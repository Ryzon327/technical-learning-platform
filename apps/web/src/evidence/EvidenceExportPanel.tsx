import { useState } from "react";
import {
  describeExportContents,
  formatPortfolioDate,
  type EvidenceExport,
  type EvidencePortfolioFilters
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { requestEvidenceExport } from "./evidence-portfolio-service";

/**
 * EVID-008 — student-controlled evidence export request.
 *
 * Kept separate from the portfolio browsing view so each component has one
 * responsibility: the portfolio presents evidence, this requests an export of
 * it. Both are private and authenticated; nothing here publishes or shares.
 *
 * Accessibility follows the repository's Option (a) convention: semantic
 * headings and lists, a real table with a caption and column scopes, readable
 * status text rather than badges, a live region for the outcome, and native
 * keyboard-operable controls. All decision logic lives in the shared pure
 * module and is unit tested.
 */

export interface EvidenceExportPanelProps {
  /** The same filters the student has applied to their portfolio. */
  filters: EvidencePortfolioFilters;
}

export function EvidenceExportPanel({ filters }: EvidenceExportPanelProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [evidenceExport, setEvidenceExport] = useState<EvidenceExport | null>(
    null
  );
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");

  async function handleRequest(): Promise<void> {
    setRequesting(true);
    setError("");

    try {
      setEvidenceExport(await requestEvidenceExport(accessToken, { filters }));
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "We could not prepare your evidence export."
      );
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section className="card" aria-labelledby="evidence-export-title">
      <h3 id="evidence-export-title">Export your evidence</h3>
      <p>
        You can request a private summary of the evidence shown above. It stays
        private to you — nothing is published, and no one else can look it up.
      </p>

      <h4 id="evidence-export-contents-title">What the export includes</h4>
      <ul aria-labelledby="evidence-export-contents-title">
        {describeExportContents().map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void handleRequest()}
        disabled={requesting}
      >
        {requesting ? "Preparing your export…" : "Request evidence export"}
      </button>

      <p aria-live="polite">
        {evidenceExport
          ? `Export prepared on ${formatPortfolioDate(
              evidenceExport.generatedAt
            )}: ${evidenceExport.totalCount} ${
              evidenceExport.totalCount === 1 ? "item" : "items"
            }, ${evidenceExport.currentlyValidCount} currently valid.`
          : ""}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {evidenceExport && evidenceExport.unavailableItems.length > 0 && (
        <section aria-labelledby="evidence-export-unavailable-title">
          <h4 id="evidence-export-unavailable-title">
            Some items could not be included
          </h4>
          <ul aria-labelledby="evidence-export-unavailable-title">
            {evidenceExport.unavailableItems.map((entry, index) => (
              <li key={`export-unavailable-${index}`}>{entry.reason}</li>
            ))}
          </ul>
        </section>
      )}

      {evidenceExport && evidenceExport.items.length > 0 && (
        <>
          <h4 id="evidence-export-items-title">Included evidence</h4>
          <table aria-labelledby="evidence-export-items-title">
            <caption>
              Your exported evidence, with its reference and current status.
            </caption>
            <thead>
              <tr>
                <th scope="col">Evidence</th>
                <th scope="col">Completed</th>
                <th scope="col">Status</th>
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {evidenceExport.items.map((item) => (
                <tr key={item.verificationId}>
                  <th scope="row">{item.sourceLabel}</th>
                  <td>
                    <time dateTime={item.observedAt}>
                      {formatPortfolioDate(item.observedAt)}
                    </time>
                  </td>
                  <td>{item.verificationStatusLabel}</td>
                  <td>
                    <code>{item.verificationId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
