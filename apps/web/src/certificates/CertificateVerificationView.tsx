import { useEffect, useState } from "react";
import {
  describeVerificationOutcome,
  describeVerifiedStatus,
  explainVerifiedStatus,
  type CertificateVerificationResult
} from "@tlp/shared-types";
import { verifyCertificate } from "./certificate-verification-service";

/**
 * CERT-005 — the public certificate verification page.
 *
 * The platform's only pre-authentication surface. It renders one verification
 * result and nothing else: no navigation, no dashboard, no account prompt.
 *
 * Accessibility (no rendered-DOM harness in this repository):
 *  - a single semantic heading structure under one <h1>
 *  - every status is readable text; colour is never the only signal
 *  - one polite live region for the lookup lifecycle
 *  - the competency summary is a real list, not a paragraph
 *  - native elements only, so keyboard and screen-reader behaviour are the
 *    platform's rather than a custom control's
 *
 * Privacy: this component can only render what the server sent, and the server
 * payload contains no holder identity, no Evidence and no internal ids.
 *
 * Not here: QR, PDF, download, share, portfolio, branding, employer profile.
 */
export function CertificateVerificationView({
  reference
}: {
  reference: string;
}) {
  const [result, setResult] = useState<CertificateVerificationResult | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function run() {
      setLoading(true);
      try {
        setResult(await verifyCertificate(reference, {
          signal: controller.signal
        }));
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setResult({ outcome: "unavailable" });
      } finally {
        setLoading(false);
      }
    }

    void run();
    return () => controller.abort();
  }, [reference]);

  const certificate =
    result && result.outcome === "verified" ? result.certificate : null;

  return (
    <main className="shell">
      <section className="card" aria-labelledby="verification-title">
        <p className="eyebrow">Technical Learning Platform</p>
        <h1 id="verification-title">Certificate verification</h1>

        <p aria-live="polite">
          {loading
            ? "Checking this certificate…"
            : result
              ? describeVerificationOutcome(result.outcome)
              : "No verification result to show."}
        </p>

        {!loading && result && result.outcome !== "verified" && (
          <p className="form-message" role="note">
            {result.outcome === "unavailable"
              ? "Please try again shortly."
              : "Check that the full verification reference was entered or opened correctly."}
          </p>
        )}

        {certificate && (
          <section className="card" aria-labelledby="verified-certificate-title">
            <h2 id="verified-certificate-title">
              {certificate.certificateTitle}
            </h2>

            <dl className="status-grid">
              <div>
                <dt>Status</dt>
                <dd>{describeVerifiedStatus(certificate.status)}</dd>
              </div>
              <div>
                <dt>Issuer</dt>
                <dd>{certificate.issuer}</dd>
              </div>
              <div>
                <dt>Issued</dt>
                <dd>
                  <time dateTime={certificate.issuedAt}>
                    {certificate.issuedAt.slice(0, 10)}
                  </time>
                </dd>
              </div>
              {certificate.expiresAt && (
                <div>
                  <dt>Valid until</dt>
                  <dd>
                    <time dateTime={certificate.expiresAt}>
                      {certificate.expiresAt.slice(0, 10)}
                    </time>
                  </dd>
                </div>
              )}
              <div>
                <dt>Certificate version</dt>
                <dd>Version {certificate.certificateDefinitionVersion}</dd>
              </div>
              <div>
                <dt>Verified</dt>
                <dd>
                  <time dateTime={certificate.verifiedAt}>
                    {certificate.verifiedAt.slice(0, 10)}
                  </time>
                </dd>
              </div>
            </dl>

            <p>{explainVerifiedStatus(certificate.status)}</p>

            {certificate.competencySummary.length > 0 && (
              <>
                <h3 id="verified-competencies-title">
                  Competencies this certificate attests to
                </h3>
                <ul aria-labelledby="verified-competencies-title">
                  {certificate.competencySummary.map((competency) => (
                    <li key={`${competency.title}@${competency.version}`}>
                      {competency.title} (version {competency.version})
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </section>
    </main>
  );
}

/**
 * Extracts a verification reference from the current path.
 *
 * Returns null for every other path, so the public surface activates only for
 * an explicit verification URL and never intercepts normal application routes.
 */
export function readVerificationReferenceFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/verify\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
