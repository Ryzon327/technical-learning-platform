import type { AppEnvironment } from "@tlp/shared-types";

/**
 * API-CORS-1 — the browser origin boundary.
 *
 * ## Why this module is pure
 *
 * `server.ts` calls `server.listen()` at module scope, so importing it from a
 * test would bind a port. Every decision here is therefore a pure function of
 * its arguments: the whole security matrix — wildcard, reflection, production
 * fail-closed, preflight-before-auth — is exercised in unit tests with no
 * server, no socket and no environment.
 *
 * `server.ts` contains the wiring and nothing else, at one shared boundary.
 *
 * ## Why the browser needs this at all
 *
 * Every authenticated call carries `Authorization`, which is not a
 * CORS-safelisted request header. That makes the request non-simple, so the
 * browser sends an `OPTIONS` preflight first and refuses to send the real
 * request unless the preflight is answered with matching permission. The API
 * previously had no `OPTIONS` branch, so preflights fell through to the route
 * table's `NOT_FOUND` and every authenticated browser call failed.
 *
 * ## What this deliberately does not do
 *
 * It grants no authority. CORS is a **browser** policy: it decides whether a
 * page may *read* a cross-origin response, and nothing else. It is not
 * authentication, it is not authorization, and it cannot substitute for either.
 * A disallowed origin is refused a readable response; it is never the reason a
 * request is rejected on the server. Auth and RLS continue to do that work
 * unchanged, and a non-browser client — curl, the API smoke script, a server —
 * is unaffected because it sends no `Origin` and ignores these headers.
 */

/**
 * The only methods the web application actually issues.
 *
 * Verified against `apps/web/src`: every call is a GET or a POST. `OPTIONS` is
 * present because the preflight itself uses it. PUT, PATCH and DELETE are
 * deliberately absent — advertising a method the application never sends would
 * widen the boundary for no reason, and `apiRequest` supporting them in its
 * type union is not the same as the application using them.
 */
export const ALLOWED_METHODS = ["GET", "POST", "OPTIONS"] as const;

/**
 * The only non-safelisted request headers the web client sends.
 *
 * `authorization` carries the learner's bearer token. `content-type` is needed
 * because `application/json` is not one of the safelisted values. `accept` is
 * already safelisted and is intentionally not listed — naming it would suggest
 * it was required.
 */
export const ALLOWED_HEADERS = ["authorization", "content-type"] as const;

/** How long a browser may cache a preflight result. Ten minutes. */
export const PREFLIGHT_MAX_AGE_SECONDS = 600;

/** The development origin the Vite dev server serves the learner app from. */
export const DEVELOPMENT_WEB_ORIGIN = "http://localhost:5173";

/**
 * Resolve the configured allowlist.
 *
 * Development and test fall back to the Vite origin, because that is the only
 * origin the repository's own tooling serves and requiring a variable for it
 * would make `npm run dev` fail for no security benefit.
 *
 * **Production has no fallback.** An unconfigured production environment
 * resolves to an empty allowlist and therefore grants no origin anything. That
 * is the fail-closed behaviour: the API keeps serving same-origin and
 * non-browser clients, and no cross-origin page can read a response. Production
 * cannot inherit the localhost default by omission, by empty string, or by
 * whitespace.
 */
export function resolveAllowedOrigins(
  rawValue: string | undefined,
  appEnv: AppEnvironment
): string[] {
  const configured = (rawValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  if (configured.length > 0) {
    return configured;
  }

  if (appEnv === "production") {
    return [];
  }

  return [DEVELOPMENT_WEB_ORIGIN];
}

export interface CorsRequest {
  /** The request `Origin` header, absent for non-browser clients. */
  origin: string | undefined;
  method: string | undefined;
}

export interface CorsDecision {
  /** True when this is a preflight that must be answered before any auth. */
  isPreflight: boolean;
  /** True when the origin is on the allowlist. */
  originAllowed: boolean;
  /**
   * Headers to apply. Empty when the origin is absent or disallowed — the
   * browser then refuses to expose the response, which is the intended outcome.
   */
  headers: Record<string, string>;
}

/**
 * Decide what a request is owed.
 *
 * The allowlist is matched by **exact string equality**. Not a prefix, not a
 * suffix, not a hostname parse, not a pattern. `http://localhost:5173.evil.com`
 * and `http://localhost:51730` are different strings and are refused, and there
 * is no code path that echoes an origin that was not already on the list — the
 * value written to `Access-Control-Allow-Origin` is taken from the allowlist
 * entry, never from the request.
 */
export function resolveCors(
  request: CorsRequest,
  allowedOrigins: readonly string[]
): CorsDecision {
  const isPreflight = request.method === "OPTIONS";
  const origin = request.origin;

  // No Origin means a non-browser client. It gets no CORS headers and is
  // otherwise untouched, so curl, the smoke script and server-to-server callers
  // behave exactly as they did before this package.
  if (origin === undefined || origin === "") {
    return { isPreflight, originAllowed: false, headers: {} };
  }

  const match = allowedOrigins.find((allowed) => allowed === origin);

  if (match === undefined) {
    // A disallowed origin is told nothing. Without Access-Control-Allow-Origin
    // the browser blocks the page from reading the response, whatever the
    // status code was.
    return { isPreflight, originAllowed: false, headers: {} };
  }

  const headers: Record<string, string> = {
    // `match` and not `origin`: the value comes from the allowlist, so an
    // attacker-supplied string can never reach this header even if a future
    // edit loosened the comparison.
    "access-control-allow-origin": match,
    // The response varies by Origin, so a shared cache must not serve one
    // origin's response to another.
    vary: "Origin"
  };

  if (isPreflight) {
    headers["access-control-allow-methods"] = ALLOWED_METHODS.join(", ");
    headers["access-control-allow-headers"] = ALLOWED_HEADERS.join(", ");
    headers["access-control-max-age"] = String(PREFLIGHT_MAX_AGE_SECONDS);
  }

  // `Access-Control-Allow-Credentials` is deliberately never set. The web
  // client authenticates with a bearer token and passes no `credentials` option
  // to fetch, so no cookie is sent cross-origin. Enabling credentialed CORS
  // would broaden the boundary to something the architecture does not use.

  return { isPreflight, originAllowed: true, headers };
}
