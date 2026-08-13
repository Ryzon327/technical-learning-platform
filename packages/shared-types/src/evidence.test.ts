import { describe, expect, it } from "vitest";
import {
  EVIDENCE_CANONICAL_VERSION,
  EVIDENCE_INTEGRITY_ALGORITHM,
  EVIDENCE_SOURCE_TYPES,
  buildEvidenceCanonicalString,
  evaluateExistingEvidenceRecord,
  isSha256Digest,
  toStudentEvidenceRecord,
  validateCreateCanonicalEvidenceInput,
  validateEvidenceMetadata,
  type CreateCanonicalEvidenceInput,
  type EvidenceRecord
} from "./evidence";

const DIGEST_A = "a1".repeat(32);
const DIGEST_B = "b2".repeat(32);

function validInput(
  overrides: Partial<CreateCanonicalEvidenceInput> = {}
): CreateCanonicalEvidenceInput {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    sourceType: "assessment_attempt",
    sourceReference: "assessment-attempt:attempt-1",
    sourceEngine: "assessment",
    sourceOccurredAt: "2026-08-13T00:00:00.000Z",
    sourceIntegrityDigest: DIGEST_A,
    ...overrides
  };
}

function evidenceRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: "evidence-1",
    userId: "11111111-1111-4111-8111-111111111111",
    sourceType: "assessment_attempt",
    sourceReference: "assessment-attempt:attempt-1",
    sourceEngine: "assessment",
    sourceOccurredAt: "2026-08-13T00:00:00.000Z",
    recordedAt: "2026-08-13T00:00:05.000Z",
    state: "active",
    integrityState: "verified",
    integrityAlgorithm: EVIDENCE_INTEGRITY_ALGORITHM,
    integrityDigest: DIGEST_B,
    sourceIntegrityDigest: DIGEST_A,
    metadata: {},
    ...overrides
  };
}

describe("canonical evidence validation", () => {
  it("A: accepts valid canonical evidence input", () => {
    expect(validateCreateCanonicalEvidenceInput(validInput()).valid).toBe(true);
  });

  it("B: rejects missing user id", () => {
    const result = validateCreateCanonicalEvidenceInput(
      validInput({ userId: "  " })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("userId is required");
  });

  it("C: rejects a blank source reference", () => {
    const result = validateCreateCanonicalEvidenceInput(
      validInput({ sourceReference: "   " })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("sourceReference is required");
  });

  it("D: rejects an unsupported source type", () => {
    const result = validateCreateCanonicalEvidenceInput(
      validInput({
        sourceType:
          "ai_inference" as unknown as CreateCanonicalEvidenceInput["sourceType"]
      })
    );
    expect(result.valid).toBe(false);
  });

  it("D2: rejects an unsupported source engine", () => {
    const result = validateCreateCanonicalEvidenceInput(
      validInput({
        sourceEngine:
          "ai" as unknown as CreateCanonicalEvidenceInput["sourceEngine"]
      })
    );
    expect(result.valid).toBe(false);
  });

  it("E: rejects a malformed SHA-256 digest", () => {
    for (const digest of ["", "abc", DIGEST_A.toUpperCase(), `${DIGEST_A}00`]) {
      expect(
        validateCreateCanonicalEvidenceInput(
          validInput({ sourceIntegrityDigest: digest })
        ).valid
      ).toBe(false);
    }
    expect(isSha256Digest(DIGEST_A)).toBe(true);
  });

  it("rejects an invalid source occurrence timestamp", () => {
    expect(
      validateCreateCanonicalEvidenceInput(
        validInput({ sourceOccurredAt: "not-a-timestamp" })
      ).valid
    ).toBe(false);
  });

  it("rejects unbounded or sensitive metadata", () => {
    expect(validateEvidenceMetadata({ serviceRoleKey: "x" }).valid).toBe(false);
    expect(validateEvidenceMetadata({ dockerContainerId: "x" }).valid).toBe(false);
    expect(validateEvidenceMetadata({ nested: { a: 1 } }).valid).toBe(false);
    expect(validateEvidenceMetadata({ assessmentVersion: 2 }).valid).toBe(true);
  });
});

describe("canonical evidence integrity", () => {
  it("F: builds a deterministic canonical string", () => {
    const input = validInput();
    expect(buildEvidenceCanonicalString(input)).toBe(
      buildEvidenceCanonicalString(input)
    );
    expect(buildEvidenceCanonicalString(input).startsWith(
      `${EVIDENCE_CANONICAL_VERSION}|`
    )).toBe(true);
  });

  it("G: produces the same canonical string for equivalent input", () => {
    expect(
      buildEvidenceCanonicalString(
        validInput({ sourceOccurredAt: "2026-08-13T00:00:00Z" })
      )
    ).toBe(
      buildEvidenceCanonicalString(
        validInput({ sourceOccurredAt: "2026-08-13T00:00:00.000Z" })
      )
    );
  });

  it("H: changes the canonical string when provenance changes materially", () => {
    const base = buildEvidenceCanonicalString(validInput());
    expect(
      buildEvidenceCanonicalString(validInput({ sourceReference: "other" }))
    ).not.toBe(base);
    expect(
      buildEvidenceCanonicalString(validInput({ sourceEngine: "lab" }))
    ).not.toBe(base);
    expect(
      buildEvidenceCanonicalString(validInput({ sourceIntegrityDigest: DIGEST_B }))
    ).not.toBe(base);
    expect(
      buildEvidenceCanonicalString(
        validInput({ sourceOccurredAt: "2026-08-14T00:00:00.000Z" })
      )
    ).not.toBe(base);
  });

  it("does not fold metadata into the canonical string", () => {
    expect(
      buildEvidenceCanonicalString(
        validInput({ metadata: { note: "a" } })
      )
    ).toBe(buildEvidenceCanonicalString(validInput()));
  });
});

describe("canonical evidence idempotency", () => {
  const candidate = {
    ...validInput(),
    integrityDigest: DIGEST_B
  };

  it("I: treats a matching trusted source event as idempotent", () => {
    expect(evaluateExistingEvidenceRecord(evidenceRecord(), candidate)).toEqual({
      kind: "match"
    });
  });

  it("J: fails closed when the evidence digest differs", () => {
    const decision = evaluateExistingEvidenceRecord(
      evidenceRecord({ integrityDigest: DIGEST_A }),
      candidate
    );
    expect(decision.kind).toBe("conflict");
  });

  it("J2: fails closed when upstream provenance differs", () => {
    expect(
      evaluateExistingEvidenceRecord(
        evidenceRecord({ sourceIntegrityDigest: DIGEST_B }),
        candidate
      ).kind
    ).toBe("conflict");

    expect(
      evaluateExistingEvidenceRecord(
        evidenceRecord({ sourceEngine: "lab" }),
        candidate
      ).kind
    ).toBe("conflict");

    expect(
      evaluateExistingEvidenceRecord(
        evidenceRecord({ sourceOccurredAt: "2026-08-14T00:00:00.000Z" }),
        candidate
      ).kind
    ).toBe("conflict");
  });
});

describe("canonical evidence boundaries", () => {
  it("O: source types never include AI authority", () => {
    for (const sourceType of EVIDENCE_SOURCE_TYPES) {
      expect(/ai|llm|model|openai|anthropic|ollama/i.test(sourceType)).toBe(false);
    }
  });

  it("P: practice or diagnostic wording confers no authority", () => {
    for (const sourceType of EVIDENCE_SOURCE_TYPES) {
      expect(/practice|diagnostic/i.test(sourceType)).toBe(false);
    }

    const practiceHint = validateCreateCanonicalEvidenceInput(
      validInput({
        metadata: { assessmentPurpose: "practice", evidenceEligible: true }
      })
    );
    const plain = validateCreateCanonicalEvidenceInput(validInput());

    // Metadata wording changes nothing about canonical acceptance.
    expect(practiceHint.valid).toBe(plain.valid);
    expect(
      buildEvidenceCanonicalString(
        validInput({ metadata: { assessmentPurpose: "practice" } })
      )
    ).toBe(buildEvidenceCanonicalString(validInput()));
  });

  it("N: the student projection omits provenance digests", () => {
    const projected = toStudentEvidenceRecord(evidenceRecord());
    expect(Object.keys(projected)).not.toContain("integrityDigest");
    expect(Object.keys(projected)).not.toContain("sourceIntegrityDigest");
    expect(Object.keys(projected)).not.toContain("userId");
    expect(projected.integrityState).toBe("verified");
  });
});
