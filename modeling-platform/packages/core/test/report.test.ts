import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build";
import { renderMarkdown } from "../src/report/markdown";
import { CATEGORIES } from "../src/categories/registry";
import { generateMockAnalysis } from "../src/testing/mock-analysis";
import { SAMPLE_TRANSCRIPT } from "../src/testing/sample-transcript";

describe("rapport", () => {
  const result = generateMockAnalysis(SAMPLE_TRANSCRIPT, { subjectName: "Mette Holm" });
  const doc = buildReport(result, { expertName: "Mette Holm", projectName: "Salgsmodel", model: "claude-opus-5-5" });

  it("har én sektion pr. kategori i registrets rækkefølge", () => {
    expect(doc.sections.map((s) => s.key)).toEqual(CATEGORIES.map((c) => c.key));
    for (const s of doc.sections) expect(s.blocks.length).toBeGreaterThan(0);
  });

  it("renderer Markdown med alle sektioner, citater og TOTE", () => {
    const md = renderMarkdown(doc);
    for (const c of CATEGORIES) expect(md).toContain(`## ${c.title}`);
    expect(md).toContain("**TOTE-løkke**");
    expect(md).toContain("> “");
    expect(md).toContain("Mette Holm");
    expect(md).toMatch(/\| (\*\*)?Visuelt \(V\)(\*\*)? \| `[█░]+` \|/);
  });
});
