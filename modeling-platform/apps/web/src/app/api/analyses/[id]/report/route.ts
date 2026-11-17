import { ANALYSIS_SCHEMA_VERSION, buildReport, renderMarkdown } from "@bm/core";
import { getAnalysis } from "@/server/analyses";
import { HttpError, withUser } from "@/server/http";

type Ctx = { params: Promise<{ id: string }> };

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "analyse";

/**
 * GET /api/analyses/:id/report?format=pdf|md|json
 * Genererer rapporten on-the-fly fra det gemte, validerede resultat.
 */
export const GET = withUser<Ctx>(async (req, user, ctx) => {
  const { id } = await ctx.params;
  const format = (new URL(req.url).searchParams.get("format") ?? "pdf").toLowerCase();
  const a = await getAnalysis(user.id, id);
  if (a.status !== "completed" || !a.result) throw new HttpError(409, "not_ready", "Analysen er ikke færdig endnu.");

  const base = `adfaerdsmodel-${slug(a.expert?.name ?? a.result.summary.subject)}-${(a.sessionDate ?? a.createdAt.toISOString()).slice(0, 10)}`;
  const disposition = (ext: string) => `attachment; filename="${base}.${ext}"`;

  if (format === "json") {
    const body = JSON.stringify({ schema_version: a.schemaVersion ?? ANALYSIS_SCHEMA_VERSION, result: a.result, meta: a.meta }, null, 2);
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": disposition("json") } });
  }

  const doc = buildReport(a.result, {
    expertName: a.expert?.name,
    projectName: a.project?.name,
    sessionDate: a.sessionDate ?? undefined,
    model: a.model ?? undefined,
    provider: a.meta?.provider,
    sourceLabel: a.sourceName || undefined,
  });

  if (format === "md" || format === "markdown") {
    return new Response(renderMarkdown(doc), {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": disposition("md") },
    });
  }
  if (format === "pdf") {
    const { renderPdf } = await import("@bm/core/pdf");
    const pdf = await renderPdf(doc);
    return new Response(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": disposition("pdf"), "content-length": String(pdf.length) },
    });
  }
  throw new HttpError(400, "bad_format", "Ukendt format. Brug pdf, md eller json.");
});
