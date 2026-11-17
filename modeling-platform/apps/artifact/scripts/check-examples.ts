import { AnalysisResultSchema, DEMO_TRANSCRIPTS } from "../src/lib";
import { EXAMPLE_RESULTS, EXAMPLE_SOURCES } from "../src/examples";

/** Validerer eksempel-analyserne: schema + at hvert citat står ordret i transskriptet. */
export function checkExamples(): string[] {
  const problems: string[] = [];
  for (const { id, demoIndex } of EXAMPLE_SOURCES) {
    const r = EXAMPLE_RESULTS[id];
    const t = DEMO_TRANSCRIPTS[demoIndex]!.transcript.replace(/\s+/g, " ");
    const parsed = AnalysisResultSchema.safeParse(r);
    if (!parsed.success) problems.push(...parsed.error.issues.slice(0, 8).map((i) => `${id}: schema ${i.path.join(".")} ${i.message}`));
    const quotes: string[] = [];
    const walk = (v: unknown, key = "") => {
      if (typeof v === "string" && (key === "quote" || key === "quotes")) quotes.push(v);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk(r);
    for (const q of quotes) if (q.trim() && !t.includes(q.replace(/\s+/g, " "))) problems.push(`${id}: citat ikke ordret: "${q.slice(0, 90)}"`);
  }
  return problems;
}

if (process.argv[1]?.endsWith("check-examples.ts")) {
  const p = checkExamples();
  console.log(p.length ? p.join("\n") : "✓ Alle eksempler er schema-gyldige, og alle citater står ordret i transskripterne");
  process.exitCode = p.length ? 1 : 0;
}
