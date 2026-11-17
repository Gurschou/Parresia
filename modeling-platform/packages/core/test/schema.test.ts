import { describe, expect, it } from "vitest";
import {
  AnalysisResultSchema,
  CATEGORIES,
  REQUIRED_SECTION_KEYS,
  normalizeResult,
  resultMetrics,
} from "../src/categories/registry";
import { ANALYSIS_API_JSON_SCHEMA, ANALYSIS_FULL_JSON_SCHEMA, validateAnalysis } from "../src/analyzer/analyze";
import { generateMockAnalysis } from "../src/testing/mock-analysis";
import { SAMPLE_TRANSCRIPT } from "../src/testing/sample-transcript";

const valid = () => structuredClone(generateMockAnalysis(SAMPLE_TRANSCRIPT));

/** Gennemløber et JSON-schema og tæller det, structured outputs begrænser. */
function audit(schema: unknown) {
  let optional = 0;
  let unions = 0;
  const unsupported: string[] = [];
  const objectsWithoutAdditional: string[] = [];
  const walk = (n: unknown, path: string) => {
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.type === "object" && o.properties) {
      const req = new Set((o.required as string[]) ?? []);
      for (const k of Object.keys(o.properties as object)) if (!req.has(k)) optional++;
      if (o.additionalProperties !== false) objectsWithoutAdditional.push(path);
    }
    if (o.anyOf || Array.isArray(o.type)) unions++;
    for (const k of ["minimum", "maximum", "minLength", "maxLength", "maxItems", "multipleOf"]) if (k in o) unsupported.push(`${path}.${k}`);
    if (typeof o.minItems === "number" && o.minItems > 1) unsupported.push(`${path}.minItems`);
    for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  walk(schema, "$");
  return { optional, unions, unsupported, objectsWithoutAdditional };
}

describe("AnalysisResultSchema", () => {
  it("indeholder alle sektioner fra specifikationen", () => {
    const keys = CATEGORIES.map((c) => c.key);
    for (const k of REQUIRED_SECTION_KEYS) expect(keys).toContain(k);
    expect(Object.keys(AnalysisResultSchema.shape)).toEqual(keys);
  });

  it("accepterer en gyldig analyse", () => {
    expect(AnalysisResultSchema.safeParse(valid()).success).toBe(true);
  });

  it("afviser manglende sektion", () => {
    const d = valid() as Record<string, unknown>;
    delete d.vakog;
    const r = AnalysisResultSchema.safeParse(d);
    expect(r.success).toBe(false);
  });

  it("afviser ukendt enum-værdi", () => {
    const d = valid();
    (d.vakog as { primary_system: string }).primary_system = "X";
    expect(AnalysisResultSchema.safeParse(d).success).toBe(false);
  });

  it("afviser behovs-score uden for 0-10", () => {
    const d = valid();
    d.values_and_6_human_needs.human_needs.growth.score = 14;
    expect(AnalysisResultSchema.safeParse(d).success).toBe(false);
  });

  it("afviser ukendt meta-program og ukendt kategori i gaps", () => {
    const d = valid();
    (d.meta_programs.programs[0] as { program: string }).program = "astrology";
    expect(AnalysisResultSchema.safeParse(d).success).toBe(false);
    const g = valid();
    (g.gaps_and_next_questions.gaps[0] as { category: string }).category = "summary";
    expect(AnalysisResultSchema.safeParse(g).success).toBe(false);
  });

  it("validateAnalysis accepterer både rå resultat og envelope", () => {
    expect(validateAnalysis(valid()).ok).toBe(true);
    expect(validateAnalysis({ schema_version: 1, result: valid(), meta: {} }).ok).toBe(true);
    const bad = validateAnalysis({ foo: 1 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues).toContain("summary");
  });
});

describe("JSON-schema til structured outputs", () => {
  it("overholder API-grænserne (0 valgfrie, ingen unions, ingen ikke-understøttede constraints)", () => {
    const a = audit(ANALYSIS_API_JSON_SCHEMA);
    expect(a.optional).toBe(0);
    expect(a.unions).toBeLessThanOrEqual(16);
    expect(a.unsupported).toEqual([]);
    expect(a.objectsWithoutAdditional).toEqual([]);
  });

  it("det fulde schema bevarer min/max til lokal validering", () => {
    expect(JSON.stringify(ANALYSIS_FULL_JSON_SCHEMA)).toContain('"maximum":10');
  });
});

describe("normalisering og metrics", () => {
  it("normaliserer VAKOG til 100 % og fjerner dublet-meta-programmer", () => {
    const d = valid();
    d.vakog.distribution = { V: 2, A: 1, K: 1, O: 0, G: 0, Ad: 0 };
    d.meta_programs.programs.push({ ...d.meta_programs.programs[0]!, strength: 99 });
    const n = normalizeResult(d);
    const sum = Object.values(n.vakog.distribution).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 0);
    expect(n.vakog.distribution.V).toBe(50);
    expect(n.meta_programs.programs.filter((p) => p.program === d.meta_programs.programs[0]!.program)).toHaveLength(1);
    expect(n.meta_programs.programs.find((p) => p.program === d.meta_programs.programs[0]!.program)!.strength).toBe(99);
  });

  it("producerer metrics for hver kategori", () => {
    const m = resultMetrics(valid());
    for (const c of CATEGORIES) expect(m).toHaveProperty(`${c.key}.count`);
    expect(m).toHaveProperty("values_and_6_human_needs.need_growth");
    expect(m).toHaveProperty("vakog.vakog_V");
  });
});
