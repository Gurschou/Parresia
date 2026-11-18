import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { AnalysisResultSchema, SAMPLE_TRANSCRIPT } from "@bm/core";
import { DEMO_TRANSCRIPTS, SELF_DEMO_TRANSCRIPT } from "@bm/core/demo";
import { run, type Io } from "../src/program";

const dir = mkdtempSync(path.join(os.tmpdir(), "bm-cli-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function capture(): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, out: (s) => stdout.push(s), err: (s) => stderr.push(s), interactive: false };
}

describe("modeling-cli", () => {
  const transcript = path.join(dir, "interview.txt");
  writeFileSync(transcript, SAMPLE_TRANSCRIPT);

  it("analyze transcript.txt → JSON, Markdown og PDF + terminal-opsummering", async () => {
    const io = capture();
    const code = await run(["analyze", transcript, "--mock", "--expert", "Mette Holm"], io);
    expect(code).toBe(0);
    const env = JSON.parse(readFileSync(path.join(dir, "interview.analysis.json"), "utf8"));
    expect(AnalysisResultSchema.safeParse(env.result).success).toBe(true);
    expect(env.result.summary.subject).toBe("Mette Holm");
    expect(readFileSync(path.join(dir, "interview.report.md"), "utf8")).toContain("## Kognitive strategier");
    expect(readFileSync(path.join(dir, "interview.report.pdf")).subarray(0, 5).toString()).toBe("%PDF-");
    const out = io.stdout.join("\n");
    expect(out).toContain("Kognitive strategier");
    expect(out).toContain("VAKOG");
    expect(io.stderr.join("\n")).toContain("Analyse færdig");
  });

  it("analyze audio.mp3 → transskript + analyse (mock-transskribering)", async () => {
    const audio = path.join(dir, "optagelse.mp3");
    writeFileSync(audio, Buffer.alloc(1024, 1));
    const io = capture();
    const code = await run(["analyze", audio, "--mock", "--format", "json", "--out", path.join(dir, "out")], io);
    expect(code).toBe(0);
    expect(existsSync(path.join(dir, "out", "optagelse.transcript.txt"))).toBe(true);
    expect(existsSync(path.join(dir, "out", "optagelse.analysis.json"))).toBe(true);
    expect(existsSync(path.join(dir, "out", "optagelse.report.pdf"))).toBe(false);
  });

  it("--stdout giver ren JSON (til pipes)", async () => {
    const io = capture();
    expect(await run(["analyze", transcript, "--mock", "--stdout"], io)).toBe(0);
    expect(JSON.parse(io.stdout.join("\n")).schema_version).toBe(1);
  });

  it("validate og report på en gemt analyse", async () => {
    const file = path.join(dir, "interview.analysis.json");
    const ok = capture();
    expect(await run(["validate", file], ok)).toBe(0);
    expect(ok.stdout.join("")).toContain("Gyldig analyse");

    const bad = path.join(dir, "bad.analysis.json");
    writeFileSync(bad, JSON.stringify({ result: { summary: {} } }));
    const fail = capture();
    expect(await run(["validate", bad], fail)).toBe(1);
    expect(fail.stderr.join("\n")).toContain("Ugyldig analyse");

    const rep = capture();
    expect(await run(["report", file, "--format", "md", "--out", path.join(dir, "rep")], rep)).toBe(0);
    expect(existsSync(path.join(dir, "rep", "interview.report.md"))).toBe(true);
  });

  it("schema udskriver gyldigt JSON-schema", async () => {
    const io = capture();
    expect(await run(["schema"], io)).toBe(0);
    const schema = JSON.parse(io.stdout.join("\n"));
    expect(Object.keys(schema.properties)).toContain("cognitive_strategies");
  });

  it("giver tydelige fejl og exit-koder", async () => {
    const missing = capture();
    expect(await run(["analyze", path.join(dir, "findes-ikke.txt"), "--mock"], missing)).toBe(2);
    expect(missing.stderr.join("")).toContain("Filen findes ikke");

    const exe = path.join(dir, "x.exe");
    writeFileSync(exe, "x");
    expect(await run(["analyze", exe, "--mock"], capture())).toBe(2);

    const short = path.join(dir, "kort.txt");
    writeFileSync(short, "Hej.");
    const s = capture();
    expect(await run(["analyze", short, "--mock"], s)).toBe(1);
    expect(s.stderr.join("\n")).toContain("for kort");

    expect(await run(["analyze", transcript, "--mock", "--format", "docx"], capture())).toBe(2);
    expect(await run(["ukendt-kommando"], capture())).not.toBe(0);
  });

  it("match: finder overbevisninger, der passer begge veje", async () => {
    const files: string[] = [];
    for (const [name, text] of [
      ["mig", SELF_DEMO_TRANSCRIPT.transcript],
      ["sara", DEMO_TRANSCRIPTS.find((t) => t.expert === "Sara Lund")!.transcript],
      ["jonas", DEMO_TRANSCRIPTS.find((t) => t.expert === "Jonas Krag")!.transcript],
    ] as const) {
      const f = path.join(dir, `${name}.txt`);
      writeFileSync(f, text);
      const expert = name === "mig" ? "Mig" : name === "sara" ? "Sara Lund" : "Jonas Krag";
      expect(await run(["analyze", f, "--mock", "--format", "json", "--quiet", "--expert", expert], capture())).toBe(0);
      files.push(path.join(dir, `${name}.analysis.json`));
    }
    const io = capture();
    expect(await run(["match", ...files, "--mock"], io)).toBe(0);
    const out = io.stdout.join("\n");
    expect(out).toContain("Passer til Mig");
    expect(out).toContain("Migs overbevisninger, der passer til andre");
    expect(out).toContain("En god beslutning i dag er bedre end en perfekt beslutning om en måned.");
    expect(io.stderr.join("\n")).toContain("Match færdigt");

    const json = capture();
    expect(await run(["match", ...files, "--offline", "--json"], json)).toBe(0);
    const parsed = JSON.parse(json.stdout.join("\n"));
    expect(parsed.source).toBe("heuristic");
    expect(parsed.matches.length).toBeGreaterThan(0);

    const same = capture();
    expect(await run(["match", files[0]!, files[0]!, "--offline"], same)).toBe(2);
  });
});
