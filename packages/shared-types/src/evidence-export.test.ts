import { describe, expect, it } from "vitest";
import {
  EVIDENCE_EXPORT_FORMAT_VERSION,
  EVIDENCE_VERIFICATION_PAYLOAD_VERSION,
  assembleEvidenceExport,
  describeExportContents,
  describeVerificationStatus,
  deriveVerificationStatus,
  isVerificationId,
  toExportedEvidenceItem,
  toVerificationPayload
} from "./evidence-export";
import type { EvidencePortfolioItem } from "./evidence-portfolio";
import type { StudentEvidenceCompetencyLink } from "./evidence-competency";

const VERIFICATION_ID = `ev1_${"a1".repeat(24)}`;

function link(
  overrides: Partial<StudentEvidenceCompetencyLink> = {}
): StudentEvidenceCompetencyLink {
  return {
    id: "link-1",
    evidenceId: "evidence-1",
    competencyStableId: "competency.network.subnetting",
    competencyVersion: 2,
    competencyTitle: "Design and apply IPv4 subnetting",
    competencyReferenceState: "current",
    relationship: "required",
    linkSource: "approved_curriculum_mapping",
    linkSourceDescription: "Mapped by the approved curriculum definition.",
    linkedAt: "2026-08-13T00:00:00.000Z",
    ...overrides
  };
}

function item(
  overrides: Partial<EvidencePortfolioItem> = {}
): EvidencePortfolioItem {
  return {
    evidenceId: "evidence-1",
    sourceType: "lab_validation",
    sourceLabel: "Configure IPv4 subnets",
    outcomeLabel: "Passed",
    occurredAt: "2026-08-13T00:00:00.000Z",
    recordedAt: "2026-08-13T00:00:05.000Z",
    effectiveState: "active",
    evidenceOutcome: "positive",
    statusLabel: "Current evidence",
    underReview: false,
    isCurrentProof: true,
    correctionCount: 0,
    competencies: [link()],
    curriculum: [
      {
        competencyStableId: "competency.network.subnetting",
        competencyVersion: 2,
        courseStableId: "course.networking.foundations",
        courseTitle: "Networking Foundations",
        missionStableId: "mission.network.addressing"
      }
    ],
    ...overrides
  };
}

describe("verification identifier", () => {
  it("I/J: is opaque and leaks no database or user identifier", () => {
    expect(isVerificationId(VERIFICATION_ID)).toBe(true);
    // Never an evidence id, user id or sequential value.
    expect(isVerificationId("evidence-1")).toBe(false);
    expect(isVerificationId("1")).toBe(false);
    expect(isVerificationId("11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isVerificationId("")).toBe(false);
    expect(isVerificationId(undefined)).toBe(false);
  });

  it("rejects a malformed or truncated identifier", () => {
    expect(isVerificationId("ev1_short")).toBe(false);
    expect(isVerificationId(`ev1_${"a1".repeat(23)}`)).toBe(false);
    expect(isVerificationId(`EV1_${"a1".repeat(24)}`)).toBe(false);
    expect(isVerificationId(`ev1_${"A1".repeat(24)}`)).toBe(false);
  });
});

describe("F/G/H: verification status follows current effective state", () => {
  it("maps active evidence to current", () => {
    expect(deriveVerificationStatus("active")).toBe("current");
  });

  it("G: maps invalidated evidence to revoked, never current", () => {
    expect(deriveVerificationStatus("invalidated")).toBe("revoked");
    expect(describeVerificationStatus("revoked")).toContain("no longer valid");
  });

  it("H: maps superseded evidence accurately", () => {
    expect(deriveVerificationStatus("superseded")).toBe("superseded");
    expect(describeVerificationStatus("superseded")).toContain("Superseded");
  });

  it("fails closed on an unrecognised state", () => {
    expect(
      deriveVerificationStatus(
        "unknown" as unknown as EvidencePortfolioItem["effectiveState"]
      )
    ).toBe("unavailable");
    expect(describeVerificationStatus("unavailable")).toContain("unavailable");
  });

  it("every status is readable text, never a visual-only badge", () => {
    for (const status of ["current", "revoked", "superseded", "unavailable"] as const) {
      expect(describeVerificationStatus(status).length).toBeGreaterThan(10);
    }
  });
});

describe("C/D/S: privacy-safe export representation", () => {
  const exported = toExportedEvidenceItem(item(), VERIFICATION_ID);

  it("D: carries no provider, session or internal identifier", () => {
    const serialized = JSON.stringify(exported);
    for (const leak of [
      "evidence-1",
      "providerId",
      "providerSessionId",
      "userId",
      "integrityDigest",
      "sourceIntegrityDigest",
      "evidence_integrity_digest",
      "actorId",
      "correctionCount",
      "lastCorrectionReason"
    ]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("R: contains understandable source, date and status information", () => {
    expect(exported.sourceLabel).toBe("Configure IPv4 subnets");
    expect(exported.sourceType).toBe("lab_validation");
    expect(exported.outcomeLabel).toBe("Passed");
    expect(exported.observedAt).toBe("2026-08-13T00:00:00.000Z");
    expect(exported.issuedAt).toBe("2026-08-13T00:00:05.000Z");
    expect(exported.verificationStatusLabel).toBe("Currently valid evidence");
  });

  it("E: preserves the exact competency stable id and version", () => {
    expect(exported.competencies).toHaveLength(1);
    expect(exported.competencies[0]?.competencyStableId).toBe(
      "competency.network.subnetting"
    );
    expect(exported.competencies[0]?.competencyVersion).toBe(2);
    expect(exported.competencies[0]?.courseTitle).toBe("Networking Foundations");
  });

  it("E: never resolves against a newer competency version", () => {
    const mismatched = toExportedEvidenceItem(
      item({
        competencies: [link({ competencyVersion: 2 })],
        curriculum: [
          {
            competencyStableId: "competency.network.subnetting",
            competencyVersion: 5,
            courseStableId: "course.later",
            courseTitle: "A Later Course"
          }
        ]
      }),
      VERIFICATION_ID
    );

    // The v5 context does not belong to the v2 link, so no course is attached.
    expect(mismatched.competencies[0]?.competencyVersion).toBe(2);
    expect(mismatched.competencies[0]?.courseStableId).toBe(undefined);
  });

  it("S: exposes no private notes or audit mechanics", () => {
    const keys = Object.keys(exported);
    expect(keys).not.toContain("lastCorrectionReason");
    expect(keys).not.toContain("underReview");
    expect(keys).not.toContain("correctionCount");
  });
});

describe("G: corrected evidence is never exported as currently valid", () => {
  it("exports invalidated evidence as revoked and not demonstrating", () => {
    const exported = toExportedEvidenceItem(
      item({
        effectiveState: "invalidated",
        isCurrentProof: false,
        statusLabel: "No longer valid — kept for your records"
      }),
      VERIFICATION_ID
    );

    expect(exported.verificationStatus).toBe("revoked");
    expect(exported.currentlyDemonstrates).toBe(false);
  });

  it("exports superseded evidence accurately", () => {
    const exported = toExportedEvidenceItem(
      item({ effectiveState: "superseded", isCurrentProof: false }),
      VERIFICATION_ID
    );
    expect(exported.verificationStatus).toBe("superseded");
    expect(exported.currentlyDemonstrates).toBe(false);
  });

  it("never claims a negative outcome currently demonstrates a competency", () => {
    const exported = toExportedEvidenceItem(
      item({ evidenceOutcome: "negative", isCurrentProof: false }),
      VERIFICATION_ID
    );
    expect(exported.currentlyDemonstrates).toBe(false);
  });
});

describe("export assembly", () => {
  it("A: assembles owned evidence with a format version and generation time", () => {
    const result = assembleEvidenceExport({
      items: [{ item: item(), verificationId: VERIFICATION_ID }],
      generatedAt: "2026-08-14T00:00:00.000Z"
    });

    expect(result.formatVersion).toBe(EVIDENCE_EXPORT_FORMAT_VERSION);
    expect(result.generatedAt).toBe("2026-08-14T00:00:00.000Z");
    expect(result.totalCount).toBe(1);
    expect(result.currentlyValidCount).toBe(1);
  });

  it("counts only currently valid items as valid", () => {
    const result = assembleEvidenceExport({
      items: [
        { item: item(), verificationId: VERIFICATION_ID },
        {
          item: item({
            evidenceId: "evidence-2",
            effectiveState: "invalidated",
            isCurrentProof: false
          }),
          verificationId: `ev1_${"b2".repeat(24)}`
        }
      ],
      generatedAt: "2026-08-14T00:00:00.000Z"
    });

    expect(result.totalCount).toBe(2);
    expect(result.currentlyValidCount).toBe(1);
  });

  it("preserves unavailable items rather than hiding them", () => {
    const result = assembleEvidenceExport({
      items: [],
      generatedAt: "2026-08-14T00:00:00.000Z",
      unavailableItems: [
        { reason: "Verification references are temporarily unavailable." }
      ]
    });

    expect(result.totalCount).toBe(0);
    expect(result.unavailableItems).toHaveLength(1);
    expect(result.unavailableItems[0]?.reason).toContain("temporarily unavailable");
  });

  it("explains what the export includes and omits", () => {
    const contents = describeExportContents();
    expect(contents.length).toBeGreaterThan(3);
    expect(contents.join(" ")).toContain("does not include your name");
  });
});

describe("verification payload design", () => {
  it("answers exactly the questions a verifier needs", () => {
    const payload = toVerificationPayload(
      toExportedEvidenceItem(item(), VERIFICATION_ID)
    );

    expect(payload.payloadVersion).toBe(EVIDENCE_VERIFICATION_PAYLOAD_VERSION);
    expect(payload.verificationId).toBe(VERIFICATION_ID);
    expect(payload.status).toBe("current");
    expect(payload.sourceType).toBe("lab_validation");
    expect(payload.observedAt).toBe("2026-08-13T00:00:00.000Z");
    expect(payload.competencies[0]?.competencyVersion).toBe(2);
  });

  it("carries no student identity at all", () => {
    const serialized = JSON.stringify(
      toVerificationPayload(toExportedEvidenceItem(item(), VERIFICATION_ID))
    );
    for (const leak of ["userId", "evidence-1", "sourceLabel", "outcomeLabel"]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("reports revoked evidence as revoked to a future verifier", () => {
    const payload = toVerificationPayload(
      toExportedEvidenceItem(
        item({ effectiveState: "invalidated", isCurrentProof: false }),
        VERIFICATION_ID
      )
    );
    expect(payload.status).toBe("revoked");
    expect(payload.statusLabel).toContain("no longer valid");
  });
});
