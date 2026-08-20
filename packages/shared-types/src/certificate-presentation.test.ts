import { describe, expect, it } from "vitest";
import { CERTIFICATE_LIFECYCLE_STATUSES } from "./certificate-lifecycle";
import type { CertificatePortfolioEntry } from "./certificate-portfolio";
import {
  CERTIFICATE_PRESENTATION_FORBIDDEN_FIELDS,
  CERTIFICATE_PRESENTATION_MODEL_VERSION,
  CERTIFICATE_PRESENTATION_TRUTH_FIELDS,
  buildCertificatePresentation,
  buildFallbackCertificatePresentation,
  describeCertificateForPrint,
  describeCertificateHeading,
  describeCertificateHolder,
  presentAsCurrentlyValid,
  presentationPreservesTruth
} from "./certificate-presentation";

function entry(
  overrides: Partial<CertificatePortfolioEntry> = {}
): CertificatePortfolioEntry {
  return {
    certificateId: "11111111-1111-4111-8111-111111111111",
    certificateTitle: "Network Defence Practitioner",
    issuer: "Technical Learning Platform",
    certificateDefinitionStableId: "certdef-network-defence-001",
    certificateDefinitionVersion: 3,
    issuedAt: "2026-02-01T10:00:00.000Z",
    status: "active",
    statusEffectiveAt: "2026-02-01T10:00:00.000Z",
    competencySummary: [{ title: "Segment a network", version: 2 }],
    verificationReference: `cert1_${"a1b2c3d4".repeat(6)}`,
    ...overrides
  };
}

const brand = {
  plainLanguageTitle: "Network Defence Practitioner",
  plainLanguageSummary: "Can design and defend a segmented network.",
  logoTextAlternative: "Technical Learning Platform logo"
};

describe("presentation never alters truth", () => {
  it("reports exactly the certificate it was built from", () => {
    const source = entry({ expiresAt: "2027-02-01T10:00:00.000Z" });

    expect(
      presentationPreservesTruth(
        buildCertificatePresentation({ entry: source, brand }),
        source
      )
    ).toBe(true);
  });

  it("preserves truth for every lifecycle status", () => {
    for (const status of CERTIFICATE_LIFECYCLE_STATUSES) {
      const source = entry({ status });

      expect(
        presentationPreservesTruth(
          buildCertificatePresentation({ entry: source, brand }),
          source
        )
      ).toBe(true);
    }
  });

  /**
   * The CERT-009 section 13 requirement, proven rather than asserted: brand
   * metadata is applied on top of the authoritative record and cannot displace
   * any of it.
   */
  it("cannot let brand metadata displace an authoritative field", () => {
    const source = entry();
    const model = buildCertificatePresentation({
      entry: source,
      brand: {
        plainLanguageTitle: "Totally Different Credential",
        plainLanguageSummary: "Marketing copy",
        logoTextAlternative: "Some logo"
      }
    });

    expect(model.certificateTitle).toBe("Network Defence Practitioner");
    expect(model.issuer).toBe("Technical Learning Platform");
    expect(model.issuedAt).toBe(source.issuedAt);
    expect(model.certificateDefinitionVersion).toBe(3);
    expect(model.verificationReference).toBe(source.verificationReference);
    expect(presentationPreservesTruth(model, source)).toBe(true);
  });

  it("detects a presentation that misreports the certificate", () => {
    const source = entry();
    const tampered = {
      ...buildCertificatePresentation({ entry: source, brand }),
      issuedAt: "2020-01-01T00:00:00.000Z"
    };

    expect(presentationPreservesTruth(tampered, source)).toBe(false);
  });

  it("detects a presentation that misreports the status", () => {
    const source = entry({ status: "revoked" });
    const tampered = {
      ...buildCertificatePresentation({ entry: source, brand }),
      status: "active" as const
    };

    expect(presentationPreservesTruth(tampered, source)).toBe(false);
  });

  it("detects a presentation that drops a competency", () => {
    const source = entry({
      competencySummary: [
        { title: "Segment a network", version: 2 },
        { title: "Contain an incident", version: 4 }
      ]
    });
    const tampered = {
      ...buildCertificatePresentation({ entry: source, brand }),
      competencySummary: [{ title: "Segment a network", version: 2 }]
    };

    expect(presentationPreservesTruth(tampered, source)).toBe(false);
  });

  it("names every authoritative field it protects", () => {
    expect(CERTIFICATE_PRESENTATION_TRUTH_FIELDS).toEqual([
      "certificateId",
      "certificateTitle",
      "issuer",
      "issuedAt",
      "certificateDefinitionStableId",
      "certificateDefinitionVersion",
      "status",
      "expiresAt",
      "verificationReference"
    ]);
  });

  it("copies the competency summary rather than sharing it", () => {
    const source = entry();
    const model = buildCertificatePresentation({ entry: source, brand });

    model.competencySummary[0]!.version = 99;

    expect(source.competencySummary[0]!.version).toBe(2);
  });

  it("stamps the model version", () => {
    expect(
      buildCertificatePresentation({ entry: entry(), brand }).modelVersion
    ).toBe(CERTIFICATE_PRESENTATION_MODEL_VERSION);
  });
});

describe("privacy", () => {
  it("carries no forbidden field", () => {
    const model = buildCertificatePresentation({
      entry: entry(),
      brand,
      holderName: "Real Person"
    }) as unknown as Record<string, unknown>;

    for (const forbidden of CERTIFICATE_PRESENTATION_FORBIDDEN_FIELDS) {
      expect(model).not.toHaveProperty(forbidden);
    }
  });

  it("does not leak a field added to the portfolio entry", () => {
    const smuggled = {
      ...entry(),
      email: "real.person@example.com",
      evidenceIds: ["ev1_leaked"],
      score: 91
    } as CertificatePortfolioEntry;

    const model = buildCertificatePresentation({
      entry: smuggled,
      brand
    }) as unknown as Record<string, unknown>;

    expect(model).not.toHaveProperty("email");
    expect(model).not.toHaveProperty("evidenceIds");
    expect(model).not.toHaveProperty("score");
  });

  it("carries no binary brand asset or accreditation seal", () => {
    const model = buildCertificatePresentation({
      entry: entry(),
      brand
    }) as unknown as Record<string, unknown>;

    for (const forbidden of [
      "logoUrl",
      "brandAssetId",
      "accreditationSeal",
      "qrImage",
      "pdfUrl"
    ]) {
      expect(model).not.toHaveProperty(forbidden);
    }
  });
});

describe("the holder name is presentation data, not issuance truth", () => {
  it("names the holder when a display name exists", () => {
    const model = buildCertificatePresentation({
      entry: entry(),
      brand,
      holderName: "Alex Rivera"
    });

    expect(model.holderName).toBe("Alex Rivera");
    expect(model.holderLabel).toBe("Issued to Alex Rivera");
  });

  it("addresses the owner directly when no display name exists", () => {
    const model = buildCertificatePresentation({ entry: entry(), brand });

    expect(model).not.toHaveProperty("holderName");
    expect(model.holderLabel).toBe("Issued to you");
  });

  it("treats a blank display name as no name, never inventing one", () => {
    for (const blank of ["", "   "]) {
      const model = buildCertificatePresentation({
        entry: entry(),
        brand,
        holderName: blank
      });

      expect(model).not.toHaveProperty("holderName");
      expect(model.holderLabel).toBe("Issued to you");
    }
  });

  it("trims a display name", () => {
    expect(describeCertificateHolder("  Alex Rivera  ")).toBe(
      "Issued to Alex Rivera"
    );
  });

  /**
   * The accepted consequence of the holder-name ruling, recorded as a test so
   * it is impossible to forget: a renamed learner sees the new name, and NO
   * certificate truth moves with it.
   */
  it("shows a renamed learner the new name while truth stays frozen", () => {
    const source = entry();
    const before = buildCertificatePresentation({
      entry: source,
      brand,
      holderName: "Alex Rivera"
    });
    const after = buildCertificatePresentation({
      entry: source,
      brand,
      holderName: "Alex Stone"
    });

    expect(before.holderName).toBe("Alex Rivera");
    expect(after.holderName).toBe("Alex Stone");

    for (const field of [
      "certificateId",
      "certificateTitle",
      "issuer",
      "issuedAt",
      "certificateDefinitionStableId",
      "certificateDefinitionVersion",
      "status",
      "verificationReference"
    ] as const) {
      expect(after[field]).toEqual(before[field]);
    }
    expect(after.competencySummary).toEqual(before.competencySummary);
    expect(presentationPreservesTruth(after, source)).toBe(true);
  });
});

describe("status is always stated, never softened", () => {
  it("presents only an active certificate as currently standing", () => {
    expect(
      presentAsCurrentlyValid(
        buildCertificatePresentation({ entry: entry(), brand })
      )
    ).toBe(true);
  });

  it.each(["superseded", "expired", "revoked", "corrected"] as const)(
    "never presents a %s certificate as currently standing",
    (status) => {
      const model = buildCertificatePresentation({
        entry: entry({ status }),
        brand
      });

      expect(presentAsCurrentlyValid(model)).toBe(false);
      expect(model.status).toBe(status);
    }
  );

  it("states a revoked status in words", () => {
    const model = buildCertificatePresentation({
      entry: entry({ status: "revoked" }),
      brand
    });

    expect(model.statusLabel.toLowerCase()).toContain("revoked");
    expect(model.statusExplanation.length).toBeGreaterThan(0);
  });

  it("gives every status readable text, so colour is never the only signal", () => {
    for (const status of CERTIFICATE_LIFECYCLE_STATUSES) {
      const model = buildCertificatePresentation({
        entry: entry({ status }),
        brand
      });

      expect(model.statusLabel.length).toBeGreaterThan(0);
      expect(model.statusExplanation.length).toBeGreaterThan(0);
    }
  });
});

describe("the heading", () => {
  it("prefers the plain-language title written for a reader", () => {
    expect(
      describeCertificateHeading(
        buildCertificatePresentation({
          entry: entry(),
          brand: { plainLanguageTitle: "Defends Networks in Practice" }
        })
      )
    ).toBe("Defends Networks in Practice");
  });

  it("falls back to the authoritative title when no brand title exists", () => {
    expect(
      describeCertificateHeading(
        buildCertificatePresentation({ entry: entry() })
      )
    ).toBe("Network Defence Practitioner");
  });

  it("ignores a blank plain-language title", () => {
    expect(
      describeCertificateHeading(
        buildCertificatePresentation({
          entry: entry(),
          brand: { plainLanguageTitle: "   " }
        })
      )
    ).toBe("Network Defence Practitioner");
  });
});

describe("the accessible fallback presentation", () => {
  it("is marked as a fallback", () => {
    const model = buildFallbackCertificatePresentation(entry());

    expect(model.isFallback).toBe(true);
    expect(buildCertificatePresentation({ entry: entry() }).isFallback).toBe(
      false
    );
  });

  it("keeps every authoritative field and the verification reference", () => {
    const source = entry({ expiresAt: "2027-02-01T10:00:00.000Z" });
    const model = buildFallbackCertificatePresentation(source, "Alex Rivera");

    expect(presentationPreservesTruth(model, source)).toBe(true);
    expect(model.verificationReference).toBe(source.verificationReference);
  });

  it("carries no brand metadata", () => {
    const model = buildFallbackCertificatePresentation(entry());

    expect(model).not.toHaveProperty("plainLanguageTitle");
    expect(model).not.toHaveProperty("plainLanguageSummary");
    expect(model).not.toHaveProperty("logoTextAlternative");
  });

  it("still states the status of a revoked certificate", () => {
    const model = buildFallbackCertificatePresentation(
      entry({ status: "revoked" })
    );

    expect(model.statusLabel.toLowerCase()).toContain("revoked");
    expect(presentAsCurrentlyValid(model)).toBe(false);
  });

  it("still names the holder", () => {
    expect(
      buildFallbackCertificatePresentation(entry(), "Alex Rivera").holderLabel
    ).toBe("Issued to Alex Rivera");
  });
});

describe("the printable summary", () => {
  it("is readable text, never an image reference", () => {
    const line = describeCertificateForPrint(
      buildCertificatePresentation({ entry: entry(), brand })
    );

    expect(line).toContain("Technical Learning Platform");
    expect(line).not.toContain("<img");
    expect(line).not.toContain("data:image");
  });

  it("carries the status into the printed line", () => {
    const line = describeCertificateForPrint(
      buildCertificatePresentation({ entry: entry({ status: "revoked" }), brand })
    );

    expect(line.toLowerCase()).toContain("revoked");
  });
});

describe("the verification hook", () => {
  it("exposes the existing CERT-005 reference and nothing else", () => {
    const model = buildCertificatePresentation({ entry: entry(), brand });

    expect(model.verificationReference).toMatch(/^cert1_/);
    expect(model).not.toHaveProperty("qrImage");
    expect(model).not.toHaveProperty("qrPayload");
    expect(model).not.toHaveProperty("shareToken");
    expect(model).not.toHaveProperty("verificationToken");
  });

  it("uses the same reference the certificate already had", () => {
    const source = entry();

    expect(
      buildCertificatePresentation({ entry: source, brand }).verificationReference
    ).toBe(source.verificationReference);
  });
});
