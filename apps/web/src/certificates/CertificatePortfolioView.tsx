import { useCallback, useEffect, useState } from "react";
import {
  describeCertificateStatus,
  describePortfolioCount,
  describeUnavailableEntry,
  explainCertificateStatus,
  type CertificatePortfolioEntry,
  type CertificatePortfolioFilters,
  type StudentCertificatePortfolio
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { CertificateExportPanel } from "./CertificateExportPanel";
import { CertificatePresentationView } from "./CertificatePresentationView";
import {
  buildCertificateVerificationHref,
  buildPortfolioDetailRegionId,
  describePortfolioDetailToggle,
  resolvePortfolioSelection,
  selectPortfolioCertificate
} from "./certificate-portfolio-presentation";
import { loadCertificatePortfolio } from "./certificate-portfolio-service";

/**
 * CERT-006 — the learner's private certificate portfolio.
 *
 * Presentation only. Lifecycle status comes from CERT-004 through the API and is
 * displayed verbatim; nothing is derived here.
 *
 * The learner scans a list of certificates and opens exactly one at a time to
 * read its detail. Focus is in-page state, not a route: this workspace has no
 * router, and a certificate detail view does not need one.
 *
 * Accessibility (no rendered-DOM harness in this repository):
 *  - semantic headings, a real list, and description lists for facts
 *  - native <select> filters with real labels, so keyboard and screen-reader
 *    behaviour come from the platform
 *  - the detail control is a native button carrying aria-expanded and
 *    aria-controls, so the platform announces the open/closed state
 *  - every status is readable text; colour is never the only signal
 *  - one polite live region for the load lifecycle
 *  - the verification action is a plain link, operable by keyboard by default
 *
 * There is deliberately no export, share, download, PDF or QR control:
 * CERT-007 owns those, and a disabled placeholder would be a dead affordance.
 * There is no lifecycle control either — CERT-008 owns revoke/correct/restore.
 */

function PortfolioEntry({
  entry,
  isSelected,
  onSelect
}: {
  entry: CertificatePortfolioEntry;
  isSelected: boolean;
  onSelect: (certificateId: string) => void;
}) {
  const headingId = `certificate-${entry.certificateId}-title`;
  const competencyHeadingId = `certificate-${entry.certificateId}-competencies`;
  const detailId = buildPortfolioDetailRegionId(entry.certificateId);

  return (
    <li className="card" aria-labelledby={headingId}>
      <h3 id={headingId}>{entry.certificateTitle}</h3>
      <p>{describeCertificateStatus(entry.status)}</p>

      {/*
        Opening one certificate closes any other. The detail region stays in
        the document and is hidden, so aria-controls always resolves.
      */}
      <button
        type="button"
        aria-expanded={isSelected}
        aria-controls={detailId}
        onClick={() => onSelect(entry.certificateId)}
      >
        {describePortfolioDetailToggle(entry, isSelected)}
      </button>

      <div id={detailId} hidden={!isSelected}>
        <dl className="status-grid">
          <div>
            <dt>Issuer</dt>
            <dd>{entry.issuer}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>
              <time dateTime={entry.issuedAt}>{entry.issuedAt.slice(0, 10)}</time>
            </dd>
          </div>
          {entry.expiresAt && (
            <div>
              <dt>Valid until</dt>
              <dd>
                <time dateTime={entry.expiresAt}>
                  {entry.expiresAt.slice(0, 10)}
                </time>
              </dd>
            </div>
          )}
          <div>
            <dt>Certificate version</dt>
            <dd>Version {entry.certificateDefinitionVersion}</dd>
          </div>
        </dl>

        <p>{explainCertificateStatus(entry.status)}</p>

        {entry.competencySummary.length > 0 && (
          <>
            <h4 id={competencyHeadingId}>Competencies this represents</h4>
            <ul aria-labelledby={competencyHeadingId}>
              {entry.competencySummary.map((competency) => (
                <li key={`${competency.title}@${competency.version}`}>
                  {competency.title} (version {competency.version})
                </li>
              ))}
            </ul>
          </>
        )}

        {/*
          The verification action CERT-006 requires. It opens the public
          verification page for this certificate — the same page an employer
          would see — so the learner can check and share what is shown there.
        */}
        <p>
          <a href={buildCertificateVerificationHref(entry.verificationReference)}>
            Open verification for {entry.certificateTitle}
          </a>
        </p>
      </div>
    </li>
  );
}

export function CertificatePortfolioView() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [portfolio, setPortfolio] = useState<StudentCertificatePortfolio | null>(
    null
  );
  const [filters, setFilters] = useState<CertificatePortfolioFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCertificateId, setSelectedCertificateId] = useState<
    string | null
  >(null);

  const load = useCallback(
    async (nextFilters: CertificatePortfolioFilters, signal: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        setPortfolio(
          await loadCertificatePortfolio(accessToken, {
            filters: nextFilters,
            signal
          })
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "We could not load your certificates."
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

  const options = portfolio?.availableFilters;

  /*
    Resolved against what is on screen, so a certificate removed by a filter
    stops being the open one instead of leaving a control expanded over nothing.
  */
  const selectedCertificate = resolvePortfolioSelection(
    portfolio?.entries ?? [],
    selectedCertificateId
  );

  return (
    <section className="card" aria-labelledby="portfolio-certificates-title">
      <p className="eyebrow">Certificate Engine</p>
      <h2 id="portfolio-certificates-title">Your certificates</h2>
      <p>
        Certificates you have earned, and whether each one is still current.
        Only you can see this.
      </p>

      <form
        aria-labelledby="portfolio-certificates-filters-title"
        onSubmit={(event) => event.preventDefault()}
      >
        <h3 id="portfolio-certificates-filters-title">
          Filter your certificates
        </h3>

        <label htmlFor="certificate-status-filter">Status</label>
        <select
          id="certificate-status-filter"
          value={filters.status ?? ""}
          onChange={(event) =>
            setFilters((current) => {
              const next = { ...current };
              if (event.target.value === "") delete next.status;
              else
                next.status = event.target
                  .value as CertificatePortfolioFilters["status"];
              return next;
            })
          }
        >
          <option value="">All statuses</option>
          {(options?.statuses ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} ({option.count})
            </option>
          ))}
        </select>

        <label htmlFor="certificate-definition-filter">Certificate</label>
        <select
          id="certificate-definition-filter"
          value={filters.certificateDefinitionStableId ?? ""}
          onChange={(event) =>
            setFilters((current) => {
              const next = { ...current };
              if (event.target.value === "")
                delete next.certificateDefinitionStableId;
              else next.certificateDefinitionStableId = event.target.value;
              return next;
            })
          }
        >
          <option value="">All certificates</option>
          {(options?.certificates ?? []).map((option) => (
            <option key={option.value} value={option.value}>
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
          ? "Loading your certificates…"
          : portfolio
            ? describePortfolioCount(portfolio)
            : "No certificates to show."}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {portfolio && !loading && portfolio.totalCount === 0 && !error && (
        <p>
          You have not earned any certificates yet. When you meet the
          requirements for one, it will appear here.
        </p>
      )}

      {portfolio && portfolio.entries.length > 0 && (
        <ul aria-labelledby="portfolio-certificates-title">
          {portfolio.entries.map((entry) => (
            <PortfolioEntry
              key={entry.certificateId}
              entry={entry}
              isSelected={
                selectedCertificate?.certificateId === entry.certificateId
              }
              onSelect={(certificateId) =>
                setSelectedCertificateId((current) =>
                  selectPortfolioCertificate(current, certificateId)
                )
              }
            />
          ))}
        </ul>
      )}

      {/*
        CERT-007 owns taking certificates out of the platform. The panel is
        mounted here so it exports what the learner is currently looking at,
        and it is implemented entirely in its own component.
      */}
      <CertificateExportPanel filters={filters} />

      {/*
        CERT-009 owns how a certificate looks. It is mounted here so it presents
        what the learner is currently looking at, and it is implemented entirely
        in its own component.
      */}
      <CertificatePresentationView filters={filters} />

      {/*
        A certificate whose details could not be resolved is shown rather than
        dropped, and nothing about it is invented.
      */}
      {portfolio && portfolio.unavailableEntries.length > 0 && (
        <section aria-labelledby="portfolio-unavailable-certificates-title">
          <h3 id="portfolio-unavailable-certificates-title">
            Some certificates could not be loaded
          </h3>
          <ul aria-labelledby="portfolio-unavailable-certificates-title">
            {portfolio.unavailableEntries.map((entry) => (
              <li key={entry.certificateId}>{describeUnavailableEntry()}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
