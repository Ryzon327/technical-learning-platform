/**
 * Generic authenticated client for the platform API service.
 *
 * Responsibility boundary (Wave 7 / Batch 6):
 *
 *   authenticated session/token
 *       -> this generic request helper
 *       -> feature-specific service modules
 *       -> React presentation
 *
 * It owns base-URL resolution, bearer-token headers, JSON handling and error
 * normalization. It deliberately owns no feature logic, no auth state, no
 * Supabase authentication, and no routing. React components must never build
 * an Authorization header themselves.
 *
 * Configuration follows the existing browser convention in lib/supabase.ts:
 * a VITE_ environment variable read at the edge of the application.
 */

export class ApiRequestError extends Error {
  /** Normalized platform error code, or a transport-level substitute. */
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    code: string;
    status: number;
    retryable: boolean;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
  }
}

export function resolveApiBaseUrl(
  env: Record<string, string | undefined> = import.meta.env as Record<
    string,
    string | undefined
  >
): string {
  const base = env.VITE_API_BASE_URL?.trim();

  if (!base) {
    throw new ApiRequestError({
      message:
        "API configuration is missing. Set VITE_API_BASE_URL to the platform API service.",
      code: "CONFIGURATION_MISSING",
      status: 0,
      retryable: false
    });
  }

  return base.replace(/\/+$/, "");
}

/** Builds a request URL, dropping empty query values rather than sending them. */
export function buildApiUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | undefined>
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    const asString = String(value).trim();
    if (asString === "") continue;
    search.set(key, asString);
  }

  const queryString = search.toString();
  return `${baseUrl.replace(/\/+$/, "")}${normalizedPath}${
    queryString ? `?${queryString}` : ""
  }`;
}

/** Maps an API error payload, or an unhelpful response, into one shape. */
export function normalizeApiError(
  status: number,
  payload: unknown
): ApiRequestError {
  const body =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const error =
    body.error && typeof body.error === "object"
      ? (body.error as Record<string, unknown>)
      : body;

  const code =
    typeof error.code === "string" && error.code.trim() !== ""
      ? error.code
      : status === 401 || status === 403
        ? "UNAUTHORIZED"
        : status === 404
          ? "NOT_FOUND"
          : "INTERNAL_ERROR";

  const message =
    typeof error.message === "string" && error.message.trim() !== ""
      ? error.message
      : "The platform could not complete that request.";

  return new ApiRequestError({
    message,
    code,
    status,
    retryable: error.retryable === true || status >= 500
  });
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  baseUrl?: string;
}

/**
 * Performs an authenticated JSON request.
 *
 * The access token is supplied by the caller from the existing AuthProvider
 * session; this module never reads or manages auth state itself.
 */
export async function apiRequest<TResponse>(
  accessToken: string,
  path: string,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  if (typeof accessToken !== "string" || accessToken.trim() === "") {
    throw new ApiRequestError({
      message: "You need to sign in again to continue.",
      code: "UNAUTHORIZED",
      status: 401,
      retryable: false
    });
  }

  const baseUrl = options.baseUrl ?? resolveApiBaseUrl();
  const url = buildApiUrl(baseUrl, path, options.query);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" })
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw caught;
    }
    throw new ApiRequestError({
      message: "We could not reach the platform. Check your connection.",
      code: "NETWORK_UNAVAILABLE",
      status: 0,
      retryable: true
    });
  }

  const text = await response.text();
  let payload: unknown = undefined;
  if (text.trim() !== "") {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    throw normalizeApiError(response.status, payload);
  }

  return payload as TResponse;
}
