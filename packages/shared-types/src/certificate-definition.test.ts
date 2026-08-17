import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_DEFINITION_MATERIAL_FIELDS,
  CERTIFICATE_DEFINITION_STATES,
  CERTIFICATE_EXPIRATION_MAX_MONTHS,
  CERTIFICATE_EXPIRATION_MIN_MONTHS,
  detectCertificateDefinitionMaterialChanges,
  evaluateCertificateDefinitionEdit,
  isCertificateDefinitionState,
  isValidCertificateDefinitionTransition,
  isValidCertificateDefinitionVersion,
  isValidCertificateExpirationMonths,
  isValidVerificationPermitted,
  normalizeCertificateDefinitionStableId,
  validateCertificateCompetencyRequirements,
  validateCertificateDefinitionForPublicationShape,
  validateCertificateDefinitionSupersession,
  validateCertificateEvidencePolicies,
  validateCreateCertificateDefinitionInput,
  type CertificateDefinition,
  type CreateCertificateDefinitionInput
} from "./certificate-definition";

function validInput(
  overrides: Partial<CreateCertificateDefinitionInput> = {}
): CreateCertificateDefinitionInput {
  return {
    stableId: "certdef-net-foundations-001",
    title: "Network Foundations",
    issuer: "Technical Learning Platform",
    effectiveAt: "2026-08-13T00:00:00.000Z",
    expirationMonths: null,
    verificationPermitted: false,
    presentation: { plainLanguageTitle: "Network Foundations Certificate" },
    requiredCompetencies: [
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3,
        required: true
      }
    ],
    evidencePolicies: [
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ],
    ...overrides
  };
}

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
    evidencePolicies: [
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ],
    ...overrides
  };
}

function codes(issues: { code: string }[]): string[] {
  return issues.map((issue) => issue.code);
}

describe("stable id normalization and validation", () => {
  it("A: normalizes the Feature Registry example id to lowercase", () => {
    expect(
      normalizeCertificateDefinitionStableId("CERTDEF-NET-FOUNDATIONS-001")
    ).toBe("certdef-net-foundations-001");
  });

  it("A2: trims surrounding whitespace", () => {
    expect(
      normalizeCertificateDefinitionStableId("  certdef-net-001  ")
    ).toBe("certdef-net-001");
  });

  it("B: rejects ids that are too short, blank, or badly formed", () => {
    expect(normalizeCertificateDefinitionStableId("ab")).toBeNull();
    expect(normalizeCertificateDefinitionStableId("   ")).toBeNull();
    expect(normalizeCertificateDefinitionStableId("-leading-hyphen")).toBeNull();
    expect(normalizeCertificateDefinitionStableId("has spaces")).toBeNull();
    expect(normalizeCertificateDefinitionStableId("has/slash")).toBeNull();
    expect(normalizeCertificateDefinitionStableId("a".repeat(121))).toBeNull();
  });

  it("B2: surfaces an invalid stable id through input validation", () => {
    const result = validateCreateCertificateDefinitionInput(
      validInput({ stableId: "no" })
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("INVALID_STABLE_ID");
  });
});

describe("version validation", () => {
  it("C: accepts positive integers only", () => {
    expect(isValidCertificateDefinitionVersion(1)).toBe(true);
    expect(isValidCertificateDefinitionVersion(42)).toBe(true);
    expect(isValidCertificateDefinitionVersion(0)).toBe(false);
    expect(isValidCertificateDefinitionVersion(-1)).toBe(false);
    expect(isValidCertificateDefinitionVersion(1.5)).toBe(false);
    expect(isValidCertificateDefinitionVersion("1")).toBe(false);
    expect(isValidCertificateDefinitionVersion(null)).toBe(false);
  });

  it("C2: blocks publication when the version is not a positive integer", () => {
    const result = validateCertificateDefinitionForPublicationShape(
      definition({ version: 0 })
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("INVALID_VERSION");
  });
});

describe("publication state validation", () => {
  it("D: recognises exactly the four curriculum publication states", () => {
    expect(CERTIFICATE_DEFINITION_STATES).toEqual([
      "draft",
      "review",
      "published",
      "retired"
    ]);
    for (const state of CERTIFICATE_DEFINITION_STATES) {
      expect(isCertificateDefinitionState(state)).toBe(true);
    }
    expect(isCertificateDefinitionState("issued")).toBe(false);
    expect(isCertificateDefinitionState("revoked")).toBe(false);
    expect(isCertificateDefinitionState("expired")).toBe(false);
    expect(isCertificateDefinitionState(undefined)).toBe(false);
  });

  it("D2: follows the existing curriculum transition rules", () => {
    expect(isValidCertificateDefinitionTransition("draft", "review")).toBe(true);
    expect(isValidCertificateDefinitionTransition("review", "published")).toBe(
      true
    );
    expect(isValidCertificateDefinitionTransition("published", "retired")).toBe(
      true
    );
    expect(isValidCertificateDefinitionTransition("retired", "draft")).toBe(
      true
    );

    // A draft can never reach published without passing through review.
    expect(isValidCertificateDefinitionTransition("draft", "published")).toBe(
      false
    );
    // A published definition can never be pulled back into editing.
    expect(isValidCertificateDefinitionTransition("published", "draft")).toBe(
      false
    );
    expect(isValidCertificateDefinitionTransition("published", "review")).toBe(
      false
    );
  });
});

describe("expiration policy", () => {
  it("E: accepts null, meaning the certificate does not expire", () => {
    expect(isValidCertificateExpirationMonths(null)).toBe(true);
    expect(
      validateCreateCertificateDefinitionInput(
        validInput({ expirationMonths: null })
      ).valid
    ).toBe(true);
  });

  it("F: accepts the lower bound of 1 month", () => {
    expect(CERTIFICATE_EXPIRATION_MIN_MONTHS).toBe(1);
    expect(isValidCertificateExpirationMonths(1)).toBe(true);
    expect(
      validateCreateCertificateDefinitionInput(
        validInput({ expirationMonths: 1 })
      ).valid
    ).toBe(true);
  });

  it("G: accepts the upper bound of 600 months", () => {
    expect(CERTIFICATE_EXPIRATION_MAX_MONTHS).toBe(600);
    expect(isValidCertificateExpirationMonths(600)).toBe(true);
    expect(
      validateCreateCertificateDefinitionInput(
        validInput({ expirationMonths: 600 })
      ).valid
    ).toBe(true);
  });

  it("H: rejects 0 months", () => {
    expect(isValidCertificateExpirationMonths(0)).toBe(false);
    const result = validateCreateCertificateDefinitionInput(
      validInput({ expirationMonths: 0 })
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("INVALID_EXPIRATION_MONTHS");
  });

  it("I: rejects more than 600 months", () => {
    expect(isValidCertificateExpirationMonths(601)).toBe(false);
    const result = validateCreateCertificateDefinitionInput(
      validInput({ expirationMonths: 601 })
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("INVALID_EXPIRATION_MONTHS");
  });

  it("I2: rejects negative and non-integer month windows", () => {
    expect(isValidCertificateExpirationMonths(-1)).toBe(false);
    expect(isValidCertificateExpirationMonths(12.5)).toBe(false);
    expect(isValidCertificateExpirationMonths("12")).toBe(false);
  });

  it("I3: is declarative only and computes no expiry date", () => {
    // The model exposes a validity window, never a resolved expiry timestamp
    // and never a revalidation model. CERT-004 owns lifecycle.
    const model = definition({ expirationMonths: 24 });
    expect(model.expirationMonths).toBe(24);
    expect(model).not.toHaveProperty("expiresAt");
    expect(model).not.toHaveProperty("expiresOn");
    expect(model).not.toHaveProperty("revalidationType");
    expect(model).not.toHaveProperty("revalidationPolicy");
  });
});

describe("verification policy", () => {
  it("J: accepts booleans only", () => {
    expect(isValidVerificationPermitted(true)).toBe(true);
    expect(isValidVerificationPermitted(false)).toBe(true);
    expect(isValidVerificationPermitted("true")).toBe(false);
    expect(isValidVerificationPermitted(1)).toBe(false);
    expect(isValidVerificationPermitted(null)).toBe(false);
  });

  it("J2: rejects a non-boolean verification declaration", () => {
    const result = validateCreateCertificateDefinitionInput(
      validInput({
        verificationPermitted: "yes" as unknown as boolean
      })
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("INVALID_VERIFICATION_PERMITTED");
  });

  it("J3: is declarative only and mints no verification identifier", () => {
    const model = definition({ verificationPermitted: true });
    expect(model.verificationPermitted).toBe(true);
    expect(model).not.toHaveProperty("verificationId");
    expect(model).not.toHaveProperty("verificationCode");
    expect(model).not.toHaveProperty("verificationUrl");
    expect(model).not.toHaveProperty("publicVerificationEnabled");
  });
});

describe("required competency references", () => {
  it("K: preserves the exact pinned competency version", () => {
    const result = validateCertificateCompetencyRequirements([
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3,
        required: true
      }
    ]);
    expect(result).toHaveLength(0);

    const model = definition();
    expect(model.requiredCompetencies[0]?.competencyVersion).toBe(3);
  });

  it("K2: never accepts a symbolic version in place of an exact one", () => {
    for (const version of ["latest", "current", null, 0, -1, 2.5]) {
      const issues = validateCertificateCompetencyRequirements([
        {
          competencyStableId: "competency.networking.subnetting",
          competencyVersion: version as unknown as number,
          required: true
        }
      ]);
      expect(codes(issues)).toContain("INVALID_COMPETENCY_REFERENCE");
    }
  });

  it("L: rejects an invalid competency stable id", () => {
    const issues = validateCertificateCompetencyRequirements([
      { competencyStableId: "no", competencyVersion: 1, required: true }
    ]);
    expect(codes(issues)).toContain("INVALID_COMPETENCY_REFERENCE");
  });

  it("L2: rejects the same competency version required twice", () => {
    const issues = validateCertificateCompetencyRequirements([
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3,
        required: true
      },
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3,
        required: false
      }
    ]);
    expect(codes(issues)).toContain("DUPLICATE_COMPETENCY_REQUIREMENT");
  });

  it("L3: treats two versions of one competency as distinct requirements", () => {
    const issues = validateCertificateCompetencyRequirements([
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 3,
        required: true
      },
      {
        competencyStableId: "competency.networking.subnetting",
        competencyVersion: 4,
        required: true
      }
    ]);
    expect(issues).toHaveLength(0);
  });

  it("M: blocks publication when nothing is required", () => {
    const result = validateCertificateDefinitionForPublicationShape(
      definition({ requiredCompetencies: [] })
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("MISSING_REQUIRED_COMPETENCY");
  });

  it("M2: blocks publication when every competency is optional", () => {
    const result = validateCertificateDefinitionForPublicationShape(
      definition({
        requiredCompetencies: [
          {
            competencyStableId: "competency.networking.subnetting",
            competencyVersion: 3,
            required: false
          }
        ]
      })
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("MISSING_REQUIRED_COMPETENCY");
  });
});

describe("declarative evidence policies", () => {
  it("N: accepts a well-formed policy", () => {
    expect(
      validateCertificateEvidencePolicies([
        {
          evidenceSourceType: "assessment_attempt",
          minimumCount: 2,
          requirePositiveOutcome: true
        }
      ])
    ).toHaveLength(0);
  });

  it("N2: rejects an unsupported evidence source type", () => {
    const issues = validateCertificateEvidencePolicies([
      {
        evidenceSourceType: "ai_attestation" as never,
        minimumCount: 1,
        requirePositiveOutcome: true
      }
    ]);
    expect(codes(issues)).toContain("INVALID_EVIDENCE_POLICY");
  });

  it("N3: rejects a non-positive or oversized minimum count", () => {
    for (const minimumCount of [0, -1, 101, 1.5]) {
      const issues = validateCertificateEvidencePolicies([
        {
          evidenceSourceType: "lab_validation",
          minimumCount,
          requirePositiveOutcome: true
        }
      ]);
      expect(codes(issues)).toContain("INVALID_EVIDENCE_POLICY");
    }
  });

  it("N4: rejects duplicate policies for one source type", () => {
    const issues = validateCertificateEvidencePolicies([
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 1,
        requirePositiveOutcome: true
      },
      {
        evidenceSourceType: "lab_validation",
        minimumCount: 2,
        requirePositiveOutcome: false
      }
    ]);
    expect(codes(issues)).toContain("DUPLICATE_EVIDENCE_POLICY");
  });
});

describe("published material immutability", () => {
  it("O: rejects every material change to a published definition", () => {
    const published = definition({ publicationState: "published" });

    const materialEdits: Array<Partial<CertificateDefinition>> = [
      { stableId: "certdef-other-001" },
      { version: 2 },
      { issuer: "Someone Else" },
      { effectiveAt: "2027-01-01T00:00:00.000Z" },
      { expirationMonths: 24 },
      { verificationPermitted: true },
      {
        requiredCompetencies: [
          {
            competencyStableId: "competency.networking.subnetting",
            competencyVersion: 4,
            required: true
          }
        ]
      },
      {
        evidencePolicies: [
          {
            evidenceSourceType: "assessment_attempt",
            minimumCount: 1,
            requirePositiveOutcome: true
          }
        ]
      }
    ];

    for (const edit of materialEdits) {
      const result = evaluateCertificateDefinitionEdit(published, edit);
      expect(result.valid).toBe(false);
      expect(codes(result.issues)).toContain(
        "MATERIAL_CHANGE_TO_PUBLISHED_DEFINITION"
      );
    }
  });

  it("O2: swapping a required competency to a new version is material", () => {
    const published = definition({ publicationState: "published" });
    // This is the exact drift CERT-001 section 2 exists to prevent: a
    // curriculum update silently changing what the certificate meant.
    expect(
      detectCertificateDefinitionMaterialChanges(published, {
        requiredCompetencies: [
          {
            competencyStableId: "competency.networking.subnetting",
            competencyVersion: 4,
            required: true
          }
        ]
      })
    ).toContain("requiredCompetencies");
  });

  it("O3: flipping a competency from required to optional is material", () => {
    const published = definition({ publicationState: "published" });
    expect(
      detectCertificateDefinitionMaterialChanges(published, {
        requiredCompetencies: [
          {
            competencyStableId: "competency.networking.subnetting",
            competencyVersion: 3,
            required: false
          }
        ]
      })
    ).toContain("requiredCompetencies");
  });

  it("O4: reordering identical requirements is not a material change", () => {
    const published = definition({
      publicationState: "published",
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
      detectCertificateDefinitionMaterialChanges(published, {
        requiredCompetencies: [
          {
            competencyStableId: "competency.b",
            competencyVersion: 2,
            required: true
          },
          {
            competencyStableId: "competency.a",
            competencyVersion: 1,
            required: true
          }
        ]
      })
    ).toEqual([]);
  });

  it("P: allows presentational correction of a published definition", () => {
    const published = definition({ publicationState: "published" });
    // CERT-001 section 7 keeps ids stable across display-title changes, and
    // section 10 requires presentation metadata that can be improved without
    // reissuing certificates.
    const result = evaluateCertificateDefinitionEdit(published, {
      title: "Network Foundations (Updated Title)",
      description: "A clearer description.",
      presentation: {
        plainLanguageTitle: "Network Foundations Certificate",
        logoTextAlternative: "Platform seal"
      }
    });
    expect(result.valid).toBe(true);
  });

  it("P2: allows material edits while the definition is still a draft", () => {
    const draft = definition({ publicationState: "draft" });
    expect(
      evaluateCertificateDefinitionEdit(draft, { expirationMonths: 24 }).valid
    ).toBe(true);
    expect(
      evaluateCertificateDefinitionEdit(draft, { verificationPermitted: true })
        .valid
    ).toBe(true);
  });

  it("P3: material field set matches what the migration freezes", () => {
    expect([...CERTIFICATE_DEFINITION_MATERIAL_FIELDS]).toEqual([
      "stableId",
      "version",
      "issuer",
      "effectiveAt",
      "expirationMonths",
      "verificationPermitted",
      "requiredCompetencies",
      "evidencePolicies"
    ]);
    // Lifecycle and supersession are the mechanisms themselves; freezing them
    // would make retirement and supersession impossible.
    expect(CERTIFICATE_DEFINITION_MATERIAL_FIELDS).not.toContain(
      "publicationState"
    );
    expect(CERTIFICATE_DEFINITION_MATERIAL_FIELDS).not.toContain(
      "supersededByDefinitionId"
    );
  });
});

describe("supersession", () => {
  it("Q: rejects self-supersession", () => {
    const result = validateCertificateDefinitionSupersession("def-a", "def-a");
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("SELF_SUPERSESSION");
  });

  it("R: rejects a direct two-definition cycle", () => {
    // def-b is already superseded by def-a; pointing def-a at def-b closes it.
    const links = new Map<string, string | null>([["def-b", "def-a"]]);
    const result = validateCertificateDefinitionSupersession(
      "def-a",
      "def-b",
      links
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("CIRCULAR_SUPERSESSION");
  });

  it("R2: rejects a longer indirect cycle", () => {
    const links = new Map<string, string | null>([
      ["def-b", "def-c"],
      ["def-c", "def-d"],
      ["def-d", "def-a"]
    ]);
    const result = validateCertificateDefinitionSupersession(
      "def-a",
      "def-b",
      links
    );
    expect(result.valid).toBe(false);
    expect(codes(result.issues)).toContain("CIRCULAR_SUPERSESSION");
  });

  it("R3: accepts a valid forward supersession chain", () => {
    const links = new Map<string, string | null>([
      ["def-b", "def-c"],
      ["def-c", null]
    ]);
    expect(
      validateCertificateDefinitionSupersession("def-a", "def-b", links).valid
    ).toBe(true);
  });

  it("R4: models no prerequisite certificate relationship", () => {
    const model = definition();
    expect(model).not.toHaveProperty("prerequisiteCertificateIds");
    expect(model).not.toHaveProperty("prerequisiteCertificates");
    expect(model).not.toHaveProperty("requiredCertificates");
  });
});

describe("CERT-001 scope boundary", () => {
  it("S: the definition model carries no student or issuance concept", () => {
    const model = definition();
    for (const forbidden of [
      "userId",
      "studentId",
      "holderId",
      "issuedAt",
      "issuedTo",
      "certificateId",
      "eligible",
      "eligibility",
      "revoked",
      "revokedAt"
    ]) {
      expect(model).not.toHaveProperty(forbidden);
    }
  });

  it("S2: a valid definition passes full input validation", () => {
    const result = validateCreateCertificateDefinitionInput(validInput());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("S3: requires a title, issuer, accessible title and effective date", () => {
    expect(
      codes(
        validateCreateCertificateDefinitionInput(validInput({ title: "  " }))
          .issues
      )
    ).toContain("MISSING_TITLE");

    expect(
      codes(
        validateCreateCertificateDefinitionInput(validInput({ issuer: "  " }))
          .issues
      )
    ).toContain("MISSING_ISSUER");

    expect(
      codes(
        validateCreateCertificateDefinitionInput(
          validInput({ presentation: { plainLanguageTitle: "   " } })
        ).issues
      )
    ).toContain("MISSING_PLAIN_LANGUAGE_TITLE");

    expect(
      codes(
        validateCreateCertificateDefinitionInput(
          validInput({ effectiveAt: "not-a-date" })
        ).issues
      )
    ).toContain("INVALID_EFFECTIVE_AT");
  });
});
