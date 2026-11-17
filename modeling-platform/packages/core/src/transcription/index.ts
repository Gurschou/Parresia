import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AnalysisError } from "../analyzer/errors";
import { extractAudio, mediaKind, probeMedia, splitAudio } from "../media/index";
import { createTranscriptionProvider, type TranscriptionProvider } from "./providers";

export * from "./providers";
export * from "./text-formats";

export type TranscriptionStage = "probing" | "extracting" | "splitting" | "transcribing" | "done";

export interface TranscribeMediaOptions {
  provider?: TranscriptionProvider;
  language?: string;
  signal?: AbortSignal;
  /** Midlertidig arbejdsmappe (default: OS tmp). Ryddes altid op. */
  workDir?: string;
  onProgress?: (p: { stage: TranscriptionStage; message: string; chunk?: number; chunks?: number }) => void;
}

export interface TranscribeMediaResult {
  text: string;
  provider: string;
  durationSec: number;
  chunks: number;
  language?: string;
  kind: "audio" | "video";
}

/**
 * End-to-end: lyd/video-fil → ren transskript-tekst.
 *  1. ffprobe (varighed, har den et lydspor?)
 *  2. ffmpeg: udtræk lydspor → mono 16 kHz (mp3 til cloud, wav til whisper.cpp)
 *  3. opdel i bidder hvis provideren har en filstørrelsesgrænse (OpenAI: 25 MB)
 *  4. transskribér bid for bid og saml
 */
export async function transcribeMedia(file: string, opts: TranscribeMediaOptions = {}): Promise<TranscribeMediaResult> {
  const kind = mediaKind(file);
  if (!kind) throw new AnalysisError("media_failed", { details: `Ukendt filtype: ${path.extname(file) || "(ingen)"}` });
  const provider = opts.provider ?? createTranscriptionProvider();
  const language = opts.language ?? (process.env.TRANSCRIPTION_LANGUAGE || undefined);
  const progress = opts.onProgress ?? (() => {});
  const work = await mkdtemp(path.join(opts.workDir ?? os.tmpdir(), "bm-transcribe-"));

  try {
    if (provider.name === "mock") {
      progress({ stage: "transcribing", message: "Transskriberer (mock)" });
      const r = await provider.transcribe(file, { language, signal: opts.signal });
      progress({ stage: "done", message: "Transskribering færdig" });
      return { text: r.text, provider: provider.name, durationSec: 0, chunks: 1, language: r.language, kind };
    }

    progress({ stage: "probing", message: "Undersøger mediefilen" });
    const probe = await probeMedia(file, opts.signal);
    if (!probe.hasAudio) throw new AnalysisError("media_failed", { details: "Filen har intet lydspor." });

    progress({ stage: "extracting", message: kind === "video" ? "Udtrækker lyd fra video" : "Normaliserer lyd" });
    const audio = await extractAudio(file, path.join(work, `audio.${provider.audioFormat}`), {
      format: provider.audioFormat,
      bitrateKbps: 48,
      signal: opts.signal,
    });

    let parts = [audio];
    const size = (await stat(audio)).size;
    if (provider.maxBytes && size > provider.maxBytes) {
      progress({ stage: "splitting", message: "Deler lyden op i mindre bidder" });
      // 48 kbit/s ≈ 6 KB/s → vælg segmentlængde med god margin til grænsen.
      const segmentSec = Math.max(60, Math.floor((provider.maxBytes * 0.8) / 6000));
      parts = await splitAudio(audio, path.join(work, "chunks"), segmentSec, opts.signal);
    }

    const texts: string[] = [];
    let detected: string | undefined;
    for (let i = 0; i < parts.length; i++) {
      progress({
        stage: "transcribing",
        message: parts.length > 1 ? `Transskriberer del ${i + 1} af ${parts.length}` : "Transskriberer lyden",
        chunk: i + 1,
        chunks: parts.length,
      });
      const r = await provider.transcribe(parts[i]!, { language, signal: opts.signal });
      detected ??= r.language;
      if (r.text.trim()) texts.push(r.text.trim());
    }
    const text = texts.join("\n\n");
    if (!text) throw new AnalysisError("transcription_failed", { details: "Transskriberingen gav ingen tekst (stille lyd?)." });
    progress({ stage: "done", message: "Transskribering færdig" });
    return { text, provider: provider.name, durationSec: probe.durationSec, chunks: parts.length, language: detected, kind };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
