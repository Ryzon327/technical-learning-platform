import type {
  CertificatePortfolioFilters,
  CertificatePresentationModel
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * CERT-009 — certificate presentation feature service.
 *
 * Follows the repository's service-module convention: the component calls this,
 * this calls the generic API client, and no component builds a request or a
 * bearer header itself.
 *
 * It sends no identity. The server derives the owner from the authenticated
 * session, so a learner can only ever render their own certificates.
 */
export interface StudentCertificatePresentationResponse {
  certificates: CertificatePresentationModel[];
  unavailableCount: number;
}

export async function loadCertificatePresentation(
  accessToken: string,
  options: { filters?: CertificatePortfolioFilters; signal?: AbortSignal } = {}
): Promise<StudentCertificatePresentationResponse> {
  const filters = options.filters ?? {};

  return apiRequest<StudentCertificatePresentationResponse>(
    accessToken,
    "/certificates/presentation",
    {
      query: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.certificateDefinitionStableId
          ? {
              certificateDefinitionStableId:
                filters.certificateDefinitionStableId
            }
          : {})
      },
      ...(options.signal ? { signal: options.signal } : {})
    }
  );
}
