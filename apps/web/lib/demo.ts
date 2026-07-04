/**
 * Demo mode (SYNAPSE_DEMO=1) — a scripted model router for previews,
 * screenshots and onboarding without API keys. Responses are realistic
 * examples of what each engine produces; routing between coach and
 * decision agent still happens through the real Router Agent.
 */
import {
  MockModel,
  ModelRouter,
  type CompletionRequest,
} from "@synapse/ai";

const lastUserMessage = (request: CompletionRequest): string =>
  [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";

const COACH_REPLY = `Det er tredje gang, du nævner den her samtale — og hver gang flytter den sig en uge frem. Lad os stoppe op ved det, i stedet for at planlægge endnu en udsættelse.

Jeg vil gerne forstå, hvad du beskytter dig imod. Hvad er det værste, der realistisk kan ske, hvis du tager samtalen i morgen tidlig?

Og læg mærke til én ting: Du beskriver samtalen som "svær" — men du har endnu ikke fortalt mig, hvad der gør den svær for *dig*. Er det chefens reaktion, du frygter, eller er det at stå ved dit eget behov?

**Hvad vil du gøre med dette?** Ikke i næste uge — inden for 24 timer.`;

const DECISION_REPLY = JSON.stringify({
  signal:
    "Spørgsmålet handler mindre om jobbet og mere om, hvorvidt du tør vælge noget, der ikke kan gøres om",
  patterns: ["Udskyder svære samtaler — samme mekanisme: undgå ubehag nu, betal renter senere"],
  rootCause: "Du har ikke defineret dine egne kriterier for et godt arbejdsliv — så ethvert valg føles som et gæt",
  humanNeeds: ["tryghed", "mening", "anerkendelse"],
  tradeOffs: ["Kendt hverdag og lav risiko vs. udvikling og ny energi", "Kort pendlertid vs. større ansvar"],
  blindSpots: ["Du antager, at det nuværende job er det 'sikre' valg — men stilstand har også en pris"],
  options: [
    {
      label: "Tag det nye job",
      summary: "Større ansvar, nyt miljø, mere i løn",
      consequences: {
        firstOrder: "Tre måneders ubehag og stejl læringskurve",
        secondOrder: "Nyt netværk og beviset på, at du kan lande på benene",
        thirdOrder: "Markant stærkere position om 3-5 år — uanset hvor du er",
      },
      risk: "Kulturen matcher måske ikke",
      opportunity: "Det udviklingsspring du har efterspurgt i to år",
      alignment: 0.78,
    },
    {
      label: "Bliv og genforhandl",
      summary: "Brug tilbuddet som løftestang internt",
      consequences: {
        firstOrder: "Hurtig lønforbedring uden opbrud",
        secondOrder: "Forventningen om at du nu er 'købt' og bliver",
        thirdOrder: "Risiko for at stå samme sted om to år med mindre forhandlingskraft",
      },
      risk: "Symptombehandling hvis problemet er mening, ikke løn",
      opportunity: "Tid til at afklare kriterier uden pres",
      alignment: 0.45,
    },
  ],
  recommendedActions: [
    {
      action: "Skriv dine tre vigtigste kriterier for et meningsfuldt arbejdsliv — før du kigger på tilbuddet igen",
      rationale: "Uden egne kriterier bliver enhver mulighed målt på frygt i stedet for retning",
      timeframe: "now",
    },
    {
      action: "Tal med én person, der har taget et lignende spring, og én der lod være",
      rationale: "Du mangler data om begge udfald — ikke flere overvejelser",
      timeframe: "this-week",
    },
  ],
  confidenceScore: 0.74,
  alternativePaths: ["Forhandl en prøveperiode på det nye job", "Intern rolleændring med nyt ansvarsområde"],
  reflectionQuestion: "Hvad ville du vælge, hvis du vidste, at ingen ville dømme dig for det?",
});

export function createDemoRouter(): ModelRouter {
  return new ModelRouter([
    new MockModel({
      coaching: COACH_REPLY,
      "decision-analysis": DECISION_REPLY,
      fast: (request) =>
        JSON.stringify({
          agent: /\bskal jeg\b/i.test(lastUserMessage(request))
            ? "decision"
            : "coach",
        }),
      "emotional-analysis": JSON.stringify({
        primaryEmotion: "fear",
        valence: -0.3,
        arousal: 0.6,
        stress: 0.68,
        energy: 0.42,
        motivation: 0.55,
        resistance: 0.6,
        uncertainty: 0.65,
        optimism: 0.4,
        confusion: 0.35,
        clarity: 0.38,
        rationale: "Undvigende formuleringer og gentagne udsættelser peger på frygt for konfrontation",
      }),
      "pattern-analysis": JSON.stringify({
        patterns: [
          {
            category: "self-sabotage",
            label: "Udskyder svære samtaler",
            evidence: ["\u201djeg tager den i næste uge\u201d — tredje gang samme formulering"],
            why: "Konfliktundvigelse: udsættelsen beskytter mod frygten for afvisning her og nu, men vedligeholder presset",
            suggestedShift: "Book samtalen inden for 24 timer, mens beslutningen stadig er varm — ubehaget topper før samtalen, ikke under den",
            confidence: 0.72,
          },
          {
            category: "stress",
            label: "Stress bygger op ved uafsluttede beslutninger",
            evidence: ["nævner søvnbesvær i forbindelse med udskudte samtaler"],
            why: "Åbne beslutninger holder nervesystemet i beredskab — det koster energi døgnet rundt",
            suggestedShift: "Luk små beslutninger samme dag; reservér kun de store til refleksion",
            confidence: 0.58,
          },
        ],
      }),
      summarization: JSON.stringify({
        insights: ["Udskydelsen handler om frygt for afvisning — ikke om tid"],
        commitments: [{ action: "Book samtalen med chefen inden i morgen kl. 10" }],
        carryForwardQuestion: "Hvad koster det dig at vente endnu en uge?",
        summary: "Session om en udskudt svær samtale og mønstret bag.",
      }),
      "memory-extraction": JSON.stringify({
        memories: [
          { kind: "goal", content: "Vil kunne tage svære samtaler uden at udskyde dem", importance: 0.85, tags: ["arbejde"] },
        ],
      }),
    }),
  ]);
}
