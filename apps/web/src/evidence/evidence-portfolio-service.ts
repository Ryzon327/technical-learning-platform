import type {
  EvidencePortfolio,
  EvidencePortfolioFilters
} from "@tlp/shared-types";
import { apiRequest } from "../lib/api-client";

/**
 * Evidence Portfolio feature service.
 *
 * Follows the repository's service-module convention: components call this,
 * this calls the generic API client, and no component constructs a request or
 * a bearer header itself. It contains no portfolio business logic — filtering,
 * grouping and status wording all live in the shared pure module so they can be
 * tested without a DOM.
 */

export interface LoadPortfolioOptions {
  filters?: EvidencePortfolioFilters;
  signal?: AbortSignal;
}

export async function loadEvidencePortfolio(
  accessToken: string,
  options: LoadPortfolioOptions = {}
): Promise<EvidencePortfolio> {
  const filters = options.filters ?? {};

  const response = await apiRequest<{ portfolio: EvidencePortfolio }>(
    accessToken,
    "/evidence/portfolio",
    {
      query: {
        ...(filters.competencyStableId
          ? { competencyStableId: filters.competencyStableId }
          : {}),
        ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
        ...(filters.courseStableId
          ? { courseStableId: filters.courseStableId }
          : {}),
        ...(filters.limit ? { limit: filters.limit } : {})
      },
      ...(options.signal ? { signal: options.signal } : {})
    }
  );

  return response.portfolio;
}
