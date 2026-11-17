import type { AnalysisResult } from "./lib";

/**
 * Eksempel-analyser af de fire fiktive demo-interviews (DEMO_TRANSCRIPTS).
 * Skrevet som rigtige analyser med ordrette citater, så artifactet åbner i en
 * realistisk tilstand. Valideres mod AnalysisResultSchema i build-scriptet.
 */

type Conf = "low" | "medium" | "high";
type Ev = "quote" | "behavior" | "inference";
const ev = (quotes: string[], evidence_type: Ev = "quote", confidence: Conf = "high") => ({ quotes, evidence_type, confidence });
const need = (score: number, how_met: string, cost: string, quotes: string[], confidence: Conf = "medium") => ({ score, how_met, cost, quotes, confidence });

export const EXAMPLE_RESULTS: Record<string, AnalysisResult> = {
  /* ───────────────────────── Mette Holm · Store kundemøder ───────────────────────── */
  "mette-1": {
    summary: {
      subject: "Mette Holm",
      result_modeled: "Lukker flere store aftaler end nogen anden i virksomheden",
      overview:
        "Mette vinder store aftaler med en grundig og gentagelig forberedelse: hun ser mødet for sig, afklarer kundens egentlige behov og stopper først, når beslutningen sidder i maven. I selve mødet lytter hun mere, end hun taler, og spejler kundens sprog. Identiteten som en, der forbereder sig mere end andre, holder strategien stabil under pres. Den største begrænsning er en overbevisning om, at ting ikke bliver godt nok, hvis hun ikke gør dem selv.",
      key_insights: [
        "Exit-kriteriet er kropsligt: hun forbereder sig, indtil der kommer en ro, \"en slags tyngde, på den gode måde\".",
        "Hun skifter repræsentationssystem efter fase: visuelt før mødet, auditivt i mødet og kinæstetisk, når hun beslutter.",
        "Et tabt møde blev til en regel: ingen møder uden at have set det for sig og mærket, at det er rigtigt.",
        "Hun bliver overbevist ved selv at gøre noget mindst tre gange. Samme convincer kan bruges til at åbne for uddelegering.",
        "Dominerende behov: sikkerhed og forbindelse.",
      ],
      source_quality:
        "Ét interview på ca. 700 ord med konkrete eksempler og tre nonverbale annoteringer. Godt grundlag for strategier og overbevisninger, tyndere for meta-programmer og øjenbevægelser.",
    },
    cognitive_strategies: {
      strategies: [
        {
          name: "Mental generalprøve før vigtige møder",
          strategy_type: "performance",
          context: "Forberedelse af store kundemøder aftenen før",
          trigger: "Et vigtigt kundemøde nærmer sig",
          steps: [
            { system: "V", orientation: "internal", temporal: "constructed", description: "Ser rummet, kunden og kundens ansigt, når han forstår", quote: "Jeg ser rummet, jeg ser kunden sidde over for mig, og jeg ser hans ansigt, når han forstår, hvad vi kan gøre for ham." },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Spørger sig selv, hvad kunden egentlig har brug for", quote: "Jeg spørger mig selv: Hvad er det egentlig, han har brug for?" },
            { system: "V", orientation: "external", temporal: "unspecified", description: "Genlæser sine noter, hvis billedet ikke er klart", quote: "Så går jeg tilbage og læser mine noter igen." },
            { system: "K", orientation: "internal", temporal: "unspecified", description: "Tester, om det føles rigtigt i maven", quote: "Jeg bliver ved, indtil det føles rigtigt i maven." },
          ],
          notation: "Vᶜ → Ad → Vᵉ → Kⁱ → Exit",
          tote: {
            trigger: "Aftenen før et vigtigt kundemøde",
            test: "Kan jeg se et klart billede af mødet, og sidder det i maven (ro, tyngde, står fast)?",
            operate: ["Genlæser noterne", "Spørger: Hvad har kunden egentlig brug for?", "Ser mødet for sig igen"],
            exit: "Når der kommer en ro og en tyngde, \"på den gode måde\"",
          },
          transferable: true,
          ...ev(["Hvis jeg ikke kan se det billede klart, så er jeg ikke klar.", "Det er min test. Når det sidder i maven, så stopper jeg forberedelsen."]),
        },
        {
          name: "Lyt efter tonen, og tal kundens sprog",
          strategy_type: "relationship",
          context: "Den første halve time af kundemødet",
          trigger: "Kunden begynder at fortælle om sit problem",
          steps: [
            { system: "A", orientation: "external", temporal: "unspecified", description: "Lytter og stiller få spørgsmål", quote: "Jeg stiller måske tre spørgsmål i den første halve time, og så hører jeg, hvordan de taler om deres problem." },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Sorterer: handler det om tal, mennesker eller frygt?", quote: "Er det tal, er det mennesker, er det frygt?" },
            { system: "A", orientation: "external", temporal: "unspecified", description: "Spejler kundens sprog tilbage", quote: "Og så taler jeg deres sprog tilbage." },
          ],
          notation: "Aᵉ → Ad → Aᵉ → Exit",
          tote: {
            trigger: "Kunden taler om sit problem",
            test: "Har jeg hørt, hvad problemet egentlig handler om (tal, mennesker eller frygt)?",
            operate: ["Stiller et åbent spørgsmål", "Lytter efter tonen"],
            exit: "Når hun kan tale kundens sprog tilbage",
          },
          transferable: true,
          ...ev(["Man kan høre det på tonen.", "De fleste sælgere taler alt for meget."]),
        },
        {
          name: "Fem-punkts-tjekliste til kundevalg",
          strategy_type: "decision",
          context: "Prioritering af, hvilke kunder hun bruger tid på",
          trigger: "En ny potentiel kunde",
          steps: [
            { system: "V", orientation: "external", temporal: "unspecified", description: "Gennemgår fem punkter i fast rækkefølge", quote: "Først budget, så beslutningstager, så tidspres, så om de har et reelt problem, og til sidst om jeg kan lide dem." },
            { system: "K", orientation: "internal", temporal: "unspecified", description: "Mærker, om samarbejdet vil blive tungt", quote: "hvis jeg ikke kan lide dem, så bliver samarbejdet tungt" },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Tæller grønne punkter", quote: "Hvis tre ud af fem er grønne, går jeg videre." },
          ],
          notation: "Vᵉ → Kⁱ → Ad → Exit",
          tote: {
            trigger: "En ny kunde skal vurderes",
            test: "Er mindst tre af de fem punkter grønne?",
            operate: ["Tjekker budget, beslutningstager, tidspres, reelt problem og sympati"],
            exit: "Tre ud af fem grønne: går videre",
          },
          transferable: true,
          ...ev(["Jeg har en tjekliste. Fem punkter."]),
        },
        {
          name: "Log og fredagsgennemgang efter et nej",
          strategy_type: "learning",
          context: "Når en kunde siger nej",
          trigger: "Et nej fra en kunde",
          steps: [
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Spørger, hvad hun kan lære", quote: "Så tænker jeg: Hvad kan jeg lære af det her?" },
            { system: "V", orientation: "external", temporal: "remembered", description: "Skriver i loggen og gennemgår den hver fredag", quote: "Jeg skriver det ned i min log, og hver fredag kigger jeg loggen igennem." },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Leder efter gentagne mønstre", quote: "Jeg leder efter mønstre." },
          ],
          notation: "Ad → Vᵉ → Ad → Exit",
          tote: {
            trigger: "En kunde siger nej",
            test: "Er der noget, jeg gør igen og igen, som ikke virker?",
            operate: ["Noterer nej'et i loggen", "Gennemgår loggen fredag"],
            exit: "Når et mønster er fundet eller afvist",
          },
          transferable: true,
          ...ev(["Et nej er bare information."], "behavior", "high"),
        },
      ],
      observations:
        "Alle fire strategier har klare, målbare exit-kriterier: et klart billede, ro i maven, tre ud af fem grønne, et fundet mønster. Det er en væsentlig grund til, at hun ikke overforbereder sig eller går i stå.",
    },
    enabling_beliefs: {
      beliefs: [
        { statement: "Jeg er en person, der forbereder mig mere end andre.", belief_type: "identity", impact: "Gør grundighed til en del af identiteten, så vanen holder, også når hun er presset.", ...ev(["Jeg er en person, der forbereder mig, mere end andre gør."]) },
        { statement: "Hvis jeg har forberedt mig bedre end alle andre, kan jeg ikke tabe på manglende forberedelse.", belief_type: "cause_effect", impact: "Giver kontrol og ro i situationer med høj indsats.", ...ev(["Jeg tror på, at hvis jeg har forberedt mig bedre end alle andre, så kan jeg ikke tabe på manglende forberedelse."]) },
        { statement: "Resultater kommer af arbejde, ikke af talent.", belief_type: "capability", impact: "Gør succes til noget, hun selv kan påvirke og gentage.", ...ev(["Det er ikke talent — det er arbejde."]) },
        { statement: "Et nej er bare information.", belief_type: "complex_equivalence", impact: "Afkobler nederlag fra identiteten og holder læringsløkken åben.", ...ev(["Et nej er bare information."]) },
        { statement: "Det vigtigste er, at kunden føler sig forstået.", belief_type: "value", impact: "Retter fokus mod kundens behov frem for eget salg, hvilket skaber tillid.", ...ev(["Det handler om, at kunden går derfra og føler, at nogen endelig har forstået ham."]) },
      ],
    },
    disenabling_beliefs: {
      beliefs: [
        {
          statement: "Hvis jeg ikke gør det selv, bliver det ikke godt nok.",
          belief_type: "cause_effect",
          impact: "Hun uddelegerer nødigt og bærer selv for meget.",
          cost: "Aftener og weekender, og et team, der ikke får lov at vokse.",
          reframe_question: "Hvad skulle du se din kollega gøre tre gange, før du ville overlade et vigtigt møde til ham?",
          ...ev(["Jeg har en tanke om, at hvis jeg ikke gør det selv, bliver det ikke godt nok.", "Og mit team får ikke lov at vokse så meget, som de burde."]),
        },
        {
          statement: "Jeg kan ikke stole på det, andre fortæller mig, før jeg selv har prøvet det.",
          belief_type: "about_others",
          impact: "Beskytter mod dårlige metoder, men gør hende langsom til at lære af andre.",
          cost: "Hver ny metode skal afprøves personligt flere gange, før den tages i brug.",
          reframe_question: "Hvilken metode har du taget til dig fra en anden, som du er glad for i dag?",
          ...ev(["Jeg tror ikke på det, andre fortæller mig, før jeg har gjort det selv og set resultaterne i mine egne tal."], "quote", "medium"),
        },
      ],
    },
    values_and_6_human_needs: {
      values: [
        { value: "Forberedelse", direction: "toward", rank: 1, rule: "For at føle mig klar skal jeg have set mødet for mig og mærket, at det er rigtigt.", ...ev(["Siden har jeg en regel: Ingen møder uden at jeg har set det for mig og mærket, at det er rigtigt."]) },
        { value: "Forbindelse med kunden", direction: "toward", rank: 2, rule: "For at føle forbindelse skal jeg se kunden slappe af i skuldrene.", ...ev(["Når jeg kan se, at han slapper af i skuldrene, så ved jeg, at vi har en forbindelse."]) },
        { value: "At være den bedste", direction: "toward", rank: 3, rule: "", ...ev(["jeg kan også godt lide at være den bedste på listen. Det driver mig."]) },
        { value: "Læring", direction: "toward", rank: 4, rule: "", ...ev(["Så tænker jeg: Hvad kan jeg lære af det her?"], "behavior", "medium") },
        { value: "Fiasko pga. manglende forberedelse", direction: "away_from", rank: 0, rule: "", ...ev(["Jeg havde ikke forberedt mig godt nok, fordi jeg var presset."]) },
      ],
      human_needs: {
        certainty: need(8.5, "Forberedelse, faste regler og en tjekliste med fast rækkefølge.", "Hun bruger aftener på forberedelse og giver nødigt kontrol fra sig.", ["Jeg har en tjekliste. Fem punkter."], "high"),
        variety: need(3, "", "", [], "low"),
        significance: need(7, "At være nummer ét på listen og den, der lukker de store aftaler.", "", ["jeg kan også godt lide at være den bedste på listen."], "medium"),
        love_connection: need(8, "At kunden føler sig forstået.", "", ["Det giver mig mere end provisionen."], "high"),
        growth: need(7, "Log over nederlag og fredagsgennemgang af mønstre.", "", ["Jeg leder efter mønstre."], "medium"),
        contribution: need(5, "Hjælper kunden med det, han egentlig har brug for.", "Teamet får for lidt plads til at bidrage.", [], "low"),
      },
      dominant_needs: ["certainty", "love_connection"],
      needs_summary:
        "Sikkerhed og forbindelse driver strategierne: forberedelsen giver sikkerhed, og lytningen giver forbindelse. Betydning (at være den bedste) er en ærligt erkendt sekundær drivkraft. Grundlaget er ét interview, så rangordningen er foreløbig.",
    },
    meta_programs: {
      programs: [
        { program: "internal_external_reference", leaning: "pole_a", strength: 85, context: "Beslutninger og overbevisning om nye metoder", linguistic_markers: ["føles rigtigt i maven", "jeg tror ikke på det, andre fortæller mig"], ...ev(["Jeg tror ikke på det, andre fortæller mig, før jeg har gjort det selv"]) },
        { program: "options_procedures", leaning: "pole_b", strength: 80, context: "Forberedelse og kundevalg", linguistic_markers: ["først", "så", "til sidst", "regel"], ...ev(["Først budget, så beslutningstager, så tidspres, så om de har et reelt problem, og til sidst om jeg kan lide dem."]) },
        { program: "self_other", leaning: "pole_b", strength: 75, context: "I kundemødet", linguistic_markers: ["hvad har han brug for", "taler deres sprog tilbage"], ...ev(["Ikke hvad vil jeg sælge — hvad har han brug for?"]) },
        { program: "independent_cooperative", leaning: "pole_a", strength: 75, context: "Opgaver og ansvar", linguistic_markers: ["gør det selv"], ...ev(["hvis jeg ikke gør det selv, bliver det ikke godt nok"]) },
        { program: "general_specific", leaning: "pole_b", strength: 65, context: "Forberedelse og vurdering", linguistic_markers: ["tre spørgsmål", "fem punkter", "tre ud af fem"], ...ev(["Hvis tre ud af fem er grønne, går jeg videre."], "behavior", "medium") },
        { program: "proactive_reactive", leaning: "pole_a", strength: 60, context: "Før møder", linguistic_markers: ["det første jeg gør"], ...ev(["Det første jeg gør, er faktisk at se mødet for mig, aftenen før."], "behavior", "medium") },
        { program: "toward_away", leaning: "balanced", strength: 50, context: "Motivation", linguistic_markers: ["det driver mig", "det sker aldrig igen"], ...ev(["Det sker aldrig igen."], "inference", "low") },
      ],
      convincer: {
        channel: "do",
        mode: "number_of_examples",
        description: "Bliver overbevist ved selv at afprøve noget mindst tre gange og se resultatet i egne tal.",
        quotes: ["Når jeg har prøvet den selv. Mindst tre gange."],
      },
    },
    meaning_makers: {
      focus: {
        description: "Det hun selv kan kontrollere: egen forberedelse og kundens egentlige behov.",
        patterns: ["Kundens behov frem for eget salg", "Hvad kan læres af et nederlag"],
        quotes: ["Ikke hvad vil jeg sælge — hvad har han brug for?"],
      },
      key_words: [
        { text: "forberedelse", meaning: "Sikkerhed og professionel identitet", empowering: true, reconstructed: false, quote: "Jeg er en person, der forbereder mig, mere end andre gør." },
        { text: "lytter", meaning: "Det, der adskiller hende fra sælgere, der taler for meget", empowering: true, reconstructed: false, quote: "Jeg lytter. Altså, virkelig lytter." },
      ],
      metaphors: [
        { text: "Mål to gange, skær én gang", meaning: "Grundighed før handling, arvet fra faren", empowering: true, reconstructed: false, quote: "Han sagde altid: \"Mål to gange, skær én gang.\"" },
        { text: "Det sidder i maven", meaning: "En beslutning er først færdig, når den er kropsligt forankret", empowering: true, reconstructed: false, quote: "Når det sidder i maven, så stopper jeg forberedelsen." },
      ],
      habitual_questions: [
        { text: "Hvad er det egentlig, han har brug for?", meaning: "Flytter fokus fra salg til kundens behov", empowering: true, reconstructed: false, quote: "Jeg spørger mig selv: Hvad er det egentlig, han har brug for?" },
        { text: "Hvad kan jeg lære af det her?", meaning: "Gør et nej til læring", empowering: true, reconstructed: false, quote: "Så tænker jeg: Hvad kan jeg lære af det her?" },
      ],
      assigned_meanings: [
        { event: "En kunde siger nej", meaning: "Information om mønstre, ikke et nederlag", empowering: true, quote: "Et nej er bare information." },
        { event: "Den tabte aftale for to år siden", meaning: "Bevis for, at forberedelse aldrig må springes over", empowering: true, quote: "Jeg sagde til mig selv bagefter: Det sker aldrig igen." },
        { event: "At lade andre gøre opgaven", meaning: "En risiko for, at kvaliteten falder", empowering: false, quote: "hvis jeg ikke gør det selv, bliver det ikke godt nok" },
      ],
      physiology: {
        observable: true,
        description: "Hun beskriver selv et kropsligt skift fra uro i brystet til ro og tyngde. Det er hendes exit-signal i forberedelsen.",
        quotes: ["Der kommer en ro. En slags tyngde, på den gode måde. Jeg mærker, at jeg står fast. Før det har jeg en uro i brystet."],
        confidence: "medium",
      },
    },
    vakog: {
      distribution: { V: 32, A: 18, K: 27, O: 0, G: 0, Ad: 23 },
      primary_system: "V",
      secondary_system: "K",
      predicates: [
        { phrase: "se mødet for mig", system: "V", quote: "Det første jeg gør, er faktisk at se mødet for mig, aftenen før." },
        { phrase: "se det billede klart", system: "V", quote: "Hvis jeg ikke kan se det billede klart, så er jeg ikke klar." },
        { phrase: "føles rigtigt i maven", system: "K", quote: "Jeg bliver ved, indtil det føles rigtigt i maven." },
        { phrase: "en slags tyngde", system: "K", quote: "En slags tyngde, på den gode måde." },
        { phrase: "høre det på tonen", system: "A", quote: "Man kan høre det på tonen." },
        { phrase: "lytter", system: "A", quote: "Jeg lytter. Altså, virkelig lytter." },
        { phrase: "spørger mig selv", system: "Ad", quote: "Jeg spørger mig selv: Hvad er det egentlig, han har brug for?" },
        { phrase: "jeg tror på", system: "Ad", quote: "Jeg tror på, at hvis jeg har forberedt mig bedre end alle andre, så kan jeg ikke tabe på manglende forberedelse." },
      ],
      interpretation:
        "Mette bruger synet til at forberede og kroppen til at beslutte: billedet skal være klart, og så skal det sidde i maven. I mødet skifter hun til auditivt og lytter efter tonen. Den indre dialog bruger hun til korte, afklarende spørgsmål.",
      communication_tips: [
        "Vis hende ting: skitser, tal på papir, et billede af løsningen.",
        "Giv tid til at mærke efter, før hun skal beslutte noget.",
        "Lad hende afprøve en ny metode selv i stedet for at argumentere for den.",
      ],
    },
    eye_accessing_cues: {
      basis: "observed_annotations",
      cues: [
        { direction: "up_left", accessed_system: "Vr", context: "Beskriver, hvordan hun ser mødet for sig aftenen før", quote: "[kigger op til venstre]", confidence: "low" },
        { direction: "down_right", accessed_system: "K", context: "Forklarer, hvordan hun ved, at det sidder i maven", quote: "[kigger ned til højre]", confidence: "medium" },
        { direction: "down_left", accessed_system: "Ad", context: "Fortæller om den tabte aftale og hvad hun sagde til sig selv", quote: "[pause, kigger ned til venstre]", confidence: "medium" },
      ],
      caveat:
        "Retningerne er antaget set fra Mettes eget perspektiv. Op til venstre peger normalt på et husket billede, men hun beskriver et konstrueret fremtidigt møde; hun kan hente billeder af tidligere møder. Tre annoteringer er for få til at fastslå hendes organisering.",
      observation_suggestions: [
        "Optag næste interview på video og observér øjnene, når hun beskriver det klare billede af mødet.",
        "Spørg til et møde, hun aldrig har haft, og se om øjnene går op til højre.",
      ],
    },
    gaps_and_next_questions: {
      gaps: [
        { category: "cognitive_strategies", description: "Hvad hun gør, når et møde begynder at gå skævt undervejs", why_it_matters: "Strategien under pres kan afvige fra den forberedte" },
        { category: "values_and_6_human_needs", description: "Rangordningen mellem at være den bedste og forbindelsen med kunden", why_it_matters: "Afgør, hvad hun vælger, når de to trækker i hver sin retning" },
        { category: "eye_accessing_cues", description: "Kun tre annoterede øjenbevægelser", why_it_matters: "For lidt til at bekræfte, hvilke systemer hun tilgår" },
      ],
      next_questions: [
        { question: "Når et møde begynder at glide fra dig, hvad lægger du så mærke til først, og hvad gør du?", purpose: "Afdække strategien under pres", target_category: "cognitive_strategies", priority: "high" },
        { question: "Hvad skulle du se Jonas gøre tre gange, før du ville overlade et vigtigt møde til ham?", purpose: "Bruge hendes egen convincer til at teste den begrænsende overbevisning", target_category: "disenabling_beliefs", priority: "high" },
        { question: "Hvis du skulle vælge mellem at lukke aftalen og at kunden føler sig forstået, hvad vælger du?", purpose: "Afklare værdihierarkiet", target_category: "values_and_6_human_needs", priority: "high" },
        { question: "Hvad ser du præcist, når billedet af mødet er klart? Hvor er det, hvor stort, i farver?", purpose: "Afdække submodaliteterne i hendes visuelle test", target_category: "vakog", priority: "medium" },
        { question: "Hvad gør du, når mødet er nu, og du endnu ikke kan mærke ro i maven?", purpose: "Teste, hvor robust exit-kriteriet er", target_category: "cognitive_strategies", priority: "medium" },
      ],
    },
  },

  /* ───────────────────────── Mette Holm · Opfølgning ───────────────────────── */
  "mette-2": {
    summary: {
      subject: "Mette Holm",
      result_modeled: "Uddelegerer store opgaver uden at miste kvaliteten",
      overview:
        "Fem uger senere har Mette overført sin egen forberedelsesstrategi til uddelegering: hun ser kollegaen klare mødet i stedet for sig selv. Hun mærker stadig modstand i maven, men slipper lidt efter lidt. Hendes convincer er uændret (tre gange, med egne øjne), men hun har fået en ny identitetsoverbevisning: hendes job er at bygge folk.",
      key_insights: [
        "Samme strategi, nyt indhold: den mentale generalprøve er flyttet fra hende selv til kollegaen.",
        "Den begrænsende overbevisning er ikke væk, men vægten er flyttet: \"det føles mærkeligt i maven\", men \"jeg slipper lidt\".",
        "Ny styrkende overbevisning på identitetsniveau: \"Mit job er at bygge folk\".",
        "Behovsprofilen er flyttet fra sikkerhed mod vækst og bidrag.",
      ],
      source_quality: "Kort opfølgningssamtale (ca. 200 ord) uden nonverbale annoteringer. Godt til at vise forandring, tyndt som selvstændigt grundlag.",
    },
    cognitive_strategies: {
      strategies: [
        {
          name: "Generalprøve af kollegaen",
          strategy_type: "relationship",
          context: "Når hun overlader et møde til en kollega",
          trigger: "Et møde, som kollegaen skal tage",
          steps: [
            { system: "V", orientation: "internal", temporal: "constructed", description: "Ser kollegaen klare mødet", quote: "Før et møde ser jeg nu for mig, hvordan min kollega Jonas klarer det, i stedet for mig selv." },
            { system: "K", orientation: "internal", temporal: "unspecified", description: "Mærker modstanden og slipper", quote: "Det føles mærkeligt i maven i starten, men jeg kan mærke, at jeg slipper lidt." },
          ],
          notation: "Vᶜ (kollega) → Kⁱ → Exit",
          tote: {
            trigger: "Kollegaen skal tage et møde",
            test: "Kan jeg se ham klare det, og kan jeg mærke, at jeg slipper?",
            operate: ["Ser mødet for sig med kollegaen i hovedrollen"],
            exit: "Når hun kan mærke, at hun slipper",
          },
          transferable: true,
          ...ev(["Før et møde ser jeg nu for mig, hvordan min kollega Jonas klarer det, i stedet for mig selv."]),
        },
      ],
      observations: "Hun har genbrugt sin stærkeste strategi i et nyt domæne. Det er et godt tegn på, at modellen er robust.",
    },
    enabling_beliefs: {
      beliefs: [
        { statement: "Mit job er at bygge folk, ikke at være den bedste på listen.", belief_type: "identity", impact: "Flytter betydning fra egen præstation til teamets vækst.", ...ev(["Jeg siger til mig selv: Mit job er at bygge folk, ikke at være den bedste på listen.", "Det er en ny tanke for mig. Den føles rigtig."]) },
        { statement: "Et nej er bare information, også for teamet.", belief_type: "complex_equivalence", impact: "Hun overfører sin egen læringsstrategi til teamets fejl.", ...ev(["Præcis som jeg gør med mine egne fejl. Et nej er bare information."]) },
      ],
    },
    disenabling_beliefs: {
      beliefs: [
        {
          statement: "Jeg skal selv have set det, før jeg kan stole på det.",
          belief_type: "about_others",
          impact: "Gør uddelegeringen langsom, men ikke umulig.",
          cost: "Hun skal være til stede ved de første tre møder.",
          reframe_question: "Hvad ville du acceptere som bevis, hvis du ikke selv kunne være til stede?",
          ...ev(["Jeg skal have set resultaterne selv — ikke bare høre, at det gik godt."]),
        },
      ],
    },
    values_and_6_human_needs: {
      values: [
        { value: "Teamets vækst", direction: "toward", rank: 1, rule: "For at føle, at jeg gør mit job, skal jeg se teamet vokse.", ...ev(["Og teamet vokser."]) },
        { value: "Frihed", direction: "toward", rank: 2, rule: "", ...ev(["Jeg har fået mine fredage tilbage."], "inference", "medium") },
        { value: "Læring", direction: "toward", rank: 3, rule: "", ...ev(["Så spørger jeg: Hvad kan vi lære af det her?"]) },
      ],
      human_needs: {
        certainty: need(7, "Ser selv resultaterne, før hun slipper.", "", ["Når jeg har set ham gøre det tre gange. Så tror jeg på det."]),
        variety: need(3.5, "", "", [], "low"),
        significance: need(5, "Flyttet fra at være nummer ét til at bygge folk.", "", ["ikke at være den bedste på listen"]),
        love_connection: need(7, "Relationen til teamet.", "", [], "low"),
        growth: need(8, "Lærer en ny rolle og hjælper teamet med at lære.", "", ["Det er en ny tanke for mig."], "high"),
        contribution: need(8, "Bygger folk og ser teamet vokse.", "", ["Mit job er at bygge folk"], "high"),
      },
      dominant_needs: ["growth", "contribution"],
      needs_summary: "Fra sikkerhed og forbindelse mod vækst og bidrag. Sikkerhed er stadig til stede via hendes convincer.",
    },
    meta_programs: {
      programs: [
        { program: "internal_external_reference", leaning: "pole_a", strength: 70, context: "Tillid til kollegaen", linguistic_markers: ["den føles rigtig"], ...ev(["Det er en ny tanke for mig. Den føles rigtig."]) },
        { program: "self_other", leaning: "pole_b", strength: 80, context: "Ledelse", linguistic_markers: ["bygge folk", "teamet vokser"], ...ev(["Mit job er at bygge folk"]) },
        { program: "independent_cooperative", leaning: "pole_b", strength: 55, context: "Opgavefordeling", linguistic_markers: ["vi"], ...ev(["Hvad kan vi lære af det her?"], "inference", "medium") },
        { program: "options_procedures", leaning: "pole_b", strength: 60, context: "Overbevisning om kollegaen", linguistic_markers: ["tre gange"], ...ev(["Når jeg har set ham gøre det tre gange."]) },
      ],
      convincer: { channel: "see", mode: "number_of_examples", description: "Skal have set kollegaen gøre det tre gange med egne øjne.", quotes: ["Når jeg har set ham gøre det tre gange. Så tror jeg på det."] },
    },
    meaning_makers: {
      focus: { description: "Teamets udvikling frem for egen præstation.", patterns: ["Hvad teamet kan lære"], quotes: ["Og teamet vokser."] },
      key_words: [{ text: "bygge folk", meaning: "Ny definition af hendes rolle", empowering: true, reconstructed: false, quote: "Mit job er at bygge folk" }],
      metaphors: [{ text: "Slipper", meaning: "Kontrol som noget, man holder fast i og gradvist giver slip på", empowering: true, reconstructed: false, quote: "jeg kan mærke, at jeg slipper lidt" }],
      habitual_questions: [{ text: "Hvad kan vi lære af det her?", meaning: "Hendes læringsspørgsmål, nu i flertal", empowering: true, reconstructed: false, quote: "Så spørger jeg: Hvad kan vi lære af det her?" }],
      assigned_meanings: [{ event: "At få fredagene tilbage", meaning: "Bevis for, at uddelegering virker", empowering: true, quote: "Jeg har fået mine fredage tilbage." }],
      physiology: { observable: true, description: "Beskriver en mærkelig fornemmelse i maven, der gradvist slipper.", quotes: ["Det føles mærkeligt i maven i starten"], confidence: "low" },
    },
    vakog: {
      distribution: { V: 28, A: 8, K: 30, O: 0, G: 0, Ad: 34 },
      primary_system: "Ad",
      secondary_system: "K",
      predicates: [
        { phrase: "ser jeg nu for mig", system: "V", quote: "Før et møde ser jeg nu for mig, hvordan min kollega Jonas klarer det, i stedet for mig selv." },
        { phrase: "føles mærkeligt i maven", system: "K", quote: "Det føles mærkeligt i maven i starten" },
        { phrase: "jeg siger til mig selv", system: "Ad", quote: "Jeg siger til mig selv: Mit job er at bygge folk" },
        { phrase: "så tror jeg på det", system: "Ad", quote: "Så tror jeg på det." },
      ],
      interpretation: "Mere indre dialog end i første interview: hun taler sig selv igennem forandringen. Kroppen er stadig hendes måleinstrument.",
      communication_tips: ["Støt hendes nye sætning (\"bygge folk\") ved at gentage den.", "Giv konkrete, synlige beviser på teamets fremgang."],
    },
    eye_accessing_cues: {
      basis: "not_available",
      cues: [],
      caveat: "Transskriptet har ingen nonverbale annoteringer, så øjenbevægelser kan ikke vurderes.",
      observation_suggestions: ["Observér øjnene, når hun forestiller sig kollegaen i mødet."],
    },
    gaps_and_next_questions: {
      gaps: [
        { category: "disenabling_beliefs", description: "Om modstanden i maven også er der ved mindre opgaver", why_it_matters: "Viser hvor generel den begrænsende overbevisning er" },
        { category: "cognitive_strategies", description: "Hvordan hun giver feedback til kollegaen efter mødet", why_it_matters: "Feedbacken er sandsynligvis hendes næste strategi at modellere" },
      ],
      next_questions: [
        { question: "Hvad skete der i dig, første gang Jonas lukkede en aftale uden dig?", purpose: "Afdække exit-punktet for tillid", target_category: "cognitive_strategies", priority: "high" },
        { question: "Hvad ville du ikke kunne overlade til nogen, uanset hvor mange gange du havde set dem gøre det?", purpose: "Finde grænsen for overbevisningen", target_category: "disenabling_beliefs", priority: "medium" },
      ],
    },
  },

  /* ───────────────────────── Jonas Krag · Forberedelse til finaler ───────────────────────── */
  jonas: {
    summary: {
      subject: "Jonas Krag",
      result_modeled: "Præsterer stabilt i finaler under højt pres",
      overview:
        "Jonas styrer sin tilstand før finaler med et fast ritual: samme sang, samme rytme, og kroppen skal føles let, før han er klar. Under løbet kobler han tænkningen fra og mærker vandet. Efter et tab bruger han én bestemt analyse: video samme aften og én ting at ændre. Han drives af vækst og bidrag, men frygten for at skuffe træneren koster ham søvn.",
      key_insights: [
        "Hans regel er en tydelig strategi-opdeling: \"Tænk før løbet, føl under løbet.\"",
        "Exit-kriteriet er kinæstetisk og meget præcist: skuldre nede, rolig vejrtrækning, varme i armene.",
        "Efter et tab begrænser han bevidst læringen til én ting. Det beskytter fokus og selvtillid.",
        "Frygten for at skuffe træneren er den største begrænsning.",
      ],
      source_quality: "Ét interview på ca. 300 ord med konkrete kropsbeskrivelser. Godt grundlag for state-strategien, tyndt for værdihierarki og meta-programmer.",
    },
    cognitive_strategies: {
      strategies: [
        {
          name: "State-ritual før finalen",
          strategy_type: "performance",
          context: "De sidste ti minutter før en finale",
          trigger: "Ti minutter til start",
          steps: [
            { system: "A", orientation: "external", temporal: "unspecified", description: "Lytter til den samme sang med en bestemt rytme", quote: "Jeg lytter til den samme sang hver gang — den har en bestemt rytme, som jeg svømmer i." },
            { system: "K", orientation: "internal", temporal: "unspecified", description: "Mærker rytmen i kroppen", quote: "Jeg hører rytmen og mærker den i kroppen." },
            { system: "K", orientation: "internal", temporal: "unspecified", description: "Tester, om kroppen føles let", quote: "Først når kroppen føles let, er jeg klar." },
          ],
          notation: "Aᵉ → Kⁱ → Kⁱ (test) → Exit",
          tote: {
            trigger: "Ti minutter før finalen",
            test: "Føles kroppen let: skuldre nede, rolig vejrtrækning, varme i armene?",
            operate: ["Ryster armene", "Trækker vejret dybt", "Lytter til rytmen igen"],
            exit: "Når kroppen føles let",
          },
          transferable: true,
          ...ev(["Hvis jeg ikke mærker det, ryster jeg armene og trækker vejret dybt igen, indtil det kommer."]),
        },
        {
          name: "Tænk før, føl under",
          strategy_type: "performance",
          context: "Under selve løbet",
          trigger: "Startskuddet",
          steps: [
            { system: "K", orientation: "external", temporal: "unspecified", description: "Mærker vandet og lader tankerne være", quote: "Jeg mærker vandet." },
          ],
          notation: "Kᵉ (Ad slukket) → Exit",
          tote: {
            trigger: "Startskuddet",
            test: "Er jeg i følelsen, eller er jeg begyndt at tænke?",
            operate: ["Flytter opmærksomheden tilbage til vandet"],
            exit: "Målet",
          },
          transferable: true,
          ...ev(["Hvis jeg begynder at tænke, bliver jeg langsom.", "Jeg har en regel: Tænk før løbet, føl under løbet."]),
        },
        {
          name: "Én ting efter et tab",
          strategy_type: "learning",
          context: "Aftenen efter et tabt løb",
          trigger: "Et tab",
          steps: [
            { system: "V", orientation: "external", temporal: "remembered", description: "Ser videoen samme aften", quote: "Så ser jeg videoen samme aften." },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Leder efter én ting at gøre anderledes", quote: "Jeg leder efter én ting, jeg kan gøre anderledes." },
          ],
          notation: "Vᵉ → Ad → Exit",
          tote: {
            trigger: "Et tabt løb",
            test: "Har jeg fundet én konkret ting at ændre?",
            operate: ["Ser videoen", "Sorterer mulige ændringer fra, til der er én tilbage"],
            exit: "Én ting er valgt",
          },
          transferable: true,
          ...ev(["Ikke ti ting. Én."]),
        },
      ],
      observations: "Klar opdeling mellem faser: auditiv og kinæstetisk forberedelse, ren kinæstetisk udførelse og visuel/logisk efterbehandling.",
    },
    enabling_beliefs: {
      beliefs: [
        { statement: "Hvis jeg kan, kan de også.", belief_type: "possibility", impact: "Gør hans præstation til et bevis for andre og giver ekstra mening.", ...ev(["Jeg tror på, at hvis jeg gør det, kan de også."]) },
        { statement: "Et tab er bare feedback.", belief_type: "complex_equivalence", impact: "Beskytter selvtilliden og holder fokus på forbedring.", ...ev(["Et tab er bare feedback."]) },
        { statement: "Jeg kan blive lidt bedre hver dag.", belief_type: "capability", impact: "Gør fremgang målbar og daglig.", ...ev(["At blive bedre. Hver dag lidt bedre end i går."]) },
      ],
    },
    disenabling_beliefs: {
      beliefs: [
        {
          statement: "Jeg må ikke skuffe min træner.",
          belief_type: "about_others",
          impact: "Skaber pres i brystet før store stævner.",
          cost: "Dårligere søvn før de vigtigste konkurrencer.",
          reframe_question: "Hvad tror du, din træner selv ville sige, at du skylder ham efter et dårligt løb?",
          ...ev(["At skuffe min træner.", "Det koster mig nogle gange søvn før store stævner."]),
        },
      ],
    },
    values_and_6_human_needs: {
      values: [
        { value: "Fremgang", direction: "toward", rank: 1, rule: "For at føle fremgang skal jeg kunne se kurven gå op.", ...ev(["Jeg elsker at se kurven gå op."]) },
        { value: "At inspirere de unge", direction: "toward", rank: 2, rule: "", ...ev(["Og så vil jeg vise de unge i klubben, at det kan lade sig gøre."]) },
        { value: "At skuffe træneren", direction: "away_from", rank: 0, rule: "", ...ev(["At skuffe min træner."]) },
      ],
      human_needs: {
        certainty: need(6, "Fast ritual: samme sang hver gang.", "", ["Jeg lytter til den samme sang hver gang"]),
        variety: need(2.5, "", "", [], "low"),
        significance: need(5, "Vil vise, at det kan lade sig gøre.", "", [], "low"),
        love_connection: need(5.5, "Relationen til træneren.", "Frygten for at skuffe ham.", ["At skuffe min træner."]),
        growth: need(9, "Måler alt og bliver lidt bedre hver dag.", "", ["Jeg måler alt — tider, slag, søvn."], "high"),
        contribution: need(7, "Viser de unge i klubben, at det kan lade sig gøre.", "", ["vil jeg vise de unge i klubben, at det kan lade sig gøre"]),
      },
      dominant_needs: ["growth", "contribution"],
      needs_summary: "Vækst er den klare drivkraft; bidrag til de unge giver den ekstra mening. Forbindelsen til træneren er både en ressource og en kilde til pres.",
    },
    meta_programs: {
      programs: [
        { program: "associated_dissociated", leaning: "pole_a", strength: 85, context: "Under løbet", linguistic_markers: ["jeg mærker vandet"], ...ev(["Ingenting, egentlig. Jeg mærker vandet."]) },
        { program: "general_specific", leaning: "pole_b", strength: 75, context: "Træning og analyse", linguistic_markers: ["tider, slag, søvn", "én ting"], ...ev(["Jeg måler alt — tider, slag, søvn."]) },
        { program: "options_procedures", leaning: "pole_b", strength: 75, context: "Før løb", linguistic_markers: ["hver gang", "regel"], ...ev(["Jeg lytter til den samme sang hver gang"]) },
        { program: "toward_away", leaning: "pole_a", strength: 70, context: "Motivation", linguistic_markers: ["at blive bedre"], ...ev(["At blive bedre. Hver dag lidt bedre end i går."]) },
        { program: "internal_external_reference", leaning: "balanced", strength: 50, context: "Vurdering af egen præstation", linguistic_markers: ["måler alt", "kroppen føles let"], ...ev(["Jeg elsker at se kurven gå op."], "inference", "low") },
      ],
      convincer: { channel: "see", mode: "unknown", description: "Ser data og video; hvor mange gange eller hvor længe fremgår ikke.", quotes: ["Jeg elsker at se kurven gå op."] },
    },
    meaning_makers: {
      focus: { description: "Kroppen i nuet før og under løbet; én ting ad gangen bagefter.", patterns: ["Rytme og fornemmelse", "Én forbedring ad gangen"], quotes: ["Ikke ti ting. Én."] },
      key_words: [{ text: "let", meaning: "Hans signal for at være klar", empowering: true, reconstructed: false, quote: "Først når kroppen føles let, er jeg klar." }],
      metaphors: [{ text: "En rytme, som jeg svømmer i", meaning: "Musikkens rytme bliver svømmetaget", empowering: true, reconstructed: false, quote: "den har en bestemt rytme, som jeg svømmer i" }],
      habitual_questions: [{ text: "Hvad er den ene ting, jeg kan gøre anderledes?", meaning: "Gør et tab overskueligt og handlingsrettet", empowering: true, reconstructed: true, quote: "Jeg leder efter én ting, jeg kan gøre anderledes." }],
      assigned_meanings: [
        { event: "Et tabt løb", meaning: "Feedback", empowering: true, quote: "Et tab er bare feedback." },
        { event: "Træneren efter et dårligt løb", meaning: "Risiko for at have skuffet ham", empowering: false, quote: "At skuffe min træner." },
      ],
      physiology: {
        observable: true,
        description: "Beskriver præcist sin klar-tilstand: skuldrene falder, vejrtrækningen bliver rolig, varme i armene. Pres i brystet ved frygten for at skuffe.",
        quotes: ["Skuldrene falder ned. Vejrtrækningen bliver rolig. Jeg mærker en varme i armene.", "jeg kan mærke det som et pres i brystet"],
        confidence: "medium",
      },
    },
    vakog: {
      distribution: { V: 17, A: 18, K: 45, O: 0, G: 0, Ad: 20 },
      primary_system: "K",
      secondary_system: "Ad",
      predicates: [
        { phrase: "mærker den i kroppen", system: "K", quote: "Jeg hører rytmen og mærker den i kroppen." },
        { phrase: "kroppen føles let", system: "K", quote: "Først når kroppen føles let, er jeg klar." },
        { phrase: "mærker vandet", system: "K", quote: "Jeg mærker vandet." },
        { phrase: "lytter til den samme sang", system: "A", quote: "Jeg lytter til den samme sang hver gang" },
        { phrase: "ser videoen", system: "V", quote: "Så ser jeg videoen samme aften." },
        { phrase: "hvis jeg begynder at tænke", system: "Ad", quote: "Hvis jeg begynder at tænke, bliver jeg langsom." },
      ],
      interpretation: "Tydeligt kinæstetisk primærsystem. Den indre dialog bruger han bevidst før og efter, men slukker den under præstationen.",
      communication_tips: ["Brug kropslige ord: mærk, let, rytme.", "Giv feedback som én konkret ting, ikke en liste.", "Vis kurver og video frem for at forklare."],
    },
    eye_accessing_cues: {
      basis: "not_available",
      cues: [],
      caveat: "Ingen nonverbale annoteringer i transskriptet.",
      observation_suggestions: ["Film ham, mens han beskriver klar-tilstanden: forventning er blik ned til højre (K)."],
    },
    gaps_and_next_questions: {
      gaps: [
        { category: "cognitive_strategies", description: "Hvad han gør, hvis ritualet bliver afbrudt (ingen musik, forsinket start)", why_it_matters: "Viser om strategien afhænger af den ydre trigger" },
        { category: "values_and_6_human_needs", description: "Hvorfor træneren betyder så meget", why_it_matters: "Kan afsløre en dybere værdi eller regel" },
      ],
      next_questions: [
        { question: "Hvad gør du, hvis du ikke kan høre din sang før en finale?", purpose: "Teste ritualets robusthed", target_category: "cognitive_strategies", priority: "high" },
        { question: "Hvad skal der ske, for at du føler, du har gjort din træner stolt?", purpose: "Afdække reglen bag frygten", target_category: "values_and_6_human_needs", priority: "high" },
        { question: "Hvordan ved du præcist, at du er begyndt at tænke under et løb?", purpose: "Finde testen i \"føl under løbet\"", target_category: "cognitive_strategies", priority: "medium" },
      ],
    },
  },

  /* ───────────────────────── Sara Lund · Beslutninger under usikkerhed ───────────────────────── */
  sara: {
    summary: {
      subject: "Sara Lund",
      result_modeled: "Træffer hurtige, gode beslutninger under usikkerhed",
      overview:
        "Sara beslutter hurtigt ved at skrive værste og bedste udfald i to kolonner og spørge sig selv, om hun kan leve med det værste. Hun ser fejl som eksperimenter og bliver først overbevist om en idé, når hun har hørt det samme fra fem kunder. Hun drives af variation og bidrag; bagsiden er, at hun har svært ved at sige nej til nye muligheder.",
      key_insights: [
        "Beslutningsstrategien er kort og gentagelig: to kolonner, ét spørgsmål, handling.",
        "Hendes convincer er auditiv og talt: fem kunder, samme svar.",
        "Hun ser muligheder overalt; det er både hendes styrke og hendes fokusproblem.",
      ],
      source_quality: "Ét interview på ca. 300 ord med tydelige regler og spørgsmål. Godt for strategier og meta-programmer, tyndt for fysiologi.",
    },
    cognitive_strategies: {
      strategies: [
        {
          name: "To kolonner og ét spørgsmål",
          strategy_type: "decision",
          context: "Store beslutninger i virksomheden",
          trigger: "En stor beslutning skal træffes",
          steps: [
            { system: "V", orientation: "external", temporal: "unspecified", description: "Skriver værste og bedste udfald i to kolonner", quote: "Jeg laver to kolonner: hvad er det værste, der kan ske, og hvad er det bedste." },
            { system: "V", orientation: "external", temporal: "unspecified", description: "Ser det på papir, så det bliver klart", quote: "Når jeg ser det på papir, bliver det klart for mig." },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Spørger, om hun kan leve med det værste", quote: "Så siger jeg til mig selv: Kan jeg leve med det værste?" },
          ],
          notation: "Vᵉ → Vᵉ → Ad → Exit",
          tote: {
            trigger: "En stor beslutning",
            test: "Kan jeg leve med det værste?",
            operate: ["Skriver værste og bedste udfald ned"],
            exit: "Ja: handler med det samme",
          },
          transferable: true,
          ...ev(["Hvis ja, så gør jeg det.", "Jeg venter ikke på perfekte data."]),
        },
        {
          name: "Fem-kunde-testen",
          strategy_type: "convincer",
          context: "Validering af nye idéer",
          trigger: "En ny idé",
          steps: [
            { system: "A", orientation: "external", temporal: "unspecified", description: "Taler med mindst fem kunder", quote: "Jeg skal tale med mindst fem kunder." },
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Konkluderer, når hun har hørt det samme fem gange", quote: "Når jeg har hørt det samme fra fem mennesker, ved jeg, at der er noget." },
          ],
          notation: "Aᵉ ×5 → Ad → Exit",
          tote: {
            trigger: "En ny idé",
            test: "Har jeg hørt det samme fra fem mennesker?",
            operate: ["Taler med flere kunder"],
            exit: "Fem ens svar: idéen er reel",
          },
          transferable: true,
          ...ev(["Før det er det bare en hypotese."]),
        },
        {
          name: "Fejl som eksperiment",
          strategy_type: "learning",
          context: "Når en beslutning viste sig forkert",
          trigger: "En forkert beslutning",
          steps: [
            { system: "Ad", orientation: "internal", temporal: "unspecified", description: "Ser fejlen som et eksperiment og spørger, hvad hun kan lære", quote: "Hvad kan jeg lære af det her?" },
          ],
          notation: "Ad → Exit",
          tote: { trigger: "En forkert beslutning", test: "Ved jeg, hvor jeg skal hen næste gang?", operate: ["Justerer kursen"], exit: "En ny retning er valgt" },
          transferable: true,
          ...ev(["Så justerer jeg. Jeg ser det som et eksperiment."]),
        },
      ],
      observations: "Korte strategier med lav tærskel for handling. Exit-kriterierne er bevidst \"gode nok\" frem for perfekte.",
    },
    enabling_beliefs: {
      beliefs: [
        { statement: "En god beslutning i dag er bedre end en perfekt beslutning om en måned.", belief_type: "cause_effect", impact: "Giver fart og forhindrer analyse-lammelse.", ...ev(["Jeg tror på, at en god beslutning i dag er bedre end en perfekt beslutning om en måned."]) },
        { statement: "Fejl er bare information om, hvor jeg skal hen næste gang.", belief_type: "complex_equivalence", impact: "Gør det billigt at tage chancer.", ...ev(["Fejl er bare information om, hvor jeg skal hen næste gang."]) },
        { statement: "Jeg kan leve med det værste.", belief_type: "capability", impact: "Gør usikkerhed håndterbar.", ...ev(["Kan jeg leve med det værste? Hvis ja, så gør jeg det."], "inference", "medium") },
      ],
    },
    disenabling_beliefs: {
      beliefs: [
        {
          statement: "Hvis jeg siger nej, går jeg glip af noget stort.",
          belief_type: "cause_effect",
          impact: "Hun siger ja til for meget.",
          cost: "Fokus.",
          reframe_question: "Hvilken stor mulighed fik du kun, fordi du havde sagt nej til noget andet?",
          ...ev(["Jeg har en tanke om, at hvis jeg siger nej, går jeg glip af noget stort.", "Det koster fokus."]),
        },
      ],
    },
    values_and_6_human_needs: {
      values: [
        { value: "Frihed", direction: "toward", rank: 1, rule: "", ...ev(["Frihed."]) },
        { value: "At skabe arbejdspladser, hvor folk vokser", direction: "toward", rank: 2, rule: "For at føle, at det er det hele værd, skal jeg se en medarbejder blomstre.", ...ev(["Når jeg ser en medarbejder blomstre, føles det som det hele værd."]) },
        { value: "Handlekraft", direction: "toward", rank: 3, rule: "", ...ev(["Jeg venter ikke på perfekte data."], "behavior", "medium") },
        { value: "At gå glip af muligheder", direction: "away_from", rank: 0, rule: "", ...ev(["hvis jeg siger nej, går jeg glip af noget stort"]) },
      ],
      human_needs: {
        certainty: need(3.5, "Worst-case-analysen giver tilstrækkelig sikkerhed.", "", ["Kan jeg leve med det værste?"]),
        variety: need(8.5, "Nye muligheder og nye virksomheder.", "Mister fokus.", ["Jeg ser muligheder overalt, og jeg vil prøve det hele."], "high"),
        significance: need(5, "", "", [], "low"),
        love_connection: need(5, "Relationen til medarbejderne.", "", [], "low"),
        growth: need(7.5, "Ser hver beslutning som et eksperiment.", "", ["Jeg ser det som et eksperiment."]),
        contribution: need(8, "Skaber arbejdspladser, hvor folk kan vokse.", "", ["Jeg vil skabe arbejdspladser, hvor folk kan vokse."], "high"),
      },
      dominant_needs: ["variety", "contribution"],
      needs_summary: "Variation giver energien, bidrag giver retningen. Det lave sikkerhedsbehov forklarer, at hun kan handle hurtigt.",
    },
    meta_programs: {
      programs: [
        { program: "options_procedures", leaning: "pole_a", strength: 85, context: "Forretningsudvikling", linguistic_markers: ["muligheder overalt"], ...ev(["Jeg ser muligheder overalt"]) },
        { program: "proactive_reactive", leaning: "pole_a", strength: 85, context: "Beslutninger", linguistic_markers: ["jeg venter ikke"], ...ev(["Jeg venter ikke på perfekte data."]) },
        { program: "toward_away", leaning: "pole_a", strength: 65, context: "Motivation", linguistic_markers: ["bygge", "skabe"], ...ev(["Og at bygge noget, der hjælper andre."]) },
        { program: "internal_external_reference", leaning: "pole_b", strength: 60, context: "Validering af nye idéer", linguistic_markers: ["fem kunder"], ...ev(["Jeg skal tale med mindst fem kunder."]) },
        { program: "general_specific", leaning: "pole_a", strength: 60, context: "Beslutninger", linguistic_markers: ["det værste", "det bedste"], ...ev(["hvad er det værste, der kan ske, og hvad er det bedste"], "inference", "medium") },
      ],
      convincer: { channel: "hear", mode: "number_of_examples", description: "Bliver overbevist, når hun har hørt det samme fra fem kunder.", quotes: ["Når jeg har hørt det samme fra fem mennesker, ved jeg, at der er noget."] },
    },
    meaning_makers: {
      focus: { description: "Muligheder og næste skridt fremad.", patterns: ["Hvad er det værste og det bedste?", "Hvor skal jeg hen næste gang?"], quotes: ["Fejl er bare information om, hvor jeg skal hen næste gang."] },
      key_words: [{ text: "eksperiment", meaning: "Gør beslutninger reversible og billige", empowering: true, reconstructed: false, quote: "Jeg ser det som et eksperiment." }],
      metaphors: [{ text: "Muligheder lukker sig", meaning: "Tid er en knap ressource", empowering: true, reconstructed: false, quote: "Muligheder lukker sig, hvis man venter." }],
      habitual_questions: [
        { text: "Kan jeg leve med det værste?", meaning: "Gør usikkerhed til et ja/nej", empowering: true, reconstructed: false, quote: "Kan jeg leve med det værste?" },
        { text: "Hvad kan jeg lære af det her?", meaning: "Gør fejl til læring", empowering: true, reconstructed: false, quote: "Hvad kan jeg lære af det her?" },
      ],
      assigned_meanings: [
        { event: "En forkert beslutning", meaning: "Et eksperiment", empowering: true, quote: "Jeg ser det som et eksperiment." },
        { event: "At sige nej", meaning: "At gå glip af noget stort", empowering: false, quote: "hvis jeg siger nej, går jeg glip af noget stort" },
      ],
      physiology: { observable: false, description: "Fysiologi fremgår ikke af teksten. Observér energi og tempo, når hun taler om nye muligheder.", quotes: [], confidence: "low" },
    },
    vakog: {
      distribution: { V: 30, A: 22, K: 10, O: 0, G: 0, Ad: 38 },
      primary_system: "Ad",
      secondary_system: "V",
      predicates: [
        { phrase: "skriver det ned", system: "V", quote: "Jeg skriver det ned. Altid." },
        { phrase: "ser det på papir", system: "V", quote: "Når jeg ser det på papir, bliver det klart for mig." },
        { phrase: "siger til mig selv", system: "Ad", quote: "Så siger jeg til mig selv: Kan jeg leve med det værste?" },
        { phrase: "tale med", system: "A", quote: "Jeg skal tale med mindst fem kunder." },
        { phrase: "hørt det samme", system: "A", quote: "Når jeg har hørt det samme fra fem mennesker" },
        { phrase: "føles som det hele værd", system: "K", quote: "føles det som det hele værd" },
      ],
      interpretation: "Logisk og sproglig (Ad) med visuel støtte: hun skal se det på papir. Det auditive bruger hun til at validere idéer udefra.",
      communication_tips: ["Præsentér beslutninger som værste/bedste udfald.", "Brug kundecitater som argumenter."],
    },
    eye_accessing_cues: {
      basis: "not_available",
      cues: [],
      caveat: "Ingen nonverbale annoteringer i transskriptet.",
      observation_suggestions: ["Observér øjnene, når hun forestiller sig det værste udfald."],
    },
    gaps_and_next_questions: {
      gaps: [
        { category: "disenabling_beliefs", description: "Hvordan hun konkret vælger mellem flere muligheder", why_it_matters: "Fokusproblemet ligger sandsynligvis her" },
        { category: "meaning_makers", description: "Hendes fysiologi og energi", why_it_matters: "Kan forklare, hvordan hun holder tempoet" },
      ],
      next_questions: [
        { question: "Hvordan beslutter du, hvilke muligheder du siger nej til?", purpose: "Afdække hendes udvælgelsesstrategi", target_category: "cognitive_strategies", priority: "high" },
        { question: "Hvad ville du gøre, hvis du ikke kunne leve med det værste udfald?", purpose: "Teste beslutningsstrategiens grænse", target_category: "cognitive_strategies", priority: "medium" },
        { question: "Hvor længe holder fem kunders svar, før du vil høre dem igen?", purpose: "Afdække convincer-mode over tid", target_category: "meta_programs", priority: "low" },
      ],
    },
  },
};

/** Kobling mellem eksempel-id og demo-transskript (indeks i DEMO_TRANSCRIPTS). */
export const EXAMPLE_SOURCES: { id: string; demoIndex: number }[] = [
  { id: "mette-1", demoIndex: 0 },
  { id: "mette-2", demoIndex: 1 },
  { id: "jonas", demoIndex: 2 },
  { id: "sara", demoIndex: 3 },
];
