/**
 * Schema-styret, deterministisk oprydning FØR Zod-validering.
 *
 * Structured outputs garanterer JSON-strukturen, men:
 *  - min/max sendes ikke til API'et (de clamp'es her),
 *  - enum-casing er ikke garanteret ("high" vs "High"),
 *  - i prompt-mode (fallback uden schema-håndhævelse) kan felter mangle.
 * Funktionen går værdien og det fulde JSON-schema (med min/max) igennem
 * parallelt og retter kun det, der kan rettes sikkert. Alt andet overlades
 * til Zod, så reelle fejl stadig opdages.
 */

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  anyOf?: JsonSchema[];
};

export interface CoerceResult {
  value: unknown;
  fixes: string[];
}

export function coerceToSchema(value: unknown, schema: JsonSchema): CoerceResult {
  const fixes: string[] = [];
  const defs = schema.$defs ?? {};
  const resolve = (s: JsonSchema): JsonSchema => {
    if (s.$ref) {
      const name = s.$ref.replace(/^#\/\$defs\//, "");
      return defs[name] ?? s;
    }
    return s;
  };

  const walk = (v: unknown, s0: JsonSchema, path: string): unknown => {
    const s = resolve(s0);
    if (s.enum && typeof v === "string") {
      if (s.enum.includes(v)) return v;
      const needle = v.trim().toLowerCase();
      const hit = s.enum.find((e) => typeof e === "string" && e.toLowerCase() === needle);
      if (hit !== undefined) {
        fixes.push(`${path}: enum-casing "${v}" → "${String(hit)}"`);
        return hit;
      }
      return v;
    }
    const type = Array.isArray(s.type) ? s.type[0] : s.type;
    switch (type) {
      case "object": {
        if (!v || typeof v !== "object" || Array.isArray(v)) return v;
        const out: Record<string, unknown> = { ...(v as Record<string, unknown>) };
        for (const [k, ps] of Object.entries(s.properties ?? {})) {
          const p = `${path}.${k}`;
          if (out[k] === undefined || out[k] === null) {
            const empty = emptyFor(resolve(ps));
            if (empty !== undefined) {
              fixes.push(`${p}: manglende felt udfyldt med tom værdi`);
              out[k] = empty;
              continue;
            }
          }
          if (out[k] !== undefined) out[k] = walk(out[k], ps, p);
        }
        return out;
      }
      case "array": {
        if (typeof v === "string" && v.trim()) {
          fixes.push(`${path}: streng pakket i liste`);
          v = [v];
        }
        if (!Array.isArray(v)) return v;
        return s.items ? v.map((x, i) => walk(x, s.items!, `${path}[${i}]`)) : v;
      }
      case "number":
      case "integer": {
        const candidate = typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
        if (typeof candidate !== "number" || !Number.isFinite(candidate)) return v;
        let n: number = candidate;
        if (type === "integer" && !Number.isInteger(n)) n = Math.round(n);
        if (s.minimum !== undefined && n < s.minimum) {
          fixes.push(`${path}: ${n} hævet til minimum ${s.minimum}`);
          n = s.minimum;
        }
        if (s.maximum !== undefined && n > s.maximum) {
          fixes.push(`${path}: ${n} sænket til maksimum ${s.maximum}`);
          n = s.maximum;
        }
        return n;
      }
      case "string":
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        return v;
      case "boolean":
        if (v === "true") return true;
        if (v === "false") return false;
        return v;
      default:
        return v;
    }
  };

  return { value: walk(value, schema, "$"), fixes };
}

function emptyFor(s: JsonSchema): unknown {
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  if (s.enum) return undefined;
  if (type === "array") return [];
  if (type === "string") return "";
  return undefined;
}

/** Udtrækker JSON fra modeltekst (tåler ```json-hegn og tekst omkring). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fortsæt */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fortsæt */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new SyntaxError("Svaret indeholder ikke et JSON-objekt");
}
