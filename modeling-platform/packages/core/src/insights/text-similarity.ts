/** Simpel, deterministisk tekstlighed til dansk/engelsk (ingen embeddings nødvendige). */

const STOPWORDS = new Set(
  (
    "og i jeg det at en den til er som på de med han af for ikke der var mig sig men et har om vi min havde ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind når være dog noget ville jo deres efter ned skulle denne end dette mit også under have dig anden hende mine alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes været jer sådan så bare kan får gør altid aldrig person en et " +
    "the a an and or of to in is are was were be been i me my we our you your he she it they them this that these those for with on at by from as not no do does did have has had will would can could should must just so if then than very really always never person"
  )
    .split(/\s+/)
    .filter(Boolean),
);

export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5) w = w.replace(/(erne|ende|ene|ere|hed|ing|ers|er|en|et|es|ed|e|s)$/u, "");
  return w;
}

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    out.add(stem(w));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function similarity(a: string, b: string): number {
  return jaccard(tokens(a), tokens(b));
}

/** Normaliseret nøgle til fx værdinavne ("Frihed", "frihed!" → "frihed"). */
export function normalizeKey(text: string): string {
  return [...tokens(text)].sort().join(" ") || text.trim().toLowerCase();
}
