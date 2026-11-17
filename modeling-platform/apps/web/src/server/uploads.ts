import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { mediaKind } from "@bm/core/media";
import { HttpError } from "./http";

/**
 * Upload af lyd/video: filen streames direkte til disk (ingen buffering i
 * hukommelsen), så store optagelser (op til MAX_UPLOAD_MB) kan håndteres.
 * Gemmes som `<UPLOAD_DIR>/<userId>/<uploadId><ext>` + en sidecar-JSON.
 */

export const uploadRoot = () => path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads"));
export const maxUploadBytes = () => (Number(process.env.MAX_UPLOAD_MB ?? 500) || 500) * 1024 * 1024;

interface UploadMeta {
  originalName: string;
  kind: "audio" | "video";
  sizeBytes: number;
  createdAt: string;
}

const safeId = (id: string) => /^[a-f0-9-]{36}$/.test(id);

export async function saveUpload(userId: string, fileName: string, body: ReadableStream<Uint8Array> | null) {
  const kind = mediaKind(fileName);
  if (!kind) {
    throw new HttpError(415, "unsupported_media", "Filtypen understøttes ikke. Brug fx mp3, wav, m4a, mp4, mov eller webm.");
  }
  if (!body) throw new HttpError(400, "empty_body", "Ingen fil modtaget.");
  const id = crypto.randomUUID();
  const dir = path.join(uploadRoot(), userId);
  await mkdir(dir, { recursive: true });
  const ext = path.extname(fileName).toLowerCase();
  const target = path.join(dir, `${id}${ext}`);
  const limit = maxUploadBytes();
  let size = 0;
  const guard = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > limit) cb(new HttpError(413, "too_large", `Filen er større end ${Math.round(limit / 1024 / 1024)} MB.`));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as unknown as WebReadableStream<Uint8Array>), guard, createWriteStream(target));
  } catch (err) {
    await rm(target, { force: true });
    throw err;
  }
  if (size === 0) {
    await rm(target, { force: true });
    throw new HttpError(400, "empty_file", "Filen er tom.");
  }
  const meta: UploadMeta = { originalName: path.basename(fileName), kind, sizeBytes: size, createdAt: new Date().toISOString() };
  await writeFile(`${target}.json`, JSON.stringify(meta));
  return { uploadId: id, ...meta };
}

/** Finder en upload til brug i en analyse (validerer ejerskab via sti). */
export async function consumeUpload(userId: string, uploadId: string) {
  if (!safeId(uploadId)) throw new HttpError(422, "invalid_upload", "Ugyldigt upload-id.");
  const dir = path.join(uploadRoot(), userId);
  const files = await readdir(dir).catch(() => [] as string[]);
  const file = files.find((f) => f.startsWith(uploadId) && !f.endsWith(".json"));
  if (!file) throw new HttpError(404, "upload_not_found", "Den uploadede fil blev ikke fundet. Upload den igen.");
  const full = path.join(dir, file);
  const meta = JSON.parse(await readFile(`${full}.json`, "utf8")) as UploadMeta;
  await rm(`${full}.json`, { force: true });
  return { path: full, ...meta };
}

/** Rydder uploads, der aldrig blev brugt (ældre end `maxAgeMs`). */
export async function cleanupStaleUploads(maxAgeMs = 24 * 60 * 60 * 1000): Promise<number> {
  const root = uploadRoot();
  let removed = 0;
  for (const user of await readdir(root).catch(() => [] as string[])) {
    const dir = path.join(root, user);
    for (const f of await readdir(dir).catch(() => [] as string[])) {
      if (!f.endsWith(".json")) continue;
      const s = await stat(path.join(dir, f)).catch(() => null);
      if (s && Date.now() - s.mtimeMs > maxAgeMs) {
        await rm(path.join(dir, f), { force: true });
        await rm(path.join(dir, f.slice(0, -5)), { force: true });
        removed++;
      }
    }
  }
  return removed;
}
