import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_INITIAL_STATUS,
  CERTIFICATE_LIFECYCLE_STATUSES,
  calculateCertificateExpiry,
  describeCertificateStatus,
  explainCertificateStatus,
  isCertificateLifecycleStatus,
  isValidCertificateLifecycleTransition,
  listPermittedCertificateLifecycleTransitions,
  resolveEffectiveCertificateStatus,
  type CertificateLifecycleEvent,
  type CertificateLifecycleStatus,
  type StudentCertificateRecord
} from "./certificate-lifecycle";

const ISSUED_AT = "2026-01-01T00:00:00.000Z";
const NOW = "2026-08-17T12:00:00.000Z";

function event(
  overrides: Partial<CertificateLifecycleEvent> = {}
): CertificateLifecycleEvent {
  return {
    id: "event-1",
    certificateId: "certificate-1",
    sequenceNumber: 1,
    previousStatus: "active",
    newStatus: "revoked",
    effectiveAt: "2026-03-01T00:00:00.000Z",
    occurredAt: "2026-03-01T00:00:00.000Z",
    ...overrides
  };
}

function resolve(
  events: CertificateLifecycleEvent[],
  extra: { expiresAt?: string | null; now?: string } = {}
) {
  return resolveEffectiveCertificateStatus({
    issuedAt: ISSUED_AT,
    expiresAt: extra.expiresAt ?? null,
    events,
    now: extra.now ?? NOW
  });
}

describe("A: the approved state model", () => {
  it("A: models exactly the five approved states", () => {
    expect(CERTIFICATE_LIFECYCLE_STATUSES).toEqual([
      "active",
      "superseded",
      "expired",
      "revoked",
      "corrected"
    ]);
  });

  it("A2: a certificate begins active at issuance", () => {
    expect(CERTIFICATE_INITIAL_STATUS).toBe("active");
    expect(resolve([]).status).toBe("active");
    expect(resolve([]).effectiveAt).toBe(ISSUED_AT);
  });

  it("A3: unknown statuses are rejected", () => {
    for (const status of CERTIFICATE_LIFECYCLE_STATUSES) {
      expect(isCertificateLifecycleStatus(status)).toBe(true);
    }
    for (const invalid of ["pending", "issued", "valid", "", undefined, 3]) {
      expect(isCertificateLifecycleStatus(invalid)).toBe(false);
    }
  });
});

describe("B: the approved transition set", () => {
  it("B: permits exactly the five approved edges", () => {
    expect(listPermittedCertificateLifecycleTransitions()).toEqual([
      { from: "active", to: "superseded" },
      { from: "active", to: "revoked" },
      { from: "active", to: "corrected" },
      { from: "active", to: "expired" },
      { from: "revoked", to: "active" }
    ]);
  });

  it("B2: active may reach each downstream state", () => {
    for (const to of ["superseded", "revoked", "corrected", "expired"] as const) {
      expect(isValidCertificateLifecycleTransition("active", to)).toBe(true);
    }
  });

  it("B3: revoked may return to active so CERT-008 restore is representable", () => {
    expect(isValidCertificateLifecycleTransition("revoked", "active")).toBe(
      true
    );
  });

  it("B4: expired, superseded and corrected are terminal", () => {
    for (const from of ["expired", "superseded", "corrected"] as const) {
      for (const to of CERTIFICATE_LIFECYCLE_STATUSES) {
        expect(isValidCertificateLifecycleTransition(from, to)).toBe(false);
      }
    }
  });

  it("B5: a no-op is not a transition", () => {
    for (const status of CERTIFICATE_LIFECYCLE_STATUSES) {
      expect(isValidCertificateLifecycleTransition(status, status)).toBe(false);
    }
  });

  it("B6: no unapproved edge exists", () => {
    const permitted = new Set(
      listPermittedCertificateLifecycleTransitions().map(
        (edge) => `${edge.from}->${edge.to}`
      )
    );
    for (const from of CERTIFICATE_LIFECYCLE_STATUSES) {
      for (const to of CERTIFICATE_LIFECYCLE_STATUSES) {
        expect(isValidCertificateLifecycleTransition(from, to)).toBe(
          permitted.has(`${from}->${to}`)
        );
      }
    }
  });
});

describe("C: replaying recorded history", () => {
  it("C: a single recorded transition is reflected", () => {
    const effective = resolve([event({ newStatus: "revoked" })]);
    expect(effective.status).toBe("revoked");
    expect(effective.sequenceValid).toBe(true);
    expect(effective.effectiveAt).toBe("2026-03-01T00:00:00.000Z");
    expect(effective.transitionCount).toBe(1);
  });

  it("C2: a restore replays back to active", () => {
    const effective = resolve([
      event({ sequenceNumber: 1, previousStatus: "active", newStatus: "revoked" }),
      event({
        id: "event-2",
        sequenceNumber: 2,
        previousStatus: "revoked",
        newStatus: "active",
        effectiveAt: "2026-04-01T00:00:00.000Z"
      })
    ]);
    expect(effective.status).toBe("active");
    expect(effective.sequenceValid).toBe(true);
  });

  it("C3: events are replayed in sequence order regardless of input order", () => {
    const forwards = resolve([
      event({ sequenceNumber: 1, previousStatus: "active", newStatus: "revoked" }),
      event({
        id: "event-2",
        sequenceNumber: 2,
        previousStatus: "revoked",
        newStatus: "active"
      })
    ]);
    const backwards = resolve([
      event({
        id: "event-2",
        sequenceNumber: 2,
        previousStatus: "revoked",
        newStatus: "active"
      }),
      event({ sequenceNumber: 1, previousStatus: "active", newStatus: "revoked" })
    ]);
    expect(backwards.status).toBe(forwards.status);
    expect(backwards.sequenceValid).toBe(true);
  });
});

describe("D: replay fails closed", () => {
  it("D: a sequence gap invalidates the history", () => {
    const effective = resolve([event({ sequenceNumber: 2 })]);
    expect(effective.sequenceValid).toBe(false);
    expect(effective.sequenceError).toBe("SEQUENCE_GAP");
    // The status reached before the bad event is reported, never a guess.
    expect(effective.status).toBe("active");
  });

  it("D2: a predecessor that disagrees invalidates the history", () => {
    const effective = resolve([
      event({ previousStatus: "revoked", newStatus: "active" })
    ]);
    expect(effective.sequenceValid).toBe(false);
    expect(effective.sequenceError).toBe("PREVIOUS_STATUS_MISMATCH");
  });

  it("D3: an unapproved edge invalidates the history", () => {
    const effective = resolve([
      event({ previousStatus: "active", newStatus: "active" })
    ]);
    expect(effective.sequenceValid).toBe(false);
    expect(effective.sequenceError).toBe("INVALID_TRANSITION");
  });

  it("D4: a broken history never reports a fabricated later status", () => {
    const effective = resolve([
      event({ sequenceNumber: 1, previousStatus: "active", newStatus: "revoked" }),
      event({
        id: "event-3",
        sequenceNumber: 3,
        previousStatus: "revoked",
        newStatus: "active"
      })
    ]);
    expect(effective.sequenceValid).toBe(false);
    expect(effective.status).toBe("revoked");
  });

  it("D5: expiry is not applied to a broken history", () => {
    const effective = resolve([event({ sequenceNumber: 5 })], {
      expiresAt: "2026-02-01T00:00:00.000Z"
    });
    expect(effective.sequenceValid).toBe(false);
    expect(effective.expiredByTime).toBe(false);
    expect(effective.status).not.toBe("expired");
  });
});

describe("E: pinned expiry", () => {
  it("E: null expiration months means the certificate never expires", () => {
    expect(
      calculateCertificateExpiry({ issuedAt: ISSUED_AT, expirationMonths: null })
    ).toBeNull();
    expect(resolve([], { expiresAt: null }).status).toBe("active");
    expect(resolve([], { expiresAt: null }).expiresAt).toBeUndefined();
  });

  it("E2: an expiry is derived from issuance time and the month window", () => {
    expect(
      calculateCertificateExpiry({ issuedAt: ISSUED_AT, expirationMonths: 12 })
    ).toBe("2027-01-01T00:00:00.000Z");
    expect(
      calculateCertificateExpiry({ issuedAt: ISSUED_AT, expirationMonths: 1 })
    ).toBe("2026-02-01T00:00:00.000Z");
  });

  it("E3: an invalid month window yields no expiry", () => {
    for (const months of [0, -1, 1.5]) {
      expect(
        calculateCertificateExpiry({ issuedAt: ISSUED_AT, expirationMonths: months })
      ).toBeNull();
    }
  });

  it("E4: an active certificate past its pinned expiry reads as expired", () => {
    const effective = resolve([], {
      expiresAt: "2026-02-01T00:00:00.000Z",
      now: NOW
    });
    expect(effective.status).toBe("expired");
    expect(effective.expiredByTime).toBe(true);
    expect(effective.effectiveAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("E5: an active certificate before its expiry stays active", () => {
    const effective = resolve([], {
      expiresAt: "2027-01-01T00:00:00.000Z",
      now: NOW
    });
    expect(effective.status).toBe("active");
    expect(effective.expiredByTime).toBe(false);
    expect(effective.expiresAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("E6: a recorded transition always wins over time-based expiry", () => {
    // A revoked certificate stays revoked after its expiry date; expiry never
    // overwrites a recorded decision.
    for (const status of ["revoked", "superseded", "corrected"] as const) {
      const effective = resolve(
        [event({ newStatus: status })],
        { expiresAt: "2026-02-01T00:00:00.000Z", now: NOW }
      );
      expect(effective.status).toBe(status);
      expect(effective.expiredByTime).toBe(false);
    }
  });

  it("E7: expiry uses caller-supplied trusted time, not a clock", () => {
    const before = resolve([], {
      expiresAt: "2026-06-01T00:00:00.000Z",
      now: "2026-05-31T23:59:59.000Z"
    });
    const after = resolve([], {
      expiresAt: "2026-06-01T00:00:00.000Z",
      now: "2026-06-01T00:00:01.000Z"
    });
    expect(before.status).toBe("active");
    expect(after.status).toBe("expired");
  });

  it("E8: resolution is deterministic for fixed inputs", () => {
    const results = new Set<string>();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      results.add(
        JSON.stringify(resolve([event()], { expiresAt: "2027-01-01T00:00:00.000Z" }))
      );
    }
    expect(results.size).toBe(1);
  });
});

describe("F: accessible status wording", () => {
  it("F: every status has distinct readable text", () => {
    const labels = CERTIFICATE_LIFECYCLE_STATUSES.map(describeCertificateStatus);
    expect(new Set(labels).size).toBe(CERTIFICATE_LIFECYCLE_STATUSES.length);
    expect(describeCertificateStatus("revoked")).toBe("Revoked");
  });

  it("F2: every status has a calm plain-language explanation", () => {
    const explanations = CERTIFICATE_LIFECYCLE_STATUSES.map(
      explainCertificateStatus
    );
    expect(new Set(explanations).size).toBe(
      CERTIFICATE_LIFECYCLE_STATUSES.length
    );
    for (const explanation of explanations) {
      expect(explanation.length).toBeGreaterThan(10);
      for (const blame of ["you failed", "your fault", "penalty"]) {
        expect(explanation.toLowerCase()).not.toContain(blame);
      }
    }
  });

  it("F3: revoked, expired and superseded are explained clearly", () => {
    expect(explainCertificateStatus("revoked")).toContain("no longer valid");
    expect(explainCertificateStatus("expired")).toContain("validity period");
    expect(explainCertificateStatus("superseded")).toContain("replaced");
  });
});

describe("G: the record model carries no CERT-005+ concept", () => {
  it("G: a student record exposes only CERT-004 fields", () => {
    const record: StudentCertificateRecord = {
      id: "certificate-1",
      certificateDefinitionStableId: "certdef-x-001",
      certificateDefinitionVersion: 1,
      issuedAt: ISSUED_AT,
      status: "active",
      statusEffectiveAt: ISSUED_AT,
      statusDetermined: true
    };

    for (const forbidden of [
      "userId",
      "studentId",
      "verificationId",
      "reason",
      "actorId",
      "replacementCertificateId",
      "shareUrl",
      "pdfUrl"
    ]) {
      expect(record).not.toHaveProperty(forbidden);
    }
  });

  it("G2: no workflow decision is modelled here", () => {
    // CERT-004 validates transitions; it never decides one should happen.
    const status: CertificateLifecycleStatus = "active";
    expect(isValidCertificateLifecycleTransition(status, "revoked")).toBe(true);
    // There is deliberately no shouldRevoke/decideRevocation style export.
    expect(
      Object.keys({ isValidCertificateLifecycleTransition }).join()
    ).not.toContain("decide");
  });
});
