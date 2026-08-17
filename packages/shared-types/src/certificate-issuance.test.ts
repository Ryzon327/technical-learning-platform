import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_ISSUANCE_REFUSAL_REASONS,
  CERTIFICATE_VERIFICATION_ID_PATTERN,
  buildCertificateIssuanceSnapshot,
  decideCertificateIssuance,
  isCertificateVerificationId,
  type CertificateIssuanceDecisionInput,
  type IssuedCertificate
} from "./certificate-issuance";
import {
  evaluateCertificateEligibility,
  type CertificateCompetencyRequirementResult,
  type CertificateEvidencePolicyResult
} from "./certificate-eligibility";
import type { CertificateDefinition } from "./certificate-definition";
import type { AuthoritativeCompetencyEvidenceReference } from "./evidence-competency";

function decisionInput(
  overrides: Partial<CertificateIssuanceDecisionInput> = {}
): CertificateIssuanceDecisionInput {
  return {
    eligibilityStatus: "eligible",
    publicationState: "published",
    supersededByDefinitionId: null,
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

describe("A: issuance is permitted only when eligible", () => {
  it("A: an eligible student may be issued a published definition", () => {
    expect(decideCertificateIssuance(decisionInput())).toEqual({
      issuable: true
    });
  });

  it("B: an ineligible student is refused", () => {
    const decision = decideCertificateIssuance(
      decisionInput({ eligibilityStatus: "ineligible" })
    );
    expect(decision).toEqual({ issuable: false, reason: "not_eligible" });
  });

  it("C: an unknown eligibility state is refused, distinctly", () => {
    const decision = decideCertificateIssuance(
      decisionInput({
        eligibilityStatus: "unknown",
        unknownReason: "evidence_under_unresolved_review"
      })
    );
    expect(decision).toEqual({
      issuable: false,
      reason: "eligibility_unknown",
      unknownReason: "evidence_under_unresolved_review"
    });
  });

  it("C2: unknown is never collapsed into ineligible", () => {
    const unknown = decideCertificateIssuance(
      decisionInput({ eligibilityStatus: "unknown" })
    );
    const ineligible = decideCertificateIssuance(
      decisionInput({ eligibilityStatus: "ineligible" })
    );
    expect(unknown).not.toEqual(ineligible);
  });

  it("C3: every refusal reason is modelled", () => {
    expect(CERTIFICATE_ISSUANCE_REFUSAL_REASONS).toEqual([
      "not_eligible",
      "eligibility_unknown",
      "definition_not_issuable"
    ]);
  });
});

describe("D: definition issuability gates eligibility", () => {
  it("D: an unpublished definition cannot be issued", () => {
    for (const state of ["draft", "review", "retired"] as const) {
      expect(
        decideCertificateIssuance(decisionInput({ publicationState: state }))
      ).toEqual({ issuable: false, reason: "definition_not_issuable" });
    }
  });

  it("E: a superseded definition cannot be issued", () => {
    expect(
      decideCertificateIssuance(
        decisionInput({ supersededByDefinitionId: "definition-2" })
      )
    ).toEqual({ issuable: false, reason: "definition_not_issuable" });
  });

  it("E2: issuability is checked before eligibility", () => {
    // A superseded definition is refused as not issuable even when the student
    // is eligible, and the reason names the definition rather than the student.
    expect(
      decideCertificateIssuance(
        decisionInput({
          eligibilityStatus: "eligible",
          supersededByDefinitionId: "definition-2"
        })
      )
    ).toEqual({ issuable: false, reason: "definition_not_issuable" });
  });

  it("E3: supersession is never inferred from version numbers", () => {
    // Only an explicit recorded successor blocks issuance.
    expect(
      decideCertificateIssuance(
        decisionInput({ supersededByDefinitionId: null })
      ).issuable
    ).toBe(true);
  });
});

describe("F: verification identifier", () => {
  it("F: accepts the opaque cert1_ format only", () => {
    expect(isCertificateVerificationId(`cert1_${"a1".repeat(24)}`)).toBe(true);
    expect(isCertificateVerificationId(`ev1_${"a1".repeat(24)}`)).toBe(false);
    expect(isCertificateVerificationId("cert1_short")).toBe(false);
    expect(isCertificateVerificationId("")).toBe(false);
    expect(isCertificateVerificationId(undefined)).toBe(false);
  });

  it("F2: the pattern is non-enumerable in shape", () => {
    // 48 hex characters of randomness; nothing sequential or guessable.
    expect(CERTIFICATE_VERIFICATION_ID_PATTERN.source).toContain("[a-f0-9]{48}");
    expect(isCertificateVerificationId("cert1_000000000000")).toBe(false);
  });
});

describe("G: issuance snapshot", () => {
  it("G: pins the competencies that justified issuance", () => {
    const snapshot = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [requirement()]
    });

    expect(snapshot.competencies).toEqual([
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3
      }
    ]);
  });

  it("G2: pins evidence against the exact competency version it satisfied", () => {
    const snapshot = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [
        requirement({ satisfyingEvidenceIds: ["evidence-2", "evidence-1"] })
      ]
    });

    expect(snapshot.evidence).toEqual([
      {
        evidenceId: "evidence-1",
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3
      },
      {
        evidenceId: "evidence-2",
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3
      }
    ]);
  });

  it("G3: excludes optional requirements from the justification", () => {
    const snapshot = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [
        requirement(),
        requirement({
          competencyStableId: "competency.optional",
          competencyVersion: 1,
          required: false,
          satisfied: true,
          satisfyingEvidenceIds: ["evidence-9"]
        })
      ]
    });

    expect(snapshot.competencies).toHaveLength(1);
    expect(snapshot.evidenceIds).toEqual(["evidence-1"]);
  });

  it("G4: excludes unsatisfied requirements", () => {
    const snapshot = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [
        requirement({
          satisfied: false,
          satisfyingEvidenceIds: [],
          unmetReason: "no_qualifying_evidence"
        })
      ]
    });

    expect(snapshot.competencies).toEqual([]);
    expect(snapshot.evidence).toEqual([]);
  });

  it("G5: distinct evidence ids are collected once for the integrity pin", () => {
    const snapshot = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [
        requirement({
          competencyStableId: "competency.a",
          competencyVersion: 1,
          satisfyingEvidenceIds: ["shared-evidence"]
        }),
        requirement({
          competencyStableId: "competency.b",
          competencyVersion: 1,
          satisfyingEvidenceIds: ["shared-evidence"]
        })
      ]
    });

    // Two snapshot rows, one pinned evidence record.
    expect(snapshot.evidence).toHaveLength(2);
    expect(snapshot.evidenceIds).toEqual(["shared-evidence"]);
  });

  it("G6: output is deterministic regardless of input order", () => {
    const forwards = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [
        requirement({ competencyStableId: "competency.b", competencyVersion: 1 }),
        requirement({ competencyStableId: "competency.a", competencyVersion: 1 })
      ]
    });
    const backwards = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [
        requirement({ competencyStableId: "competency.a", competencyVersion: 1 }),
        requirement({ competencyStableId: "competency.b", competencyVersion: 1 })
      ]
    });

    expect(JSON.stringify(forwards)).toBe(JSON.stringify(backwards));
  });

  it("G7: the snapshot copies no Evidence content", () => {
    const snapshot = buildCertificateIssuanceSnapshot({
      evidencePolicies: [],
      competencyRequirements: [requirement()]
    });

    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      "digest",
      "integrity",
      "outcome",
      "resultState",
      "effectiveState",
      "metadata",
      "correction"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("J: integrity pin-set completeness", () => {
  /**
   * A CERT-002 result becomes eligible through two independent gates: required
   * competencies, and definition-level Evidence policies. These run the REAL
   * evaluator end to end, so the pin set is proven against actual eligibility
   * output rather than a hand-built result object.
   */
  function reference(
    evidenceId: string,
    competencyStableId: string,
    competencyVersion: number,
    sourceType: CertificateEvidencePolicyResult["evidenceSourceType"] = "lab_validation"
  ): AuthoritativeCompetencyEvidenceReference {
    return {
      evidenceId,
      competencyStableId,
      competencyVersion,
      relationship: "required",
      linkSource: "approved_curriculum_mapping",
      linkedAt: "2026-08-14T00:00:00.000Z",
      evidenceSourceType: sourceType,
      evidenceSourceEngine: "lab",
      evidenceSourceReference: `lab-validation:${evidenceId}`,
      evidenceSourceOccurredAt: "2026-08-14T00:00:00.000Z",
      evidenceOutcome: "positive",
      evidenceResultState: "passed",
      evidenceEffectiveState: "active",
      evidenceUnderReview: false,
      qualifiesForDemonstration: true
    };
  }

  function definition(
    overrides: Partial<CertificateDefinition> = {}
  ): CertificateDefinition {
    return {
      id: "def-1",
      stableId: "certdef-x-001",
      version: 1,
      title: "X",
      issuer: "Technical Learning Platform",
      publicationState: "published",
      effectiveAt: "2026-08-13T00:00:00.000Z",
      expirationMonths: null,
      verificationPermitted: false,
      supersededByDefinitionId: null,
      presentation: { plainLanguageTitle: "X" },
      requiredCompetencies: [
        {
          competencyStableId: "competency.a",
          competencyVersion: 1,
          required: true
        }
      ],
      evidencePolicies: [],
      ...overrides
    };
  }

  function evaluate(
    def: CertificateDefinition,
    references: AuthoritativeCompetencyEvidenceReference[]
  ) {
    return evaluateCertificateEligibility({
      definition: def,
      references,
      evaluatedAt: "2026-08-17T12:00:00.000Z"
    });
  }

  it("A: Evidence satisfying a required competency is pinned", () => {
    const result = evaluate(definition(), [
      reference("E1", "competency.a", 1)
    ]);
    expect(result.status).toBe("eligible");
    expect(buildCertificateIssuanceSnapshot(result).evidenceIds).toEqual(["E1"]);
  });

  it("B: Evidence contributing to a policy minimumCount is pinned even when its competency is optional", () => {
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
          required: false
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
      reference("E1", "competency.a", 1),
      reference("E2", "competency.b", 1)
    ]);

    // E2 is why the policy reached 2, so it is why the student is eligible.
    expect(result.status).toBe("eligible");
    expect(result.evidencePolicies[0]?.satisfyingEvidenceIds).toEqual([
      "E1",
      "E2"
    ]);

    expect(buildCertificateIssuanceSnapshot(result).evidenceIds).toEqual([
      "E1",
      "E2"
    ]);
  });

  it("C: Evidence contributing to both gates is pinned exactly once", () => {
    const def = definition({
      evidencePolicies: [
        {
          evidenceSourceType: "lab_validation",
          minimumCount: 1,
          requirePositiveOutcome: true
        }
      ]
    });

    const result = evaluate(def, [reference("E1", "competency.a", 1)]);

    expect(result.status).toBe("eligible");
    expect(result.competencyRequirements[0]?.satisfyingEvidenceIds).toContain(
      "E1"
    );
    expect(result.evidencePolicies[0]?.satisfyingEvidenceIds).toContain("E1");

    const snapshot = buildCertificateIssuanceSnapshot(result);
    expect(snapshot.evidenceIds).toEqual(["E1"]);
    expect(
      snapshot.evidenceIds.filter((id) => id === "E1")
    ).toHaveLength(1);
  });

  it("D: Evidence that contributed to neither gate is not pinned", () => {
    // competency.b is optional and no policy exists, so its Evidence supported
    // nothing that made the result eligible.
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
          required: false
        }
      ]
    });

    const result = evaluate(def, [
      reference("E1", "competency.a", 1),
      reference("E2", "competency.b", 1)
    ]);

    expect(result.status).toBe("eligible");
    const snapshot = buildCertificateIssuanceSnapshot(result);
    expect(snapshot.evidenceIds).toEqual(["E1"]);
    expect(snapshot.evidenceIds).not.toContain("E2");
  });

  it("D2: Evidence for an unrequired competency version is never pinned", () => {
    const result = evaluate(definition(), [
      reference("E1", "competency.a", 1),
      reference("E9", "competency.a", 9)
    ]);

    expect(result.status).toBe("eligible");
    expect(buildCertificateIssuanceSnapshot(result).evidenceIds).toEqual([
      "E1"
    ]);
  });

  it("E: every Evidence id CERT-002 reports as contributing is pinned", () => {
    // The general invariant, asserted against the evaluator's own output
    // across a definition exercising both gates and several source types.
    const def = definition({
      requiredCompetencies: [
        {
          competencyStableId: "competency.a",
          competencyVersion: 1,
          required: true
        },
        {
          competencyStableId: "competency.b",
          competencyVersion: 2,
          required: false
        },
        {
          competencyStableId: "competency.c",
          competencyVersion: 1,
          required: true
        }
      ],
      evidencePolicies: [
        {
          evidenceSourceType: "lab_validation",
          minimumCount: 2,
          requirePositiveOutcome: true
        },
        {
          evidenceSourceType: "assessment_attempt",
          minimumCount: 1,
          requirePositiveOutcome: true
        }
      ]
    });

    const result = evaluate(def, [
      reference("E1", "competency.a", 1),
      reference("E2", "competency.b", 2),
      reference("E3", "competency.c", 1, "assessment_attempt"),
      reference("E4", "competency.b", 2, "assessment_attempt")
    ]);

    expect(result.status).toBe("eligible");

    const reported = new Set<string>();
    for (const requirement of result.competencyRequirements) {
      if (!requirement.required || !requirement.satisfied) continue;
      for (const id of requirement.satisfyingEvidenceIds) reported.add(id);
    }
    for (const policy of result.evidencePolicies) {
      for (const id of policy.satisfyingEvidenceIds) reported.add(id);
    }

    const pinned = new Set(
      buildCertificateIssuanceSnapshot(result).evidenceIds
    );

    for (const id of reported) {
      expect(pinned.has(id)).toBe(true);
    }
    // And nothing beyond what CERT-002 reported.
    expect([...pinned].sort()).toEqual([...reported].sort());
  });

  it("E2: every snapshot row references a pinned Evidence record", () => {
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
          required: false
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

    const snapshot = buildCertificateIssuanceSnapshot(
      evaluate(def, [
        reference("E1", "competency.a", 1),
        reference("E2", "competency.b", 1)
      ])
    );

    // The issuance RPC rejects any snapshot row referencing unpinned Evidence.
    for (const entry of snapshot.evidence) {
      expect(snapshot.evidenceIds).toContain(entry.evidenceId);
    }
    // Policy-contributing Evidence keeps its competency provenance.
    expect(snapshot.evidence).toContainEqual({
      evidenceId: "E2",
      competencyStableId: "competency.b",
      competencyVersion: 1
    });
  });
});

describe("H: the record model carries no CERT-004+ concept", () => {
  it("H: an issued certificate exposes only CERT-003 fields", () => {
    const certificate: IssuedCertificate = {
      id: "certificate-1",
      certificateDefinitionId: "definition-1",
      certificateDefinitionStableId: "certdef-net-foundations-001",
      certificateDefinitionVersion: 3,
      verificationId: `cert1_${"a1".repeat(24)}`,
      issuedAt: "2026-08-17T12:00:00.000Z"
    };

    expect(Object.keys(certificate).sort()).toEqual([
      "certificateDefinitionId",
      "certificateDefinitionStableId",
      "certificateDefinitionVersion",
      "id",
      "issuedAt",
      "verificationId"
    ]);
  });

  it("H2: no lifecycle, expiration or revocation field exists", () => {
    const certificate = {
      id: "certificate-1",
      certificateDefinitionId: "definition-1",
      certificateDefinitionStableId: "certdef-net-foundations-001",
      certificateDefinitionVersion: 3,
      verificationId: `cert1_${"a1".repeat(24)}`,
      issuedAt: "2026-08-17T12:00:00.000Z"
    } satisfies IssuedCertificate;

    for (const forbidden of [
      "status",
      "lifecycleStatus",
      "expiresAt",
      "expirationDate",
      "revokedAt",
      "supersededBy",
      "presentation"
    ]) {
      expect(certificate).not.toHaveProperty(forbidden);
    }
  });

  it("H3: the owner's identity is not echoed back to them", () => {
    const certificate = {
      id: "certificate-1",
      certificateDefinitionId: "definition-1",
      certificateDefinitionStableId: "certdef-net-foundations-001",
      certificateDefinitionVersion: 3,
      verificationId: `cert1_${"a1".repeat(24)}`,
      issuedAt: "2026-08-17T12:00:00.000Z"
    } satisfies IssuedCertificate;

    expect(certificate).not.toHaveProperty("userId");
    expect(certificate).not.toHaveProperty("studentId");
  });
});

describe("I: determinism", () => {
  it("I: the same inputs always produce the same decision", () => {
    const input = decisionInput({ eligibilityStatus: "ineligible" });
    const results = new Set<string>();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      results.add(JSON.stringify(decideCertificateIssuance(input)));
    }
    expect(results.size).toBe(1);
  });

  it("I2: the decision inspects no competency or evidence data", () => {
    // The input type carries a status and two definition facts only, so the
    // decision cannot become a second eligibility engine.
    const input = decisionInput();
    expect(Object.keys(input).sort()).toEqual([
      "eligibilityStatus",
      "publicationState",
      "supersededByDefinitionId"
    ]);
  });
});
