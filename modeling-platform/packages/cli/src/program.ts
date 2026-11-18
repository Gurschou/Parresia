import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import pc from "picocolors";
import ora, { type Ora } from "ora";
import {
  ANALYSIS_FULL_JSON_SCHEMA,
  ANALYSIS_SCHEMA_VERSION,
  AnalysisError,
  HUMAN_NEED_LABEL,
  META_PROGRAMS,
  MockLlmClient,
  REP_SYSTEMS,
  REP_SYSTEM_LABEL,
  MATCH_KIND_LABEL,
  analyzeTranscript,
  buildInventory,
  buildReport,
  genitive,
  matchBeliefs,
  matchesForPerson,
  personKeyOf,
  type BeliefMatch,
  type PersonRecord,
  loadConfig,
  metaProgramPoleLabel,
  renderMarkdown,
  validateAnalysis,
  type AnalysisEnvelope,
  type AnalysisResult,
} from "@bm/core";
import { ffmpegAvailable, mediaKind } from "@bm/core/media";
import { createTranscriptionProvider, isTextTranscriptFile, normalizeTranscriptFile, transcribeMedia } from "@bm/core/transcription";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
  /** Vis spinner (false i tests/pipes). */
  interactive: boolean;
}

const defaultIo: Io = {
  out: (s) => process.stdout.write(`${s}\n`),
  err: (s) => process.stderr.write(`${s}\n`),
  interactive: !!process.stderr.isTTY,
};

class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

const FORMATS = ["json", "md", "pdf"] as const;
type Format = (typeof FORMATS)[number];

function parseFormats(v: string): Format[] {
  const list = v.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const bad = list.filter((x) => !FORMATS.includes(x as Format));
  if (bad.length) throw new CliError(`Ukendt format: ${bad.join(", ")}. Brug json, md og/eller pdf.`, 2);
  return list as Format[];
}

interface Spin {
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
}

/** Spinner i en terminal; enkle statuslinjer i pipes/CI/tests. */
function spinner(io: Io, text: string): Spin {
  if (!io.interactive) {
    io.err(pc.dim(`• ${text}`));
    let last = text;
    return {
      update(t) {
        if (t !== last && !/Modtager/.test(t)) io.err(pc.dim(`• ${t}`));
        last = t;
      },
      succeed: (t) => io.err(pc.green(`✔ ${t ?? last}`)),
      fail: (t) => io.err(pc.red(`✖ ${t ?? last}`)),
    };
  }
  const s: Ora = ora({ text, stream: process.stderr }).start();
  return { update: (t) => (s.text = t), succeed: (t) => void s.succeed(t), fail: (t) => void s.fail(t) };
}

const BLOCK_COLORS = [pc.blue, pc.red, pc.green, pc.yellow, pc.magenta, pc.cyan];

function vakogBar(dist: Record<string, number>, width = 40): string {
  let bar = "";
  REP_SYSTEMS.forEach((s, i) => {
    const n = Math.round(((dist[s] ?? 0) / 100) * width);
    bar += BLOCK_COLORS[i]!("█".repeat(n));
  });
  return bar;
}

/** Pæn terminal-opsummering af en analyse. */
export function summarize(result: AnalysisResult, io: Io) {
  const r = result;
  const h = (t: string) => io.out(`\n${pc.bold(pc.magenta(t))}`);
  io.out(`\n${pc.bold(r.summary.subject)} ${pc.dim("— " + r.summary.result_modeled)}`);
  io.out(pc.dim(r.summary.overview));
  h("Nøgleindsigter");
  r.summary.key_insights.forEach((k, i) => io.out(`  ${pc.cyan(String(i + 1) + ".")} ${k}`));
  h("Kognitive strategier");
  for (const s of r.cognitive_strategies.strategies) io.out(`  • ${pc.bold(s.name)}  ${pc.yellow(s.notation)}\n    ${pc.dim(`Test: ${s.tote.test}  →  Exit: ${s.tote.exit}`)}`);
  h("Overbevisninger");
  r.enabling_beliefs.beliefs.forEach((b) => io.out(`  ${pc.green("+")} ${b.statement}`));
  r.disenabling_beliefs.beliefs.forEach((b) => io.out(`  ${pc.red("−")} ${b.statement}`));
  h("Værdier & 6 Human Needs");
  io.out(`  ${r.values_and_6_human_needs.values.map((v) => (v.direction === "toward" ? v.value : pc.dim(`(væk fra) ${v.value}`))).join(" · ")}`);
  io.out(`  Dominerende behov: ${pc.bold(r.values_and_6_human_needs.dominant_needs.map((n) => HUMAN_NEED_LABEL[n]).join(" · ") || "—")}`);
  h("Meta-programmer");
  for (const p of [...r.meta_programs.programs].sort((a, b) => b.strength - a.strength).slice(0, 6)) {
    io.out(`  ${META_PROGRAMS[p.program].name.padEnd(18)} ${metaProgramPoleLabel(p.program, p.leaning)} ${pc.dim(`(${Math.round(p.strength)})`)}`);
  }
  h("VAKOG");
  io.out(`  ${vakogBar(r.vakog.distribution)}  primært: ${pc.bold(REP_SYSTEM_LABEL[r.vakog.primary_system])}`);
  io.out(`  ${REP_SYSTEMS.map((s, i) => BLOCK_COLORS[i]!(`${s} ${Math.round(r.vakog.distribution[s])}%`)).join("  ")}`);
  h("Næste spørgsmål");
  r.gaps_and_next_questions.next_questions.slice(0, 5).forEach((q) => io.out(`  ? ${q.question}`));
}

async function writeOutputs(envelope: AnalysisEnvelope, base: string, formats: Format[], info: { expertName?: string; sourceLabel?: string }) {
  const written: string[] = [];
  await mkdir(path.dirname(base), { recursive: true });
  if (formats.includes("json")) {
    await writeFile(`${base}.analysis.json`, JSON.stringify(envelope, null, 2));
    written.push(`${base}.analysis.json`);
  }
  const doc = buildReport(envelope.result, { ...info, model: envelope.meta.model, provider: envelope.meta.provider });
  if (formats.includes("md")) {
    await writeFile(`${base}.report.md`, renderMarkdown(doc));
    written.push(`${base}.report.md`);
  }
  if (formats.includes("pdf")) {
    const { renderPdf } = await import("@bm/core/pdf");
    await writeFile(`${base}.report.pdf`, await renderPdf(doc));
    written.push(`${base}.report.pdf`);
  }
  return written;
}

function outBase(input: string, outDir?: string) {
  const name = path.basename(input).replace(/\.[^.]+$/, "");
  return path.join(path.resolve(outDir ?? path.dirname(input)), name);
}

export function buildProgram(io: Io = defaultIo): Command {
  const program = new Command("modeling-cli")
    .description("Advanced Behavioral Modeling fra terminalen — tekst, lyd og video → struktureret adfærdsmodel med Claude.")
    .version("0.1.0")
    .configureOutput({ writeOut: (s) => io.out(s.trimEnd()), writeErr: (s) => io.err(s.trimEnd()) })
    .showHelpAfterError();

  program
    .command("analyze")
    .description("Analysér et transskript (.txt/.md/.srt/.vtt/.json) eller en lyd/video-fil")
    .argument("<file>", "transskript, lyd- eller videofil")
    .option("-o, --out <dir>", "outputmappe (default: samme mappe som input)")
    .option("-f, --format <list>", "outputformater: json,md,pdf", "json,md,pdf")
    .option("-e, --expert <name>", "navn på personen der modelleres")
    .option("-d, --domain <text>", "rolle/domæne, fx 'salgsdirektør'")
    .option("-g, --goal <text>", "resultat der ønskes modelleret")
    .option("-i, --interviewer <name>", "interviewerens navn i transskriptet")
    .option("-l, --language <code>", "sprog-hint til transskribering (fx da)")
    .addOption(new Option("-t, --transcriber <provider>", "transskriberings-provider").choices(["openai", "assemblyai", "whisper-local", "mock"]))
    .option("-m, --model <id>", "Claude-model (default fra ANTHROPIC_MODEL eller claude-opus-5-5)")
    .option("--mock", "brug mock-LLM (ingen API-nøgle, til test)")
    .option("--stdout", "skriv analyse-JSON til stdout i stedet for filer")
    .option("-q, --quiet", "ingen opsummering i terminalen")
    .action(async (file: string, o) => {
      const input = path.resolve(file);
      if (!existsSync(input)) throw new CliError(`Filen findes ikke: ${file}`, 2);
      const formats = parseFormats(o.format);
      let transcript: string;
      let sourceLabel = path.basename(input);

      const kind = mediaKind(input);
      if (kind) {
        const sp = spinner(io, kind === "video" ? "Udtrækker lyd fra video" : "Forbereder lyd");
        try {
          const res = await transcribeMedia(input, {
            provider: createTranscriptionProvider(o.transcriber),
            language: o.language,
            onProgress: (p) => sp.update(p.message),
          });
          transcript = res.text;
          sp.succeed(`Transskriberet med ${res.provider}${res.durationSec ? ` (${Math.round(res.durationSec / 60)} min, ${res.chunks} del${res.chunks > 1 ? "e" : ""})` : ""}`);
          if (!o.stdout) {
            const t = `${outBase(input, o.out)}.transcript.txt`;
            await mkdir(path.dirname(t), { recursive: true });
            await writeFile(t, transcript);
            io.err(pc.dim(`  transskript → ${t}`));
          }
        } catch (err) {
          sp.fail("Transskribering fejlede");
          throw err;
        }
      } else if (isTextTranscriptFile(input)) {
        transcript = normalizeTranscriptFile(input, await readFile(input, "utf8"));
      } else {
        throw new CliError(`Ukendt filtype: ${path.extname(input) || "(ingen)"}. Brug tekst (.txt .md .srt .vtt .json) eller lyd/video.`, 2);
      }

      const sp = spinner(io, "Claude analyserer transskriptet");
      let envelope: AnalysisEnvelope;
      try {
        envelope = await analyzeTranscript(
          { transcript, context: { subjectName: o.expert, domain: o.domain, goal: o.goal, interviewer: o.interviewer } },
          {
            llm: o.mock ? new MockLlmClient() : undefined,
            config: o.model ? { model: o.model } : undefined,
            onProgress: (p) => {
              if (p.stage === "done" || p.stage === "preparing") return;
              sp.update(p.receivedChars ? `${p.message} (${Math.round(p.receivedChars / 1000)}k tegn)` : p.message);
            },
          },
        );
        sp.succeed(
          `Analyse færdig på ${(envelope.meta.duration_ms / 1000).toFixed(1)} s · ${envelope.meta.model}${envelope.meta.provider === "mock" ? " (mock)" : ""} · ${envelope.meta.input_tokens}/${envelope.meta.output_tokens} tokens`,
        );
      } catch (err) {
        sp.fail("Analysen fejlede");
        throw err;
      }

      if (o.stdout) {
        io.out(JSON.stringify(envelope, null, 2));
        return;
      }
      if (!o.quiet) summarize(envelope.result, io);
      const written = await writeOutputs(envelope, outBase(input, o.out), formats, { expertName: o.expert, sourceLabel });
      io.out(`\n${pc.bold("Filer:")}`);
      written.forEach((w) => io.out(`  ${pc.green("✔")} ${w}`));
    });

  program
    .command("transcribe")
    .description("Transskribér en lyd/video-fil til tekst (uden analyse)")
    .argument("<file>", "lyd- eller videofil")
    .option("-o, --out <dir>", "outputmappe")
    .option("-l, --language <code>", "sprog-hint (fx da)")
    .addOption(new Option("-t, --transcriber <provider>", "provider").choices(["openai", "assemblyai", "whisper-local", "mock"]))
    .action(async (file: string, o) => {
      const input = path.resolve(file);
      if (!existsSync(input)) throw new CliError(`Filen findes ikke: ${file}`, 2);
      if (!mediaKind(input)) throw new CliError("Kun lyd- og videofiler kan transskriberes.", 2);
      const sp = spinner(io, "Transskriberer");
      const res = await transcribeMedia(input, { provider: createTranscriptionProvider(o.transcriber), language: o.language, onProgress: (p) => sp.update(p.message) });
      const target = `${outBase(input, o.out)}.transcript.txt`;
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, res.text);
      sp.succeed(`Transskriberet med ${res.provider} → ${target}`);
    });

  program
    .command("report")
    .description("Generér Markdown/PDF-rapport fra en gemt *.analysis.json")
    .argument("<analysis>", "sti til *.analysis.json")
    .option("-o, --out <dir>", "outputmappe")
    .option("-f, --format <list>", "md,pdf", "md,pdf")
    .option("-e, --expert <name>", "navn på eksperten i rapporten")
    .action(async (file: string, o) => {
      const raw = JSON.parse(await readFile(path.resolve(file), "utf8"));
      const v = validateAnalysis(raw);
      if (!v.ok) throw new CliError(`Filen er ikke en gyldig analyse:\n${v.issues}`, 2);
      const envelope: AnalysisEnvelope = raw.result ? raw : { schema_version: ANALYSIS_SCHEMA_VERSION, result: v.result, meta: {} as AnalysisEnvelope["meta"] };
      const base = outBase(path.resolve(file).replace(/\.analysis\.json$/, ".json"), o.out);
      const written = await writeOutputs({ ...envelope, result: v.result }, base, parseFormats(o.format).filter((f) => f !== "json"), { expertName: o.expert });
      written.forEach((w) => io.out(`${pc.green("✔")} ${w}`));
    });

  program
    .command("match")
    .description("Find overbevisninger, der passer mellem personen i den første analyse og personerne i de andre — begge veje")
    .argument("<target>", "analysen, der matches (*.analysis.json)")
    .argument("<others...>", "andre analyser at matche mod (én eller flere personer)")
    .option("--mock", "brug mock-LLM (ingen API-nøgle, til test)")
    .option("--offline", "kun tekstbaseret match (intet LLM-kald)")
    .option("--json", "skriv matchet som JSON til stdout")
    .action(async (targetFile: string, otherFiles: string[], o) => {
      const load = async (file: string, order: number): Promise<PersonRecord> => {
        let raw: unknown;
        try {
          raw = JSON.parse(await readFile(path.resolve(file), "utf8"));
        } catch {
          throw new CliError(`${file} er ikke gyldig JSON.`, 2);
        }
        const v = validateAnalysis(raw);
        if (!v.ok) throw new CliError(`${file} er ikke en gyldig analyse:\n${v.issues}`, 2);
        return { id: path.resolve(file), title: path.basename(file), createdAt: new Date(order), expertName: v.result.summary.subject, result: v.result };
      };
      const target = await load(targetFile, otherFiles.length + 1);
      const others = await Promise.all(otherFiles.map((f, i) => load(f, i)));
      const key = personKeyOf(target);
      const inventory = buildInventory(
        { analysisId: target.id, records: [target, ...others.filter((r) => personKeyOf(r) === key)] },
        others.filter((r) => personKeyOf(r) !== key),
      );
      if (inventory.persons.length < 2) throw new CliError("De andre analyser er af samme person — angiv mindst én analyse af en anden person.", 2);

      const spin = spinner(io, `Matcher ${genitive(inventory.persons[0]!.name)} overbevisninger mod ${inventory.persons.length - 1} ${inventory.persons.length === 2 ? "person" : "personer"}`);
      const run = await matchBeliefs(inventory, { llm: o.mock ? new MockLlmClient({ delayMs: 0 }) : undefined, useLlm: !o.offline });
      spin.succeed(`Match færdigt (${run.source === "claude" ? "Claude" : "tekstbaseret"}): ${run.matches.length} match`);
      if (run.meta.fallback_reason) io.err(pc.yellow(`  Claude kunne ikke svare (${run.meta.fallback_reason}); tekstbaseret match brugt.`));
      if (o.json) {
        io.out(JSON.stringify(run, null, 2));
        return;
      }
      const name = inventory.persons[0]!.name;
      const g = matchesForPerson(run.matches, key);
      const line = (m: BeliefMatch, side: "from" | "to") => {
        io.out(`  ${pc.bold(`[${MATCH_KIND_LABEL[m.kind]} ${m.fit}]`)} “${m.belief.statement}” ${pc.dim(`— ${side === "from" ? "fra" : "til"} ${m[side].name}`)}`);
        if (m.anchor.text) io.out(`    ${pc.dim("→")} ${pc.dim(m.anchor.text)}`);
        if (m.rationale) io.out(`    ${pc.dim(m.rationale)}`);
        if (m.bridgeQuestion) io.out(`    ${pc.cyan("?")} ${m.bridgeQuestion}`);
      };
      if (run.summary) io.out(`\n${run.summary}`);
      io.out(`\n${pc.bold(pc.magenta(`Passer til ${name}`))}`);
      g.incoming.forEach((m) => line(m, "from"));
      if (!g.incoming.length) io.out(pc.dim("  Ingen tydelige match."));
      io.out(`\n${pc.bold(pc.magenta(`${genitive(name)} overbevisninger, der passer til andre`))}`);
      g.outgoing.forEach((m) => line(m, "to"));
      if (!g.outgoing.length) io.out(pc.dim("  Ingen tydelige match."));
      io.out(`\n${pc.bold(pc.magenta("Fælles"))}`);
      g.shared.forEach((m) => io.out(`  ≈ “${m.belief.statement}” ${pc.dim(`(${m.from.name})`)} · “${m.anchor.text}” ${pc.dim(`(${m.to.name})`)}`));
      if (!g.shared.length) io.out(pc.dim("  Ingen fælles overbevisninger."));
    });

  program
    .command("validate")
    .description("Validér en analyse-JSON mod schemaet (exit-kode 1 ved fejl)")
    .argument("<analysis>", "sti til *.analysis.json")
    .action(async (file: string) => {
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(path.resolve(file), "utf8"));
      } catch {
        throw new CliError("Filen er ikke gyldig JSON.", 1);
      }
      const v = validateAnalysis(raw);
      if (!v.ok) throw new CliError(`Ugyldig analyse:\n${v.issues}`, 1);
      io.out(`${pc.green("✔")} Gyldig analyse (schema v${ANALYSIS_SCHEMA_VERSION}): ${v.result.summary.subject}`);
    });

  program
    .command("schema")
    .description("Udskriv analysens JSON-schema")
    .action(() => io.out(JSON.stringify(ANALYSIS_FULL_JSON_SCHEMA, null, 2)));

  program
    .command("doctor")
    .description("Tjek konfiguration: API-nøgler, ffmpeg og providers")
    .action(async () => {
      const cfg = loadConfig();
      const ok = (b: boolean) => (b ? pc.green("✔") : pc.yellow("!"));
      io.out(`${ok(cfg.llmProvider === "mock" || !!cfg.anthropicApiKey)} LLM: ${cfg.llmProvider} · model ${cfg.model} · ANTHROPIC_API_KEY ${cfg.anthropicApiKey ? "sat" : "mangler"}`);
      io.out(`${ok(await ffmpegAvailable())} ffmpeg ${(await ffmpegAvailable()) ? "fundet" : "mangler (krævet til lyd/video)"}`);
      const t = (process.env.TRANSCRIPTION_PROVIDER ?? "openai").toLowerCase();
      const tOk = t === "mock" || (t === "openai" && !!process.env.OPENAI_API_KEY) || (t === "assemblyai" && !!process.env.ASSEMBLYAI_API_KEY) || t === "whisper-local";
      io.out(`${ok(tOk)} Transskribering: ${t}${tOk ? "" : " (API-nøgle mangler)"}`);
      io.out(pc.dim(`Rate limit: ${cfg.maxConcurrency} samtidige, ${cfg.requestsPerMinute}/min, ${cfg.maxRetries} retries`));
    });

  return program;
}

/** Kører CLI'en og returnerer exit-koden (bruges af bin og tests). */
export async function run(argv: string[], io: Io = defaultIo): Promise<number> {
  const program = buildProgram(io).exitOverride();
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    const e = err as { code?: string; exitCode?: number };
    if (e.code === "commander.helpDisplayed" || e.code === "commander.version" || e.code === "commander.help") return 0;
    if (typeof e.code === "string" && e.code.startsWith("commander.")) return e.exitCode ?? 2;
    if (err instanceof CliError) {
      io.err(pc.red(`✖ ${err.message}`));
      return err.exitCode;
    }
    if (err instanceof AnalysisError) {
      io.err(pc.red(`✖ ${err.userMessage}`));
      if (err.details) io.err(pc.dim(`  ${err.details}`));
      return 1;
    }
    io.err(pc.red(`✖ ${err instanceof Error ? err.message : String(err)}`));
    return 1;
  }
}
