import { useCallback, useEffect, useState } from "react";
import {
  labelCertificateDefinitionOptions,
  type CertificateCompetencyRequirementResult,
  type CertificateEligibilityResult,
  type CertificateEvidencePolicyResult,
  type StudentCertificateDefinitionOption
} from "@tlp/shared-types";
import { useAuth } from "../auth/AuthProvider";
import { ApiRequestError } from "../lib/api-client";
import {
  describeCertificateVersion,
  describeEligibilityStatus,
  describeEligibilityStatusLabel,
  describeEvidencePolicyProgress,
  describeEvidencePolicyState,
  describeEvidenceSourceLabel,
  describeLoadingStatus,
  describeRemainingWork,
  describeRequirementDetail,
  describeRequirementState,
  describeUnknownReason,
  isUndetermined
} from "./certificate-eligibility-presentation";
import {
  loadCertificateEligibility,
  loadSelectableCertificates
} from "./certificate-eligibility-service";

/**
 * CERT-002 — student certificate eligibility.
 *
 * Accessibility approach (no rendered-DOM harness in this repository):
 *  - semantic landmarks, headings, lists and description lists
 *  - a native <select> with a real <label>, so keyboard and screen-reader
 *    behaviour come from the platform rather than a custom control
 *  - every state is readable text; colour is never the only signal
 *  - one polite live region for the load lifecycle, not per-item announcements
 *  - errors use the existing role="alert" convention
 *
 * Truth boundary: this component computes no eligibility. It branches on the
 * backend's final states for presentation only, and every string comes from the
 * unit-tested pure module beside it.
 *
 * There is deliberately no issue, claim, download, share or verify control.
 * CERT-002 reports eligibility; CERT-003 and later Features own issuance.
 */

function RequirementItem({
  requirement
}: {
  requirement: CertificateCompetencyRequirementResult;
}) {
  const headingId = `requirement-${requirement.competencyStableId}-${requirement.competencyVersion}`;

  return (
    <li className="card" aria-labelledby={headingId}>
      <h4 id={headingId}>{requirement.competencyStableId}</h4>
      <dl className="status-grid">
        <div>
          <dt>Status</dt>
          <dd>{describeRequirementState(requirement)}</dd>
        </div>
        <div>
          <dt>Required</dt>
          <dd>{requirement.required ? "Yes" : "Optional"}</dd>
        </div>
      </dl>
      <p>{describeRequirementDetail(requirement)}</p>
    </li>
  );
}

function EvidencePolicyItem({
  policy
}: {
  policy: CertificateEvidencePolicyResult;
}) {
  const headingId = `policy-${policy.evidenceSourceType}`;

  return (
    <li className="card" aria-labelledby={headingId}>
      <h4 id={headingId}>
        {describeEvidenceSourceLabel(policy.evidenceSourceType)}
      </h4>
      <dl className="status-grid">
        <div>
          <dt>Status</dt>
          <dd>{describeEvidencePolicyState(policy)}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{describeEvidencePolicyProgress(policy)}</dd>
        </div>
      </dl>
    </li>
  );
}

function EligibilityResultPanel({
  result
}: {
  result: CertificateEligibilityResult;
}) {
  const undetermined = isUndetermined(result);

  return (
    <section className="card" aria-labelledby="eligibility-result-title">
      <h3 id="eligibility-result-title">
        {describeEligibilityStatusLabel(result.status)}
      </h3>

      <p>{describeEligibilityStatus(result.status)}</p>

      {undetermined && <p>{describeUnknownReason(result)}</p>}

      <dl className="status-grid">
        <div>
          <dt>Certificate version</dt>
          <dd>{describeCertificateVersion(result)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{describeRemainingWork(result)}</dd>
        </div>
      </dl>

      {result.competencyRequirements.length > 0 && (
        <>
          <h4 id="eligibility-requirements-title">Skills required</h4>
          <ul aria-labelledby="eligibility-requirements-title">
            {result.competencyRequirements.map((requirement) => (
              <RequirementItem
                key={`${requirement.competencyStableId}@${requirement.competencyVersion}`}
                requirement={requirement}
              />
            ))}
          </ul>
        </>
      )}

      {result.evidencePolicies.length > 0 && (
        <>
          <h4 id="eligibility-policies-title">Evidence required</h4>
          <ul aria-labelledby="eligibility-policies-title">
            {result.evidencePolicies.map((policy) => (
              <EvidencePolicyItem
                key={policy.evidenceSourceType}
                policy={policy}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function CertificateEligibilityView() {
  const { session } = useAuth();
  const accessToken = session?.access_token ?? "";

  const [certificates, setCertificates] = useState<
    StudentCertificateDefinitionOption[]
  >([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [result, setResult] = useState<CertificateEligibilityResult | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCertificates() {
      try {
        const options = await loadSelectableCertificates(accessToken, {
          signal: controller.signal
        });
        setCertificates(options);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "We could not load the available certificates."
        );
      }
    }

    void loadCertificates();
    return () => controller.abort();
  }, [accessToken]);

  const labelled = labelCertificateDefinitionOptions(certificates);

  const evaluate = useCallback(
    async (option: StudentCertificateDefinitionOption, signal: AbortSignal) => {
      setLoading(true);
      setError("");

      try {
        // The exact selected version is evaluated. No substitution.
        const evaluation = await loadCertificateEligibility(accessToken, {
          stableId: option.stableId,
          version: option.version,
          signal
        });
        setResult(evaluation);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setResult(null);
        setError(
          caught instanceof ApiRequestError
            ? caught.message
            : "We could not check your eligibility for this certificate."
        );
      } finally {
        setLoading(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    if (!selectedKey) {
      setResult(null);
      return;
    }

    const option = certificates.find(
      (candidate) => `${candidate.stableId}@${candidate.version}` === selectedKey
    );

    if (!option) {
      setResult(null);
      return;
    }

    const controller = new AbortController();
    void evaluate(option, controller.signal);
    return () => controller.abort();
  }, [selectedKey, certificates, evaluate]);

  const selected = labelled.find(
    (candidate) => `${candidate.stableId}@${candidate.version}` === selectedKey
  );

  return (
    <section className="card" aria-labelledby="eligibility-title">
      <p className="eyebrow">Certificate Engine</p>
      <h2 id="eligibility-title">Certificate eligibility</h2>
      <p>
        Check what a certificate requires and how much of it you have already
        met. Checking here does not request or issue a certificate.
      </p>

      <label htmlFor="certificate-select">Choose a certificate</label>
      <select
        id="certificate-select"
        value={selectedKey}
        onChange={(event) => setSelectedKey(event.target.value)}
      >
        <option value="">Select a certificate</option>
        {labelled.map((option) => (
          <option
            key={`${option.stableId}@${option.version}`}
            value={`${option.stableId}@${option.version}`}
          >
            {option.label}
          </option>
        ))}
      </select>

      <p aria-live="polite">
        {describeLoadingStatus({
          loading,
          hasSelection: selectedKey !== "",
          hasResult: result !== null
        })}
      </p>

      {error && (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      )}

      {selected && (
        <section className="card" aria-labelledby="certificate-identity-title">
          <h3 id="certificate-identity-title">
            {selected.plainLanguageTitle || selected.title}
          </h3>
          {selected.description && <p>{selected.description}</p>}
        </section>
      )}

      {!loading && certificates.length === 0 && !error && (
        <p>
          There are no certificates available to check right now. This page will
          show them when they become available.
        </p>
      )}

      {result && !loading && <EligibilityResultPanel result={result} />}
    </section>
  );
}
