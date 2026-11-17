import { spawn } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { AnalysisError } from "../analyzer/errors";

/**
 * ffmpeg/ffprobe-hjælpere (Node-only). Kræver ffmpeg på PATH eller
 * FFMPEG_PATH/FFPROBE_PATH.
 */

export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac", ".wma", ".aiff", ".amr"];
export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".wmv", ".mpeg", ".mpg", ".3gp"];

export function mediaKind(fileName: string): "audio" | "video" | null {
  const ext = path.extname(fileName).toLowerCase();
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  return null;
}

const ffmpegBin = () => process.env.FFMPEG_PATH || "ffmpeg";
const ffprobeBin = () => process.env.FFPROBE_PATH || "ffprobe";

function run(bin: string, args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], signal });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-8000)));
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.name === "AbortError") return reject(new AnalysisError("aborted", { cause: err }));
      reject(
        new AnalysisError("media_failed", {
          details: err.code === "ENOENT" ? `${bin} blev ikke fundet. Installér ffmpeg eller sæt FFMPEG_PATH/FFPROBE_PATH.` : err.message,
          cause: err,
        }),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new AnalysisError("media_failed", { details: stderr.trim().split("\n").slice(-4).join("\n") || `exit ${code}` }));
    });
  });
}

export interface MediaProbe {
  durationSec: number;
  hasAudio: boolean;
  hasVideo: boolean;
  formatName: string;
  sizeBytes: number;
}

export async function probeMedia(file: string, signal?: AbortSignal): Promise<MediaProbe> {
  const { stdout } = await run(
    ffprobeBin(),
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    signal,
  );
  const info = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string; size?: string };
    streams?: { codec_type?: string }[];
  };
  return {
    durationSec: Number(info.format?.duration ?? 0) || 0,
    hasAudio: !!info.streams?.some((s) => s.codec_type === "audio"),
    hasVideo: !!info.streams?.some((s) => s.codec_type === "video"),
    formatName: info.format?.format_name ?? "",
    sizeBytes: Number(info.format?.size ?? 0) || (await stat(file)).size,
  };
}

export interface ExtractOptions {
  format: "mp3" | "wav";
  /** kbit/s for mp3 (default 64 — rigeligt til tale). */
  bitrateKbps?: number;
  sampleRate?: number;
  signal?: AbortSignal;
}

/** Udtrækker/normaliserer lydsporet til mono tale-lyd (16 kHz). Virker også for video. */
export async function extractAudio(input: string, outFile: string, opts: ExtractOptions): Promise<string> {
  await mkdir(path.dirname(outFile), { recursive: true });
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vn", "-ac", "1", "-ar", String(opts.sampleRate ?? 16000)];
  if (opts.format === "mp3") args.push("-c:a", "libmp3lame", "-b:a", `${opts.bitrateKbps ?? 64}k`);
  else args.push("-c:a", "pcm_s16le");
  args.push(outFile);
  await run(ffmpegBin(), args, opts.signal);
  return outFile;
}

/** Deler en lydfil i segmenter af `segmentSec` sekunder (uden genkodning). */
export async function splitAudio(input: string, outDir: string, segmentSec: number, signal?: AbortSignal): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const ext = path.extname(input);
  await run(
    ffmpegBin(),
    ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-f", "segment", "-segment_time", String(segmentSec), "-c", "copy", "-reset_timestamps", "1", path.join(outDir, `chunk-%03d${ext}`)],
    signal,
  );
  const files = (await readdir(outDir)).filter((f) => f.startsWith("chunk-") && f.endsWith(ext)).sort();
  return files.map((f) => path.join(outDir, f));
}

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await run(ffmpegBin(), ["-version"]);
    return true;
  } catch {
    return false;
  }
}
