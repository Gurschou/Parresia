/**
 * Format-uafhængig rapportmodel. Hver kategori oversætter sine data til
 * blokke; derefter renderes de samme blokke til Markdown, PDF og web-UI.
 * En ny bloktype skal derfor implementeres i alle tre renderere
 * (`markdown.ts`, `pdf.tsx`, `apps/web/components/report/blocks.tsx`).
 */

export type Tone = "neutral" | "positive" | "negative" | "info" | "warning";

export interface Badge {
  text: string;
  tone?: Tone;
}

export interface ReportItem {
  /** Overskrift for fundet (fed i rendering). */
  title: string;
  /** Brødtekst/forklaring. */
  body?: string;
  /** Små etiketter: type, sikkerhed, evidens … */
  badges?: Badge[];
  /** Nøgle/værdi-detaljer under fundet. */
  details?: { label: string; value: string }[];
  /** Ordrette citater fra transskriptet. */
  quotes?: string[];
}

export type ReportBlock =
  | { type: "paragraph"; text: string }
  | { type: "subheading"; text: string }
  | { type: "items"; items: ReportItem[]; emptyText?: string }
  | { type: "bullets"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "callout"; tone: Tone; title?: string; text: string }
  | { type: "keyvalue"; items: { label: string; value: string }[] }
  | {
      type: "bars";
      title?: string;
      unit?: string;
      max: number;
      items: { label: string; value: number; highlight?: boolean }[];
    }
  | {
      type: "flow";
      title: string;
      steps: { label: string; caption?: string }[];
    }
  | {
      type: "tote";
      trigger: string;
      test: string;
      operate: string[];
      exit: string;
    }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface ReportSection {
  key: string;
  title: string;
  description: string;
  blocks: ReportBlock[];
}

export interface ReportDocument {
  title: string;
  subtitle: string;
  generatedAt: string;
  meta: { label: string; value: string }[];
  sections: ReportSection[];
}
