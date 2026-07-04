/**
 * Structured error hierarchy shared across all SYNAPSE layers.
 *
 * Every error carries a stable machine-readable `code` so the API layer can
 * map errors to HTTP statuses and clients can branch on them without string
 * matching.
 */
export type ErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_RESPONSE_INVALID"
  | "MEMORY_STORE_FAILURE"
  | "INTERNAL";

export class SynapseError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "SynapseError";
    this.code = code;
    this.details = options?.details;
  }
}

export class ValidationError extends SynapseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION", message, { details });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends SynapseError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} not found: ${id}`, {
      details: { resource, id },
    });
    this.name = "NotFoundError";
  }
}

export class ModelUnavailableError extends SynapseError {
  constructor(provider: string, cause?: unknown) {
    super("MODEL_UNAVAILABLE", `Model provider unavailable: ${provider}`, {
      details: { provider },
      cause,
    });
    this.name = "ModelUnavailableError";
  }
}

export class ModelResponseInvalidError extends SynapseError {
  constructor(message: string, cause?: unknown) {
    super("MODEL_RESPONSE_INVALID", message, { cause });
    this.name = "ModelResponseInvalidError";
  }
}
