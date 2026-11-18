import { buildModelingReport, renderMarkdown } from "@bm/core";
import { HttpError, withUser } from "@/server/http";
import { getAnalysisModeling } from "@/server/modeling";

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
    .slice(0, 60) || "person";

/** GET /api/analyses/:id/model/export?format=pdf|md|json — modelleringskortet som fil. */
export const GET = withUser<Ctx>(async (req, user, ctx) => {
  const { id } = await ctx.params;
  const format = (new URL(req.url).searchParams.get("format") ?? "pdf").toLowerCase();
  const { map } = await getAnalysisModeling(user.id, id);
  if (!map || map.status !== "done" || !map.result) throw new HttpError(409, "not_ready", "Modelleringskortet er ikke færdigt endnu.");
  const r = map.result;
  const base = `modelleringskort-${slug(r.person.name)}-${map.updatedAt.toISOString().slice(0, 10)}`;
  const disposition = (ext: string) => `attachment; filename="${base}.${ext}"`;

  if (format === "json") {
    return new Response(JSON.stringify({ source: map.source, model: map.model, ...r }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": disposition("json") },
    });
  }
  const doc = buildModelingReport(r, {
    generatedAt: map.updatedAt.toISOString(),
    model: map.model ?? undefined,
    sourceLabel: map.source === "claude" ? "Claude" : "Tekstbaseret (uden Claude)",
  });
  if (format === "md" || format === "markdown") {
    return new Response(renderMarkdown(doc), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": disposition("md") } });
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
