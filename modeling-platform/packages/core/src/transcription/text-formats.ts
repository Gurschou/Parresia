/**
 * Normaliserer tekstbaserede transskript-filer (.txt, .md, .srt, .vtt, .json)
 * til ren tekst med talerlinjer bevaret. Isomorf (bruges også i browseren).
 */
export const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".srt", ".vtt", ".json", ".text"];

const ext = (name: string) => {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
};

export function isTextTranscriptFile(name: string): boolean {
  return TEXT_EXTENSIONS.includes(ext(name));
}

function fromSubtitles(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l === "WEBVTT" || /^\d+$/.test(l) || /-->/.test(l) || /^(NOTE|STYLE|REGION)\b/.test(l)) continue;
    // <v Taler>tekst</v> (VTT voice tags) → "Taler: tekst"
    const voice = l.match(/^<v\s+([^>]+)>(.*?)(<\/v>)?$/);
    const text = voice ? `${voice[1]}: ${voice[2]}` : l.replace(/<[^>]+>/g, "");
    if (out.at(-1) !== text) out.push(text);
  }
  // Sæt sammenhængende replikker fra samme taler sammen.
  const merged: string[] = [];
  for (const line of out) {
    const speaker = line.match(/^([^:]{1,40}):\s/)?.[1];
    const prev = merged.at(-1);
    if (prev && !speaker) merged[merged.length - 1] = `${prev} ${line}`;
    else merged.push(line);
  }
  return merged.join("\n");
}

function fromJson(content: string): string {
  const data = JSON.parse(content) as unknown;
  const pick = (o: Record<string, unknown>) => {
    const text = (o.text ?? o.transcript ?? o.content) as string | undefined;
    const speaker = (o.speaker ?? o.speaker_label ?? o.name) as string | undefined;
    return text ? (speaker ? `${speaker}: ${text}` : text) : "";
  };
  if (Array.isArray(data)) return data.map((x) => (typeof x === "string" ? x : pick(x as Record<string, unknown>))).filter(Boolean).join("\n");
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["utterances", "segments", "results", "turns"]) {
      if (Array.isArray(o[key])) return fromJson(JSON.stringify(o[key]));
    }
    return pick(o);
  }
  return String(data);
}

export function normalizeTranscriptFile(name: string, content: string): string {
  const e = ext(name);
  try {
    if (e === ".srt" || e === ".vtt") return fromSubtitles(content).trim();
    if (e === ".json") return fromJson(content).trim();
  } catch {
    /* fald tilbage til rå tekst */
  }
  return content.replace(/\r\n/g, "\n").trim();
}
