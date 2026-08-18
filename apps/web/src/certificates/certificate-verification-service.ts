import type {
  CertificateVerificationRecord,
  CertificateVerificationResult
} from "@tlp/shared-types";
import {
  ApiRequestError,
  buildApiUrl,
  normalizeApiError,
  resolveApiBaseUrl
} from "../lib/api-client";

/**
 * CERT-005 — public certificate verification.
 *
 * This is the one feature service that must work without a session, so it
 * cannot use `apiRequest`, which requires a bearer token by design. It builds
 * the request through the same URL and error-normalisation helpers instead, so
 * the transport rules stay shared and only the auth requirement differs.
 *
 * It sends nothing but the reference: no identity, no token, no query
 * parameters. A dependency failure is surfaced as `unavailable`, never as an
 * invalid or missing certificate.
 */
export async function verifyCertificate(
  reference: string,
  options: { signal?: AbortSignal; baseUrl?: string } = {}
): Promise<CertificateVerificationResult> {
  let url: string;
  try {
    url = buildApiUrl(
      options.baseUrl ?? resolveApiBaseUrl(),
      `/certificates/verify/${encodeURIComponent(reference)}`
    );
  } catch {
    return { outcome: "unavailable" };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      ...(options.signal ? { signal: options.signal } : {})
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") {
      throw caught;
    }
    return { outcome: "unavailable" };
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

  if (response.ok) {
    const body = (payload ?? {}) as {
      verification?: CertificateVerificationRecord;
    };
    return body.verification
      ? { outcome: "verified", certificate: body.verification }
      : { outcome: "unavailable" };
  }

  const error: ApiRequestError = normalizeApiError(response.status, payload);

  if (error.status === 400) return { outcome: "malformed_reference" };
  if (error.status === 404) return { outcome: "not_found" };

  // Anything else — including 503 — is temporary, not a verdict.
  return { outcome: "unavailable" };
}
