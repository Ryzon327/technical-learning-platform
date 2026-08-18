import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS,
  CERTIFICATE_VERIFICATION_OUTCOMES,
  CERTIFICATE_VERIFICATION_REFERENCE_PATTERN,
  buildCertificateVerificationRecord,
  describeVerificationOutcome,
  describeVerifiedStatus,
  explainVerifiedStatus,
  isCertificateVerificationReference,
  type CertificateVerificationRecord
} from "./certificate-verification";
import {
  CERTIFICATE_LIFECYCLE_STATUSES,
  type CertificateLifecycleStatus
} from "./certificate-lifecycle";

const REFERENCE = `cert1_${"a1".repeat(24)}`;
const VERIFIED_AT = "2026-08-18T12:00:00.000Z";

function record(
  overrides: Partial<Parameters<typeof buildCertificateVerificationRecord>[0]> = {}
): CertificateVerificationRecord {
  return buildCertificateVerificationRecord({
    certificateTitle: "Network Foundations",
    issuer: "Technical Learning Platform",
    certificateDefinitionStableId: "certdef-net-foundations-001",
    certificateDefinitionVersion: 3,
    issuedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    statusEffectiveAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    competencySummary: [{ title: "Subnetting", version: 3 }],
    verifiedAt: VERIFIED_AT,
    ...overrides
  });
}

describe("A: verification reference format", () => {
  it("A: accepts only the cert1_ opaque format", () => {
    expect(isCertificateVerificationReference(REFERENCE)).toBe(true);
    for (const invalid of [
      "cert1_short",
      `ev1_${"a1".repeat(24)}`,
      `cert1_${"A1".repeat(24)}`,
      `cert1_${"a1".repeat(23)}`,
      `cert1_${"a1".repeat(25)}`,
      "",
      "   ",
      undefined,
      42
    ]) {
      expect(isCertificateVerificationReference(invalid)).toBe(false);
    }
  });

  it("A2: the reference carries 192 bits of randomness", () => {
    expect(CERTIFICATE_VERIFICATION_REFERENCE_PATTERN.source).toContain(
      "[a-f0-9]{48}"
    );
  });

  it("A3: no wildcard, prefix or partial reference is accepted", () => {
    // A prefix of a valid reference must not validate, so a probing caller
    // cannot walk toward a real one.
    expect(isCertificateVerificationReference(REFERENCE.slice(0, 40))).toBe(
      false
    );
    expect(isCertificateVerificationReference(`${REFERENCE}%`)).toBe(false);
    expect(isCertificateVerificationReference("cert1_%")).toBe(false);
    expect(isCertificateVerificationReference("cert1_*")).toBe(false);
  });
});

describe("B: the public payload carries only approved fields", () => {
  it("B: exposes exactly the approved field set", () => {
    expect(Object.keys(record()).sort()).toEqual([
      "certificateDefinitionStableId",
      "certificateDefinitionVersion",
      "certificateTitle",
      "competencySummary",
      "issuedAt",
      "issuer",
      "status",
      "statusEffectiveAt",
      "verifiedAt"
    ]);
  });

  it("B2: no holder identity of any kind is present", () => {
    const serialized = JSON.stringify(record());
    for (const forbidden of [
      "userId",
      "user_id",
      "studentId",
      "holderName",
      "displayName",
      "display_name",
      "email"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("B3: no internal identifier is present", () => {
    const value = record() as unknown as Record<string, unknown>;
    for (const forbidden of [
      "id",
      "certificateId",
      "verificationId",
      "certificateDefinitionId",
      "competencyId"
    ]) {
      expect(value).not.toHaveProperty(forbidden);
    }
  });

  it("B4: no Evidence detail is present", () => {
    const serialized = JSON.stringify(
      record({ competencySummary: [{ title: "Subnetting", version: 3 }] })
    );
    for (const forbidden of [
      "evidence",
      "Evidence",
      "score",
      "attempt",
      "labSession",
      "correction",
      "digest",
      "outcome"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("B5: every forbidden field is absent, driven by the shared list", () => {
    const value = record() as unknown as Record<string, unknown>;
    for (const forbidden of CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS) {
      expect(value).not.toHaveProperty(forbidden);
    }
  });

  it("B6: extra source fields cannot leak into the payload", () => {
    // The builder names every output field explicitly, so nothing is spread.
    const built = buildCertificateVerificationRecord({
      certificateTitle: "T",
      issuer: "I",
      certificateDefinitionStableId: "certdef-a",
      certificateDefinitionVersion: 1,
      issuedAt: "2026-01-01T00:00:00.000Z",
      status: "active",
      statusEffectiveAt: "2026-01-01T00:00:00.000Z",
      competencySummary: [],
      verifiedAt: VERIFIED_AT,
      // @ts-expect-error deliberately passing a field that must be ignored
      userId: "11111111-1111-4111-8111-111111111111"
    });
    expect(built).not.toHaveProperty("userId");
  });
});

describe("C: competency summary is title and version only", () => {
  it("C: each entry has exactly two fields", () => {
    const summary = record({
      competencySummary: [{ title: "Subnetting", version: 3 }]
    }).competencySummary;
    expect(Object.keys(summary[0] ?? {}).sort()).toEqual(["title", "version"]);
  });

  it("C2: summary order is deterministic", () => {
    const forwards = record({
      competencySummary: [
        { title: "Routing", version: 1 },
        { title: "Subnetting", version: 2 }
      ]
    }).competencySummary;
    const backwards = record({
      competencySummary: [
        { title: "Subnetting", version: 2 },
        { title: "Routing", version: 1 }
      ]
    }).competencySummary;
    expect(backwards).toEqual(forwards);
  });

  it("C3: an empty summary is permitted", () => {
    expect(record({ competencySummary: [] }).competencySummary).toEqual([]);
  });
});

describe("D: lifecycle states are reported accurately", () => {
  it("D: every lifecycle status is representable", () => {
    for (const status of CERTIFICATE_LIFECYCLE_STATUSES) {
      expect(record({ status }).status).toBe(status);
    }
  });

  it("D2: status is never collapsed into a boolean", () => {
    const value = record({ status: "revoked" }) as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of ["valid", "isValid", "authentic", "ok"]) {
      expect(value).not.toHaveProperty(forbidden);
    }
    expect(typeof value.status).toBe("string");
  });

  it("D3: every status has distinct readable text", () => {
    const labels = CERTIFICATE_LIFECYCLE_STATUSES.map(describeVerifiedStatus);
    expect(new Set(labels).size).toBe(CERTIFICATE_LIFECYCLE_STATUSES.length);
  });

  it("D4: non-active states are still described as authentically issued", () => {
    for (const status of ["expired", "revoked", "superseded", "corrected"] as const) {
      expect(explainVerifiedStatus(status)).toMatch(/issued/i);
    }
  });

  it("D5: revoked is explained as not to be relied upon", () => {
    expect(explainVerifiedStatus("revoked")).toContain("revoked");
    expect(explainVerifiedStatus("revoked")).toContain("should not be relied");
  });

  it("D6: expiry is included only when pinned", () => {
    expect(record({ expiresAt: null })).not.toHaveProperty("expiresAt");
    expect(
      record({ expiresAt: "2027-01-01T00:00:00.000Z" }).expiresAt
    ).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("E: the four outcomes stay distinct", () => {
  it("E: exactly four outcomes are modelled", () => {
    expect(CERTIFICATE_VERIFICATION_OUTCOMES).toEqual([
      "verified",
      "not_found",
      "malformed_reference",
      "unavailable"
    ]);
  });

  it("E2: unavailable never reads as invalid or missing", () => {
    const message = describeVerificationOutcome("unavailable");
    expect(message).toContain("temporarily unavailable");
    expect(message).toContain("does not mean the certificate is invalid");
    expect(message).not.toBe(describeVerificationOutcome("not_found"));
  });

  it("E3: each outcome has its own wording", () => {
    const messages = CERTIFICATE_VERIFICATION_OUTCOMES.map(
      describeVerificationOutcome
    );
    expect(new Set(messages).size).toBe(4);
  });

  it("E4: not_found reveals nothing about whether a reference could exist", () => {
    const message = describeVerificationOutcome("not_found");
    for (const leak of ["revoked", "expired", "deleted", "exists", "user"]) {
      expect(message.toLowerCase()).not.toContain(leak);
    }
  });
});

describe("F: determinism", () => {
  it("F: identical inputs produce an identical payload", () => {
    const results = new Set<string>();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      results.add(JSON.stringify(record()));
    }
    expect(results.size).toBe(1);
  });

  it("F2: the builder derives no status and reads no clock", () => {
    const status: CertificateLifecycleStatus = "superseded";
    const built = record({ status, statusEffectiveAt: "2026-05-05T00:00:00.000Z" });
    expect(built.status).toBe("superseded");
    expect(built.statusEffectiveAt).toBe("2026-05-05T00:00:00.000Z");
    expect(built.verifiedAt).toBe(VERIFIED_AT);
  });
});
