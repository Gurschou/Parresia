import type { ReportBlock, ReportDocument, ReportItem } from "./blocks";

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");
const quoteLines = (q: string) => q.split("\n").map((l) => `> ${l}`).join("\n");

function bar(value: number, max: number, width = 20): string {
  const filled = max > 0 ? Math.round((Math.max(0, Math.min(value, max)) / max) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function item(it: ReportItem): string {
  const lines: string[] = [];
  const badges = it.badges?.length ? `  \n  _${it.badges.map((b) => b.text).join(" · ")}_` : "";
  lines.push(`- **${it.title}**${badges}`);
  if (it.body) lines.push(`  ${it.body}`);
  for (const d of it.details ?? []) lines.push(`  - _${d.label}:_ ${d.value}`);
  for (const q of it.quotes ?? []) if (q.trim()) lines.push(`  > “${q.trim()}”`);
  return lines.join("\n");
}

function block(b: ReportBlock): string {
  switch (b.type) {
    case "paragraph":
      return b.text;
    case "subheading":
      return `### ${b.text}`;
    case "bullets":
      return b.items.map((i) => `- ${i}`).join("\n");
    case "items":
      return b.items.length ? b.items.map(item).join("\n\n") : `_${b.emptyText ?? "Ingen fund."}_`;
    case "quote":
      return quoteLines(`“${b.text}”`);
    case "callout": {
      const icon = b.tone === "warning" ? "⚠️" : b.tone === "positive" ? "✅" : "ℹ️";
      return quoteLines(`${icon} ${b.title ? `**${b.title}:** ` : ""}${b.text}`);
    }
    case "keyvalue":
      return b.items.map((i) => `- **${i.label}:** ${i.value}`).join("\n");
    case "bars":
      return [
        ...(b.title ? [`**${b.title}**`, ""] : []),
        "| | | |",
        "|---|---|---:|",
        ...b.items.map((i) => `| ${i.highlight ? `**${esc(i.label)}**` : esc(i.label)} | \`${bar(i.value, b.max)}\` | ${i.value}${b.unit ?? ""} |`),
      ].join("\n");
    case "flow":
      return `**${b.title}:** ${b.steps.map((s) => `\`${s.label}\``).join(" → ")}\n\n${b.steps
        .map((s, i) => `${i + 1}. \`${s.label}\`${s.caption ? ` — ${s.caption}` : ""}`)
        .join("\n")}`;
    case "tote":
      return [
        "**TOTE-løkke**",
        "",
        "| Fase | Indhold |",
        "|---|---|",
        `| Trigger | ${esc(b.trigger)} |`,
        `| Test | ${esc(b.test)} |`,
        `| Operate | ${esc(b.operate.join("; ") || "—")} |`,
        `| Exit | ${esc(b.exit)} |`,
      ].join("\n");
    case "table":
      return [
        `| ${b.headers.map(esc).join(" | ")} |`,
        `|${b.headers.map(() => "---").join("|")}|`,
        ...b.rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
      ].join("\n");
  }
}

/** Renderer rapportmodellen til GitHub-flavored Markdown. */
export function renderMarkdown(doc: ReportDocument): string {
  const out: string[] = [`# ${doc.title}`, "", `_${doc.subtitle}_`, ""];
  out.push(...doc.meta.map((m) => `- **${m.label}:** ${m.value}`), "");
  out.push("## Indhold", "", ...doc.sections.map((s, i) => `${i + 1}. [${s.title}](#${slug(s.title)})`), "");
  doc.sections.forEach((s) => {
    out.push(`## ${s.title}`, "", `_${s.description}_`, "");
    for (const b of s.blocks) out.push(block(b), "");
  });
  out.push("---", "_Genereret af Behavioral Modeling Platform. Citater er gengivet ordret fra transskriptet; fund markeret som inferens er fortolkninger._", "");
  return out.join("\n");
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}
