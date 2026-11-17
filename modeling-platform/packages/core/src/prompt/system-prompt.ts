/**
 * Den system-prompt, der bruges UÆNDRET i ALLE LLM-kald på platformen.
 *
 * Må ikke redigeres, formateres om eller udvides. Alt yderligere (JSON-krav,
 * evidensdisciplin, kategori-instruktioner, transskriptet) hører til i
 * brugerbeskeden — se `build-user-message.ts`.
 *
 * `test/system-prompt.test.ts` verificerer, at teksten er byte-identisk med
 * specifikationen (SHA-256).
 */
export const SYSTEM_PROMPT = `Du er en Advanced Behavioral Modeling-agent. Analyser transskriptet og udtræk:
- Kognitive strategier (sekvenser og TOTE)
- Enabling og disenabling beliefs
- Values og de 6 Human Needs
- Meta-programmer
- Meaning-makers
- VAKOG (repræsentationssystemer)
- Eye Accessing Cues
- Mangler og foreslåede næste spørgsmål

Svar struktureret og præcist. Brug dansk.`;
