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
  /**
   * Structured detail the API attached to the error, passed through verbatim.
   *
   * Transport only: this module never interprets it. Feature modules read the
   * fields they understand, so a machine-readable reason does not have to be
   * recovered by matching on human-readable message text.
   */
  readonly details?: Record<string, unknown>;

  constructor(input: {
    message: string;
    code: string;
    status: number;
    retryable: boolean;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
    if (input.details) this.details = input.details;
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

/**
 * One query parameter value.
 *
 * An array becomes a repeated parameter — `["course", "mission"]` is sent as
 * `?key=course&key=mission`, the multi-select convention the API already reads
 * with `URLSearchParams.getAll`. It is never joined into one comma-separated
 * value, which would make the wire format ambiguous for any value containing a
 * comma.
 */
export type ApiQueryValue = string | number | readonly string[] | undefined;

/** Builds a request URL, dropping empty query values rather than sending them. */
export function buildApiUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, ApiQueryValue>
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const search = new URLSearchParams();

  const appendValue = (key: string, value: string | number) => {
    const asString = String(value).trim();
    if (asString === "") return;
    search.append(key, asString);
  };

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const entry of value) appendValue(key, entry);
      continue;
    }

    appendValue(key, value as string | number);
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

  const details =
    error.details && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : undefined;

  return new ApiRequestError({
    message,
    code,
    status,
    retryable: error.retryable === true || status >= 500,
    ...(details ? { details } : {})
  });
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, ApiQueryValue>;
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
