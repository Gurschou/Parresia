import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Badge, ReportBlock, ReportDocument, ReportItem, Tone } from "./blocks";

/**
 * PDF-dokumentet for rapportmodellen (React-PDF) — uden Node-afhængigheder,
 * så det bruges både på serveren (`pdf.tsx`) og i browseren (artifactet).
 * Tegn uden for skrifttypernes latin-subset mappes af `pdfText`.
 */

export interface PdfFonts {
  sans: string;
  serif: string;
}

/** Indbyggede PDF-skrifttyper (WinAnsi: dækker æøå og typografiske tegn). */
export const BUILTIN_PDF_FONTS: PdfFonts = { sans: "Helvetica", serif: "Times-Roman" };

const C = {
  ink: "#1d1c2b",
  muted: "#6b6a75",
  faint: "#9a98a3",
  border: "#e4e2da",
  soft: "#f6f5f1",
  primary: "#3f3aa8",
  primarySoft: "#ecebfa",
  positive: "#1f7a4d",
  positiveSoft: "#e6f4ec",
  negative: "#b23a2e",
  negativeSoft: "#fbeceb",
  info: "#2a5db0",
  infoSoft: "#e8eff9",
  warning: "#8a6100",
  warningSoft: "#fbf3df",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"],
};

const TONE: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: C.muted, bg: C.soft },
  positive: { fg: C.positive, bg: C.positiveSoft },
  negative: { fg: C.negative, bg: C.negativeSoft },
  info: { fg: C.info, bg: C.infoSoft },
  warning: { fg: C.warning, bg: C.warningSoft },
};

const SUPERSCRIPT: Record<string, string> = { "ⁱ": "i", "ᶜ": "c", "ᵉ": "e", "ʳ": "r", "ᵈ": "d" };
/** Mapper glyffer uden for latin-subsettet. */
export function pdfText(s: string): string {
  return s
    .replace(/[ⁱᶜᵉʳᵈ]/g, (c) => SUPERSCRIPT[c] ?? c)
    .replace(/→/g, "›")
    .replace(/[█░]/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
}

function styles(f: { sans: string; serif: string }) {
  return StyleSheet.create({
    page: { paddingTop: 56, paddingBottom: 64, paddingHorizontal: 52, fontFamily: f.sans, fontSize: 9.5, color: C.ink },
    footer: { position: "absolute", bottom: 28, fontSize: 7.5, color: C.faint },
    brand: { fontSize: 7.5, letterSpacing: 2, color: C.primary, fontWeight: 700, marginBottom: 18 },
    title: { fontFamily: f.serif, fontWeight: 600, fontSize: 28, lineHeight: 1.12, marginBottom: 8 },
    subtitle: { fontFamily: f.serif, fontStyle: "italic", fontSize: 13, color: C.muted, lineHeight: 1.35, marginBottom: 18 },
    metaRow: { lineHeight: 1.4, flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.border, paddingVertical: 3 },
    metaLabel: { width: 130, color: C.muted, fontSize: 8.5 },
    metaValue: { flex: 1, fontSize: 8.5, fontWeight: 700 },
    tocTitle: { fontSize: 7.5, letterSpacing: 1.5, color: C.muted, fontWeight: 700, marginTop: 26, marginBottom: 6 },
    tocItem: { lineHeight: 1.5, fontSize: 9.5, paddingVertical: 2 },
    sectionHead: { marginTop: 4, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
    sectionTitle: { fontFamily: f.serif, fontWeight: 600, fontSize: 18, lineHeight: 1.2 },
    sectionDesc: { lineHeight: 1.5, fontSize: 8.5, color: C.muted, marginTop: 2 },
    p: { lineHeight: 1.5, marginBottom: 7 },
    sub: { fontSize: 7.5, letterSpacing: 1.3, fontWeight: 700, color: C.muted, marginTop: 8, marginBottom: 6 },
    bulletRow: { lineHeight: 1.5, flexDirection: "row", marginBottom: 3 },
    bulletDot: { width: 10, color: C.primary, fontWeight: 700 },
    item: { lineHeight: 1.5, borderWidth: 0.75, borderColor: C.border, borderRadius: 6, padding: 9, marginBottom: 7 },
    itemTitle: { fontWeight: 700, fontSize: 10, marginBottom: 3 },
    badgeRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
    badge: { lineHeight: 1.25, fontSize: 7, fontWeight: 700, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, marginRight: 4, marginBottom: 2 },
    body: { color: C.muted, marginBottom: 3 },
    detail: { lineHeight: 1.5, backgroundColor: C.soft, borderRadius: 4, padding: 5, marginTop: 3 },
    detailLabel: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.8, color: C.muted },
    quote: { lineHeight: 1.45, fontFamily: f.serif, fontStyle: "italic", fontSize: 9.5, color: "#3b3a46", borderLeftWidth: 1.5, borderLeftColor: "#b9b6e8", paddingLeft: 7, marginTop: 4 },
    callout: { lineHeight: 1.5, borderRadius: 6, padding: 8, marginBottom: 8 },
    kvGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
    kv: { lineHeight: 1.5, width: "50%", paddingRight: 8, marginBottom: 6 },
    kvLabel: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.8, color: C.muted },
    kvValue: { fontWeight: 700 },
    barRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
    barLabel: { width: 130, fontSize: 8.5 },
    barTrack: { flex: 1, height: 6, backgroundColor: C.soft, borderRadius: 3 },
    barValue: { width: 44, textAlign: "right", fontSize: 8.5, color: C.muted },
    flow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", backgroundColor: C.soft, borderRadius: 6, padding: 8, marginBottom: 8 },
    chip: { lineHeight: 1.5, borderWidth: 0.75, borderColor: C.border, backgroundColor: "#ffffff", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4, marginRight: 4, marginBottom: 4, maxWidth: 150 },
    chipLabel: { fontWeight: 700, fontSize: 9 },
    chipCaption: { fontSize: 7, color: C.muted },
    arrow: { color: C.faint, fontSize: 12, marginRight: 4, marginBottom: 4 },
    toteRow: { flexDirection: "row", alignItems: "stretch", marginBottom: 10 },
    toteBox: { lineHeight: 1.5, flex: 1, borderWidth: 0.75, borderColor: C.border, borderRadius: 6, padding: 7, backgroundColor: "#ffffff" },
    toteLabel: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.8, color: C.muted, marginBottom: 2 },
    table: { borderWidth: 0.75, borderColor: C.border, borderRadius: 6, marginBottom: 8 },
    tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.border },
    th: { flex: 1, padding: 5, fontSize: 7, fontWeight: 700, color: C.muted, backgroundColor: C.soft },
    td: { lineHeight: 1.5, flex: 1, padding: 5, fontSize: 8.5 },
  });
}

type S = ReturnType<typeof styles>;

function Badges({ badges, s }: { badges?: Badge[]; s: S }) {
  if (!badges?.length) return null;
  return (
    <View style={s.badgeRow}>
      {badges.map((b, i) => {
        const t = TONE[b.tone ?? "neutral"];
        return (
          <Text key={i} style={[s.badge, { color: t.fg, backgroundColor: t.bg }]}>
            {pdfText(b.text)}
          </Text>
        );
      })}
    </View>
  );
}

function Item({ it, s }: { it: ReportItem; s: S }) {
  return (
    <View style={s.item} wrap={false}>
      <Text style={s.itemTitle}>{pdfText(it.title)}</Text>
      <Badges badges={it.badges} s={s} />
      {it.body ? <Text style={s.body}>{pdfText(it.body)}</Text> : null}
      {it.details?.map((d, i) => (
        <View key={i} style={s.detail}>
          <Text style={s.detailLabel}>{pdfText(d.label.toUpperCase())}</Text>
          <Text>{pdfText(d.value)}</Text>
        </View>
      ))}
      {it.quotes?.filter((q) => q.trim()).map((q, i) => (
        <Text key={i} style={s.quote}>
          “{pdfText(q.trim())}”
        </Text>
      ))}
    </View>
  );
}

const REP_IDX: Record<string, number> = { V: 0, A: 1, K: 2, O: 3, G: 4 };
const repColor = (label: string) => (label.startsWith("Ad") ? C.series[5]! : C.series[REP_IDX[label[0] ?? ""] ?? 0] ?? C.primary);

function Block({ b, s }: { b: ReportBlock; s: S }) {
  switch (b.type) {
    case "paragraph":
      return <Text style={s.p}>{pdfText(b.text)}</Text>;
    case "subheading":
      return <Text style={s.sub}>{pdfText(b.text.toUpperCase())}</Text>;
    case "bullets":
      return (
        <View style={{ marginBottom: 6 }}>
          {b.items.map((t, i) => (
            <View key={i} style={s.bulletRow}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={{ flex: 1 }}>{pdfText(t)}</Text>
            </View>
          ))}
        </View>
      );
    case "items":
      return b.items.length ? (
        <View>
          {b.items.map((it, i) => (
            <Item key={i} it={it} s={s} />
          ))}
        </View>
      ) : (
        <Text style={[s.p, { color: C.muted, fontStyle: "italic" }]}>{pdfText(b.emptyText ?? "Ingen fund.")}</Text>
      );
    case "quote":
      return <Text style={[s.quote, { marginBottom: 6 }]}>“{pdfText(b.text)}”</Text>;
    case "callout": {
      const t = TONE[b.tone];
      return (
        <View style={[s.callout, { backgroundColor: t.bg }]} wrap={false}>
          {b.title ? <Text style={{ fontWeight: 700, color: t.fg }}>{pdfText(b.title)}</Text> : null}
          <Text>{pdfText(b.text)}</Text>
        </View>
      );
    }
    case "keyvalue":
      return (
        <View style={s.kvGrid}>
          {b.items.map((kv, i) => (
            <View key={i} style={s.kv}>
              <Text style={s.kvLabel}>{pdfText(kv.label.toUpperCase())}</Text>
              <Text style={s.kvValue}>{pdfText(kv.value)}</Text>
            </View>
          ))}
        </View>
      );
    case "bars":
      return (
        <View style={{ marginBottom: 8 }} wrap={false}>
          {b.items.map((it, i) => (
            <View key={i} style={s.barRow}>
              <Text style={[s.barLabel, it.highlight ? { fontWeight: 700 } : {}]}>{pdfText(it.label)}</Text>
              <View style={s.barTrack}>
                <View
                  style={{
                    width: `${Math.max(0, Math.min(100, (it.value / b.max) * 100))}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: it.highlight ? C.primary : "#b9b6e8",
                  }}
                />
              </View>
              <Text style={s.barValue}>
                {Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}
                {b.unit}
              </Text>
            </View>
          ))}
        </View>
      );
    case "flow":
      return (
        <View style={s.flow} wrap={false}>
          {b.steps.map((st, i) => (
            <React.Fragment key={i}>
              <View style={s.chip}>
                <Text style={[s.chipLabel, { color: repColor(st.label) }]}>{pdfText(st.label)}</Text>
                {st.caption ? <Text style={s.chipCaption}>{pdfText(st.caption)}</Text> : null}
              </View>
              <Text style={s.arrow}>›</Text>
            </React.Fragment>
          ))}
          <View style={[s.chip, { backgroundColor: C.primarySoft }]}>
            <Text style={[s.chipLabel, { color: C.primary }]}>Exit</Text>
          </View>
        </View>
      );
    case "tote":
      return (
        <View style={s.toteRow} wrap={false}>
          <View style={s.toteBox}>
            <Text style={s.toteLabel}>TRIGGER</Text>
            <Text>{pdfText(b.trigger || "—")}</Text>
          </View>
          <Text style={[s.arrow, { alignSelf: "center", marginHorizontal: 4 }]}>›</Text>
          <View style={[s.toteBox, { flex: 1.4, backgroundColor: C.primarySoft }]}>
            <Text style={s.toteLabel}>TEST</Text>
            <Text>{pdfText(b.test || "—")}</Text>
            <Text style={[s.toteLabel, { marginTop: 5 }]}>OPERATE (indtil testen er opfyldt)</Text>
            {b.operate.length ? b.operate.map((o, i) => <Text key={i}>• {pdfText(o)}</Text>) : <Text>—</Text>}
          </View>
          <Text style={[s.arrow, { alignSelf: "center", marginHorizontal: 4 }]}>›</Text>
          <View style={[s.toteBox, { backgroundColor: C.positiveSoft }]}>
            <Text style={s.toteLabel}>EXIT</Text>
            <Text>{pdfText(b.exit || "—")}</Text>
          </View>
        </View>
      );
    case "table":
      return (
        <View style={s.table}>
          <View style={s.tr} fixed={false}>
            {b.headers.map((h, i) => (
              <Text key={i} style={s.th}>
                {pdfText(h.toUpperCase())}
              </Text>
            ))}
          </View>
          {b.rows.map((r, i) => (
            <View key={i} style={[s.tr, i === b.rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              {r.map((c, j) => (
                <Text key={j} style={[s.td, j === 0 ? { fontWeight: 700 } : {}]}>
                  {pdfText(c)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
  }
}

export function ReportPdf({ doc, fonts = BUILTIN_PDF_FONTS }: { doc: ReportDocument; fonts?: PdfFonts }) {
  const f = fonts;
  const s = styles(f);
  return (
    <Document title={pdfText(doc.title)} author="Parresia Modeling Studio" subject={pdfText(doc.subtitle)} language="da">
      {/* Forside: titel, metadata og indhold */}
      <Page size="A4" style={s.page}>
        <View style={{ marginTop: 120 }}>
          <Text style={s.brand}>PARRESIA · MODELING STUDIO</Text>
          <Text style={[s.title, { fontSize: 34 }]}>{pdfText(doc.title)}</Text>
          <Text style={s.subtitle}>{pdfText(doc.subtitle)}</Text>
        </View>
        <View style={{ marginTop: 18 }}>
          {doc.meta.map((m) => (
            <View key={m.label} style={s.metaRow}>
              <Text style={s.metaLabel}>{pdfText(m.label)}</Text>
              <Text style={s.metaValue}>{pdfText(m.value)}</Text>
            </View>
          ))}
        </View>
        <Text style={s.tocTitle}>INDHOLD</Text>
        {doc.sections.map((sec, i) => (
          <Text key={sec.key} style={s.tocItem}>
            {i + 1}. {pdfText(sec.title)}
          </Text>
        ))}
        <Text style={[s.sectionDesc, { marginTop: 28 }]}>
          Citater er gengivet ordret fra transskriptet. Fund markeret som “Inferens” er fortolkninger, ikke direkte belæg.
        </Text>
        {footer(s, doc.title)}
      </Page>
      {/* Én side (eller flere) pr. sektion */}
      {doc.sections.map((sec, idx) => (
        <Page key={sec.key} size="A4" style={s.page}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>
              {idx + 1}. {pdfText(sec.title)}
            </Text>
            <Text style={s.sectionDesc}>{pdfText(sec.description)}</Text>
          </View>
          {sec.blocks.map((b, i) => (
            <Block key={i} b={b} s={s} />
          ))}
          {footer(s, doc.title)}
        </Page>
      ))}
    </Document>
  );
}

/**
 * Footer som funktionskald (ikke komponent): React-PDF 4.9 dropper
 * dynamiske `render`-tekster, der returneres fra en funktionskomponent.
 */
function footer(s: S, title: string) {
  return [
    <Text key="f-title" style={[s.footer, { left: 52, width: 360 }]} fixed>
      {pdfText(title)}
    </Text>,
    <Text
      key="f-page"
      style={[s.footer, { right: 52, width: 120, textAlign: "right" }]}
      fixed
      render={({ pageNumber, totalPages }) => `Side ${pageNumber} af ${totalPages}`}
    />,
  ];
}
