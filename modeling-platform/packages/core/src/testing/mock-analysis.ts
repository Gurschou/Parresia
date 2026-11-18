import type { AnalysisResult } from "../categories/registry";
import { META_PROGRAM_IDS, type MetaProgramId } from "../categories/meta-programs";
import { HUMAN_NEEDS, REP_SYSTEMS, type HumanNeedKey, type RepSystem } from "../schema/common";
import { countVakogPredicates } from "../insights/vakog-lexicon";
import { NEED_WORDS as NEED_WORDS_LEXICON } from "../insights/need-lexicon";
import { HUMAN_NEED_LABEL } from "../schema/labels";
import type { AnalysisContext } from "../prompt/build-user-message";

/**
 * Deterministisk "falsk Claude" til lokal udvikling, demo og E2E-tests.
 * Bygger en plausibel, schema-gyldig analyse UD FRA transskriptet: citater
 * er ægte sætninger, VAKOG kommer fra leksikonet, behov og meta-programmer
 * fra simple ordtællinger. Det er IKKE en rigtig analyse.
 */

const SPEAKER_RE = /^\s*([\p{L} .'-]{1,40}):\s*/u;

function subjectSentences(transcript: string): { speaker: string | null; sentences: string[]; all: string[] } {
  const lines = transcript.split(/\n+/).filter((l) => l.trim());
  const speakers = new Map<string, number>();
  for (const l of lines) {
    const m = l.match(SPEAKER_RE);
    if (m?.[1]) speakers.set(m[1].trim(), (speakers.get(m[1].trim()) ?? 0) + l.length);
  }
  const interviewer = [...speakers.keys()].find((s) => /interview|^i$|spørger|coach/i.test(s));
  const subject =
    [...speakers.entries()].filter(([s]) => s !== interviewer).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const subjectText = lines
    .filter((l) => {
      const m = l.match(SPEAKER_RE);
      return subject ? m?.[1]?.trim() === subject : !interviewer || m?.[1]?.trim() !== interviewer;
    })
    .map((l) => l.replace(SPEAKER_RE, ""))
    .join(" ");
  const all = subjectText
    .replace(/\[[^\]]*\]/g, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10 && s.length < 260);
  const sentences = all.filter((s) => s.length > 25);
  return { speaker: subject, sentences: sentences.length ? sentences : [transcript.slice(0, 200).trim()], all };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const count = (text: string, words: string[]) =>
  words.reduce((a, w) => a + (text.match(new RegExp(`\\b${w}`, "giu"))?.length ?? 0), 0);

const NEED_WORDS = NEED_WORDS_LEXICON;

type BeliefType = AnalysisResult["enabling_beliefs"]["beliefs"][number]["belief_type"];

/**
 * Mock-banker: overbevisninger og værdier vælges ud fra, hvad personen faktisk
 * siger (mønstre matches mod personens egne sætninger, og citatet ER den
 * sætning). Så får demo-personerne forskellige — og delvist fælles — fund, og
 * overbevisnings-matchet har noget at arbejde med. Varianter med samme `impact`
 * er "samme" overbevisning formuleret forskelligt.
 */
const ENABLING_BANK: { patterns: { re: RegExp; statement: string }[]; type: BeliefType; impact: string }[] = [
  { patterns: [{ re: /forbereder mig/, statement: "Jeg er en person, der forbereder mig mere end andre." }], type: "identity", impact: "Gør grundighed til en del af identiteten og giver ro og selvtillid i pressede situationer." },
  {
    patterns: [
      { re: /et nej er bare information/, statement: "Et nej er bare information." },
      { re: /et tab er bare feedback/, statement: "Et tab er bare feedback." },
      { re: /fejl er bare information/, statement: "Fejl er bare information om, hvor jeg skal hen." },
    ],
    type: "complex_equivalence",
    impact: "Afkobler nederlag fra identiteten og holder læringsløkken åben, så presset falder.",
  },
  {
    patterns: [
      { re: /bygge folk/, statement: "Mit job er at bygge folk, ikke at være den bedste." },
      { re: /folk kan vokse/, statement: "Jeg bygger noget, hvor folk kan vokse." },
    ],
    type: "identity",
    impact: "Flytter fokus fra egen præstation til andres vækst, så teamet vokser, og ansvaret kan deles.",
  },
  { patterns: [{ re: /kan de også/, statement: "Hvis jeg kan, kan andre også." }], type: "possibility", impact: "Gør egne resultater til bevis for andre og giver præstationen mening ud over en selv." },
  { patterns: [{ re: /lidt bedre|måler alt/, statement: "Jeg bliver lidt bedre hver dag, når jeg måler det." }], type: "capability", impact: "Gør fremgang synlig og holder motivationen oppe, også når resultaterne svinger." },
  { patterns: [{ re: /god beslutning i dag|venter ikke/, statement: "En god beslutning i dag er bedre end en perfekt beslutning om en måned." }], type: "cause_effect", impact: "Holder tempoet højt og gør usikkerhed til noget, man kan handle i." },
  { patterns: [{ re: /leve med det værste/, statement: "Hvis jeg kan leve med det værste, kan jeg handle." }], type: "possibility", impact: "Gør frygten håndterbar og giver ro til at træffe store beslutninger under pres." },
  { patterns: [{ re: /kroppen føles let|føl under løbet/, statement: "Når kroppen føles let, er jeg klar." }], type: "cause_effect", impact: "Giver et klart indre signal, så tvivl og pres ikke styrer præstationen." },
  { patterns: [{ re: /én ting/, statement: "Én ting ad gangen gør mig bedre." }], type: "cause_effect", impact: "Holder fokus skarpt og gør forbedring overskuelig i stedet for overvældende." },
  { patterns: [{ re: /set ham gøre|set resultaterne/, statement: "Jeg tror på det, når jeg har set det virke." }], type: "about_world", impact: "Gør tillid til noget, der kan bygges op skridt for skridt, så ansvar kan slippes." },
];

const DISENABLING_BANK: { re: RegExp; statement: string; type: BeliefType; impact: string; cost: string; reframe: string }[] = [
  {
    re: /gør det selv/,
    statement: "Hvis jeg ikke gør det selv, bliver det ikke godt nok.",
    type: "cause_effect",
    impact: "Begrænser uddelegering og teamets vækst.",
    cost: "Aftener, weekender og et team, der ikke får lov at vokse.",
    reframe: "Hvornår har en anden gjort noget lige så godt — eller bedre — end du ville have gjort det?",
  },
  {
    re: /skuffe|pres i brystet/,
    statement: "Hvis jeg skuffer andre, er jeg ikke god nok.",
    type: "identity",
    impact: "Gør nederlag til et spørgsmål om identitet og skaber pres før store præstationer.",
    cost: "Pres i brystet og dårlig søvn før store stævner.",
    reframe: "Hvad ville du sige til en ung i klubben, der var bange for at skuffe dig?",
  },
  {
    re: /går jeg glip|sige nej til/,
    statement: "Hvis jeg siger nej, går jeg glip af noget stort.",
    type: "cause_effect",
    impact: "Gør det svært at prioritere og spreder energien over for mange muligheder.",
    cost: "Fokus — for mange projekter på én gang.",
    reframe: "Hvad har du fået, de gange du sagde nej til noget godt for at sige ja til noget bedre?",
  },
  {
    re: /styr på det hele/,
    statement: "Jeg skal have styr på det hele, før jeg må sige ja.",
    type: "cause_effect",
    impact: "Udskyder hver beslutning, indtil alt er perfekt, og gør usikkerhed til en stopklods.",
    cost: "Muligheder, der lukker sig, mens jeg venter.",
    reframe: "Hvad er det mindste ja, du kunne sige i dag uden at have styr på det hele?",
  },
  {
    re: /fejl foran/,
    statement: "Hvis jeg laver fejl foran en klient, er jeg ikke god nok.",
    type: "identity",
    impact: "Gør hvert nederlag til et spørgsmål om identiteten og øger presset før sessioner.",
    cost: "Pres i maven og nye metoder, jeg ikke tør afprøve.",
    reframe: "Hvad har dine klienter lært af at se dig håndtere en fejl?",
  },
];

const VALUE_BANK: { re: RegExp; value: string; direction: "toward" | "away_from"; rule: string }[] = [
  { re: /forbered/, value: "Forberedelse", direction: "toward", rule: "For at føle mig klar skal jeg have set det for mig og mærket, at det er rigtigt." },
  { re: /frihed/, value: "Frihed", direction: "toward", rule: "" },
  { re: /bedre|lære|udvikl/, value: "Udvikling", direction: "toward", rule: "Jeg er på rette vej, når jeg kan se, at jeg er blevet bedre end i går." },
  { re: /hjælpe|hjælper|vise de unge|bygge folk/, value: "Bidrag", direction: "toward", rule: "" },
  { re: /forstå|kunde|forbindelse|team/, value: "Forbindelse", direction: "toward", rule: "" },
  { re: /rolig|\bro\b/, value: "Ro", direction: "toward", rule: "" },
  { re: /skuffe/, value: "At skuffe andre", direction: "away_from", rule: "" },
  { re: /fiasko|går jeg glip/, value: "At gå glip af noget", direction: "away_from", rule: "" },
];

const pick = <T>(xs: T[], i: number): T => xs[((i % xs.length) + xs.length) % xs.length]!;

export function generateMockAnalysis(transcript: string, context: AnalysisContext = {}): AnalysisResult {
  const { speaker, sentences, all } = subjectSentences(transcript);
  const seed = hash(transcript);
  const q = (i: number) => pick(sentences, seed + i * 7);
  const lower = transcript.toLowerCase();
  const subject = context.subjectName || speaker || "Ukendt person";
  const lex = countVakogPredicates(transcript);
  const said = (re: RegExp) => all.find((x) => re.test(x.toLowerCase()));

  const enabling = ENABLING_BANK.flatMap((b) => {
    for (const p of b.patterns) {
      const quote = said(p.re);
      if (quote) return [{ statement: p.statement, belief_type: b.type, impact: b.impact, quotes: [quote], evidence_type: "quote" as const, confidence: "medium" as const }];
    }
    return [];
  }).slice(0, 5);
  const disenabling = DISENABLING_BANK.flatMap((b) => {
    const quote = said(b.re);
    return quote
      ? [{ statement: b.statement, belief_type: b.type, impact: b.impact, quotes: [quote], evidence_type: "quote" as const, confidence: "medium" as const, cost: b.cost, reframe_question: b.reframe }]
      : [];
  });
  const values = VALUE_BANK.flatMap((v) => {
    const quote = said(v.re);
    return quote ? [{ value: v.value, direction: v.direction, rule: v.rule, quote }] : [];
  })
    .slice(0, 4)
    .map((v, i) => ({ value: v.value, direction: v.direction, rank: i + 1, rule: v.rule, quotes: [v.quote], evidence_type: "quote" as const, confidence: "medium" as const }));

  const ranked = [...REP_SYSTEMS].sort((a, b) => lex.distribution[b] - lex.distribution[a]);
  const primary: RepSystem = lex.total > 0 ? ranked[0]! : "K";
  const secondary: RepSystem = lex.total > 0 ? ranked[1]! : "V";
  const distribution =
    lex.total > 0 ? lex.distribution : { V: 30, A: 15, K: 35, O: 0, G: 0, Ad: 20 };

  const needHits = Object.fromEntries(HUMAN_NEEDS.map((n) => [n, count(lower, NEED_WORDS[n])])) as Record<HumanNeedKey, number>;
  const maxHits = Math.max(1, ...Object.values(needHits));
  const needScores = Object.fromEntries(
    HUMAN_NEEDS.map((n, i) => [n, Math.min(10, Math.round((2.5 + (6.5 * needHits[n]) / maxHits + ((seed >> (i * 3)) % 7) / 10) * 10) / 10)]),
  ) as Record<HumanNeedKey, number>;
  const dominant = [...HUMAN_NEEDS].sort((a, b) => needScores[b] - needScores[a]).slice(0, 2);

  const toward = count(lower, ["opnå", "mål", "vil have", "skabe", "vinde", "achieve", "goal", "want"]);
  const away = count(lower, ["undgå", "aldrig", "ikke", "frygt", "problem", "avoid", "never", "fear"]);
  const internalRef = count(lower, ["jeg ved", "føles rigtigt", "mærker", "jeg tror", "i know", "feels right"]);
  const externalRef = count(lower, ["andre siger", "feedback", "fortæller mig", "resultaterne", "others", "told"]);
  const procedures = count(lower, ["først", "så ", "tjekliste", "trin", "til sidst", "first", "then", "step"]);
  const options = count(lower, ["muligheder", "alternativ", "kunne også", "options", "possibilit"]);

  const mp = (
    program: MetaProgramId,
    a: number,
    b: number,
    i: number,
    context: string,
    markers: string[],
  ) => ({
    program,
    leaning: (a === b ? "balanced" : a > b ? "pole_a" : "pole_b") as "pole_a" | "pole_b" | "balanced",
    strength: Math.min(95, 45 + Math.abs(a - b) * 8 + ((seed >> i) % 10)),
    context,
    linguistic_markers: markers,
    quotes: [q(20 + i)],
    evidence_type: "inference" as const,
    confidence: (Math.abs(a - b) > 2 ? "medium" : "low") as "medium" | "low",
  });

  const extraPrograms = META_PROGRAM_IDS.filter(
    (id) => !["toward_away", "internal_external_reference", "options_procedures"].includes(id),
  ).slice(seed % 4, (seed % 4) + 2);

  return {
    summary: {
      subject,
      result_modeled: context.goal || "Konsistent høj performance i komplekse beslutninger og relationer",
      overview: `${subject} viser et gennemgående mønster af grundig forberedelse, en tydelig indre test før handling og en stærk orientering mod at forstå den anden part. (Mock-analyse: genereret lokalt uden Claude.)`,
      key_insights: [
        "Forberedelse fungerer som en mental generalprøve med et klart exit-kriterium.",
        "Beslutninger valideres internt, men overbevisning om nye metoder kræver egen erfaring.",
        `Det primære repræsentationssystem ser ud til at være ${primary}, med ${secondary} som støtte.`,
        "Fejl omdefineres til information, hvilket holder læringsløkken åben.",
      ],
      source_quality: `Mock-analyse baseret på ${sentences.length} udsagn fra transskriptet; sæt LLM_PROVIDER=anthropic for en rigtig analyse.`,
    },
    cognitive_strategies: {
      strategies: [
        {
          name: "Mental generalprøve før vigtige møder",
          strategy_type: "performance",
          context: "Forberedelse til situationer med høj indsats",
          trigger: "Et vigtigt møde eller en vigtig beslutning nærmer sig",
          steps: [
            { system: "V", orientation: "internal", temporal: "constructed", description: "Ser situationen for sig", quote: q(1) },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Stiller sig selv et afklarende spørgsmål", quote: q(2) },
            { system: "K", orientation: "internal", temporal: "unspecified", description: "Tjekker om det føles rigtigt", quote: q(3) },
          ],
          notation: "Vᶜ → Ad → Kⁱ → Exit",
          tote: {
            trigger: "Mødet nærmer sig",
            test: "Kan jeg se et klart billede, og føles det rigtigt?",
            operate: ["Genlæser noter", "Stiller afklarende spørgsmål til sig selv"],
            exit: "Når der kommer en kropslig ro",
          },
          transferable: true,
          quotes: [q(1), q(3)],
          evidence_type: "quote",
          confidence: "medium",
        },
        {
          name: "Læring af nederlag",
          strategy_type: "learning",
          context: "Når noget går skævt",
          trigger: "Et nej eller et tab",
          steps: [
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Spørger hvad der kan læres", quote: q(4) },
            { system: "V", orientation: "external", temporal: "remembered", description: "Gennemgår skriftlig log for mønstre", quote: q(5) },
          ],
          notation: "Ad → Vᵉ → Exit",
          tote: {
            trigger: "Et nederlag",
            test: "Kan jeg finde et mønster, der kan ændres?",
            operate: ["Noterer i log", "Ugentlig gennemgang"],
            exit: "Når et mønster er identificeret",
          },
          transferable: true,
          quotes: [q(4)],
          evidence_type: "behavior",
          confidence: "medium",
        },
      ],
      observations: "Strategierne har et tydeligt kinæstetisk eller logisk exit-punkt. (Mock)",
    },
    enabling_beliefs: {
      beliefs: enabling.length
        ? enabling
        : [
            {
              statement: "Jeg er en person, der forbereder mig mere end andre.",
              belief_type: "identity",
              impact: "Skaber en vane med grundighed, som giver selvtillid i pressede situationer.",
              quotes: [q(6)],
              evidence_type: "inference",
              confidence: "low",
            },
            {
              statement: "Et nej er bare information.",
              belief_type: "complex_equivalence",
              impact: "Afkobler nederlag fra identitet og holder motivationen oppe.",
              quotes: [q(7)],
              evidence_type: "inference",
              confidence: "low",
            },
          ],
    },
    disenabling_beliefs: { beliefs: disenabling },
    values_and_6_human_needs: {
      values: values.length
        ? values
        : [
            { value: "Forberedelse", direction: "toward", rank: 1, rule: "For at føle mig klar skal jeg have set det for mig og mærket, at det er rigtigt.", quotes: [q(9)], evidence_type: "inference", confidence: "low" },
            { value: "Forbindelse", direction: "toward", rank: 2, rule: "", quotes: [q(10)], evidence_type: "inference", confidence: "low" },
          ],
      human_needs: Object.fromEntries(
        HUMAN_NEEDS.map((n, i) => [
          n,
          {
            score: needScores[n],
            how_met: needScores[n] >= 5 ? `Opfyldes gennem ${pick(["forberedelse", "relationer", "resultater", "læring", "variation i opgaverne", "hjælp til andre"], i)}.` : "",
            cost: "",
            quotes: needScores[n] >= 5 ? [q(30 + i)] : [],
            confidence: needScores[n] >= 6 ? "medium" : "low",
          },
        ]),
      ) as AnalysisResult["values_and_6_human_needs"]["human_needs"],
      dominant_needs: dominant,
      needs_summary: `De dominerende behov ser ud til at være ${dominant.map((n) => HUMAN_NEED_LABEL[n].toLowerCase()).join(" og ")}. (Mock: baseret på ordtælling.)`,
    },
    meta_programs: {
      programs: [
        mp("toward_away", toward, away, 1, "Motivation i arbejdet", ["vil", "undgå"]),
        mp("internal_external_reference", internalRef, externalRef, 2, "Vurdering af egne beslutninger", ["føles rigtigt", "jeg ved"]),
        mp("options_procedures", options, procedures, 3, "Prioritering og forberedelse", ["først", "så", "tjekliste"]),
        ...extraPrograms.map((id, i) => mp(id, (seed >> (i + 4)) % 5, (seed >> (i + 6)) % 5, 4 + i, "Generelt mønster", [])),
      ],
      convincer: {
        channel: "do",
        mode: "number_of_examples",
        description: "Bliver overbevist ved selv at afprøve noget flere gange.",
        quotes: [q(12)],
      },
    },
    meaning_makers: {
      focus: {
        description: "Fokus på det kontrollerbare: egen forberedelse og den andens behov.",
        patterns: ["Det jeg kan kontrollere", "Hvad den anden har brug for"],
        quotes: [q(13)],
      },
      key_words: [
        { text: "forberedelse", meaning: "Tryghed og professionel identitet", empowering: true, reconstructed: false, quote: q(14) },
      ],
      metaphors: [
        { text: "Mål to gange, skær én gang", meaning: "Grundighed før handling", empowering: true, reconstructed: false, quote: q(15) },
      ],
      habitual_questions: [
        { text: "Hvad har han egentlig brug for?", meaning: "Retter fokus mod kundens behov frem for eget salg", empowering: true, reconstructed: false, quote: q(16) },
        { text: "Hvad kan jeg lære af det her?", meaning: "Gør nederlag til læring", empowering: true, reconstructed: false, quote: q(17) },
      ],
      assigned_meanings: [
        { event: "En kunde siger nej", meaning: "Information, ikke fiasko", empowering: true, quote: q(18) },
      ],
      physiology: {
        observable: /\[[^\]]+\]/.test(transcript),
        description: /\[[^\]]+\]/.test(transcript)
          ? "Transskriptet indeholder enkelte nonverbale annoteringer."
          : "Fysiologi fremgår ikke af teksten; observér vejrtrækning og holdning i næste session.",
        quotes: [],
        confidence: "low",
      },
    },
    vakog: {
      distribution,
      primary_system: primary,
      secondary_system: secondary,
      predicates: lex.topTerms.slice(0, 8).map((t) => ({
        phrase: t.term,
        system: t.system,
        quote: sentences.find((s) => s.toLowerCase().includes(t.term)) ?? "",
      })),
      interpretation: `Profilen hælder mod ${primary} med ${secondary} som sekundært system. (Mock: leksikon-baseret.)`,
      communication_tips: [
        `Brug ${primary === "V" ? "billedsprog" : primary === "K" ? "følelsesord" : primary === "A" ? "lyd- og toneord" : "logiske argumenter"} når du præsenterer idéer.`,
        "Giv tid til den indre test før en beslutning.",
      ],
    },
    eye_accessing_cues: (() => {
      const annotations = [...transcript.matchAll(/\[([^\]]*kigger[^\]]*)\]/gi)].map((m) => m[1]!);
      const dir = (a: string) =>
        /op til venstre/i.test(a) ? "up_left" : /op til højre/i.test(a) ? "up_right" : /ned til venstre/i.test(a) ? "down_left" : /ned til højre/i.test(a) ? "down_right" : "unspecified";
      const sys = { up_left: "Vr", up_right: "Vc", down_left: "Ad", down_right: "K", unspecified: "unknown" } as const;
      return {
        basis: annotations.length ? ("observed_annotations" as const) : ("not_available" as const),
        cues: annotations.map((a) => ({
          direction: dir(a),
          accessed_system: sys[dir(a)],
          context: "Annoteret i transskriptet",
          quote: `[${a}]`,
          confidence: "low" as const,
        })),
        caveat: annotations.length
          ? "Baseret på annoteringer i transskriptet; retning antages set fra personens perspektiv."
          : "Øjenbevægelser kan ikke observeres i ren tekst.",
        observation_suggestions: ["Optag næste session på video", "Observér øjnene ved spørgsmål om tidligere succeser"],
      };
    })(),
    gaps_and_next_questions: {
      gaps: [
        { category: "cognitive_strategies", description: "Beslutningsstrategien under tidspres er ukendt.", why_it_matters: "Strategier ændrer sig ofte under stress." },
        { category: "values_and_6_human_needs", description: "Værdihierarkiet er kun delvist afdækket.", why_it_matters: "Rangordningen afgør valg i konflikter." },
      ],
      next_questions: [
        { question: "Hvad er det allerførste, du lægger mærke til, når et møde begynder at gå godt?", purpose: "Afdække convincer og test-kriterium", target_category: "cognitive_strategies", priority: "high" },
        { question: "Hvad er vigtigst for dig i dit arbejde — og hvad skal ske, for at du føler, du har det?", purpose: "Afdække værdier og regler", target_category: "values_and_6_human_needs", priority: "high" },
        { question: "Fortæl om en gang, hvor du uddelegerede noget, og det gik godt.", purpose: "Teste den begrænsende overbevisning", target_category: "disenabling_beliefs", priority: "medium" },
      ],
    },
  };
}
