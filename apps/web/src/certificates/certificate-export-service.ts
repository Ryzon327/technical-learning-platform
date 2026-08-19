import type {
  CertificateExport,
  CertificatePortfolioFilters
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * CERT-007 — certificate export feature service.
 *
 * Follows the repository's service-module convention: the component calls this,
 * this calls the generic API client, and no component builds a request or a
 * bearer header itself.
 *
 * It sends no identity. The server derives the owner from the authenticated
 * session, so a learner can only ever export their own certificates.
 */
export async function requestCertificateExport(
  accessToken: string,
  options: { filters?: CertificatePortfolioFilters; signal?: AbortSignal } = {}
): Promise<CertificateExport> {
  const filters = options.filters ?? {};

  const response = await apiRequest<{ export: CertificateExport }>(
    accessToken,
    "/certificates/export",
    {
      method: "POST",
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

  return response.export;
}
