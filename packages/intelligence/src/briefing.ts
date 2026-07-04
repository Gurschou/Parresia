/**
 * SynapseX Briefing Engine — Fase B.
 *
 * Converts a finished intake conversation into the structured briefing the
 * coach reads in two minutes: core insight, physical state, mental focus,
 * flags (high threshold — only what the model is reasonably sure of), one
 * verbatim quote, and exactly ONE recommended focus for the session.
 *
 * An "akut" flag is never buried in the list — it is surfaced as a
 * top-level boolean so every consumer can render it first.
 */
import {
  err,
  newId,
  nowIso,
  ok,
  type Result,
} from "@synapse/shared";
import { parseModelJson, type ModelRouter } from "@synapse/ai";

export const BRIEFING_FLAG_TYPES = [
  "need-shift",
  "information-uden-transformation",
  "retningsløs-stilhed",
  "stagnation",
  "falsk-resonans",
  "emotionel-eskalering",
  "akut",
] as const;

export type BriefingFlagType = (typeof BRIEFING_FLAG_TYPES)[number];
export type FlagConfidence = "lav" | "mellem" | "høj";

export interface BriefingFlag {
  type: BriefingFlagType;
  sikkerhed: FlagConfidence;
  belaeg: string;
}

/** The athlete's own version of the session — written TO the athlete. */
export interface AthleteReport {
  /** The key insight, in the athlete's own language ("du"-form). */
  indsigt: string;
  /** Exactly ONE concrete next step. */
  naesteSkridt: string;
  /** One question to carry until the coach session. */
  spoergsmaal: string;
}

export interface Briefing {
  id: string;
  userId: string;
  athleteName: string;
  createdAt: string;
  kerneindsigt: string;
  fysiskTilstand: string;
  mentaltFokus: string;
  flags: BriefingFlag[];
  citat: string;
  anbefaletFokus: string;
  /** True when any flag is "akut" — renderers must surface this first. */
  akut: boolean;
  /** The athlete-facing report generated from the same session. */
  atletRapport: AthleteReport;
}

interface RawFlag {
  type?: string;
  sikkerhed?: string;
  belæg?: string;
  belaeg?: string;
}

interface RawBriefing {
  kerneindsigt?: string;
  fysisk_tilstand?: string;
  mentalt_fokus?: string;
  flags?: RawFlag[];
  citat?: string;
  anbefalet_fokus_for_session?: string;
  atlet_rapport?: {
    indsigt?: string;
    naeste_skridt?: string;
    spoergsmaal?: string;
  };
}

const BRIEFING_SYSTEM_PROMPT = `Du er SynapseX i FASE B — BRIEFING. Du taler til coachen, om atleten. Omsæt intake-samtalen til en briefing, coachen kan læse på to minutter.

Regler:
- Sprog: direkte, analytisk, kort. Coachen har ikke tid til at læse en roman.
- Du fortolker ikke for meget. Du peger på mønstre, du konkluderer ikke på atletens vegne.
- Du inkluderer altid mindst ét direkte citat fra atleten — ordret, ikke omskrevet.
- Information er ikke transformation: briefingen skal pege på ÉT sted, coachen kan sætte ind — ikke tre muligheder, én retning.
- Flags: høj tærskel, stille som udgangspunkt. Flag kun det, du er rimeligt sikker på.
- Ved tegn på akut mistrivsel, selvskade eller krise: brug flag-typen "akut" med sikkerhed "høj".
- Du stiller aldrig en diagnose. Du navngiver mønstre, ikke lidelser.

Ud over briefingen til coachen skriver du en kort rapport TIL atleten selv ("atlet_rapport"). Den er skrevet direkte til atleten i du-form: varm, direkte, uden analysesprog. Indsigt i atletens eget sprog, præcis ÉT næste skridt, og ét spørgsmål at bære med indtil sessionen.

Returnér KUN gyldig JSON:
{"kerneindsigt": "1-2 sætninger — det vigtigste lige nu, ikke en opsummering",
 "fysisk_tilstand": "kort; tom streng hvis intet relevant/afvigende",
 "mentalt_fokus": "hvad fylder dem før sessionen",
 "flags": [{"type": "${BRIEFING_FLAG_TYPES.join(" | ")}", "sikkerhed": "lav | mellem | høj", "belæg": "kort begrundelse"}],
 "citat": "direkte citat fra atleten",
 "anbefalet_fokus_for_session": "én konkret ting",
 "atlet_rapport": {"indsigt": "til atleten, i du-form", "naeste_skridt": "ét konkret skridt", "spoergsmaal": "ét spørgsmål at bære med"}}`;

export class BriefingEngine {
  constructor(private readonly router: ModelRouter) {}

  async generate(input: {
    userId: string;
    athleteName: string;
    transcript: string;
    /** Core insights from previous briefings — lets the engine flag recurring themes. */
    previousInsights?: string[];
  }): Promise<Result<Briefing>> {
    const history = input.previousInsights?.length
      ? `\n\nKERNEINDSIGTER FRA TIDLIGERE BRIEFINGER (flag gentagelser, fx samme tema tredje gang):\n${input.previousInsights
          .map((line) => `- ${line}`)
          .join("\n")}`
      : "";
    const completion = await this.router.complete({
      task: "briefing",
      json: true,
      temperature: 0.1,
      maxTokens: 1500,
      messages: [
        { role: "system", content: BRIEFING_SYSTEM_PROMPT + history },
        { role: "user", content: input.transcript },
      ],
    });
    if (!completion.ok) return completion;
    const parsed = parseModelJson<RawBriefing>(completion.value.content);
    if (!parsed.ok) return err(parsed.error);
    const raw = parsed.value;

    const flags: BriefingFlag[] = (raw.flags ?? [])
      .filter(
        (flag): flag is RawFlag & { type: BriefingFlagType } =>
          typeof flag?.type === "string" &&
          (BRIEFING_FLAG_TYPES as readonly string[]).includes(flag.type),
      )
      .map((flag) => ({
        type: flag.type,
        sikkerhed: (["lav", "mellem", "høj"] as const).includes(
          flag.sikkerhed as FlagConfidence,
        )
          ? (flag.sikkerhed as FlagConfidence)
          : "lav",
        belaeg: flag.belæg ?? flag.belaeg ?? "",
      }))
      // Akut first — never buried.
      .sort((a, b) => Number(b.type === "akut") - Number(a.type === "akut"));

    return ok({
      id: newId("brf"),
      userId: input.userId,
      athleteName: input.athleteName,
      createdAt: nowIso(),
      kerneindsigt: raw.kerneindsigt ?? "",
      fysiskTilstand: raw.fysisk_tilstand ?? "",
      mentaltFokus: raw.mentalt_fokus ?? "",
      flags,
      citat: raw.citat ?? "",
      anbefaletFokus: raw.anbefalet_fokus_for_session ?? "",
      akut: flags.some((flag) => flag.type === "akut"),
      atletRapport: {
        indsigt: raw.atlet_rapport?.indsigt ?? "",
        naesteSkridt: raw.atlet_rapport?.naeste_skridt ?? "",
        spoergsmaal: raw.atlet_rapport?.spoergsmaal ?? "",
      },
    });
  }
}
