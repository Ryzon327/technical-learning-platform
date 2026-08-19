import { describe, expect, it } from "vitest";
import { isValidCertificateLifecycleTransition } from "./certificate-lifecycle";
import {
  CERTIFICATE_CORRECTION_ACTIONS,
  CERTIFICATE_CORRECTION_REASON_MAX_LENGTH,
  CERTIFICATE_CORRECTION_REASON_MIN_LENGTH,
  CERTIFICATE_CORRECTION_STUDENT_FORBIDDEN_FIELDS,
  certificateCorrectionRequiresReplacement,
  certificateCorrectionTargetStatus,
  describeCertificateCorrectionAction,
  describeCertificateCorrectionReasonError,
  describeCertificateCorrectionReplacementError,
  explainCertificateCorrection,
  isCertificateCorrectionAction,
  sortCertificateCorrections,
  toStudentCertificateCorrection,
  validateCertificateCorrectionReason,
  validateCertificateCorrectionReplacement,
  type CertificateCorrectionRecord
} from "./certificate-correction";

const CERTIFICATE_ID = "11111111-1111-4111-8111-111111111111";
const REPLACEMENT_ID = "22222222-2222-4222-8222-222222222222";

function record(
  overrides: Partial<CertificateCorrectionRecord> = {}
): CertificateCorrectionRecord {
  return {
    correctionId: "33333333-3333-4333-8333-333333333333",
    certificateId: CERTIFICATE_ID,
    sequenceNumber: 1,
    action: "revoke",
    reason: "Source evidence was found to be invalid.",
    actorId: "44444444-4444-4444-8444-444444444444",
    actorRole: "founder_admin",
    previousStatus: "active",
    newStatus: "revoked",
    occurredAt: "2026-08-19T10:00:00.000Z",
    ...overrides
  };
}

describe("the approved correction actions", () => {
  it("offers exactly the four actions CERT-008 section 5 lists", () => {
    expect(CERTIFICATE_CORRECTION_ACTIONS).toEqual([
      "revoke",
      "correct",
      "supersede",
      "restore"
    ]);
  });

  it("recognises only those actions", () => {
    for (const action of CERTIFICATE_CORRECTION_ACTIONS) {
      expect(isCertificateCorrectionAction(action)).toBe(true);
    }
    for (const rejected of ["delete", "expire", "hide", "", null, 7]) {
      expect(isCertificateCorrectionAction(rejected)).toBe(false);
    }
  });

  it("offers no deletion action", () => {
    expect(CERTIFICATE_CORRECTION_ACTIONS).not.toContain("delete");
    expect(isCertificateCorrectionAction("delete")).toBe(false);
  });
});

describe("actions translate to CERT-004 statuses without deciding legality", () => {
  it("maps each action to the status it drives", () => {
    expect(certificateCorrectionTargetStatus("revoke")).toBe("revoked");
    expect(certificateCorrectionTargetStatus("correct")).toBe("corrected");
    expect(certificateCorrectionTargetStatus("supersede")).toBe("superseded");
    expect(certificateCorrectionTargetStatus("restore")).toBe("active");
  });

  /**
   * The mapping is a naming translation. Every status it produces must be one
   * CERT-004 already permits from the matching starting state — proven against
   * CERT-004's own rule, not restated here.
   */
  it("only ever names a status CERT-004 permits from an active certificate", () => {
    for (const action of ["revoke", "correct", "supersede"] as const) {
      expect(
        isValidCertificateLifecycleTransition(
          "active",
          certificateCorrectionTargetStatus(action)
        )
      ).toBe(true);
    }
  });

  it("only ever restores from revoked, which CERT-004 permits", () => {
    expect(
      isValidCertificateLifecycleTransition(
        "revoked",
        certificateCorrectionTargetStatus("restore")
      )
    ).toBe(true);
  });

  it("does not itself authorise an edge CERT-004 forbids", () => {
    // Restoring an expired certificate is not a permitted CERT-004 edge, and
    // CERT-008 must not make it one by naming a target status.
    expect(
      isValidCertificateLifecycleTransition(
        "expired",
        certificateCorrectionTargetStatus("restore")
      )
    ).toBe(false);
  });
});

describe("a reason is mandatory", () => {
  it("accepts a real reason", () => {
    expect(
      validateCertificateCorrectionReason("Issued against defective evidence.")
    ).toBeNull();
  });

  it("refuses a missing, blank or non-string reason", () => {
    for (const rejected of [undefined, null, "", "   ", 42]) {
      expect(validateCertificateCorrectionReason(rejected)).toBe(
        "reason_missing"
      );
    }
  });

  it("refuses a reason shorter than the database allows", () => {
    expect(validateCertificateCorrectionReason("oops")).toBe("reason_too_short");
    expect(
      validateCertificateCorrectionReason(
        "x".repeat(CERTIFICATE_CORRECTION_REASON_MIN_LENGTH - 1)
      )
    ).toBe("reason_too_short");
  });

  it("accepts a reason exactly at the minimum length", () => {
    expect(
      validateCertificateCorrectionReason(
        "x".repeat(CERTIFICATE_CORRECTION_REASON_MIN_LENGTH)
      )
    ).toBeNull();
  });

  it("refuses a reason longer than the database allows", () => {
    expect(
      validateCertificateCorrectionReason(
        "x".repeat(CERTIFICATE_CORRECTION_REASON_MAX_LENGTH + 1)
      )
    ).toBe("reason_too_long");
  });

  it("ignores surrounding whitespace when measuring", () => {
    expect(validateCertificateCorrectionReason("   short   ")).toBe(
      "reason_too_short"
    );
  });

  it("explains every reason failure in plain language", () => {
    for (const error of [
      "reason_missing",
      "reason_too_short",
      "reason_too_long"
    ] as const) {
      expect(describeCertificateCorrectionReasonError(error).length).toBeGreaterThan(0);
    }
  });
});

describe("replacement semantics", () => {
  it("requires a replacement only for supersession", () => {
    expect(certificateCorrectionRequiresReplacement("supersede")).toBe(true);
    for (const action of ["revoke", "correct", "restore"] as const) {
      expect(certificateCorrectionRequiresReplacement(action)).toBe(false);
    }
  });

  it("accepts supersession that names a replacement", () => {
    expect(
      validateCertificateCorrectionReplacement({
        action: "supersede",
        certificateId: CERTIFICATE_ID,
        replacementCertificateId: REPLACEMENT_ID
      })
    ).toBeNull();
  });

  it("refuses supersession with no replacement", () => {
    expect(
      validateCertificateCorrectionReplacement({
        action: "supersede",
        certificateId: CERTIFICATE_ID
      })
    ).toBe("replacement_missing");
  });

  it("refuses a certificate replacing itself", () => {
    expect(
      validateCertificateCorrectionReplacement({
        action: "supersede",
        certificateId: CERTIFICATE_ID,
        replacementCertificateId: CERTIFICATE_ID
      })
    ).toBe("replacement_is_self");
  });

  it("refuses a replacement on any other action", () => {
    for (const action of ["revoke", "correct", "restore"] as const) {
      expect(
        validateCertificateCorrectionReplacement({
          action,
          certificateId: CERTIFICATE_ID,
          replacementCertificateId: REPLACEMENT_ID
        })
      ).toBe("replacement_not_allowed");
    }
  });

  it("explains every replacement failure in plain language", () => {
    for (const error of [
      "replacement_missing",
      "replacement_not_allowed",
      "replacement_is_self"
    ] as const) {
      expect(
        describeCertificateCorrectionReplacementError(error).length
      ).toBeGreaterThan(0);
    }
  });
});

describe("what the student is shown", () => {
  it("carries the explanation but never the administrator", () => {
    const student = toStudentCertificateCorrection(record());

    expect(student.reason).toBe("Source evidence was found to be invalid.");
    expect(student.action).toBe("revoke");
    expect(student.previousStatus).toBe("active");
    expect(student.newStatus).toBe("revoked");
    expect(Object.keys(student).sort()).toEqual(
      ["action", "reason", "previousStatus", "newStatus", "occurredAt"].sort()
    );
  });

  it("carries no forbidden field", () => {
    const student = toStudentCertificateCorrection(
      record({ replacementCertificateId: REPLACEMENT_ID })
    ) as unknown as Record<string, unknown>;

    for (const forbidden of CERTIFICATE_CORRECTION_STUDENT_FORBIDDEN_FIELDS) {
      expect(student).not.toHaveProperty(forbidden);
    }
  });

  it("does not leak a field added to the privileged record", () => {
    const smuggled = {
      ...record(),
      internalNote: "do not show",
      actorEmail: "admin@example.com"
    } as CertificateCorrectionRecord;

    const student = toStudentCertificateCorrection(
      smuggled
    ) as unknown as Record<string, unknown>;

    expect(student).not.toHaveProperty("internalNote");
    expect(student).not.toHaveProperty("actorEmail");
  });

  it("explains each action to the student", () => {
    for (const action of CERTIFICATE_CORRECTION_ACTIONS) {
      const explanation = explainCertificateCorrection(
        toStudentCertificateCorrection(record({ action }))
      );
      expect(explanation.length).toBeGreaterThan(0);
    }
  });

  it("never tells the student a revoked certificate is still valid", () => {
    const explanation = explainCertificateCorrection(
      toStudentCertificateCorrection(record({ action: "revoke" }))
    );

    expect(explanation.toLowerCase()).toContain("no longer valid");
  });

  it("labels each action for an administrator", () => {
    expect(describeCertificateCorrectionAction("revoke")).toBe("Revoked");
    expect(describeCertificateCorrectionAction("correct")).toBe("Corrected");
    expect(describeCertificateCorrectionAction("supersede")).toBe("Superseded");
    expect(describeCertificateCorrectionAction("restore")).toBe("Restored");
  });
});

describe("history ordering", () => {
  it("orders corrections oldest first", () => {
    const ordered = sortCertificateCorrections([
      record({ sequenceNumber: 3 }),
      record({ sequenceNumber: 1 }),
      record({ sequenceNumber: 2 })
    ]);

    expect(ordered.map((entry) => entry.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it("does not mutate the caller's list", () => {
    const source = [record({ sequenceNumber: 2 }), record({ sequenceNumber: 1 })];
    sortCertificateCorrections(source);

    expect(source.map((entry) => entry.sequenceNumber)).toEqual([2, 1]);
  });

  it("preserves every recorded correction", () => {
    expect(
      sortCertificateCorrections([
        record({ sequenceNumber: 2, action: "revoke" }),
        record({ sequenceNumber: 3, action: "restore" }),
        record({ sequenceNumber: 1, action: "correct" })
      ])
    ).toHaveLength(3);
  });
});
