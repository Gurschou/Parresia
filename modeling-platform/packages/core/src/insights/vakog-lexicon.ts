import { REP_SYSTEMS, type RepSystem } from "../schema/common";
import { normalizeDistribution, type VakogDistribution } from "../categories/vakog";

/**
 * Deterministisk prædikat-optælling (dansk + engelsk) som krydstjek af
 * modellens VAKOG-vurdering. "ord*" = præfiks/stamme, ellers eksakt ord.
 * Bevidst konservativ: hellere for få end tvetydige træffere — derfor
 * er fx "så", "ved", "klar" og "stille" udeladt (oftest ikke-sansebaserede).
 */
const LEXICON: Record<RepSystem, string[]> = {
  V: [
    "se", "ser", "kig*", "billed*", "tydelig*", "lys", "lyse", "lysende", "mørk*",
    "farve*", "perspektiv*", "vision*", "visualis*", "overblik*", "udsigt*", "belys*", "glimt*", "øje", "øjne",
    "synlig*", "uklar*", "slør*", "spejl*", "fremtidsbillede*", "skue",
    "see", "sees", "saw", "seen", "look*", "picture*", "clear*", "bright*", "dark*", "colo*", "vision*",
    "visuali*", "view*", "focus*", "glimpse*", "illuminat*", "vivid*", "imag*", "show*", "watch*", "appear*",
  ],
  A: [
    "hør*", "lyd*", "stemme*", "tone*", "klinge*", "lyt*", "råb*", "larm*", "støj*", "harmoni*", "rytme*",
    "resoner*", "ekko*", "melodi*", "stilhed*", "snak*", "fortæl*",
    "hear*", "heard", "sound*", "voice*", "listen*", "tone*", "loud*", "quiet*", "noise*", "rhythm*", "resonat*",
    "echo*", "harmon*", "tell*", "told", "talk*", "ring*", "tune*",
  ],
  K: [
    "føl*", "fornemmelse*", "mavefornemmelse*", "mærk*", "greb*", "grib*", "tung*", "varm*", "kold*", "pres*",
    "spænding*", "spændt", "rolig*", "ro", "hård*", "blød*", "krop*", "energi*", "puls*", "sved*", "ondt",
    "håndgribelig*", "solid*", "berør*", "rørt", "glat*", "kæmp*", "bære*", "bærer", "stød*", "skub*",
    "feel*", "felt", "touch*", "grasp*", "heavy", "warm*", "cold*", "pressure*", "tense*", "tension*", "calm*",
    "hard*", "soft*", "body", "energy", "solid*", "grip*", "push*", "struggl*", "gut",
  ],
  O: ["lugt*", "duft*", "stank*", "snus*", "smell*", "scent*", "fragran*", "odo*", "nose", "sniff*", "stink*"],
  G: [
    "smag*", "bitter*", "sød*", "sur", "surt", "salt*", "krydr*", "appetit*", "slug*", "tyg*",
    "taste*", "tasty", "bitter*", "sweet*", "sour*", "salty", "spicy", "appetite*", "swallow*", "chew*", "flavo*",
  ],
  Ad: [
    "tænk*", "tanke*", "logi*", "analys*", "overvej*", "forstå*", "forstår", "mening*", "beslut*", "vurder*",
    "fakta", "data", "proces*", "system*", "viden", "lær*", "regn*", "konklu*", "forklar*", "princip*",
    "think*", "thought*", "logic*", "analy*", "consider*", "understand*", "understood", "mean*", "decid*",
    "decision*", "evaluat*", "fact*", "data", "process*", "system*", "know*", "knew", "learn*", "reason*",
    "conclu*", "explain*", "principle*",
  ],
};

interface CompiledEntry {
  system: RepSystem;
  term: string;
  prefix: boolean;
}

const COMPILED: CompiledEntry[] = REP_SYSTEMS.flatMap((system) =>
  LEXICON[system].map((raw) => ({
    system,
    term: raw.replace(/\*/g, ""),
    prefix: raw.includes("*"),
  })),
);

const EXACT = new Map<string, CompiledEntry>();
const PREFIXES: CompiledEntry[] = [];
for (const e of COMPILED) {
  if (e.prefix) PREFIXES.push(e);
  else if (!EXACT.has(e.term)) EXACT.set(e.term, e);
}
// Længste præfiks først, så "mavefornemmelse" vinder over "ma…".
PREFIXES.sort((a, b) => b.term.length - a.term.length);

export interface LexiconCounts {
  counts: Record<RepSystem, number>;
  distribution: VakogDistribution;
  total: number;
  topTerms: { term: string; system: RepSystem; count: number }[];
}

export function countVakogPredicates(text: string): LexiconCounts {
  const counts = Object.fromEntries(REP_SYSTEMS.map((s) => [s, 0])) as Record<RepSystem, number>;
  const termCounts = new Map<string, { system: RepSystem; count: number }>();
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  for (const w of words) {
    let hit = EXACT.get(w);
    if (!hit) hit = PREFIXES.find((p) => p.term.length >= 3 && w.startsWith(p.term));
    if (!hit) continue;
    counts[hit.system]++;
    const cur = termCounts.get(w) ?? { system: hit.system, count: 0 };
    cur.count++;
    termCounts.set(w, cur);
  }
  const total = REP_SYSTEMS.reduce((a, s) => a + counts[s], 0);
  const topTerms = [...termCounts.entries()]
    .map(([term, v]) => ({ term, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  return { counts, distribution: normalizeDistribution(counts), total, topTerms };
}
