import { describe, expect, it } from "vitest";
import { buildReport } from "../src/report/build";
import { pdfText, renderPdf } from "../src/report/pdf";
import { generateMockAnalysis } from "../src/testing/mock-analysis";
import { SAMPLE_TRANSCRIPT } from "../src/testing/sample-transcript";

describe("PDF-rapport", () => {
  it("renderer en gyldig PDF med én side pr. sektion", async () => {
    const doc = buildReport(generateMockAnalysis(SAMPLE_TRANSCRIPT, { subjectName: "Mette Holm" }), { expertName: "Mette Holm" });
    const pdf = await renderPdf(doc);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(20_000);
    const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(doc.sections.length);
  });

  it("mapper glyffer uden for skrifttypens tegnsæt", () => {
    expect(pdfText("Vᶜ → Ad → Kⁱ")).toBe("Vc › Ad › Ki");
    expect(pdfText("æøå “citat”")).toBe("æøå “citat”");
  });
});
