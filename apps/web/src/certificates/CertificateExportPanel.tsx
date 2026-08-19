import { useState } from "react";
import {
  CERTIFICATE_EXPORT_FORMATS,
  buildCertificateExportDownload,
  describeCertificateExportContents,
  describeCertificateExportFormat,
  describeCertificateExportSummary,
  normalizeCertificateExportFormat,
  type CertificateExport,
  type CertificateExportFormat,
  type CertificatePortfolioFilters
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { requestCertificateExport } from "./certificate-export-service";

/**
 * CERT-007 — student-controlled certificate export.
 *
 * Kept separate from the portfolio view so each component has one
 * responsibility: the portfolio presents certificates, this exports them. Both
 * are private and authenticated; nothing here publishes or shares. There is no
 * share link, because CERT-007 designs that model without minting one.
 *
 * The export is shown on screen first and only saved when the student asks, so
 * they can see exactly what they are about to take away.
 *
 * Accessibility follows the repository's convention: semantic headings and
 * lists, a real table with a caption and column scopes, a labelled native
 * select, readable status text rather than badges, a polite live region for the
 * outcome, and native keyboard-operable controls. All decision logic lives in
 * the shared pure module and is unit tested.
 *
 * No branding, logo or student display name: CERT-009 owns presentation.
 */

export interface CertificateExportPanelProps {
  /** The same filters the student has applied to their portfolio. */
  filters: CertificatePortfolioFilters;
}

export function CertificateExportPanel({ filters }: CertificateExportPanelProps) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [certificateExport, setCertificateExport] =
    useState<CertificateExport | null>(null);
  const [format, setFormat] = useState<CertificateExportFormat>("json");
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function handleRequest(): Promise<void> {
    setRequesting(true);
    setError("");
    setSaved("");

    try {
      setCertificateExport(
        await requestCertificateExport(accessToken, { filters })
      );
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : "We could not prepare your certificate export."
      );
    } finally {
      setRequesting(false);
    }
  }

  /*
    The only browser-specific step. Everything it needs — file name, media type
    and contents — is decided by the shared pure module and unit tested there.
  */
  function handleSave(): void {
    if (!certificateExport) return;

    const file = buildCertificateExportDownload(certificateExport, format);
    const url = URL.createObjectURL(
      new Blob([file.content], { type: file.mediaType })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = file.fileName;
    link.click();
    URL.revokeObjectURL(url);

    setSaved(`Saved as ${file.fileName}.`);
  }

  return (
    <section className="card" aria-labelledby="certificate-export-title">
      <h3 id="certificate-export-title">Take your certificates with you</h3>
      <p>
        You can save a copy of the certificates shown above. It stays private to
        you — nothing is published, and no one else can look it up.
      </p>

      <h4 id="certificate-export-contents-title">What the file includes</h4>
      <ul aria-labelledby="certificate-export-contents-title">
        {describeCertificateExportContents().map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => void handleRequest()}
        disabled={requesting}
      >
        {requesting ? "Preparing your copy…" : "Prepare my certificates"}
      </button>

      <p aria-live="polite">
        {certificateExport
          ? `${describeCertificateExportSummary(certificateExport)} ${saved}`.trim()
          : ""}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {certificateExport && (
        <>
          <label htmlFor="certificate-export-format">File format</label>
          <select
            id="certificate-export-format"
            value={format}
            onChange={(event) =>
              setFormat(normalizeCertificateExportFormat(event.target.value))
            }
          >
            {CERTIFICATE_EXPORT_FORMATS.map((option) => (
              <option key={option} value={option}>
                {describeCertificateExportFormat(option)}
              </option>
            ))}
          </select>

          <button type="button" onClick={handleSave}>
            Save my certificates
          </button>
        </>
      )}

      {certificateExport &&
        certificateExport.unavailableCertificates.length > 0 && (
          <section aria-labelledby="certificate-export-unavailable-title">
            <h4 id="certificate-export-unavailable-title">
              Some certificates could not be included
            </h4>
            <ul aria-labelledby="certificate-export-unavailable-title">
              {certificateExport.unavailableCertificates.map((entry, index) => (
                <li key={`certificate-export-unavailable-${index}`}>
                  {entry.reason}
                </li>
              ))}
            </ul>
          </section>
        )}

      {certificateExport && certificateExport.certificates.length > 0 && (
        <>
          <h4 id="certificate-export-items-title">Included certificates</h4>
          <table aria-labelledby="certificate-export-items-title">
            <caption>
              The certificates in your copy, with their status and verification
              reference.
            </caption>
            <thead>
              <tr>
                <th scope="col">Certificate</th>
                <th scope="col">Issued</th>
                <th scope="col">Status</th>
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {certificateExport.certificates.map((certificate) => (
                <tr key={certificate.verificationReference}>
                  <th scope="row">{certificate.certificateTitle}</th>
                  <td>
                    <time dateTime={certificate.issuedAt}>
                      {certificate.issuedAt.slice(0, 10)}
                    </time>
                  </td>
                  <td>{certificate.statusLabel}</td>
                  <td>
                    <code>{certificate.verificationReference}</code>
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
