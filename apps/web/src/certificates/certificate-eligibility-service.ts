import type {
  CertificateEligibilityResult,
  CertificateIssuanceResult,
  StudentCertificateDefinitionOption,
  StudentCertificateRecord
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * Certificate eligibility feature service (CERT-002).
 *
 * Follows the repository's service-module convention: components call this,
 * this calls the generic API client, and no component constructs a request or a
 * bearer header itself.
 *
 * It contains no eligibility logic. The API is authoritative; this module only
 * moves data. Neither call sends a user identifier — the server derives the
 * subject from the authenticated session, so a student can only ever ask about
 * themselves.
 */

/**
 * CERT-004 — the student's own certificates and their effective lifecycle
 * status.
 *
 * Sends no identifier: the server derives the subject from the authenticated
 * session, so a learner can only ever see their own records. Status is derived
 * server-side and displayed verbatim.
 */
export async function loadStudentCertificates(
  accessToken: string,
  options: { signal?: AbortSignal } = {}
): Promise<StudentCertificateRecord[]> {
  const response = await apiRequest<{
    certificates: StudentCertificateRecord[];
  }>(accessToken, "/certificates", {
    ...(options.signal ? { signal: options.signal } : {})
  });

  return response.certificates;
}

export async function loadSelectableCertificates(
  accessToken: string,
  options: { signal?: AbortSignal } = {}
): Promise<StudentCertificateDefinitionOption[]> {
  const response = await apiRequest<{
    definitions: StudentCertificateDefinitionOption[];
  }>(accessToken, "/certificates/definitions", {
    ...(options.signal ? { signal: options.signal } : {})
  });

  return response.definitions;
}

/**
 * Evaluates one exact Certificate Definition version.
 *
 * `stableId` and `version` come from the option the student selected and are
 * passed through unchanged. The UI never substitutes another version.
 */
export async function loadCertificateEligibility(
  accessToken: string,
  input: { stableId: string; version: number; signal?: AbortSignal }
): Promise<CertificateEligibilityResult> {
  const response = await apiRequest<{
    eligibility: CertificateEligibilityResult;
  }>(accessToken, "/certificates/eligibility", {
    query: {
      stableId: input.stableId,
      version: input.version
    },
    ...(input.signal ? { signal: input.signal } : {})
  });

  return response.eligibility;
}

/**
 * CERT-003 — requests issuance for one exact Certificate Definition version.
 *
 * The server re-evaluates eligibility itself and decides. This call carries
 * only which certificate version is being requested; it sends no identity, no
 * eligibility claim and no evidence reference, so nothing here can influence
 * the decision. Issuance is idempotent server-side: a repeated request returns
 * the same record with `alreadyIssued: true`.
 */
export async function requestCertificateIssuance(
  accessToken: string,
  input: { stableId: string; version: number; signal?: AbortSignal }
): Promise<CertificateIssuanceResult> {
  return apiRequest<CertificateIssuanceResult>(
    accessToken,
    "/certificates/issuance",
    {
      method: "POST",
      body: { stableId: input.stableId, version: input.version },
      ...(input.signal ? { signal: input.signal } : {})
    }
  );
}
