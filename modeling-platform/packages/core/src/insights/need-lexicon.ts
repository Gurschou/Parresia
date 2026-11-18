import { HUMAN_NEEDS, type HumanNeedKey } from "../schema/common";

/**
 * Ordstammer, der peger på de 6 Human Needs. Bruges af mock-analysen og af den
 * deterministiske overbevisnings-match (hvilke behov en overbevisning tjener).
 */
export const NEED_WORDS: Record<HumanNeedKey, string[]> = {
  certainty: ["sikker", "kontrol", "plan", "forbered", "tjekliste", "regel", "ro", "rolig", "tryg", "certain", "control", "plan"],
  variety: ["ny", "nyt", "eventyr", "forandring", "anderledes", "spænd", "mulighed", "new", "change", "adventure"],
  significance: ["bedst", "vinde", "vinder", "anerkend", "stolt", "først", "listen", "best", "win", "proud"],
  love_connection: ["forbindelse", "team", "familie", "sammen", "forstå", "kunde", "folk", "connect", "together", "family"],
  growth: ["lær", "udvikl", "bedre", "mønstre", "vokse", "vækst", "fremgang", "learn", "grow", "improve", "better"],
  contribution: ["hjælp", "bidrag", "brug for", "for andre", "andres", "help", "contribut"],
};

export const countWords = (text: string, words: string[]) =>
  words.reduce((a, w) => a + (text.match(new RegExp(`(?<![\\p{L}])${w}`, "giu"))?.length ?? 0), 0);

/** Hvilke behov en tekst taler til (sorteret efter antal træffere). */
export function needsInText(text: string): HumanNeedKey[] {
  const lower = text.toLowerCase();
  return HUMAN_NEEDS.map((n) => [n, countWords(lower, NEED_WORDS[n])] as const)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([n]) => n);
}
