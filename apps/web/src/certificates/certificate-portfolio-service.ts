import type {
  CertificatePortfolioFilters,
  StudentCertificatePortfolio
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * CERT-006 — private certificate portfolio feature service.
 *
 * Follows the repository's service-module convention: the component calls this,
 * this calls the generic API client, and no component builds a request or a
 * bearer header itself.
 *
 * It sends no identity. The server derives the owner from the authenticated
 * session, so a learner can only ever load their own portfolio.
 */
export async function loadCertificatePortfolio(
  accessToken: string,
  options: { filters?: CertificatePortfolioFilters; signal?: AbortSignal } = {}
): Promise<StudentCertificatePortfolio> {
  const filters = options.filters ?? {};

  const response = await apiRequest<{ portfolio: StudentCertificatePortfolio }>(
    accessToken,
    "/certificates/portfolio",
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

  return response.portfolio;
}
