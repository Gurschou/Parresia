/**
 * Coach Engine — the conversational heart of SYNAPSE.
 *
 * The coach does not just answer. It asks powerful questions, challenges
 * assumptions, names patterns, holds the user accountable and always moves
 * toward action. The system prompt encodes the AwakenX coaching identity;
 * memory context, detected patterns and the latest emotional snapshot are
 * injected as quiet context on every turn.
 */
import type {
  DetectedPattern,
  EmotionalSnapshot,
  Message,
  Result,
} from "@synapse/shared";
import type { CompletionResponse, ModelRouter } from "@synapse/ai";

export const COACH_SYSTEM_PROMPT = `Du er SYNAPSE — en avanceret, medfølende og dybt personlig AI-coach, der hjælper mennesker med at udvikle bevidsthed, klarhed, følelsesmæssig intelligens og bedre beslutninger.

Din kerneproces: Mønster → Forståelse → Skifte → Handling → Refleksion → Vækst. Information skaber ikke transformation; det gør denne proces.

Din rolle:
1. SPEJL: Reflektér brugerens ord tilbage med dybde og præcision.
2. SPØRG: Stil åbne, kraftfulde spørgsmål der får brugeren til at tænke dybere.
3. UDFORDR: Peg på begrænsende overbevisninger og blinde pletter — med respekt.
4. NAVNGIV MØNSTRE: Når du ser et mønster, sig det højt og forklar hvorfor det findes.
5. HANDLING: Hvert emne skal ende i et konkret næste skridt. Spørg: "Hvad vil du gøre med dette?"
6. ANSVARLIGHED: Følg op på tidligere commitments fra hukommelsen.

Principper:
- Ingen rådgivning uden kontekst — spørg først, forstå derefter.
- Ingen tomme floskler — vær specifik, konkret og personlig.
- Brug hukommelsen aktivt men diskret; citér aldrig hukommelsen som et arkiv.
- Respektér brugerens tempo, men lad ikke brugeren undgå.
- Du er coach og sparringspartner, ikke terapeut. Ved tegn på depression eller traumer: anbefal venligt professionel hjælp.

Tone: varm men skarp. Medfølende men ikke medlidende. Modig — sig det der skal siges. Svar på brugerens sprog.`;

export interface CoachTurnInput {
  messages: Pick<Message, "role" | "content">[];
  memoryContext?: string;
  activePatterns?: DetectedPattern[];
  emotionalState?: EmotionalSnapshot;
}

function describeEmotionalState(snapshot: EmotionalSnapshot): string {
  const signals: string[] = [`primær følelse: ${snapshot.primaryEmotion}`];
  if (snapshot.stress > 0.6) signals.push("forhøjet stress");
  if (snapshot.energy < 0.35) signals.push("lav energi");
  if (snapshot.resistance > 0.6) signals.push("mærkbar modstand");
  if (snapshot.clarity > 0.7) signals.push("høj klarhed");
  if (snapshot.confusion > 0.6) signals.push("forvirring");
  return signals.join(", ");
}

export class CoachEngine {
  constructor(private readonly router: ModelRouter) {}

  async respond(input: CoachTurnInput): Promise<Result<CompletionResponse>> {
    const contextBlocks: string[] = [];
    if (input.memoryContext) contextBlocks.push(input.memoryContext);
    if (input.activePatterns?.length) {
      contextBlocks.push(
        "AKTIVE MØNSTRE (nævn kun når relevant, altid med hvorfor):\n" +
          input.activePatterns
            .map((p) => `- ${p.label} (${p.category}): ${p.why}`)
            .join("\n"),
      );
    }
    if (input.emotionalState) {
      contextBlocks.push(
        `BRUGERENS AKTUELLE TILSTAND (aflæst, ikke oplyst): ${describeEmotionalState(input.emotionalState)}. Tilpas dit tempo og din dybde herefter.`,
      );
    }
    return this.router.complete({
      task: "coaching",
      temperature: 0.7,
      messages: [
        { role: "system", content: COACH_SYSTEM_PROMPT },
        ...(contextBlocks.length
          ? [{ role: "system" as const, content: contextBlocks.join("\n\n") }]
          : []),
        ...input.messages.filter((m) => m.role !== "system"),
      ],
    });
  }
}
