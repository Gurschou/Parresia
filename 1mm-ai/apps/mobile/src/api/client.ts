import { fetch as expoFetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";

/**
 * API client for the shared backend (apps/web API routes).
 * - Base URL comes from EXPO_PUBLIC_API_URL (safe, public value).
 * - The session JWT is stored in SecureStore and sent as a Bearer header.
 * - expo/fetch is used because it supports streaming response bodies in
 *   React Native (needed for the SSE chat stream).
 */

const TOKEN_KEY = "onemm_session_token";

export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/** JSON request helper. Throws ApiRequestError with a user-friendly message. */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = await getToken();
  const response = await expoFetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!response.ok) {
    let message = "Noget gik galt. Prøv igen.";
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // Non-JSON error body – keep the generic message.
    }
    throw new ApiRequestError(response.status, message);
  }
  return (await response.json()) as T;
}

/** Streaming POST used by the chat (returns the raw streaming response). */
export async function apiStream(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<typeof expoFetch>>> {
  const token = await getToken();
  const response = await expoFetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    let message = "Kunne ikke sende beskeden.";
    try {
      const parsed = (await response.json()) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // ignore
    }
    throw new ApiRequestError(response.status, message);
  }
  return response;
}
