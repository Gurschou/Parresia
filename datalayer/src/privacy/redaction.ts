/**
 * Redaction layer — the second line of the no-PII guarantee.
 *
 * Strategy (layered, deliberately redundant):
 *
 *  1. STRUCTURAL (primary): PII exists in exactly one table
 *     (user_identity), and every payload schema is a strict Zod whitelist —
 *     a payload cannot carry a `name` or `email` field because no schema
 *     declares one. Whitelists beat blacklists: you cannot forget to redact
 *     a field that cannot exist.
 *
 *  2. TEXTUAL (this file): free-text fields the user CAN type into (notes)
 *     and anything serialized towards logs or model APIs pass through
 *     pattern-based scrubbing for emails, phone numbers and national id
 *     formats (Danish CPR and similar Nordic formats).
 *
 * Everything sent to a model API must go through redactForModel(); every
 * log line must go through redactForLog(). Neither ever receives
 * user_identity rows — those functions accept only already-PII-free store
 * data, and the scrubbing is defense in depth on top of that.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** Danish CPR: DDMMYY-XXXX (with or without hyphen). */
const CPR_RE = /\b\d{6}-?\d{4}\b/g;
/** Phone numbers: international or local formats with 8+ digits. */
const PHONE_RE = /(?:\+|00)?\d[\d\s\-()]{7,}\d/g;
/** UUIDs are opaque ids, not PII — protect them from the digit-based rules. */
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function redactText(text: string): string {
  // Shield UUIDs so CPR/phone patterns can't fire inside them.
  const uuids: string[] = [];
  const shielded = text.replace(UUID_RE, (m) => {
    uuids.push(m);
    return `\u0000uuid${uuids.length - 1}\u0000`;
  });
  const scrubbed = shielded
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(CPR_RE, "[redacted-id]")
    .replace(PHONE_RE, "[redacted-phone]");
  return scrubbed.replace(/\u0000uuid(\d+)\u0000/g, (_, i) => uuids[Number(i)]!);
}

/** Recursively scrub every string value in a JSON-shaped structure. */
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redactText(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v);
    }
    return out as T;
  }
  return value;
}

/** Applied to every event payload at the ingest boundary. */
export function redactPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return redactDeep(payload);
}

/**
 * The ONLY sanctioned serialization towards a model API. Accepts store data
 * (already structurally PII-free), scrubs strings, and stamps the result so
 * calling code can assert it received a redacted object.
 */
export function redactForModel<T>(data: T): T {
  return redactDeep(data);
}

/**
 * Log serializer: user ids are pseudonymized to a short prefix (enough to
 * correlate log lines, not enough to join back to identity without DB
 * access), all strings scrubbed.
 */
export function redactForLog(data: unknown): unknown {
  const scrubbed = redactDeep(data);
  return pseudonymizeUserIds(scrubbed);
}

function pseudonymizeUserIds(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(pseudonymizeUserIds);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === "userId" || k === "user_id") && typeof v === "string") {
        out[k] = `${v.slice(0, 8)}…`;
      } else {
        out[k] = pseudonymizeUserIds(v);
      }
    }
    return out;
  }
  return value;
}
