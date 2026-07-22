/** Normalized provider error with a client-safe message and retry hint. */
export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(message: string, options: { retryable: boolean; status?: number; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "ProviderError";
    this.retryable = options.retryable;
    this.status = options.status;
  }
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;

  if (error instanceof Error && error.name === "AbortError") {
    return new ProviderError("Anmodningen blev afbrudt.", { retryable: false, cause: error });
  }

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : undefined;

  if (status === 429) {
    return new ProviderError("AI-tjenesten er optaget lige nu. Prøv igen om lidt.", {
      retryable: true,
      status,
      cause: error,
    });
  }
  if (status !== undefined && status >= 500) {
    return new ProviderError("AI-tjenesten svarede med en midlertidig fejl. Prøv igen.", {
      retryable: true,
      status,
      cause: error,
    });
  }
  if (status === 401 || status === 403) {
    return new ProviderError("AI-tjenesten afviste anmodningen (konfigurationsfejl).", {
      retryable: false,
      status,
      cause: error,
    });
  }
  return new ProviderError("Der opstod en uventet fejl hos AI-tjenesten.", {
    retryable: true,
    status,
    cause: error,
  });
}
