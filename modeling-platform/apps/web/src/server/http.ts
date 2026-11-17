import { AnalysisError } from "@bm/core";
import { ZodError } from "zod";
import { getApiUser, type SessionUser } from "./session";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function jsonError(status: number, code: string, message: string, details?: unknown): Response {
  return Response.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, { status });
}

const ANALYSIS_STATUS: Partial<Record<AnalysisError["code"], number>> = {
  input_empty: 422,
  input_too_long: 413,
  missing_api_key: 503,
  rate_limited: 429,
  overloaded: 503,
};

/** Oversætter kendte fejl til et konsistent JSON-fejlsvar: `{ error: { code, message } }`. */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return jsonError(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    return jsonError(
      422,
      "validation_error",
      "Ugyldigt input.",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (err instanceof AnalysisError) return jsonError(ANALYSIS_STATUS[err.code] ?? 500, err.code, err.userMessage, err.details);
  if (err instanceof SyntaxError) return jsonError(400, "bad_json", "Request-body er ikke gyldig JSON.");
  console.error("[api] uventet fejl", err);
  return jsonError(500, "internal_error", "Der opstod en uventet serverfejl.");
}

type Handler<C> = (req: Request, user: SessionUser, ctx: C) => Promise<Response>;

/** Wrapper til API-ruter: kræver login og giver ensartet fejlhåndtering. */
export function withUser<C = unknown>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const user = await getApiUser();
      if (!user) return jsonError(401, "unauthorized", "Du skal være logget ind.");
      return await handler(req, user, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export const notFound = (what = "Ressourcen") => new HttpError(404, "not_found", `${what} blev ikke fundet.`);
