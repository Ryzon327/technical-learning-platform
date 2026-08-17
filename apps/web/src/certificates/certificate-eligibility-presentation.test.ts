import { describe, expect, it } from "vitest";

/**
 * Behavioural tests for the pure presentation module.
 *
 * Source-scanning assertions (no eligibility computation in the frontend, no
 * issuance control, accessible markup structure, calm vocabulary) deliberately
 * live in scripts/verify-wave8.sh instead: this is a browser workspace with
 * `types: ["vite/client"]` and no Node types, so reading files from a test here
 * would mean adding `@types/node` to a browser package. Those are build-time
 * architecture checks, and the verifier is where they belong.
 */
import { labelCertificateDefinitionOptions } from "@tlp/shared-types";
import type {
  CertificateCompetencyRequirementResult,
  CertificateEligibilityResult,
  CertificateEvidencePolicyResult
} from "@tlp/shared-types";
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

function result(
  overrides: Partial<CertificateEligibilityResult> = {}
): CertificateEligibilityResult {
  return {
    status: "eligible",
    certificateDefinitionId: "def-1",
    certificateDefinitionStableId: "certdef-net-foundations-001",
    certificateDefinitionVersion: 3,
    definitionPublicationState: "published",
    evaluatedAt: "2026-08-17T12:00:00.000Z",
    competencyRequirements: [],
    evidencePolicies: [],
    unsatisfiedCompetencyCount: 0,
    unsatisfiedPolicyCount: 0,
    ...overrides
  };
}

function requirement(
  overrides: Partial<CertificateCompetencyRequirementResult> = {}
): CertificateCompetencyRequirementResult {
  return {
    competencyStableId: "competency.networking.subnetting",
    competencyVersion: 3,
    required: true,
    satisfied: true,
    satisfyingEvidenceIds: ["evidence-1"],
    ...overrides
  };
}

function policy(
  overrides: Partial<CertificateEvidencePolicyResult> = {}
): CertificateEvidencePolicyResult {
  return {
    evidenceSourceType: "lab_validation",
    minimumCount: 2,
    requirePositiveOutcome: true,
    qualifyingCount: 1,
    satisfied: false,
    satisfyingEvidenceIds: ["evidence-1"],
    ...overrides
  };
}

describe("A: eligible state", () => {
  it("A: states requirements are met without implying issuance", () => {
    const message = describeEligibilityStatus("eligible");
    expect(message).toBe(
      "You've met the current requirements for this certificate."
    );
    for (const issuanceWord of [
      "issued",
      "earned",
      "awarded",
      "granted",
      "claim",
      "download",
      "certificate is yours"
    ]) {
      expect(message.toLowerCase()).not.toContain(issuanceWord);
    }
  });

  it("A2: the short label is readable text, not a colour", () => {
    expect(describeEligibilityStatusLabel("eligible")).toBe("Requirements met");
  });

  it("A3: nothing remains when eligible", () => {
    expect(describeRemainingWork(result({ status: "eligible" }))).toBe(
      "Nothing remaining."
    );
  });
});

describe("B: ineligible state", () => {
  it("B: explains that requirements remain, calmly", () => {
    expect(describeEligibilityStatus("ineligible")).toBe(
      "You still have requirements to complete."
    );
  });

  it("B2: counts remaining requirements from backend totals", () => {
    expect(
      describeRemainingWork(
        result({
          status: "ineligible",
          unsatisfiedCompetencyCount: 2,
          unsatisfiedPolicyCount: 0
        })
      )
    ).toBe("2 requirements remaining.");

    expect(
      describeRemainingWork(
        result({
          status: "ineligible",
          unsatisfiedCompetencyCount: 1,
          unsatisfiedPolicyCount: 0
        })
      )
    ).toBe("1 requirement remaining.");
  });

  it("B3: combines competency and policy totals", () => {
    expect(
      describeRemainingWork(
        result({
          status: "ineligible",
          unsatisfiedCompetencyCount: 1,
          unsatisfiedPolicyCount: 2
        })
      )
    ).toBe("3 requirements remaining.");
  });
});

describe("C: unknown is distinct from ineligible", () => {
  it("C: unknown wording never states a requirement was failed", () => {
    const message = describeEligibilityStatus("unknown");
    expect(message).toBe("We can't determine your eligibility right now.");
    expect(message).not.toBe(describeEligibilityStatus("ineligible"));
    expect(message.toLowerCase()).not.toContain("requirement");
  });

  it("C2: each unknown reason has its own explanation", () => {
    const review = describeUnknownReason({
      unknownReason: "evidence_under_unresolved_review"
    });
    const dependency = describeUnknownReason({
      unknownReason: "dependency_unavailable"
    });
    const unpublished = describeUnknownReason({
      unknownReason: "definition_not_published"
    });

    expect(new Set([review, dependency, unpublished]).size).toBe(3);
  });

  it("C3: an open review is framed as pending, not as failure", () => {
    const message = describeUnknownReason({
      unknownReason: "evidence_under_unresolved_review"
    });
    expect(message).toContain("being reviewed");
    expect(message).toContain("Nothing is wrong with your work");
    for (const blame of ["failed", "rejected", "invalid", "not met"]) {
      expect(message.toLowerCase()).not.toContain(blame);
    }
  });

  it("C4: an unavailable definition is about the certificate, not the student", () => {
    const message = describeUnknownReason({
      unknownReason: "definition_not_published"
    });
    expect(message).toContain("about the certificate, not about your progress");
  });

  it("C5: unknown does not assert what remains", () => {
    expect(describeRemainingWork(result({ status: "unknown" }))).toBe(
      "We'll show what remains once this can be checked."
    );
  });

  it("C6: undetermined results are identified for explanation", () => {
    expect(isUndetermined({ status: "unknown" })).toBe(true);
    expect(isUndetermined({ status: "ineligible" })).toBe(false);
    expect(isUndetermined({ status: "eligible" })).toBe(false);
  });

  it("C7: the three statuses produce three distinct messages", () => {
    const messages = new Set([
      describeEligibilityStatus("eligible"),
      describeEligibilityStatus("ineligible"),
      describeEligibilityStatus("unknown")
    ]);
    expect(messages.size).toBe(3);

    const labels = new Set([
      describeEligibilityStatusLabel("eligible"),
      describeEligibilityStatusLabel("ineligible"),
      describeEligibilityStatusLabel("unknown")
    ]);
    expect(labels.size).toBe(3);
  });
});

describe("D: requirement presentation", () => {
  it("D: state is conveyed as words", () => {
    expect(describeRequirementState(requirement({ satisfied: true }))).toBe(
      "Satisfied"
    );
    expect(describeRequirementState(requirement({ satisfied: false }))).toBe(
      "Still needed"
    );
  });

  it("D2: a version mismatch is explained plainly", () => {
    const detail = describeRequirementDetail(
      requirement({
        satisfied: false,
        unmetReason: "version_not_evidenced",
        satisfyingEvidenceIds: []
      })
    );
    expect(detail).toContain("different version");
  });

  it("D3: missing evidence reads differently from a version mismatch", () => {
    const missing = describeRequirementDetail(
      requirement({
        satisfied: false,
        unmetReason: "no_qualifying_evidence",
        satisfyingEvidenceIds: []
      })
    );
    const mismatch = describeRequirementDetail(
      requirement({
        satisfied: false,
        unmetReason: "version_not_evidenced",
        satisfyingEvidenceIds: []
      })
    );
    expect(missing).not.toBe(mismatch);
  });

  it("D4: a satisfied requirement reports the supporting evidence count", () => {
    expect(
      describeRequirementDetail(
        requirement({ satisfied: true, satisfyingEvidenceIds: ["a", "b"] })
      )
    ).toBe("Met by 2 pieces of your evidence.");
    expect(
      describeRequirementDetail(
        requirement({ satisfied: true, satisfyingEvidenceIds: ["a"] })
      )
    ).toBe("Met by 1 piece of your evidence.");
  });
});

describe("E: evidence policy presentation", () => {
  it("E: progress uses backend-supplied counts verbatim", () => {
    expect(
      describeEvidencePolicyProgress(policy({ qualifyingCount: 1, minimumCount: 2 }))
    ).toBe("1 of 2 counted so far.");
  });

  it("E2: state is words, not colour", () => {
    expect(describeEvidencePolicyState(policy({ satisfied: true }))).toBe(
      "Satisfied"
    );
    expect(describeEvidencePolicyState(policy({ satisfied: false }))).toBe(
      "Still needed"
    );
  });

  it("E3: each canonical source type has readable wording", () => {
    const labels = new Set([
      describeEvidenceSourceLabel("assessment_attempt"),
      describeEvidenceSourceLabel("lab_validation"),
      describeEvidenceSourceLabel("manual_authoritative"),
      describeEvidenceSourceLabel("system_authoritative")
    ]);
    expect(labels.size).toBeGreaterThanOrEqual(3);
    expect(describeEvidenceSourceLabel("lab_validation")).toBe("Hands-on labs");
  });
});

describe("F: loading and status region", () => {
  it("F: prompts for a selection before anything is chosen", () => {
    expect(
      describeLoadingStatus({
        loading: false,
        hasSelection: false,
        hasResult: false
      })
    ).toBe("Choose a certificate to check your eligibility.");
  });

  it("F2: announces loading only while checking", () => {
    expect(
      describeLoadingStatus({
        loading: true,
        hasSelection: true,
        hasResult: false
      })
    ).toBe("Checking your eligibility…");
  });

  it("F3: announces a single completion message", () => {
    expect(
      describeLoadingStatus({
        loading: false,
        hasSelection: true,
        hasResult: true
      })
    ).toBe("Eligibility check complete.");
  });

  it("F4: every lifecycle state produces exactly one sentence", () => {
    const states = [
      { loading: false, hasSelection: false, hasResult: false },
      { loading: true, hasSelection: true, hasResult: false },
      { loading: false, hasSelection: true, hasResult: true },
      { loading: false, hasSelection: true, hasResult: false }
    ];
    for (const state of states) {
      const message = describeLoadingStatus(state);
      expect(message.split(".").filter((part) => part.trim()).length).toBe(1);
    }
  });
});

describe("G: exact version presentation", () => {
  it("G: reports the exact evaluated version", () => {
    expect(
      describeCertificateVersion(result({ certificateDefinitionVersion: 7 }))
    ).toBe("Version 7");
  });

  it("G3: option labels add a version only when titles are ambiguous", () => {
    const single = labelCertificateDefinitionOptions([
      {
        stableId: "certdef-a",
        version: 2,
        title: "Cloud Security Professional",
        plainLanguageTitle: "Cloud Security Professional"
      }
    ]);
    expect(single[0]?.label).toBe("Cloud Security Professional");

    const ambiguous = labelCertificateDefinitionOptions([
      {
        stableId: "certdef-a",
        version: 2,
        title: "Cloud Security Professional",
        plainLanguageTitle: "Cloud Security Professional"
      },
      {
        stableId: "certdef-a",
        version: 3,
        title: "Cloud Security Professional",
        plainLanguageTitle: "Cloud Security Professional"
      }
    ]);
    expect(ambiguous.map((option) => option.label)).toEqual([
      "Cloud Security Professional — Version 2",
      "Cloud Security Professional — Version 3"
    ]);
  });

  it("G4: option labels never imply precedence between versions", () => {
    const labels = labelCertificateDefinitionOptions([
      {
        stableId: "certdef-a",
        version: 2,
        title: "Cloud Security",
        plainLanguageTitle: "Cloud Security"
      },
      {
        stableId: "certdef-a",
        version: 3,
        title: "Cloud Security",
        plainLanguageTitle: "Cloud Security"
      }
    ]).map((option) => option.label.toLowerCase());

    for (const label of labels) {
      for (const forbidden of ["latest", "current", "recommended", "preferred"]) {
        expect(label).not.toContain(forbidden);
      }
    }
  });
});
