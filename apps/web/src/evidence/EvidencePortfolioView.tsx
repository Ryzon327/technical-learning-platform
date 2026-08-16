import { useCallback, useEffect, useState } from "react";
import {
  formatPortfolioDate,
  type EvidencePortfolio,
  type EvidencePortfolioCompetencyGroup,
  type EvidencePortfolioFilters,
  type EvidencePortfolioItem
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { EvidenceExportPanel } from "./EvidenceExportPanel";
import { loadEvidencePortfolio } from "./evidence-portfolio-service";

/**
 * EVID-007 — private Student Evidence Portfolio.
 *
 * Accessibility approach (no rendered-DOM harness in this repository):
 *  - semantic landmarks, headings, lists and description lists
 *  - native keyboard-operable controls only (select, button) with real labels
 *  - every status is readable text, never a colour or badge alone
 *  - absolute readable dates
 *  - competency-to-evidence relationships expressed through nested lists and
 *    aria-labelledby, so the structure is followable by a screen reader
 *
 * All decision logic lives in the shared pure module and is unit tested; this
 * component only presents what it is given.
 */

function EvidenceItem({ item }: { item: EvidencePortfolioItem }) {
  const headingId = `evidence-${item.evidenceId}-title`;

  return (
    <li className="card evidence-item" aria-labelledby={headingId}>
      <h4 id={headingId}>{item.sourceLabel}</h4>

      <dl className="status-grid">
        <div>
          <dt>Status</dt>
          <dd>{item.statusLabel}</dd>
        </div>
        <div>
          <dt>Counts as current proof</dt>
          <dd>{item.isCurrentProof ? "Yes" : "No"}</dd>
        </div>
        {item.outcomeLabel && (
          <div>
            <dt>Result</dt>
            <dd>{item.outcomeLabel}</dd>
          </div>
        )}
        <div>
          <dt>Date completed</dt>
          <dd>
            <time dateTime={item.occurredAt}>
              {formatPortfolioDate(item.occurredAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>
            <time dateTime={item.recordedAt}>
              {formatPortfolioDate(item.recordedAt)}
            </time>
          </dd>
        </div>
      </dl>

      {item.correctionCount > 0 && (
        <p className="form-message" role="note">
          This evidence has been reviewed {item.correctionCount}{" "}
          {item.correctionCount === 1 ? "time" : "times"}.
          {item.lastCorrectionReason ? ` ${item.lastCorrectionReason}` : ""}
        </p>
      )}

      {item.competencies.length > 0 && (
        <>
          <h5 id={`evidence-${item.evidenceId}-competencies`}>
            Competencies this supports
          </h5>
          <ul aria-labelledby={`evidence-${item.evidenceId}-competencies`}>
            {item.competencies.map((link) => (
              <li key={`${link.id}`}>
                {link.competencyTitle ?? link.competencyStableId} (version{" "}
                {link.competencyVersion}) — {link.relationship} evidence
              </li>
            ))}
          </ul>
        </>
      )}
    </li>
  );
}

function CompetencyGroup({ group }: { group: EvidencePortfolioCompetencyGroup }) {
  const headingId = `competency-${group.competencyStableId}-${group.competencyVersion}`;

  return (
    <section className="card" aria-labelledby={headingId}>
      <h3 id={headingId}>
        {group.competencyTitle ?? group.competencyStableId}
      </h3>
      <p>
        Version {group.competencyVersion}
        {group.courseTitle ? ` · Course: ${group.courseTitle}` : ""}
      </p>
      <p>
        {group.currentProofCount} of {group.items.length}{" "}
        {group.items.length === 1 ? "item" : "items"} currently count as proof.
      </p>

      <ul aria-labelledby={headingId} className="evidence-list">
        {group.items.map((item) => (
          <EvidenceItem key={`${headingId}-${item.evidenceId}`} item={item} />
        ))}
      </ul>
    </section>
  );
}

export function EvidencePortfolioView() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [portfolio, setPortfolio] = useState<EvidencePortfolio | null>(null);
  const [filters, setFilters] = useState<EvidencePortfolioFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (nextFilters: EvidencePortfolioFilters, signal: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const result = await loadEvidencePortfolio(accessToken, {
          filters: nextFilters,
          signal
        });
        setPortfolio(result);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "We could not load your evidence portfolio."
        );
      } finally {
        setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(filters, controller.signal);
    return () => controller.abort();
  }, [filters, load]);

  function updateFilter(
    key: keyof EvidencePortfolioFilters,
    value: string
  ): void {
    setFilters((current) => {
      const next = { ...current };
      if (value === "") {
        delete next[key];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
      return next;
    });
  }

  const options = portfolio?.availableFilters;

  return (
    <section className="card" aria-labelledby="portfolio-title">
      <p className="eyebrow">Evidence Engine</p>
      <h2 id="portfolio-title">Your evidence portfolio</h2>
      <p>
        This is a private record of what you have demonstrated. Only you can see
        it.
      </p>

      <form
        className="portfolio-filters"
        aria-labelledby="portfolio-filters-title"
        onSubmit={(event) => event.preventDefault()}
      >
        <h3 id="portfolio-filters-title">Filter your evidence</h3>

        <label htmlFor="filter-competency">Competency</label>
        <select
          id="filter-competency"
          value={filters.competencyStableId ?? ""}
          onChange={(event) =>
            updateFilter("competencyStableId", event.target.value)
          }
        >
          <option value="">All competencies</option>
          {(options?.competencies ?? []).map((option) => (
            <option
              key={`${option.competencyStableId}@${option.competencyVersion}`}
              value={option.competencyStableId}
            >
              {option.label}
            </option>
          ))}
        </select>

        <label htmlFor="filter-type">Evidence type</label>
        <select
          id="filter-type"
          value={filters.sourceType ?? ""}
          onChange={(event) => updateFilter("sourceType", event.target.value)}
        >
          <option value="">All types</option>
          {(options?.sourceTypes ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label htmlFor="filter-course">Course</label>
        <select
          id="filter-course"
          value={filters.courseStableId ?? ""}
          onChange={(event) => updateFilter("courseStableId", event.target.value)}
        >
          <option value="">All courses</option>
          {(options?.courses ?? []).map((option) => (
            <option key={option.courseStableId} value={option.courseStableId}>
              {option.label}
            </option>
          ))}
        </select>

        <button type="button" onClick={() => setFilters({})}>
          Clear filters
        </button>
      </form>

      <p aria-live="polite">
        {loading
          ? "Loading your evidence…"
          : `${portfolio?.totalCount ?? 0} evidence ${
              (portfolio?.totalCount ?? 0) === 1 ? "item" : "items"
            } shown.`}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {portfolio && portfolio.unavailableItems.length > 0 && (
        <section aria-labelledby="portfolio-unavailable-title">
          <h3 id="portfolio-unavailable-title">Some details are unavailable</h3>
          <ul aria-labelledby="portfolio-unavailable-title">
            {portfolio.unavailableItems.map((entry, index) => (
              <li key={`${entry.evidenceId}-${index}`}>{entry.reason}</li>
            ))}
          </ul>
        </section>
      )}

      {portfolio && !loading && portfolio.totalCount === 0 && !error && (
        <p>
          No evidence matches these filters yet. Completing an assessment or a
          hands-on lab will add evidence here.
        </p>
      )}

      <EvidenceExportPanel filters={filters} />

      {portfolio?.groups.map((group) => (
        <CompetencyGroup
          key={`${group.competencyStableId}@${group.competencyVersion}`}
          group={group}
        />
      ))}

      {portfolio && portfolio.ungroupedItems.length > 0 && (
        <section aria-labelledby="portfolio-ungrouped-title">
          <h3 id="portfolio-ungrouped-title">
            Evidence not yet linked to a competency
          </h3>
          <ul
            aria-labelledby="portfolio-ungrouped-title"
            className="evidence-list"
          >
            {portfolio.ungroupedItems.map((item) => (
              <EvidenceItem key={`ungrouped-${item.evidenceId}`} item={item} />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
