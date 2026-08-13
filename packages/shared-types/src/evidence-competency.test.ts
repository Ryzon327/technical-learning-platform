import { describe, expect, it } from "vitest";
import {
  EVIDENCE_COMPETENCY_LINK_SOURCES,
  EVIDENCE_COMPETENCY_RELATIONSHIPS,
  classifyCompetencyReference,
  describeEvidenceCompetencyLinkSource,
  evaluateEvidenceLinkEligibility,
  evaluateExistingEvidenceCompetencyLink,
  isCompetencyStableId,
  isCompetencyVersion,
  toStudentEvidenceCompetencyLink,
  validateCreateEvidenceCompetencyLinkInput,
  type CompetencyDefinitionReference,
  type CreateEvidenceCompetencyLinkInput,
  type EvidenceCompetencyLink
} from "./evidence-competency";
import { decideCompetencyTransition } from "./competency";

function validInput(
  overrides: Partial<CreateEvidenceCompetencyLinkInput> = {}
): CreateEvidenceCompetencyLinkInput {
  return {
    evidenceId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    competencyStableId: "competency.network.subnetting",
    competencyVersion: 2,
    relationship: "required",
    linkSource: "approved_curriculum_mapping",
    ...overrides
  };
}

function link(
  overrides: Partial<EvidenceCompetencyLink> = {}
): EvidenceCompetencyLink {
  return {
    id: "link-1",
    evidenceId: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    competencyId: "33333333-3333-4333-8333-333333333333",
    competencyStableId: "competency.network.subnetting",
    competencyVersion: 2,
    relationship: "required",
    linkSource: "approved_curriculum_mapping",
    linkedAt: "2026-08-13T00:00:00.000Z",
    metadata: {},
    ...overrides
  };
}

function definition(
  overrides: Partial<CompetencyDefinitionReference> = {}
): CompetencyDefinitionReference {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    stableId: "competency.network.subnetting",
    version: 2,
    title: "Design and apply IPv4 subnetting",
    description: "Plan address space and apply subnet masks correctly.",
    publicationState: "published",
    ...overrides
  };
}

describe("evidence competency link validation", () => {
  it("A: accepts a valid trusted mapping request", () => {
    expect(validateCreateEvidenceCompetencyLinkInput(validInput()).valid).toBe(
      true
    );
  });

  it("C: accepts the required relationship", () => {
    expect(
      validateCreateEvidenceCompetencyLinkInput(
        validInput({ relationship: "required" })
      ).valid
    ).toBe(true);
  });

  it("D: accepts the supporting relationship", () => {
    expect(
      validateCreateEvidenceCompetencyLinkInput(
        validInput({ relationship: "supporting" })
      ).valid
    ).toBe(true);
  });

  it("rejects an unapproved relationship", () => {
    const result = validateCreateEvidenceCompetencyLinkInput(
      validInput({
        relationship:
          "mastered" as unknown as CreateEvidenceCompetencyLinkInput["relationship"]
      })
    );
    expect(result.valid).toBe(false);
  });

  it("J: rejects an invalid competency version", () => {
    for (const version of [0, -1, 1.5, Number.NaN]) {
      expect(
        validateCreateEvidenceCompetencyLinkInput(
          validInput({ competencyVersion: version })
        ).valid
      ).toBe(false);
    }
    expect(isCompetencyVersion(1)).toBe(true);
  });

  it("rejects a malformed competency stable identifier", () => {
    for (const stableId of ["", "  ", "AB", "Competency.Upper", "x"]) {
      expect(isCompetencyStableId(stableId)).toBe(false);
    }
    expect(isCompetencyStableId("competency.network.subnetting")).toBe(true);
  });

  it("rejects missing evidence or user identifiers", () => {
    expect(
      validateCreateEvidenceCompetencyLinkInput(validInput({ evidenceId: " " }))
        .valid
    ).toBe(false);
    expect(
      validateCreateEvidenceCompetencyLinkInput(validInput({ userId: "" })).valid
    ).toBe(false);
  });

  it("rejects unbounded or sensitive mapping metadata", () => {
    expect(
      validateCreateEvidenceCompetencyLinkInput(
        validInput({ metadata: { serviceRoleKey: "x" } })
      ).valid
    ).toBe(false);
    expect(
      validateCreateEvidenceCompetencyLinkInput(
        validInput({ metadata: { approvedBy: "curriculum-config" } })
      ).valid
    ).toBe(true);
  });
});

describe("evidence eligibility for trusted competency proof", () => {
  it("accepts active verified evidence", () => {
    expect(
      evaluateEvidenceLinkEligibility({
        state: "active",
        integrityState: "verified"
      })
    ).toEqual({ eligible: true });
  });

  it("F: rejects invalidated and superseded evidence", () => {
    for (const state of ["invalidated", "superseded"] as const) {
      const decision = evaluateEvidenceLinkEligibility({
        state,
        integrityState: "verified"
      });
      expect(decision.eligible).toBe(false);
    }
  });

  it("G: rejects mismatch and unverified integrity", () => {
    for (const integrityState of ["mismatch", "unverified"] as const) {
      const decision = evaluateEvidenceLinkEligibility({
        state: "active",
        integrityState
      });
      expect(decision.eligible).toBe(false);
    }
  });
});

describe("evidence competency link idempotency", () => {
  const candidate = {
    userId: "22222222-2222-4222-8222-222222222222",
    competencyId: "33333333-3333-4333-8333-333333333333",
    linkSource: "approved_curriculum_mapping" as const
  };

  it("E: treats an identical trusted mapping as idempotent", () => {
    expect(evaluateExistingEvidenceCompetencyLink(link(), candidate)).toEqual({
      kind: "match"
    });
  });

  it("ignores descriptive metadata differences", () => {
    expect(
      evaluateExistingEvidenceCompetencyLink(
        link({ metadata: { approvedBy: "curriculum-config" } }),
        candidate
      ).kind
    ).toBe("match");
  });

  it("fails closed on a divergent trusted mapping source", () => {
    expect(
      evaluateExistingEvidenceCompetencyLink(
        link({ linkSource: "authoritative_manual_mapping" }),
        candidate
      )
    ).toEqual({ kind: "conflict", reason: "link_source_mismatch" });
  });

  it("K: fails closed on an owner mismatch", () => {
    expect(
      evaluateExistingEvidenceCompetencyLink(
        link({ userId: "44444444-4444-4444-8444-444444444444" }),
        candidate
      )
    ).toEqual({ kind: "conflict", reason: "owner_mismatch" });
  });

  it("fails closed when the competency definition row differs", () => {
    expect(
      evaluateExistingEvidenceCompetencyLink(
        link({ competencyId: "55555555-5555-4555-8555-555555555555" }),
        candidate
      )
    ).toEqual({ kind: "conflict", reason: "competency_definition_mismatch" });
  });
});

describe("historical competency version preservation", () => {
  it("B: the student projection preserves the linked competency version", () => {
    const projected = toStudentEvidenceCompetencyLink(
      link({ competencyVersion: 2 }),
      definition({ version: 2 }),
      2
    );
    expect(projected.competencyVersion).toBe(2);
    expect(projected.competencyReferenceState).toBe("current");
  });

  it("T: a newer published version does not rewrite the historical link", () => {
    const projected = toStudentEvidenceCompetencyLink(
      link({ competencyVersion: 2 }),
      definition({ version: 2 }),
      5
    );
    expect(projected.competencyVersion).toBe(2);
    expect(projected.competencyReferenceState).toBe("superseded_version");
  });

  it("classifies retired and missing competency references safely", () => {
    expect(
      classifyCompetencyReference({
        linkedVersion: 2,
        definition: definition({ publicationState: "retired" }),
        latestPublishedVersion: 3
      })
    ).toBe("retired");

    expect(
      classifyCompetencyReference({
        linkedVersion: 2,
        definition: null,
        latestPublishedVersion: null
      })
    ).toBe("missing");
  });

  it("N: the student projection omits ownership and internal identifiers", () => {
    const projected = toStudentEvidenceCompetencyLink(link(), definition(), 2);
    const keys = Object.keys(projected);
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("competencyId");
    expect(keys).not.toContain("metadata");
    expect(projected.competencyTitle).toBe("Design and apply IPv4 subnetting");
    expect(projected.linkSourceDescription.length).toBeGreaterThan(0);
  });
});

describe("evidence competency mapping boundaries", () => {
  it("O: no mapping source grants AI authority", () => {
    for (const source of EVIDENCE_COMPETENCY_LINK_SOURCES) {
      expect(/ai|llm|model|openai|anthropic|ollama/i.test(source)).toBe(false);
      expect(
        /ai |llm|model decision/i.test(describeEvidenceCompetencyLinkSource(source))
      ).toBe(false);
    }
  });

  it("no relationship value implies mastery", () => {
    for (const relationship of EVIDENCE_COMPETENCY_RELATIONSHIPS) {
      expect(/master|demonstrated|award|certif/i.test(relationship)).toBe(false);
    }
  });

  it("Q: existing competency transition rules remain unchanged", () => {
    expect(decideCompetencyTransition("developing", 1).to).toBe("demonstrated");
    expect(decideCompetencyTransition("demonstrated", 0).to).toBe("demonstrated");
    expect(decideCompetencyTransition("not_started", 0).to).toBe("developing");
    expect(decideCompetencyTransition("demonstrated", 1, true).to).toBe(
      "needs_review"
    );
  });
});
