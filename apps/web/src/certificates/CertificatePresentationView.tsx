import { useCallback, useEffect, useState } from "react";
import {
  describeCertificateHeading,
  presentAsCurrentlyValid,
  type CertificatePortfolioFilters,
  type CertificatePresentationModel
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import { buildCertificateVerificationHref } from "./certificate-portfolio-presentation";
import { loadCertificatePresentation } from "./certificate-presentation-service";

/**
 * CERT-009 — the owner's branded certificate presentation.
 *
 * Presentation only. Every authoritative value is rendered verbatim from the
 * model; nothing is derived, recomputed or softened here.
 *
 * Accessibility (CERT-009 section 10):
 *  - semantic heading structure and a real list, so reading order is logical
 *  - the credential is TEXT, never an image; the brand mark is a text alternative
 *  - status is always readable words, so colour and seals are never the only
 *    signal of validity
 *  - the verification action is a plain link, keyboard-operable by default
 *  - printing uses the browser's own print, styled by @media print
 *
 * A certificate whose brand metadata could not be resolved renders through the
 * accessible fallback with a plain note. It is equally valid, and verification
 * is never blocked (CERT-009 section 12).
 *
 * Deliberately absent: PDF generation, QR image generation, downloadable
 * branded artifact, binary logo asset, accreditation seal. CERT-007 owns
 * portable export; CURR-007 will own asset references.
 */

function CertificateCredential({
  certificate
}: {
  certificate: CertificatePresentationModel;
}) {
  const headingId = `credential-${certificate.certificateId}-title`;
  const competencyHeadingId = `credential-${certificate.certificateId}-competencies`;
  const currentlyValid = presentAsCurrentlyValid(certificate);

  return (
    <li className="credential" aria-labelledby={headingId}>
      {/*
        The brand mark is a text alternative, never an image. CURR-007 will own
        binary asset references; until then the certificate is fully readable
        and can never become image-only.
      */}
      {certificate.logoTextAlternative && (
        <p className="credential-brand">{certificate.logoTextAlternative}</p>
      )}

      <p className="eyebrow">{certificate.issuer}</p>
      <h3 id={headingId} className="credential-title">
        {describeCertificateHeading(certificate)}
      </h3>

      {certificate.plainLanguageSummary && (
        <p className="credential-summary">{certificate.plainLanguageSummary}</p>
      )}

      <p className="credential-holder">{certificate.holderLabel}</p>

      {/*
        Status is stated in words before anything else about validity, so a
        revoked certificate reads as revoked even in print or a screen reader.
      */}
      <p className="credential-status">
        {certificate.statusLabel}
        {currentlyValid ? "" : " — this certificate is not currently valid"}
      </p>
      <p>{certificate.statusExplanation}</p>

      <dl className="status-grid">
        <div>
          <dt>Certificate</dt>
          <dd>{certificate.certificateTitle}</dd>
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
          <dt>Certificate ID</dt>
          <dd>
            <code>{certificate.certificateId}</code>
          </dd>
        </div>
        <div>
          <dt>Verification reference</dt>
          <dd>
            <code>{certificate.verificationReference}</code>
          </dd>
        </div>
      </dl>

      {certificate.competencySummary.length > 0 && (
        <>
          <h4 id={competencyHeadingId}>Competencies this represents</h4>
          <ul aria-labelledby={competencyHeadingId}>
            {certificate.competencySummary.map((competency) => (
              <li key={`${competency.title}@${competency.version}`}>
                {competency.title} (version {competency.version})
              </li>
            ))}
          </ul>
        </>
      )}

      {/*
        The official CERT-005 destination. A future QR must encode exactly this
        and must not mint a second reference.
      */}
      <p>
        <a
          href={buildCertificateVerificationHref(
            certificate.verificationReference
          )}
        >
          Verify this certificate
        </a>
      </p>

      {certificate.isFallback && (
        <p className="credential-fallback">
          This certificate is shown in a simpler format because its presentation
          details could not be loaded. The certificate itself is unaffected and
          can still be verified.
        </p>
      )}
    </li>
  );
}

export function CertificatePresentationView({
  filters
}: {
  filters: CertificatePortfolioFilters;
}) {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [certificates, setCertificates] = useState<
    CertificatePresentationModel[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (nextFilters: CertificatePortfolioFilters, signal: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        const response = await loadCertificatePresentation(accessToken, {
          filters: nextFilters,
          signal
        });
        setCertificates(response.certificates);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "We could not prepare your certificates for viewing."
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

  return (
    <section className="card" aria-labelledby="credential-presentation-title">
      <h3 id="credential-presentation-title">Your certificates to print</h3>
      <p>
        A printable version of the certificates shown above. Use your browser's
        print option to print or save it.
      </p>

      <p aria-live="polite">
        {loading
          ? "Preparing your certificates…"
          : `${certificates.length} ${
              certificates.length === 1 ? "certificate" : "certificates"
            } ready to print.`}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && certificates.length > 0 && (
        <ul className="credential-list" aria-labelledby="credential-presentation-title">
          {certificates.map((certificate) => (
            <CertificateCredential
              key={certificate.certificateId}
              certificate={certificate}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
