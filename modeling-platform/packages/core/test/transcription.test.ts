import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractAudio, ffmpegAvailable, mediaKind, probeMedia, splitAudio } from "../src/media/index";
import {
  AssemblyAIProvider,
  MockTranscriptionProvider,
  OpenAITranscriptionProvider,
  createTranscriptionProvider,
  transcribeMedia,
  type TranscriptionProvider,
} from "../src/transcription/index";
import { normalizeTranscriptFile } from "../src/transcription/text-formats";

const dir = mkdtempSync(path.join(os.tmpdir(), "bm-media-test-"));
const tone = path.join(dir, "tone.wav");
const video = path.join(dir, "clip.mp4");
let hasFfmpeg = false;

beforeAll(async () => {
  hasFfmpeg = await ffmpegAvailable();
  if (!hasFfmpeg) return;
  // 20 s tale-lignende tone + en kort video med lydspor
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=20", tone]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=3",
    "-f", "lavfi", "-i", "sine=frequency=300:duration=3",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video,
  ]);
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("tekstformater", () => {
  it("renser SRT-undertekster og bevarer talere", () => {
    const srt = "1\n00:00:01,000 --> 00:00:03,000\nInterviewer: Hej Mette\n\n2\n00:00:03,500 --> 00:00:06,000\nMette: Jeg ser det for mig.\n\n3\n00:00:06,000 --> 00:00:08,000\nog så mærker jeg efter.\n";
    expect(normalizeTranscriptFile("x.srt", srt)).toBe("Interviewer: Hej Mette\nMette: Jeg ser det for mig. og så mærker jeg efter.");
  });
  it("forstår VTT voice-tags", () => {
    const vtt = "WEBVTT\n\n00:00.000 --> 00:02.000\n<v Mette>Det føles rigtigt</v>\n";
    expect(normalizeTranscriptFile("x.vtt", vtt)).toBe("Mette: Det føles rigtigt");
  });
  it("læser JSON-eksporter med utterances", () => {
    const json = JSON.stringify({ utterances: [{ speaker: "A", text: "Hej" }, { speaker: "B", text: "Davs" }] });
    expect(normalizeTranscriptFile("x.json", json)).toBe("A: Hej\nB: Davs");
  });
  it("genkender medietyper", () => {
    expect(mediaKind("a.MP3")).toBe("audio");
    expect(mediaKind("b.mov")).toBe("video");
    expect(mediaKind("c.txt")).toBeNull();
  });
});

describe.runIf(process.env.SKIP_FFMPEG_TESTS !== "1")("ffmpeg-pipeline", () => {
  it("prober, udtrækker og deler lyd", async () => {
    if (!hasFfmpeg) return;
    const p = await probeMedia(tone);
    expect(p.hasAudio).toBe(true);
    expect(p.durationSec).toBeCloseTo(20, 0);
    const mp3 = await extractAudio(tone, path.join(dir, "out.mp3"), { format: "mp3", bitrateKbps: 32 });
    expect(statSync(mp3).size).toBeGreaterThan(1000);
    const parts = await splitAudio(mp3, path.join(dir, "chunks"), 6);
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });

  it("udtrækker lydsporet fra video", async () => {
    if (!hasFfmpeg) return;
    const p = await probeMedia(video);
    expect(p.hasVideo && p.hasAudio).toBe(true);
    const wav = await extractAudio(video, path.join(dir, "video.wav"), { format: "wav" });
    expect((await probeMedia(wav)).hasVideo).toBe(false);
  });

  it("transcribeMedia deler store filer i bidder og samler teksten", async () => {
    if (!hasFfmpeg) return;
    const calls: string[] = [];
    const tiny: TranscriptionProvider = {
      name: "openai",
      audioFormat: "mp3",
      maxBytes: 30_000, // tvinger opdeling af 20 s lyd
      async transcribe(file) {
        calls.push(path.basename(file));
        return { text: `del ${calls.length}` };
      },
    };
    const stages: string[] = [];
    const r = await transcribeMedia(video.replace("clip.mp4", "tone.wav"), { provider: tiny, onProgress: (p) => stages.push(p.stage) });
    expect(r.chunks).toBeGreaterThan(1);
    expect(r.text.split("\n\n")).toHaveLength(r.chunks);
    expect(stages).toEqual(expect.arrayContaining(["probing", "extracting", "splitting", "transcribing", "done"]));
  });

  it("afviser filer uden lydspor og ukendte filtyper", async () => {
    if (!hasFfmpeg) return;
    const silentVideo = path.join(dir, "silent.mp4");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=64x64:rate=5:duration=1", "-pix_fmt", "yuv420p", silentVideo]);
    await expect(transcribeMedia(silentVideo, { provider: new MockTranscriptionProvider() })).resolves.toBeDefined(); // mock springer ffmpeg over
    const realish: TranscriptionProvider = { name: "openai", audioFormat: "mp3", transcribe: async () => ({ text: "x" }) };
    await expect(transcribeMedia(silentVideo, { provider: realish })).rejects.toMatchObject({ code: "media_failed" });
    await expect(transcribeMedia(path.join(dir, "notes.txt"), { provider: realish })).rejects.toMatchObject({ code: "media_failed" });
  });
});

describe("providers (fake HTTP)", () => {
  it("OpenAI: sender multipart med model/sprog og forsøger igen ved 429", async () => {
    if (!hasFfmpeg) return;
    const seen: { auth: string | null; model: unknown; language: unknown }[] = [];
    let n = 0;
    const fetchFake = (async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      seen.push({ auth: new Headers(init.headers).get("authorization"), model: form.get("model"), language: form.get("language") });
      if (n++ === 0) return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
      return Response.json({ text: " Hej verden ", language: "danish", segments: [{ start: 0, end: 1, text: "Hej verden" }] });
    }) as unknown as typeof fetch;
    const p = new OpenAITranscriptionProvider({ apiKey: "sk-test", fetch: fetchFake });
    const r = await p.transcribe(tone, { language: "da" });
    expect(r.text).toBe("Hej verden");
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ auth: "Bearer sk-test", model: "whisper-1", language: "da" });
  });

  it("OpenAI: 401 giver transcription_failed med hint", async () => {
    if (!hasFfmpeg) return;
    const p = new OpenAITranscriptionProvider({ apiKey: "bad", fetch: (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch });
    await expect(p.transcribe(tone, {})).rejects.toMatchObject({ code: "transcription_failed", status: 401 });
  });

  it("AssemblyAI: upload → job → polling → talermærket tekst", async () => {
    if (!hasFfmpeg) return;
    let polls = 0;
    const fetchFake = (async (url: string, init?: RequestInit) => {
      if (url.endsWith("/v2/upload")) return Response.json({ upload_url: "https://cdn/x" });
      if (url.endsWith("/v2/transcript") && init?.method === "POST") {
        expect(JSON.parse(String(init.body))).toMatchObject({ speaker_labels: true, language_code: "da" });
        return Response.json({ id: "t1" });
      }
      if (url.endsWith("/v2/transcript/t1")) {
        polls++;
        return polls < 2
          ? Response.json({ status: "processing" })
          : Response.json({ status: "completed", utterances: [{ speaker: "A", text: "Hvad gør du?", start: 0, end: 900 }, { speaker: "B", text: "Jeg ser det for mig.", start: 1000, end: 2000 }] });
      }
      return new Response("?", { status: 404 });
    }) as unknown as typeof fetch;
    const p = new AssemblyAIProvider({ apiKey: "k", fetch: fetchFake, pollMs: 1 });
    const r = await p.transcribe(tone, { language: "da" });
    expect(r.text).toBe("Taler A: Hvad gør du?\n\nTaler B: Jeg ser det for mig.");
    expect(polls).toBe(2);
  });

  it("createTranscriptionProvider validerer konfiguration", () => {
    expect(createTranscriptionProvider("mock").name).toBe("mock");
    expect(createTranscriptionProvider("whisper-local", { WHISPER_CPP_MODEL: "m.bin" }).name).toBe("whisper-local");
    expect(() => createTranscriptionProvider("openai", {})).toThrow(/OPENAI_API_KEY/);
    expect(() => createTranscriptionProvider("assemblyai", {})).toThrow();
    expect(() => createTranscriptionProvider("ukendt", {})).toThrow();
  });
});
