import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_ELIGIBILITY_STATUSES,
  buildUnknownEligibilityResult,
  evaluateCertificateEligibility,
  isCertificateEligibilityStatus,
  type CertificateEligibilityResult
} from "./certificate-eligibility";
import type { CertificateDefinition } from "./certificate-definition";
import type { AuthoritativeCompetencyEvidenceReference } from "./evidence-competency";

const EVALUATED_AT = "2026-08-17T12:00:00.000Z";

function definition(
  overrides: Partial<CertificateDefinition> = {}
): CertificateDefinition {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    stableId: "certdef-net-foundations-001",
    version: 1,
    title: "Network Foundations",
    issuer: "Technical Learning Platform",
    publicationState: "published",
    effectiveAt: "2026-08-13T00:00:00.000Z",
    expirationMonths: null,
    verificationPermitted: false,
    supersededByDefinitionId: null,
    presentation: { plainLanguageTitle: "Network Foundations Certificate" },
    requiredCompetencies: [
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3,
        required: true
      }
    ],
    evidencePolicies: [],
    ...overrides
  };
}

/**
 * `qualifiesForDemonstration` is Wave 7's verdict, already combining effective
 * state, integrity and source outcome. These fixtures set it the way Wave 7
 * would, so the tests exercise CERT-002's use of that verdict rather than a
 * re-implementation of it.
 */
function reference(
  overrides: Partial<AuthoritativeCompetencyEvidenceReference> = {}
): AuthoritativeCompetencyEvidenceReference {
  return {
    evidenceId: "evidence-1",
    competencyStableId: "competency.networking.subnetting",
    competencyVersion: 3,
    relationship: "required",
    linkSource: "approved_curriculum_mapping",
    linkedAt: "2026-08-14T00:00:00.000Z",
    evidenceSourceType: "lab_validation",
    evidenceSourceEngine: "lab",
    evidenceSourceReference: "lab-validation:run-1",
    evidenceSourceOccurredAt: "2026-08-14T00:00:00.000Z",
    evidenceOutcome: "positive",
    evidenceResultState: "passed",
    evidenceEffectiveState: "active",
    evidenceUnderReview: false,
    qualifiesForDemonstration: true,
    ...overrides
  };
}

function evaluate(
  def: CertificateDefinition,
  references: AuthoritativeCompetencyEvidenceReference[]
): CertificateEligibilityResult {
  return evaluateCertificateEligibility({
    definition: def,
    references,
    evaluatedAt: EVALUATED_AT
  });
}

describe("A: all required competencies satisfied", () => {
  it("A: reports eligible", () => {
    const result = evaluate(definition(), [reference()]);
    expect(result.status).toBe("eligible");
    expect(result.unsatisfiedCompetencyCount).toBe(0);
    expect(result.competencyRequirements[0]?.satisfied).toBe(true);
    expect(result.competencyRequirements[0]?.satisfyingEvidenceIds).toEqual([
      "evidence-1"
    ]);
  });

  it("A2: reports the exact definition version evaluated", () => {
    const result = evaluate(definition({ version: 4 }), [reference()]);
    expect(result.certificateDefinitionVersion).toBe(4);
    expect(result.certificateDefinitionStableId).toBe(
      "certdef-net-foundations-001"
    );
    expect(result.evaluatedAt).toBe(EVALUATED_AT);
  });

  it("A3: satisfies every required competency before reporting eligible", () => {
    const twoRequirements = definition({
      requiredCompetencies: [
        {
          competencyStableId: "competency.a",
          competencyVersion: 1,
          required: true
        },
        {
          competencyStableId: "competency.b",
          competencyVersion: 2,
          required: true
        }
      ]
    });

    expect(
      evaluate(twoRequirements, [
        reference({
          evidenceId: "e-a",
          competencyStableId: "competency.a",
          competencyVersion: 1
        }),
        reference({
          evidenceId: "e-b",
          competencyStableId: "competency.b",
          competencyVersion: 2
        })
      ]).status
    ).toBe("eligible");
  });

  it("A4: an optional requirement never blocks eligibility", () => {
    const withOptional = definition({
      requiredCompetencies: [
        {
          competencyStableId: "competency.networking.subnetting",
          competencyVersion: 3,
          required: true
        },
        {
          competencyStableId: "competency.optional",
          competencyVersion: 1,
          required: false
        }
      ]
    });

    const result = evaluate(withOptional, [reference()]);
    expect(result.status).toBe("eligible");
    expect(result.competencyRequirements).toHaveLength(2);
    expect(
      result.competencyRequirements.find(
        (r) => r.competencyStableId === "competency.optional"
      )?.satisfied
    ).toBe(false);
  });
});

describe("B: missing required competency", () => {
  it("B: reports ineligible with no qualifying evidence", () => {
    const result = evaluate(definition(), []);
    expect(result.status).toBe("ineligible");
    expect(result.unsatisfiedCompetencyCount).toBe(1);
    expect(result.competencyRequirements[0]?.unmetReason).toBe(
      "no_qualifying_evidence"
    );
  });

  it("B2: one missing requirement of several blocks eligibility", () => {
    const twoRequirements = definition({
      requiredCompetencies: [
        {
          competencyStableId: "competency.a",
          competencyVersion: 1,
          required: true
        },
        {
          competencyStableId: "competency.b",
          competencyVersion: 1,
          required: true
        }
      ]
    });

    const result = evaluate(twoRequirements, [
      reference({
        evidenceId: "e-a",
        competencyStableId: "competency.a",
        competencyVersion: 1
      })
    ]);
    expect(result.status).toBe("ineligible");
    expect(result.unsatisfiedCompetencyCount).toBe(1);
  });
});

describe("C: exact competency version", () => {
  it("C: evidence at another version does not satisfy the pin", () => {
    const result = evaluate(definition(), [
      reference({ competencyVersion: 4 })
    ]);
    expect(result.status).toBe("ineligible");
    expect(result.competencyRequirements[0]?.unmetReason).toBe(
      "version_not_evidenced"
    );
    expect(result.competencyRequirements[0]?.satisfyingEvidenceIds).toEqual([]);
  });

  it("C2: an older evidenced version does not satisfy a newer pin", () => {
    const result = evaluate(definition(), [
      reference({ competencyVersion: 2 })
    ]);
    expect(result.status).toBe("ineligible");
    expect(result.competencyRequirements[0]?.unmetReason).toBe(
      "version_not_evidenced"
    );
  });

  it("C3: never falls back to a latest or newest version", () => {
    // Qualifying Evidence exists at versions 1, 2, 4 and 5 — none is version 3.
    const result = evaluate(
      definition(),
      [1, 2, 4, 5].map((version) =>
        reference({ evidenceId: `e-${version}`, competencyVersion: version })
      )
    );
    expect(result.status).toBe("ineligible");
    expect(result.competencyRequirements[0]?.satisfyingEvidenceIds).toEqual([]);
  });

  it("C4: the pinned version is satisfied when it is present among others", () => {
    const result = evaluate(definition(), [
      reference({ evidenceId: "e-2", competencyVersion: 2 }),
      reference({ evidenceId: "e-3", competencyVersion: 3 }),
      reference({ evidenceId: "e-4", competencyVersion: 4 })
    ]);
    expect(result.status).toBe("eligible");
    expect(result.competencyRequirements[0]?.satisfyingEvidenceIds).toEqual([
      "e-3"
    ]);
  });
});

describe("D-I: Wave 7 evidence semantics are honoured, not re-implemented", () => {
  it("D: invalidated Evidence does not qualify", () => {
    const result = evaluate(definition(), [
      reference({
        evidenceEffectiveState: "invalidated",
        qualifiesForDemonstration: false
      })
    ]);
    expect(result.status).toBe("ineligible");
  });

  it("E: superseded Evidence does not qualify", () => {
    const result = evaluate(definition(), [
      reference({
        evidenceEffectiveState: "superseded",
        qualifiesForDemonstration: false
      })
    ]);
    expect(result.status).toBe("ineligible");
  });

  it("F: failed assessment Evidence does not qualify", () => {
    const result = evaluate(definition(), [
      reference({
        evidenceSourceType: "assessment_attempt",
        evidenceSourceEngine: "assessment",
        evidenceOutcome: "negative",
        evidenceResultState: "failed",
        qualifiesForDemonstration: false
      })
    ]);
    expect(result.status).toBe("ineligible");
    expect(result.competencyRequirements[0]?.unmetReason).toBe(
      "no_qualifying_evidence"
    );
  });

  it("G: incomplete Lab Evidence does not qualify", () => {
    const result = evaluate(definition(), [
      reference({
        evidenceOutcome: "negative",
        evidenceResultState: "incomplete",
        qualifiesForDemonstration: false
      })
    ]);
    expect(result.status).toBe("ineligible");
  });

  it("G2: indeterminate technical-error Evidence does not qualify", () => {
    const result = evaluate(definition(), [
      reference({
        evidenceOutcome: "indeterminate",
        evidenceResultState: "technical_error",
        qualifiesForDemonstration: false
      })
    ]);
    expect(result.status).toBe("ineligible");
  });

  it("H: restored positive Evidence qualifies again", () => {
    // Wave 7 restored it to active and it carries a positive outcome, so its
    // qualifying verdict is true again.
    const result = evaluate(definition(), [
      reference({
        evidenceEffectiveState: "active",
        evidenceOutcome: "positive",
        qualifiesForDemonstration: true
      })
    ]);
    expect(result.status).toBe("eligible");
  });

  it("I: restored negative Evidence still does not qualify", () => {
    const result = evaluate(definition(), [
      reference({
        evidenceEffectiveState: "active",
        evidenceOutcome: "negative",
        evidenceResultState: "failed",
        qualifiesForDemonstration: false
      })
    ]);
    expect(result.status).toBe("ineligible");
  });

  it("I2: the qualifying verdict is read, never recomputed", () => {
    // A reference whose outcome looks positive but which Wave 7 marked as not
    // qualifying must not be counted. CERT-002 defers to Wave 7 entirely.
    const result = evaluate(definition(), [
      reference({
        evidenceOutcome: "positive",
        evidenceResultState: "passed",
        evidenceEffectiveState: "active",
        qualifiesForDemonstration: false
      })
    ]);
    expect(result.status).toBe("ineligible");
  });
});

describe("J-L: declarative Evidence policies", () => {
  const withPolicy = (
    policies: CertificateDefinition["evidencePolicies"]
  ): CertificateDefinition => definition({ evidencePolicies: policies });

  it("J: an Evidence source-type policy is enforced", () => {
    const def = withPolicy([
      {
        evidenceSourceType: "assessment_attempt",
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ]);

    // The competency is satisfied by lab Evidence, but the policy demands
    // assessment Evidence.
    const result = evaluate(def, [reference()]);
    expect(result.status).toBe("ineligible");
    expect(result.evidencePolicies[0]?.satisfied).toBe(false);
    expect(result.evidencePolicies[0]?.qualifyingCount).toBe(0);
    expect(result.unsatisfiedCompetencyCount).toBe(0);
  });

  it("J2: the matching source type satisfies the policy", () => {
    const def = withPolicy([
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ]);
    const result = evaluate(def, [reference()]);
    expect(result.status).toBe("eligible");
    expect(result.evidencePolicies[0]?.qualifyingCount).toBe(1);
  });

  it("K: a minimum Evidence count is enforced", () => {
    const def = withPolicy([
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 2,
        requirePositiveOutcome: true
      }
    ]);

    expect(evaluate(def, [reference()]).status).toBe("ineligible");

    const twoRecords = evaluate(def, [
      reference({ evidenceId: "e-1" }),
      reference({ evidenceId: "e-2" })
    ]);
    expect(twoRecords.status).toBe("eligible");
    expect(twoRecords.evidencePolicies[0]?.qualifyingCount).toBe(2);
  });

  it("K2: counts distinct Evidence records, never duplicate links", () => {
    // One Evidence record linked to two required competencies counts once.
    const def = definition({
      requiredCompetencies: [
        {
          competencyStableId: "competency.a",
          competencyVersion: 1,
          required: true
        },
        {
          competencyStableId: "competency.b",
          competencyVersion: 1,
          required: true
        }
      ],
      evidencePolicies: [
        {
          evidenceSourceType: "lab_validation",
          minimumCount: 2,
          requirePositiveOutcome: true
        }
      ]
    });

    const result = evaluate(def, [
      reference({
        evidenceId: "shared-evidence",
        competencyStableId: "competency.a",
        competencyVersion: 1
      }),
      reference({
        evidenceId: "shared-evidence",
        competencyStableId: "competency.b",
        competencyVersion: 1
      })
    ]);

    expect(result.evidencePolicies[0]?.qualifyingCount).toBe(1);
    expect(result.status).toBe("ineligible");
  });

  it("K3: only Evidence pinned to a required competency counts", () => {
    const def = withPolicy([
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ]);

    // Qualifying lab Evidence, but for a competency version this definition
    // does not require.
    const result = evaluate(def, [reference({ competencyVersion: 9 })]);
    expect(result.evidencePolicies[0]?.qualifyingCount).toBe(0);
    expect(result.status).toBe("ineligible");
  });

  it("L: multiple policies combine with AND", () => {
    const def = withPolicy([
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 1,
        requirePositiveOutcome: true
      },
      {
        evidenceSourceType: "assessment_attempt",
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ]);

    // Only the lab policy is met.
    const partial = evaluate(def, [reference()]);
    expect(partial.status).toBe("ineligible");
    expect(partial.unsatisfiedPolicyCount).toBe(1);

    // Both met.
    const both = evaluate(def, [
      reference({ evidenceId: "e-lab" }),
      reference({
        evidenceId: "e-assessment",
        evidenceSourceType: "assessment_attempt",
        evidenceSourceEngine: "assessment",
        evidenceResultState: "passed"
      })
    ]);
    expect(both.status).toBe("eligible");
    expect(both.unsatisfiedPolicyCount).toBe(0);
  });

  it("L2: requirePositiveOutcome=false never admits non-qualifying Evidence", () => {
    // Ruling 3: the flag is preserved declaratively but may never turn
    // fundamentally non-qualifying Evidence into certificate proof.
    const def = withPolicy([
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 1,
        requirePositiveOutcome: false
      }
    ]);

    const result = evaluate(def, [
      reference({
        evidenceOutcome: "negative",
        evidenceResultState: "incomplete",
        qualifiesForDemonstration: false
      })
    ]);

    expect(result.evidencePolicies[0]?.requirePositiveOutcome).toBe(false);
    expect(result.evidencePolicies[0]?.qualifyingCount).toBe(0);
    expect(result.status).toBe("ineligible");
  });

  it("L3: competency requirements and policies combine with AND", () => {
    const def = withPolicy([
      {
        evidenceSourceType: "assessment_attempt",
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ]);

    // Policy met by assessment Evidence, but the pinned competency is not.
    const result = evaluate(def, [
      reference({
        evidenceId: "e-assessment",
        competencyVersion: 9,
        evidenceSourceType: "assessment_attempt"
      })
    ]);
    expect(result.status).toBe("ineligible");
  });
});

describe("M-N: Certificate Definition publication state", () => {
  it("M: an unpublished definition does not produce student eligibility", () => {
    for (const state of ["draft", "review", "retired"] as const) {
      const result = evaluate(definition({ publicationState: state }), [
        reference()
      ]);
      expect(result.status).toBe("unknown");
      expect(result.unknownReason).toBe("definition_not_published");
    }
  });

  it("N: an unpublished definition is never reported as ineligible", () => {
    // Even with every requirement unmet, the answer is "not evaluable",
    // not a negative determination about the student.
    for (const state of ["draft", "review", "retired"] as const) {
      const result = evaluate(definition({ publicationState: state }), []);
      expect(result.status).toBe("unknown");
      expect(result.status).not.toBe("ineligible");
      expect(result.definitionPublicationState).toBe(state);
    }
  });

  it("N2: only a published definition can be eligible", () => {
    expect(
      evaluate(definition({ publicationState: "published" }), [reference()])
        .status
    ).toBe("eligible");
  });
});

describe("O: unresolved review and dependency failure are not ineligibility", () => {
  it("O: relevant Evidence under unresolved review returns unknown", () => {
    const result = evaluate(definition(), [
      reference({ evidenceUnderReview: true })
    ]);
    expect(result.status).toBe("unknown");
    expect(result.unknownReason).toBe("evidence_under_unresolved_review");
  });

  it("O2: review blocks even when requirements would otherwise be unmet", () => {
    const result = evaluate(definition(), [
      reference({
        evidenceUnderReview: true,
        qualifiesForDemonstration: false,
        evidenceEffectiveState: "invalidated"
      })
    ]);
    expect(result.status).toBe("unknown");
    expect(result.status).not.toBe("ineligible");
  });

  it("O3: review of unrelated Evidence does not block this certificate", () => {
    const result = evaluate(definition(), [
      reference(),
      reference({
        evidenceId: "unrelated",
        competencyStableId: "competency.unrelated",
        competencyVersion: 1,
        evidenceUnderReview: true
      })
    ]);
    expect(result.status).toBe("eligible");
  });

  it("O4: review of another version of a required competency does not block", () => {
    const result = evaluate(definition(), [
      reference(),
      reference({
        evidenceId: "other-version",
        competencyVersion: 9,
        evidenceUnderReview: true
      })
    ]);
    expect(result.status).toBe("eligible");
  });

  it("O5: a dependency failure result is unknown, never ineligible", () => {
    const result = buildUnknownEligibilityResult({
      certificateDefinitionStableId: "certdef-net-foundations-001",
      certificateDefinitionVersion: 1,
      unknownReason: "dependency_unavailable",
      evaluatedAt: EVALUATED_AT
    });
    expect(result.status).toBe("unknown");
    expect(result.unknownReason).toBe("dependency_unavailable");
    expect(result.status).not.toBe("ineligible");
    expect(result.certificateDefinitionVersion).toBe(1);
  });

  it("O6: the three outcomes stay distinct", () => {
    expect(CERTIFICATE_ELIGIBILITY_STATUSES).toEqual([
      "eligible",
      "ineligible",
      "unknown"
    ]);
    expect(isCertificateEligibilityStatus("eligible")).toBe(true);
    expect(isCertificateEligibilityStatus("not_eligible")).toBe(false);
    expect(isCertificateEligibilityStatus("pending")).toBe(false);
  });
});

describe("P-S: determinism and scope boundary", () => {
  it("P: evaluation has no side effects on its inputs", () => {
    const def = definition();
    const references = [reference()];
    const defSnapshot = JSON.stringify(def);
    const referencesSnapshot = JSON.stringify(references);

    evaluate(def, references);

    expect(JSON.stringify(def)).toBe(defSnapshot);
    expect(JSON.stringify(references)).toBe(referencesSnapshot);
  });

  it("P2: the same inputs always produce the same result", () => {
    const def = definition();
    const references = [
      reference({ evidenceId: "e-2" }),
      reference({ evidenceId: "e-1" })
    ];

    const first = evaluate(def, references);
    const second = evaluate(def, references);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // Output order is stable regardless of input order.
    expect(first.competencyRequirements[0]?.satisfyingEvidenceIds).toEqual([
      "e-1",
      "e-2"
    ]);
  });

  it("P3: the evaluation timestamp comes from the caller, not a clock", () => {
    expect(evaluate(definition(), [reference()]).evaluatedAt).toBe(
      EVALUATED_AT
    );
  });

  it("Q: no student certificate record is produced", () => {
    const result = evaluate(definition(), [reference()]);
    for (const forbidden of [
      "certificateId",
      "issuedAt",
      "issuedTo",
      "holderId",
      "lifecycleStatus",
      "expiresAt",
      "expirationDate",
      "verificationId",
      "revokedAt"
    ]) {
      expect(result).not.toHaveProperty(forbidden);
    }
  });

  it("R: the result carries no issuance instruction", () => {
    const result = evaluate(definition(), [reference()]);
    expect(result.status).toBe("eligible");
    // Eligible states a fact about requirements. It does not authorise,
    // request, or schedule issuance — CERT-003 owns that decision.
    expect(result).not.toHaveProperty("shouldIssue");
    expect(result).not.toHaveProperty("issue");
    expect(result).not.toHaveProperty("issuanceApproved");
  });

  it("S: no AI or randomness participates in the decision", () => {
    const results = new Set<string>();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      results.add(JSON.stringify(evaluate(definition(), [reference()])));
    }
    expect(results.size).toBe(1);
  });

  it("S2: an empty definition with no requirements and no policies is eligible", () => {
    // CERT-001 blocks publishing a definition with no required competency, so
    // this cannot arise from a published definition; asserted to pin the
    // evaluator's behaviour rather than to endorse the shape.
    const result = evaluate(
      definition({ requiredCompetencies: [], evidencePolicies: [] }),
      []
    );
    expect(result.status).toBe("eligible");
    expect(result.competencyRequirements).toEqual([]);
  });
});
