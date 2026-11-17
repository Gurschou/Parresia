import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { AnalysisError } from "../analyzer/errors";
import { sleep, withRetry } from "../llm/retry";
import { SAMPLE_TRANSCRIPT } from "../testing/sample-transcript";

export interface TranscriptSegment {
  start?: number;
  end?: number;
  speaker?: string;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments?: TranscriptSegment[];
  language?: string;
}

export interface TranscribeOptions {
  language?: string;
  signal?: AbortSignal;
}

/** Ét interface for alle transskriberings-backends. */
export interface TranscriptionProvider {
  readonly name: "openai" | "assemblyai" | "whisper-local" | "mock";
  /** Hvilket lydformat provideren vil have. */
  readonly audioFormat: "mp3" | "wav";
  /** Max filstørrelse pr. request (bytes) — større filer deles op. */
  readonly maxBytes?: number;
  transcribe(file: string, opts: TranscribeOptions): Promise<TranscriptionResult>;
}

type FetchLike = typeof fetch;

class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

const retryable = (e: unknown) =>
  e instanceof HttpStatusError ? e.status === 429 || e.status >= 500 : e instanceof TypeError; // TypeError = netværksfejl i fetch

async function checked(res: Response, provider: string): Promise<Response> {
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  const ra = res.headers.get("retry-after");
  throw new HttpStatusError(res.status, `${provider} svarede ${res.status}: ${body.slice(0, 300)}`, ra ? Number(ra) * 1000 : undefined);
}

function asTranscriptionError(err: unknown, provider: string): AnalysisError {
  if (err instanceof AnalysisError) return err;
  if (err instanceof Error && err.name === "AbortError") return new AnalysisError("aborted", { cause: err });
  const status = err instanceof HttpStatusError ? err.status : undefined;
  const hint =
    status === 401 || status === 403 ? ` Kontrollér API-nøglen for ${provider}.` : status === 413 ? " Filen er for stor." : "";
  return new AnalysisError("transcription_failed", {
    status,
    details: `${err instanceof Error ? err.message : String(err)}${hint}`,
    cause: err,
  });
}

const RETRY = { retries: 3, baseDelayMs: 2000, shouldRetry: retryable, retryAfterMs: (e: unknown) => (e instanceof HttpStatusError ? e.retryAfterMs : undefined) };

/** OpenAI Whisper / gpt-4o-transcribe via /v1/audio/transcriptions (max 25 MB pr. fil). */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai" as const;
  readonly audioFormat = "mp3" as const;
  readonly maxBytes = 24 * 1024 * 1024;

  constructor(
    private readonly opts: { apiKey: string; model?: string; baseUrl?: string; fetch?: FetchLike },
  ) {
    if (!opts.apiKey) throw new AnalysisError("transcription_failed", { details: "OPENAI_API_KEY mangler." });
  }

  async transcribe(file: string, o: TranscribeOptions): Promise<TranscriptionResult> {
    const model = this.opts.model || "whisper-1";
    const verbose = model === "whisper-1";
    const doFetch = this.opts.fetch ?? fetch;
    try {
      const data = await withRetry(async () => {
        const form = new FormData();
        form.append("file", new Blob([await readFile(file)]), path.basename(file));
        form.append("model", model);
        form.append("response_format", verbose ? "verbose_json" : "json");
        if (o.language) form.append("language", o.language);
        const res = await doFetch(`${this.opts.baseUrl ?? "https://api.openai.com"}/v1/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.opts.apiKey}` },
          body: form,
          signal: o.signal,
        });
        return (await (await checked(res, "OpenAI")).json()) as {
          text: string;
          language?: string;
          segments?: { start: number; end: number; text: string }[];
        };
      }, { ...RETRY, signal: o.signal });
      return {
        text: data.text.trim(),
        language: data.language,
        segments: data.segments?.map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
      };
    } catch (err) {
      throw asTranscriptionError(err, "OpenAI");
    }
  }
}

/** AssemblyAI med talergenkendelse (speaker labels) — godt til interviews. */
export class AssemblyAIProvider implements TranscriptionProvider {
  readonly name = "assemblyai" as const;
  readonly audioFormat = "mp3" as const;

  constructor(
    private readonly opts: { apiKey: string; baseUrl?: string; fetch?: FetchLike; pollMs?: number; timeoutMs?: number },
  ) {
    if (!opts.apiKey) throw new AnalysisError("transcription_failed", { details: "ASSEMBLYAI_API_KEY mangler." });
  }

  async transcribe(file: string, o: TranscribeOptions): Promise<TranscriptionResult> {
    const base = this.opts.baseUrl ?? "https://api.assemblyai.com";
    const doFetch = this.opts.fetch ?? fetch;
    const headers = { authorization: this.opts.apiKey };
    try {
      const uploadUrl = await withRetry(async () => {
        const res = await doFetch(`${base}/v2/upload`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/octet-stream" },
          body: await readFile(file),
          signal: o.signal,
        });
        return ((await (await checked(res, "AssemblyAI")).json()) as { upload_url: string }).upload_url;
      }, { ...RETRY, signal: o.signal });

      const job = await withRetry(async () => {
        const res = await doFetch(`${base}/v2/transcript`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            audio_url: uploadUrl,
            speaker_labels: true,
            ...(o.language ? { language_code: o.language } : { language_detection: true }),
          }),
          signal: o.signal,
        });
        return (await (await checked(res, "AssemblyAI")).json()) as { id: string };
      }, { ...RETRY, signal: o.signal });

      const deadline = Date.now() + (this.opts.timeoutMs ?? 60 * 60 * 1000);
      for (;;) {
        const res = await doFetch(`${base}/v2/transcript/${job.id}`, { headers, signal: o.signal });
        const t = (await (await checked(res, "AssemblyAI")).json()) as {
          status: string;
          text?: string;
          error?: string;
          language_code?: string;
          utterances?: { speaker: string; text: string; start: number; end: number }[];
        };
        if (t.status === "completed") {
          const segments = t.utterances?.map((u) => ({ speaker: `Taler ${u.speaker}`, text: u.text, start: u.start / 1000, end: u.end / 1000 }));
          return {
            text: segments?.length ? segments.map((s) => `${s.speaker}: ${s.text}`).join("\n\n") : (t.text ?? "").trim(),
            segments,
            language: t.language_code,
          };
        }
        if (t.status === "error") throw new Error(t.error ?? "AssemblyAI-fejl");
        if (Date.now() > deadline) throw new Error("AssemblyAI svarede ikke i tide");
        await sleep(this.opts.pollMs ?? 3000, o.signal);
      }
    } catch (err) {
      throw asTranscriptionError(err, "AssemblyAI");
    }
  }
}

/** Lokal whisper.cpp (`whisper-cli`): kræver 16 kHz mono WAV og en ggml-model. */
export class WhisperCppProvider implements TranscriptionProvider {
  readonly name = "whisper-local" as const;
  readonly audioFormat = "wav" as const;

  constructor(private readonly opts: { bin?: string; model: string; threads?: number }) {}

  async transcribe(file: string, o: TranscribeOptions): Promise<TranscriptionResult> {
    const outBase = file.replace(/\.[^.]+$/, "");
    const args = ["-m", this.opts.model, "-f", file, "-otxt", "-of", outBase, "-np"];
    if (o.language) args.push("-l", o.language);
    if (this.opts.threads) args.push("-t", String(this.opts.threads));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.opts.bin || "whisper-cli", args, { stdio: ["ignore", "ignore", "pipe"], signal: o.signal });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
      child.on("error", (err: NodeJS.ErrnoException) =>
        reject(
          new AnalysisError(err.name === "AbortError" ? "aborted" : "transcription_failed", {
            details: err.code === "ENOENT" ? "whisper-cli blev ikke fundet. Sæt WHISPER_CPP_BIN." : err.message,
            cause: err,
          }),
        ),
      );
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new AnalysisError("transcription_failed", { details: stderr.trim().slice(-500) || `exit ${code}` })),
      );
    });
    const txt = `${outBase}.txt`;
    const text = (await readFile(txt, "utf8")).trim();
    await rm(txt, { force: true });
    return { text, language: o.language };
  }
}

/** Mock (TRANSCRIPTION_PROVIDER=mock): returnerer eksempel-transskriptet. */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock" as const;
  readonly audioFormat = "mp3" as const;
  constructor(private readonly opts: { delayMs?: number; text?: string } = {}) {}
  async transcribe(_file: string, o: TranscribeOptions): Promise<TranscriptionResult> {
    if (this.opts.delayMs) await sleep(this.opts.delayMs, o.signal);
    return { text: this.opts.text ?? SAMPLE_TRANSCRIPT, language: o.language ?? "da" };
  }
}

export type TranscriptionProviderName = TranscriptionProvider["name"];

export function createTranscriptionProvider(
  name: string | undefined = process.env.TRANSCRIPTION_PROVIDER,
  env: Record<string, string | undefined> = process.env,
): TranscriptionProvider {
  switch ((name ?? "openai").toLowerCase()) {
    case "mock":
      return new MockTranscriptionProvider({ delayMs: Number(env.MOCK_TRANSCRIPTION_DELAY_MS ?? 800) });
    case "assemblyai":
      return new AssemblyAIProvider({ apiKey: env.ASSEMBLYAI_API_KEY ?? "" });
    case "whisper-local":
    case "whispercpp":
    case "local":
      return new WhisperCppProvider({ bin: env.WHISPER_CPP_BIN, model: env.WHISPER_CPP_MODEL ?? "./models/ggml-base.bin" });
    case "openai":
    case "whisper":
      return new OpenAITranscriptionProvider({ apiKey: env.OPENAI_API_KEY ?? "", model: env.OPENAI_TRANSCRIPTION_MODEL });
    default:
      throw new AnalysisError("transcription_failed", { details: `Ukendt TRANSCRIPTION_PROVIDER: ${name}` });
  }
}
