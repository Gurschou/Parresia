import Anthropic from "@anthropic-ai/sdk";

export type AnalysisErrorCode =
  | "missing_api_key"
  | "auth"
  | "permission"
  | "model_not_found"
  | "rate_limited"
  | "overloaded"
  | "server"
  | "network"
  | "timeout"
  | "bad_request"
  | "schema_too_complex"
  | "input_too_long"
  | "input_empty"
  | "refusal"
  | "truncated"
  | "invalid_output"
  | "aborted"
  | "transcription_failed"
  | "media_failed"
  | "unknown";

const USER_MESSAGES: Record<AnalysisErrorCode, string> = {
  missing_api_key:
    "Der er ingen ANTHROPIC_API_KEY. Sæt nøglen i .env (eller brug LLM_PROVIDER=mock til lokal test).",
  auth: "Anthropic afviste API-nøglen. Kontrollér ANTHROPIC_API_KEY.",
  permission: "API-nøglen har ikke adgang til den valgte model eller funktion.",
  model_not_found: "Modellen findes ikke eller er ikke tilgængelig for din konto. Kontrollér ANTHROPIC_MODEL.",
  rate_limited: "Claude-API'ets rate limit er nået. Analysen er forsøgt igen automatisk — prøv igen om lidt.",
  overloaded: "Claude er midlertidigt overbelastet. Prøv igen om et øjeblik.",
  server: "Der opstod en fejl hos Anthropic. Prøv igen.",
  network: "Kunne ikke forbinde til Anthropic. Kontrollér netværket.",
  timeout: "Analysen tog for lang tid og blev afbrudt. Prøv igen, evt. med et kortere transskript.",
  bad_request: "Anmodningen blev afvist af API'et.",
  schema_too_complex: "Analyse-schemaet er for komplekst til structured outputs.",
  input_too_long: "Transskriptet er for langt. Del det op eller hæv MAX_TRANSCRIPT_CHARS.",
  input_empty: "Transskriptet er tomt eller for kort til en meningsfuld analyse.",
  refusal: "Claude afviste at analysere dette materiale.",
  truncated: "Svaret blev afkortet (max_tokens). Hæv ANTHROPIC_MAX_TOKENS eller forkort transskriptet.",
  invalid_output: "Modellens svar kunne ikke valideres mod analyse-schemaet, heller ikke efter en reparationsrunde.",
  aborted: "Analysen blev afbrudt.",
  transcription_failed: "Transskriberingen fejlede.",
  media_failed: "Lyd/video-filen kunne ikke behandles (ffmpeg).",
  unknown: "Der opstod en uventet fejl under analysen.",
};

const RETRYABLE: ReadonlySet<AnalysisErrorCode> = new Set(["rate_limited", "overloaded", "server", "network", "timeout"]);

export class AnalysisError extends Error {
  readonly code: AnalysisErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly details?: string;

  constructor(
    code: AnalysisErrorCode,
    opts: { message?: string; status?: number; retryAfterMs?: number; details?: string; cause?: unknown } = {},
  ) {
    super(opts.message ?? (opts.details ? `${USER_MESSAGES[code]} ${opts.details}` : USER_MESSAGES[code]), { cause: opts.cause });
    this.name = "AnalysisError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
    this.retryable = RETRYABLE.has(code);
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.details = opts.details;
  }

  toJSON() {
    return { code: this.code, message: this.userMessage, details: this.details, retryable: this.retryable };
  }
}

export function userMessageFor(code: AnalysisErrorCode): string {
  return USER_MESSAGES[code];
}

function parseRetryAfter(headers: Headers | undefined): number | undefined {
  const raw = headers?.get?.("retry-after-ms") ?? undefined;
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  const s = headers?.get?.("retry-after");
  if (!s) return undefined;
  const secs = Number(s);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(s);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** Oversætter vilkårlige fejl (især SDK-fejl) til en typed AnalysisError. Mest specifikke først. */
export function toAnalysisError(err: unknown): AnalysisError {
  if (err instanceof AnalysisError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new AnalysisError("aborted", { cause: err });
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new AnalysisError("timeout", { cause: err });
  if (err instanceof Anthropic.APIConnectionError) return new AnalysisError("network", { cause: err });
  if (err instanceof Anthropic.APIError) {
    const status = err.status;
    const headers = err.headers as Headers | undefined;
    const details = err.message;
    const base = { status, details, cause: err, retryAfterMs: parseRetryAfter(headers) };
    if (err instanceof Anthropic.AuthenticationError) return new AnalysisError("auth", base);
    if (err instanceof Anthropic.PermissionDeniedError) return new AnalysisError("permission", base);
    if (err instanceof Anthropic.NotFoundError) return new AnalysisError("model_not_found", base);
    if (err instanceof Anthropic.RateLimitError) return new AnalysisError("rate_limited", base);
    if (err instanceof Anthropic.ContentTooLargeError) return new AnalysisError("input_too_long", base);
    if (err instanceof Anthropic.BadRequestError) {
      if (/too complex|compil/i.test(details)) return new AnalysisError("schema_too_complex", base);
      if (/prompt is too long|too many tokens|context/i.test(details)) return new AnalysisError("input_too_long", base);
      return new AnalysisError("bad_request", base);
    }
    if (status === 529 || /overloaded/i.test(details)) return new AnalysisError("overloaded", base);
    if (status === 408) return new AnalysisError("timeout", base);
    if (status !== undefined && status >= 500) return new AnalysisError("server", base);
    // Fejl uden status kommer typisk fra en SSE-fejlhændelse midt i streamen.
    if (status === undefined && /overloaded/i.test(details)) return new AnalysisError("overloaded", base);
    if (status === undefined && /api_error|internal/i.test(details)) return new AnalysisError("server", base);
    return new AnalysisError("unknown", base);
  }
  if (err instanceof Error && err.name === "AbortError") return new AnalysisError("aborted", { cause: err });
  return new AnalysisError("unknown", {
    cause: err,
    details: err instanceof Error ? err.message : String(err),
  });
}
