import { describe, expect, it } from "vitest";
import {
  EVIDENCE_CORRECTION_ACTIONS,
  EVIDENCE_CORRECTION_AUTHORITY,
  evaluateCorrectionTransition,
  isEffectivelyTrustedEvidence,
  resolveEffectiveEvidenceState,
  toStudentCorrectionEntry,
  validateCorrectionReason,
  validateCreateEvidenceCorrectionInput,
  withEffectiveEvidenceState,
  type CreateEvidenceCorrectionInput,
  type EvidenceCorrectionEvent,
} from "./evidence-correction";
import type { EvidenceRecordState } from "./evidence";
import {
  deriveEvidenceOutcome,
  qualifiesAsDemonstrationEvidence
} from "./evidence-competency";
import type { StudentEvidenceRecord } from "./evidence";

const EVIDENCE_ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const REPLACEMENT = "44444444-4444-4444-8444-444444444444";

function event(
  overrides: Partial<EvidenceCorrectionEvent> = {}
): EvidenceCorrectionEvent {
  return {
    id: "correction-1",
    evidenceId: EVIDENCE_ID,
    userId: OWNER,
    sequenceNumber: 1,
    action: "invalidate",
    reason: "Validation profile defect corrected by the platform team.",
    actorId: ACTOR,
    actorRole: "founder_admin",
    previousEffectiveState: "active",
    newEffectiveState: "invalidated",
    occurredAt: "2026-08-13T00:00:00.000Z",
    metadata: {},
    ...overrides
  };
}

function input(
  overrides: Partial<CreateEvidenceCorrectionInput> = {}
): CreateEvidenceCorrectionInput {
  return {
    evidenceId: EVIDENCE_ID,
    action: "invalidate",
    reason: "Validation profile defect corrected by the platform team.",
    expectedPreviousState: "active",
    ...overrides
  };
}

describe("effective state resolution", () => {
  it("A: active Evidence with no corrections resolves active", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, []);
    expect(effective.state).toBe("active");
    expect(effective.underReview).toBe(false);
    expect(effective.correctionCount).toBe(0);
    expect(effective.sequenceValid).toBe(true);
    expect(isEffectivelyTrustedEvidence(effective)).toBe(true);
  });

  it("B: active becomes invalidated", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, [event()]);
    expect(effective.state).toBe("invalidated");
    expect(isEffectivelyTrustedEvidence(effective)).toBe(false);
    expect(effective.lastReason).toContain("Validation profile defect");
  });

  it("C: active becomes superseded and records the replacement", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, [
      event({
        action: "supersede",
        newEffectiveState: "superseded",
        supersedingEvidenceId: REPLACEMENT
      })
    ]);
    expect(effective.state).toBe("superseded");
    expect(effective.supersededByEvidenceId).toBe(REPLACEMENT);
    expect(isEffectivelyTrustedEvidence(effective)).toBe(false);
  });

  it("D: invalidated can be restored to active", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, [
      event(),
      event({
        id: "correction-2",
        sequenceNumber: 2,
        action: "restore",
        previousEffectiveState: "invalidated",
        newEffectiveState: "active",
        reason: "The invalidation was itself incorrect and has been reversed."
      })
    ]);
    expect(effective.state).toBe("active");
    expect(isEffectivelyTrustedEvidence(effective)).toBe(true);
  });

  it("D2: superseded can be restored when the supersession was wrong", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, [
      event({
        action: "supersede",
        newEffectiveState: "superseded",
        supersedingEvidenceId: REPLACEMENT
      }),
      event({
        id: "correction-2",
        sequenceNumber: 2,
        action: "restore",
        previousEffectiveState: "superseded",
        newEffectiveState: "active",
        reason: "The supersession referenced the wrong replacement Evidence."
      })
    ]);
    expect(effective.state).toBe("active");
    expect(effective.supersededByEvidenceId).toBe(undefined);
  });

  it("tracks an open review without inventing a fourth state", () => {
    const underReview = resolveEffectiveEvidenceState({ state: "active" }, [
      event({
        action: "place_under_review",
        newEffectiveState: "active",
        reason: "Reported by a student for investigation of the lab probe."
      })
    ]);
    expect(underReview.state).toBe("active");
    expect(underReview.underReview).toBe(true);

    const confirmed = resolveEffectiveEvidenceState({ state: "active" }, [
      event({
        action: "place_under_review",
        newEffectiveState: "active",
        reason: "Reported by a student for investigation of the lab probe."
      }),
      event({
        id: "correction-2",
        sequenceNumber: 2,
        action: "confirm",
        newEffectiveState: "active",
        reason: "Review concluded; the original Evidence stands unchanged."
      })
    ]);
    expect(confirmed.underReview).toBe(false);
    expect(confirmed.state).toBe("active");
  });

  it("J/E: fails closed on a sequence gap", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, [
      event({ sequenceNumber: 2 })
    ]);
    expect(effective.sequenceValid).toBe(false);
    expect(effective.sequenceError).toBe("SEQUENCE_GAP");
    expect(isEffectivelyTrustedEvidence(effective)).toBe(false);
  });

  it("E: fails closed when a recorded predecessor disagrees", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, [
      event({ previousEffectiveState: "superseded" })
    ]);
    expect(effective.sequenceValid).toBe(false);
    expect(effective.sequenceError).toBe("PREVIOUS_STATE_MISMATCH");
  });

  it("E: fails closed when a recorded successor breaks the transition rules", () => {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, [
      event({ action: "invalidate", newEffectiveState: "superseded" })
    ]);
    expect(effective.sequenceValid).toBe(false);
    expect(effective.sequenceError).toBe("INVALID_TRANSITION");
    expect(isEffectivelyTrustedEvidence(effective)).toBe(false);
  });

  it("replays events in sequence order regardless of input order", () => {
    const ordered = resolveEffectiveEvidenceState({ state: "active" }, [
      event(),
      event({
        id: "correction-2",
        sequenceNumber: 2,
        action: "restore",
        previousEffectiveState: "invalidated",
        newEffectiveState: "active",
        reason: "The invalidation was itself incorrect and has been reversed."
      })
    ]);
    const reversed = resolveEffectiveEvidenceState({ state: "active" }, [
      event({
        id: "correction-2",
        sequenceNumber: 2,
        action: "restore",
        previousEffectiveState: "invalidated",
        newEffectiveState: "active",
        reason: "The invalidation was itself incorrect and has been reversed."
      }),
      event()
    ]);
    expect(reversed).toEqual(ordered);
  });
});

describe("transition rules", () => {
  it("E: refuses invalid transitions", () => {
    const cases: Array<[EvidenceRecordState, CreateEvidenceCorrectionInput["action"]]> = [
      ["invalidated", "invalidate"],
      ["superseded", "invalidate"],
      ["invalidated", "supersede"],
      ["superseded", "supersede"],
      ["active", "restore"]
    ];

    for (const [currentState, action] of cases) {
      const decision = evaluateCorrectionTransition({
        currentState,
        currentUnderReview: false,
        action,
        hasSupersedingEvidence: action === "supersede"
      });
      expect(decision.allowed).toBe(false);
    }
  });

  it("K: supersede requires a replacement Evidence Record", () => {
    const decision = evaluateCorrectionTransition({
      currentState: "active",
      currentUnderReview: false,
      action: "supersede",
      hasSupersedingEvidence: false
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "SUPERSEDING_EVIDENCE_REQUIRED"
    });
  });

  it("rejects a replacement on a non-supersede action", () => {
    const decision = evaluateCorrectionTransition({
      currentState: "active",
      currentUnderReview: false,
      action: "invalidate",
      hasSupersedingEvidence: true
    });
    expect(decision).toEqual({
      allowed: false,
      reason: "SUPERSEDING_EVIDENCE_NOT_ALLOWED"
    });
  });

  it("refuses to conclude a review that is not open", () => {
    expect(
      evaluateCorrectionTransition({
        currentState: "active",
        currentUnderReview: false,
        action: "confirm",
        hasSupersedingEvidence: false
      })
    ).toEqual({ allowed: false, reason: "REVIEW_NOT_OPEN" });
  });

  it("refuses an unsupported action", () => {
    expect(
      evaluateCorrectionTransition({
        currentState: "active",
        currentUnderReview: false,
        action: "delete" as CreateEvidenceCorrectionInput["action"],
        hasSupersedingEvidence: false
      })
    ).toEqual({ allowed: false, reason: "ACTION_UNSUPPORTED" });
  });
});

describe("correction input validation", () => {
  it("F: requires a bounded non-blank reason", () => {
    expect(validateCorrectionReason("   ")).toBe(false);
    expect(validateCorrectionReason("")).toBe(false);
    expect(validateCorrectionReason("too short")).toBe(true);
    expect(validateCorrectionReason("x".repeat(501))).toBe(false);
    expect(validateCreateEvidenceCorrectionInput(input({ reason: "  " })).valid).toBe(
      false
    );
  });

  it("L: refuses self-supersession", () => {
    const result = validateCreateEvidenceCorrectionInput(
      input({ action: "supersede", supersedingEvidenceId: EVIDENCE_ID })
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Evidence cannot supersede itself");
  });

  it("K: refuses supersede without a replacement", () => {
    expect(
      validateCreateEvidenceCorrectionInput(input({ action: "supersede" })).valid
    ).toBe(false);
  });

  it("O: requires a stable idempotency key when one is supplied", () => {
    expect(
      validateCreateEvidenceCorrectionInput(input({ idempotencyKey: "short" })).valid
    ).toBe(false);
    expect(
      validateCreateEvidenceCorrectionInput(
        input({ idempotencyKey: "correction-request-2026-08-13-001" })
      ).valid
    ).toBe(true);
  });

  it("accepts a valid privileged correction request", () => {
    expect(validateCreateEvidenceCorrectionInput(input()).valid).toBe(true);
    expect(
      validateCreateEvidenceCorrectionInput(
        input({
          action: "supersede",
          supersedingEvidenceId: REPLACEMENT
        })
      ).valid
    ).toBe(true);
  });

  it("rejects sensitive metadata on a correction", () => {
    expect(
      validateCreateEvidenceCorrectionInput(
        input({ metadata: { serviceRoleKey: "x" } })
      ).valid
    ).toBe(false);
  });
});

describe("T/U/V/W/X: qualification follows effective state", () => {
  function qualifies(
    outcomeSource: unknown,
    events: EvidenceCorrectionEvent[]
  ): boolean {
    const effective = resolveEffectiveEvidenceState({ state: "active" }, events);
    const outcome = deriveEvidenceOutcome(outcomeSource);
    return (
      isEffectivelyTrustedEvidence(effective) &&
      qualifiesAsDemonstrationEvidence(outcome)
    );
  }

  it("positive active Evidence qualifies", () => {
    expect(qualifies("passed", [])).toBe(true);
  });

  it("T: invalidated positive Evidence stops qualifying", () => {
    expect(qualifies("passed", [event()])).toBe(false);
  });

  it("U: superseded positive Evidence stops qualifying", () => {
    expect(
      qualifies("passed", [
        event({
          action: "supersede",
          newEffectiveState: "superseded",
          supersedingEvidenceId: REPLACEMENT
        })
      ])
    ).toBe(false);
  });

  it("V: restored positive Evidence may qualify again", () => {
    expect(
      qualifies("passed", [
        event(),
        event({
          id: "correction-2",
          sequenceNumber: 2,
          action: "restore",
          previousEffectiveState: "invalidated",
          newEffectiveState: "active",
          reason: "The invalidation was itself incorrect and has been reversed."
        })
      ])
    ).toBe(true);
  });

  it("W: negative Evidence never qualifies, even when restored", () => {
    for (const negative of ["failed", "incomplete"]) {
      expect(qualifies(negative, [])).toBe(false);
      expect(
        qualifies(negative, [
          event(),
          event({
            id: "correction-2",
            sequenceNumber: 2,
            action: "restore",
            previousEffectiveState: "invalidated",
            newEffectiveState: "active",
            reason: "The invalidation was itself incorrect and has been reversed."
          })
        ])
      ).toBe(false);
    }
  });

  it("X: indeterminate Evidence never qualifies", () => {
    for (const value of ["technical_error", "interrupted", undefined, null, ""]) {
      expect(qualifies(value, [])).toBe(false);
    }
  });

  it("a broken history never qualifies", () => {
    expect(qualifies("passed", [event({ sequenceNumber: 3 })])).toBe(false);
  });
});

describe("Z: student-facing projection", () => {
  it("exposes the reason and resulting state, never the actor or metadata", () => {
    const entry = toStudentCorrectionEntry(
      event({ metadata: { internalTicket: "OPS-1" } })
    );
    const keys = Object.keys(entry);
    expect(keys).not.toContain("actorId");
    expect(keys).not.toContain("actorRole");
    expect(keys).not.toContain("metadata");
    expect(keys).not.toContain("userId");
    expect(entry.reason).toContain("Validation profile defect");
    expect(entry.newEffectiveState).toBe("invalidated");
  });

  it("attaches effective state to a student Evidence record", () => {
    const record: StudentEvidenceRecord = {
      id: EVIDENCE_ID,
      sourceType: "lab_validation",
      sourceReference: "lab-validation-run:run-1",
      sourceEngine: "lab",
      sourceOccurredAt: "2026-08-13T00:00:00.000Z",
      recordedAt: "2026-08-13T00:00:05.000Z",
      state: "active",
      integrityState: "verified",
      metadata: {}
    };

    const projected = withEffectiveEvidenceState(
      record,
      resolveEffectiveEvidenceState({ state: "active" }, [event()])
    );

    // The original recorded state is preserved alongside the effective state.
    expect(projected.state).toBe("active");
    expect(projected.effectiveState).toBe("invalidated");
    expect(projected.correctionCount).toBe(1);
    expect(projected.lastCorrectionReason).toContain("Validation profile defect");
  });
});

describe("AB: authority is fixed and non-AI", () => {
  it("only founder_admin may author a correction", () => {
    expect(EVIDENCE_CORRECTION_AUTHORITY).toBe("founder_admin");
  });

  it("no correction action implies AI or automated authority", () => {
    for (const action of EVIDENCE_CORRECTION_ACTIONS) {
      expect(/ai|llm|model|openai|anthropic|ollama|auto/i.test(action)).toBe(false);
    }
  });
});
