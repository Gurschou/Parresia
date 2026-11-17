import { SAMPLE_TRANSCRIPT } from "./sample-transcript";

/** Fiktive demo-interviews (bruges af seed-scriptet og E2E-tests). */
export const DEMO_TRANSCRIPTS: { expert: string; role: string; title: string; daysAgo: number; transcript: string }[] = [
  { expert: "Mette Holm", role: "Salgsdirektør", title: "Store kundemøder", daysAgo: 42, transcript: SAMPLE_TRANSCRIPT },
  {
    expert: "Mette Holm",
    role: "Salgsdirektør",
    title: "Opfølgning: uddelegering",
    daysAgo: 9,
    transcript: `Interviewer: Sidst talte vi om, at du har svært ved at uddelegere. Hvad er sket siden?

Mette: Jeg har prøvet noget nyt. Før et møde ser jeg nu for mig, hvordan min kollega Jonas klarer det, i stedet for mig selv. Det føles mærkeligt i maven i starten, men jeg kan mærke, at jeg slipper lidt.

Interviewer: Hvordan ved du, at du kan slippe en opgave?

Mette: Når jeg har set ham gøre det tre gange. Så tror jeg på det. Jeg skal have set resultaterne selv — ikke bare høre, at det gik godt.

Interviewer: Hvad har det betydet for dig?

Mette: Jeg har fået mine fredage tilbage. Og teamet vokser. Jeg siger til mig selv: Mit job er at bygge folk, ikke at være den bedste på listen. Det er en ny tanke for mig. Den føles rigtig.

Interviewer: Hvad gør du, når det går galt for en i teamet?

Mette: Så spørger jeg: Hvad kan vi lære af det her? Præcis som jeg gør med mine egne fejl. Et nej er bare information.`,
  },
  {
    expert: "Jonas Krag",
    role: "Elitesvømmer",
    title: "Forberedelse til finaler",
    daysAgo: 30,
    transcript: `Interviewer: Hvad sker der i dig, de sidste ti minutter før en finale?

Jonas: Jeg lukker alt ude. Jeg lytter til den samme sang hver gang — den har en bestemt rytme, som jeg svømmer i. Jeg hører rytmen og mærker den i kroppen. Først når kroppen føles let, er jeg klar.

Interviewer: Hvordan ved du, at kroppen føles let?

Jonas: Skuldrene falder ned. Vejrtrækningen bliver rolig. Jeg mærker en varme i armene. Hvis jeg ikke mærker det, ryster jeg armene og trækker vejret dybt igen, indtil det kommer.

Interviewer: Hvad tænker du på i selve løbet?

Jonas: Ingenting, egentlig. Jeg mærker vandet. Hvis jeg begynder at tænke, bliver jeg langsom. Jeg har en regel: Tænk før løbet, føl under løbet.

Interviewer: Hvad driver dig?

Jonas: At blive bedre. Hver dag lidt bedre end i går. Jeg måler alt — tider, slag, søvn. Jeg elsker at se kurven gå op. Og så vil jeg vise de unge i klubben, at det kan lade sig gøre. Jeg tror på, at hvis jeg gør det, kan de også.

Interviewer: Hvad når du taber?

Jonas: Så ser jeg videoen samme aften. Jeg leder efter én ting, jeg kan gøre anderledes. Ikke ti ting. Én. Et tab er bare feedback.

Interviewer: Er der noget, du er bange for?

Jonas: At skuffe min træner. Jeg ved godt, det ikke er rationelt, men jeg kan mærke det som et pres i brystet. Det koster mig nogle gange søvn før store stævner.`,
  },
  {
    expert: "Sara Lund",
    role: "Iværksætter",
    title: "Beslutninger under usikkerhed",
    daysAgo: 18,
    transcript: `Interviewer: Du har bygget tre virksomheder. Hvordan træffer du store beslutninger?

Sara: Jeg skriver det ned. Altid. Jeg laver to kolonner: hvad er det værste, der kan ske, og hvad er det bedste. Når jeg ser det på papir, bliver det klart for mig. Så siger jeg til mig selv: Kan jeg leve med det værste? Hvis ja, så gør jeg det.

Interviewer: Hvor hurtigt sker det?

Sara: Hurtigt. Jeg venter ikke på perfekte data. Jeg tror på, at en god beslutning i dag er bedre end en perfekt beslutning om en måned. Muligheder lukker sig, hvis man venter.

Interviewer: Hvad gør du, hvis beslutningen var forkert?

Sara: Så justerer jeg. Jeg ser det som et eksperiment. Hvad kan jeg lære af det her? Fejl er bare information om, hvor jeg skal hen næste gang.

Interviewer: Hvad betyder mest for dig?

Sara: Frihed. Og at bygge noget, der hjælper andre. Jeg vil skabe arbejdspladser, hvor folk kan vokse. Når jeg ser en medarbejder blomstre, føles det som det hele værd.

Interviewer: Hvordan bliver du overbevist om en ny idé?

Sara: Jeg skal tale med mindst fem kunder. Når jeg har hørt det samme fra fem mennesker, ved jeg, at der er noget. Før det er det bare en hypotese.

Interviewer: Hvad er svært for dig?

Sara: At sige nej til nye muligheder. Jeg ser muligheder overalt, og jeg vil prøve det hele. Det koster fokus. Jeg har en tanke om, at hvis jeg siger nej, går jeg glip af noget stort.`,
  },
];
