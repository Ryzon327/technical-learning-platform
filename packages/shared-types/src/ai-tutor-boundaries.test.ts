import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_AUTHORITY_PROHIBITIONS,
  AI_TUTOR_BOUNDARY_MODEL_VERSION,
  AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS,
  TUTOR_DEFERRAL_SUBJECTS,
  TUTOR_DETERMINISTIC_AUTHORITIES,
  TUTOR_LAB_ATTESTATION_SOURCE,
  TUTOR_LAB_UNAVAILABLE_REASONS,
  buildTutorDeterministicDeferral,
  buildTutorNoteSuggestion,
  classifyTutorLabState,
  containsForbiddenAuthorityField,
  describeTutorLabUnavailable,
  tutorLabStateUnavailable,
  tutorMayWriteLearnerNote
} from "./ai-tutor-boundaries";

/**
 * The deterministic boundary, proven rather than documented.
 *
 * SCOPE OF THIS EVIDENCE, stated honestly: these are contract-level proofs over
 * a pure module. They establish that the Tutor foundation cannot EXPRESS a
 * deterministic verdict and fails closed on an untrusted lab claim. They do not
 * and cannot prove that a future product surface wires them up correctly —
 * that is the integration requirement each consuming package carries.
 */

describe("the authority prohibitions are recorded as data", () => {
  it("stamps the model version", () => {
    expect(AI_TUTOR_BOUNDARY_MODEL_VERSION).toBe("ai-tutor-boundary-v1");
  });

  it("names every non-negotiable product boundary", () => {
    const text = AI_TUTOR_AUTHORITY_PROHIBITIONS.join(" ").toLowerCase();

    for (const subject of [
      "lab is correct",
      "mastery",
      "deterministic validation",
      "scoring",
      "evidence",
      "private learner note",
      "another learner",
      "citation"
    ]) {
      expect(text).toContain(subject);
    }
  });

  it("names an owner for every deterministic fact, and it is never the Tutor", () => {
    const owners = Object.values(TUTOR_DETERMINISTIC_AUTHORITIES);

    expect(owners.length).toBeGreaterThan(0);
    for (const owner of owners) {
      expect(owner.toLowerCase()).not.toContain("tutor");
      expect(owner.length).toBeGreaterThan(0);
    }
  });
});

describe("output claiming deterministic authority is detected", () => {
  it("detects a top-level lab verdict", () => {
    expect(containsForbiddenAuthorityField({ labPassed: true })).toBe(true);
  });

  it("detects a nested lab verdict", () => {
    expect(
      containsForbiddenAuthorityField({ result: { inner: { labCorrect: true } } })
    ).toBe(true);
  });

  it("detects a verdict inside an array", () => {
    expect(
      containsForbiddenAuthorityField({ checks: [{ passed: true }] })
    ).toBe(true);
  });

  it("detects a mastery grant", () => {
    expect(containsForbiddenAuthorityField({ masteryGranted: true })).toBe(true);
  });

  it("detects a score adjustment", () => {
    expect(containsForbiddenAuthorityField({ scoreAdjustment: -1 })).toBe(true);
  });

  it("detects a note mutation", () => {
    expect(containsForbiddenAuthorityField({ noteWrite: { body: "x" } })).toBe(
      true
    );
  });

  it("detects another learner's identity", () => {
    expect(containsForbiddenAuthorityField({ userId: "someone-else" })).toBe(
      true
    );
  });

  it("is case-insensitive about the key", () => {
    expect(containsForbiddenAuthorityField({ LabPassed: true })).toBe(true);
  });

  /**
   * Keys are compared EXACTLY, never as substrings. A substring rule would
   * reject the legitimate word "corrected", which the Evidence and Certificate
   * Engines both use, and the Tutor would then be unable to explain a
   * correction.
   */
  it("does not reject a legitimate key that merely contains a forbidden word", () => {
    expect(
      containsForbiddenAuthorityField({
        correctedExplanation: "the lesson was amended"
      })
    ).toBe(false);
  });

  it("accepts an ordinary explanatory payload", () => {
    expect(
      containsForbiddenAuthorityField({
        answer: "A VLAN separates broadcast domains.",
        explanation: "Each VLAN is its own broadcast domain.",
        citedSegmentStableIds: ["step-1"]
      })
    ).toBe(false);
  });

  it("holds the forbidden-field prohibition as data", () => {
    expect(AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS.length).toBeGreaterThan(20);
    for (const field of ["labPassed", "masteryGranted", "score", "noteWrite"]) {
      expect(AI_TUTOR_FORBIDDEN_AUTHORITY_FIELDS).toContain(field);
    }
  });
});

describe("lab state is never guessed", () => {
  const attested = {
    source: TUTOR_LAB_ATTESTATION_SOURCE,
    sessionId: "session-1",
    validationRunId: "run-1",
    observedAt: "2026-10-05T10:00:00.000Z"
  };

  it("accepts a complete deterministic attestation", () => {
    const state = classifyTutorLabState(attested);

    expect(state.availability).toBe("available");
    if (state.availability === "available") {
      expect(state.attestation.source).toBe(TUTOR_LAB_ATTESTATION_SOURCE);
      expect(state.attestation.sessionId).toBe("session-1");
    }
  });

  /**
   * The claim a hostile or merely optimistic client would send. It is
   * well-formed, it is complete, and it is refused — because the one thing it
   * cannot produce is the deterministic source marker.
   */
  it("refuses a well-formed claim from an untrusted source", () => {
    expect(
      classifyTutorLabState({ ...attested, source: "client" })
    ).toEqual({ availability: "unavailable", reason: "not_attested" });
  });

  it("refuses a claim with no source at all", () => {
    expect(
      classifyTutorLabState({
        sessionId: "session-1",
        validationRunId: "run-1",
        observedAt: "2026-10-05T10:00:00.000Z"
      })
    ).toEqual({ availability: "unavailable", reason: "not_attested" });
  });

  it("refuses an attestation missing the deterministic run reference", () => {
    expect(
      classifyTutorLabState({ ...attested, validationRunId: "  " })
    ).toEqual({ availability: "unavailable", reason: "not_attested" });
  });

  it("refuses an attestation with no observation time", () => {
    expect(classifyTutorLabState({ ...attested, observedAt: "" })).toEqual({
      availability: "unavailable",
      reason: "not_attested"
    });
  });

  for (const hostile of [null, undefined, "available", 1, true, []]) {
    it(`fails closed for a non-object claim: ${JSON.stringify(hostile)}`, () => {
      const state = classifyTutorLabState(hostile);
      expect(state.availability).toBe("unavailable");
    });
  }

  /**
   * An attestation that carries a verdict still yields only availability. The
   * Tutor is told whether lab state is knowable and never what the verdict was,
   * because a verdict in Tutor context is one the Tutor can repeat as its own.
   */
  it("never carries a verdict through, even when one is offered", () => {
    const state = classifyTutorLabState({
      ...attested,
      labPassed: true,
      validationResult: "passed"
    });

    expect(state.availability).toBe("available");
    expect(JSON.stringify(state)).not.toContain("labPassed");
    expect(JSON.stringify(state)).not.toContain("passed");
  });

  it("describes every unavailable reason honestly and without a verdict", () => {
    for (const reason of TUTOR_LAB_UNAVAILABLE_REASONS) {
      const message = describeTutorLabUnavailable(reason);

      expect(message.length).toBeGreaterThan(20);
      expect(message.toLowerCase()).not.toContain("passed");
      expect(message.toLowerCase()).not.toContain("correct");
    }
  });

  it("builds an explicit unavailable state", () => {
    expect(tutorLabStateUnavailable("not_connected")).toEqual({
      availability: "unavailable",
      reason: "not_connected"
    });
  });
});

describe("a deterministic question is handed back to its owner", () => {
  it("covers every deferral subject", () => {
    for (const subject of TUTOR_DEFERRAL_SUBJECTS) {
      const deferral = buildTutorDeterministicDeferral(subject);

      expect(deferral.subject).toBe(subject);
      expect(deferral.authority.toLowerCase()).not.toContain("tutor");
      expect(deferral.statement).toContain("cannot");
    }
  });

  it("points a lab-correctness question at the lab's own validation", () => {
    const deferral = buildTutorDeterministicDeferral("lab_correctness");

    expect(deferral.authority).toBe(
      TUTOR_DETERMINISTIC_AUTHORITIES.labCorrectness
    );
    expect(deferral.statement.toLowerCase()).toContain("validation");
  });

  it("still offers something useful rather than only refusing", () => {
    expect(
      buildTutorDeterministicDeferral("lab_correctness").statement.toLowerCase()
    ).toContain("i can help you understand");
  });
});

describe("the Tutor cannot write a learner note", () => {
  it("never claims a suggestion was applied", () => {
    const suggestion = buildTutorNoteSuggestion("  VLANs separate domains.  ");

    expect(suggestion.applied).toBe(false);
    expect(suggestion.requiresExplicitLearnerAction).toBe(true);
    expect(suggestion.suggestedText).toBe("VLANs separate domains.");
    expect(suggestion.authority).toBe(
      TUTOR_DETERMINISTIC_AUTHORITIES.noteContent
    );
  });

  it("answers the write question unconditionally", () => {
    expect(tutorMayWriteLearnerNote()).toBe(false);
  });
});
