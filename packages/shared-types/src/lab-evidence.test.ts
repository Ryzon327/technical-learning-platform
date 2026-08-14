import { describe, expect, it } from "vitest";
import {
  LAB_VALIDATION_CANONICAL_VERSION,
  buildLabMappingAuthorityCanonicalString,
  resolveMappingAuthority,
  type LabEvidenceMappingAuthority,
  buildLabEvidenceMetadata,
  buildLabValidationCanonicalString,
  buildLabValidationSourceReference,
  evaluateLabEvidenceEligibility,
  isAuthoritativeLabOutcome,
  toLabEvidenceRelationship,
  validateLabEvidenceMetadata,
  type LabEvidenceSourceFacts
} from "./lab-evidence";
import {
  deriveEvidenceOutcome,
  qualifiesAsDemonstrationEvidence
} from "./evidence-competency";
import { deriveLabValidationState } from "./lab-runtime";
import type { LabValidationCheckResult } from "./lab-runtime";
import { validateEvidenceMetadata } from "./evidence";

function check(
  overrides: Partial<LabValidationCheckResult> = {}
): LabValidationCheckResult {
  return {
    checkStableId: "check.service.listening",
    title: "Service is listening",
    required: true,
    passed: true,
    state: "passed",
    explanation: "",
    ...overrides
  };
}

function facts(
  overrides: Partial<LabEvidenceSourceFacts> = {}
): LabEvidenceSourceFacts {
  return {
    validationRunId: "11111111-1111-4111-8111-111111111111",
    labSessionId: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    profileStableId: "profile.network.subnetting",
    labDefinitionStableId: "lab.network.subnetting",
    labDefinitionVersion: 2,
    labName: "Configure IPv4 subnets",
    missionStableId: "mission.network.addressing",
    runState: "passed",
    checkedAt: "2026-08-13T00:00:00.000Z",
    mappingAuthorityDigest: "c3".repeat(32),
    results: [
      check(),
      check({ checkStableId: "check.route.present", title: "Route present" })
    ],
    ...overrides
  };
}

describe("lab evidence eligibility", () => {
  it("A: a passed deterministic validation run is eligible", () => {
    expect(evaluateLabEvidenceEligibility("passed")).toEqual({ eligible: true });
  });

  it("B: an incomplete run is eligible as traceable negative evidence", () => {
    expect(evaluateLabEvidenceEligibility("incomplete")).toEqual({
      eligible: true
    });
  });

  it("C/R: a validator technical error never becomes student evidence", () => {
    expect(evaluateLabEvidenceEligibility("technical_error")).toEqual({
      eligible: false,
      reason: "validation_technical_error"
    });
    expect(isAuthoritativeLabOutcome("technical_error")).toBe(false);
  });

  it("R: a validator outage is distinguishable from a student failure", () => {
    const studentFailure = deriveLabValidationState([
      check({ state: "passed" }),
      check({
        checkStableId: "check.route.present",
        state: "failed",
        passed: false
      })
    ]);
    const validatorOutage = deriveLabValidationState([
      check({ state: "passed" }),
      check({ checkStableId: "check.route.present", state: "technical_error" })
    ]);

    expect(studentFailure).toBe("incomplete");
    expect(validatorOutage).toBe("technical_error");
    expect(evaluateLabEvidenceEligibility(studentFailure).eligible).toBe(true);
    expect(evaluateLabEvidenceEligibility(validatorOutage).eligible).toBe(false);
  });

  it("D: an unrecognised run state fails closed", () => {
    const decision = evaluateLabEvidenceEligibility(
      "unknown" as unknown as LabEvidenceSourceFacts["runState"]
    );
    expect(decision.eligible).toBe(false);
  });
});

describe("lab evidence outcome qualification", () => {
  it("A/P: a passed run qualifies for demonstration", () => {
    const metadata = buildLabEvidenceMetadata(facts());
    const outcome = deriveEvidenceOutcome(metadata.resultState);
    expect(outcome).toBe("positive");
    expect(qualifiesAsDemonstrationEvidence(outcome)).toBe(true);
  });

  it("B/Q: an incomplete run is negative and never qualifies", () => {
    const metadata = buildLabEvidenceMetadata(
      facts({
        runState: "incomplete",
        results: [check({ state: "failed", passed: false })]
      })
    );
    const outcome = deriveEvidenceOutcome(metadata.resultState);
    expect(outcome).toBe("negative");
    expect(qualifiesAsDemonstrationEvidence(outcome)).toBe(false);
  });

  it("C: a technical error is indeterminate and never qualifies", () => {
    const outcome = deriveEvidenceOutcome("technical_error");
    expect(outcome).toBe("indeterminate");
    expect(qualifiesAsDemonstrationEvidence(outcome)).toBe(false);
  });

  it("absence of an explicit success is never read as success", () => {
    for (const value of [undefined, null, "", "unknown", 1, true]) {
      expect(qualifiesAsDemonstrationEvidence(deriveEvidenceOutcome(value))).toBe(
        false
      );
    }
  });
});

describe("lab source integrity", () => {
  it("builds a deterministic canonical string", () => {
    const value = facts();
    expect(buildLabValidationCanonicalString(value)).toBe(
      buildLabValidationCanonicalString(value)
    );
    expect(
      buildLabValidationCanonicalString(value).startsWith(
        `${LAB_VALIDATION_CANONICAL_VERSION}|`
      )
    ).toBe(true);
  });

  it("E: is stable under check row ordering", () => {
    const ordered = facts();
    const reversed = facts({ results: [...facts().results].reverse() });
    expect(buildLabValidationCanonicalString(reversed)).toBe(
      buildLabValidationCanonicalString(ordered)
    );
  });

  it("F: changes when any authoritative validation fact changes", () => {
    const base = buildLabValidationCanonicalString(facts());

    expect(
      buildLabValidationCanonicalString(facts({ runState: "incomplete" }))
    ).not.toBe(base);
    expect(
      buildLabValidationCanonicalString(facts({ labDefinitionVersion: 3 }))
    ).not.toBe(base);
    expect(
      buildLabValidationCanonicalString(
        facts({ userId: "44444444-4444-4444-8444-444444444444" })
      )
    ).not.toBe(base);
    expect(
      buildLabValidationCanonicalString(
        facts({ checkedAt: "2026-08-14T00:00:00.000Z" })
      )
    ).not.toBe(base);
    expect(
      buildLabValidationCanonicalString(
        facts({
          results: [check({ state: "failed", passed: false }), facts().results[1]!]
        })
      )
    ).not.toBe(base);
  });

  it("normalises the validation timestamp", () => {
    expect(
      buildLabValidationCanonicalString(facts({ checkedAt: "2026-08-13T00:00:00Z" }))
    ).toBe(buildLabValidationCanonicalString(facts()));
  });

  it("uses the stable validation run reference convention", () => {
    expect(buildLabValidationSourceReference("run-1")).toBe(
      "lab-validation-run:run-1"
    );
  });
});

describe("lab evidence metadata", () => {
  it("preserves the lab, definition version and authoritative outcome", () => {
    const metadata = buildLabEvidenceMetadata(facts());
    expect(metadata.labDefinitionStableId).toBe("lab.network.subnetting");
    expect(metadata.labDefinitionVersion).toBe(2);
    expect(metadata.labName).toBe("Configure IPv4 subnets");
    expect(metadata.resultState).toBe("passed");
    expect(metadata.requiredCheckCount).toBe(2);
    expect(metadata.passedRequiredCheckCount).toBe(2);
  });

  it("exposes no provider, runtime or validator internals", () => {
    const metadata = buildLabEvidenceMetadata(facts());
    const keys = Object.keys(metadata);
    for (const forbidden of [
      "probeId",
      "explanation",
      "endpoint",
      "username",
      "providerId",
      "providerSessionId",
      "containerId",
      "connectionMetadata"
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(validateLabEvidenceMetadata(metadata).valid).toBe(true);
    expect(validateEvidenceMetadata(metadata).valid).toBe(true);
  });

  it("rejects metadata carrying validator internals", () => {
    const metadata = { ...buildLabEvidenceMetadata(facts()), probeId: "probe-1" };
    expect(validateLabEvidenceMetadata(metadata).valid).toBe(false);
  });

  it("rejects metadata without an authoritative run state", () => {
    const metadata = {
      ...buildLabEvidenceMetadata(facts()),
      resultState: "technical_error"
    };
    expect(validateLabEvidenceMetadata(metadata).valid).toBe(false);
  });

  it("counts only required checks toward the recorded totals", () => {
    const metadata = buildLabEvidenceMetadata(
      facts({
        runState: "incomplete",
        results: [
          check({ state: "passed" }),
          check({
            checkStableId: "check.optional.tuning",
            required: false,
            state: "failed",
            passed: false
          }),
          check({
            checkStableId: "check.route.present",
            state: "failed",
            passed: false
          })
        ]
      })
    );
    expect(metadata.requiredCheckCount).toBe(2);
    expect(metadata.passedRequiredCheckCount).toBe(1);
  });
});

describe("lab competency relationships", () => {
  it("I: maps approved required mappings to the required relationship", () => {
    expect(toLabEvidenceRelationship(true)).toBe("required");
    expect(toLabEvidenceRelationship(false)).toBe("supporting");
  });
});

describe("frozen competency mapping authority", () => {
  const missionV3: LabEvidenceMappingAuthority = {
    missionStableId: "mission.network.addressing",
    missionVersion: 3,
    missionId: "mission-row-v3",
    mappings: [
      {
        competencyStableId: "competency.network.subnetting",
        competencyVersion: 2,
        required: true
      },
      {
        competencyStableId: "competency.network.routing",
        competencyVersion: 1,
        required: false
      }
    ],
    unresolvedCompetencyStableIds: []
  };

  const missionV4: LabEvidenceMappingAuthority = {
    missionStableId: "mission.network.addressing",
    missionVersion: 4,
    missionId: "mission-row-v4",
    mappings: [
      {
        competencyStableId: "competency.network.subnetting",
        competencyVersion: 5,
        required: true
      },
      {
        competencyStableId: "competency.network.vlans",
        competencyVersion: 1,
        required: true
      }
    ],
    unresolvedCompetencyStableIds: []
  };

  it("A-D: a delayed retry still uses the mapping frozen at validation time", () => {
    // A: validation happened while mission v3 / mapping set A was published.
    // B/C: ingestion was delayed and mission v4 / mapping set B was published.
    // D: the retry resolves the frozen snapshot, not the current curriculum.
    const resolution = resolveMappingAuthority({
      frozen: missionV3,
      current: missionV4
    });

    expect(resolution.capturedLate).toBe(false);
    expect(resolution.authority.missionVersion).toBe(3);
    expect(resolution.authority.mappings).toEqual(missionV3.mappings);
  });

  it("E: the retry adds no mapping from the newer mission version", () => {
    const resolution = resolveMappingAuthority({
      frozen: missionV3,
      current: missionV4
    });

    const stableIds = resolution.authority.mappings.map(
      (mapping) => mapping.competencyStableId
    );
    expect(stableIds).not.toContain("competency.network.vlans");

    const subnetting = resolution.authority.mappings.find(
      (mapping) => mapping.competencyStableId === "competency.network.subnetting"
    );
    // The competency version stays at the historically approved value.
    expect(subnetting?.competencyVersion).toBe(2);
  });

  it("repeated retries remain identical and idempotent", () => {
    const first = resolveMappingAuthority({ frozen: missionV3, current: missionV4 });
    for (let i = 0; i < 10; i += 1) {
      const repeat = resolveMappingAuthority({
        frozen: missionV3,
        current: missionV4
      });
      expect(repeat.authority).toEqual(first.authority);
      expect(
        buildLabMappingAuthorityCanonicalString(repeat.authority)
      ).toBe(buildLabMappingAuthorityCanonicalString(first.authority));
    }
  });

  it("falls back to the current mapping only when nothing was frozen, and says so", () => {
    const resolution = resolveMappingAuthority({ frozen: null, current: missionV4 });
    expect(resolution.capturedLate).toBe(true);
    expect(resolution.authority.missionVersion).toBe(4);
  });

  it("the mapping authority string is deterministic and order independent", () => {
    const reordered: LabEvidenceMappingAuthority = {
      ...missionV3,
      mappings: [...missionV3.mappings].reverse()
    };
    expect(buildLabMappingAuthorityCanonicalString(reordered)).toBe(
      buildLabMappingAuthorityCanonicalString(missionV3)
    );
  });

  it("the mapping authority string changes when the approved mapping changes", () => {
    const base = buildLabMappingAuthorityCanonicalString(missionV3);
    expect(buildLabMappingAuthorityCanonicalString(missionV4)).not.toBe(base);
    expect(
      buildLabMappingAuthorityCanonicalString({
        ...missionV3,
        missionVersion: 4
      })
    ).not.toBe(base);
    expect(
      buildLabMappingAuthorityCanonicalString({
        ...missionV3,
        mappings: [
          { ...missionV3.mappings[0]!, required: false },
          missionV3.mappings[1]!
        ]
      })
    ).not.toBe(base);
  });

  it("binds the frozen mapping authority into the source integrity string", () => {
    const base = buildLabValidationCanonicalString(facts());
    const drifted = buildLabValidationCanonicalString(
      facts({ mappingAuthorityDigest: "d4".repeat(32) })
    );
    expect(drifted).not.toBe(base);
    expect(base.endsWith("c3".repeat(32))).toBe(true);
  });
});
