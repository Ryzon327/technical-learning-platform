import { describe, expect, it } from "vitest";
import { CERTIFICATE_LIFECYCLE_STATUSES } from "./certificate-lifecycle";
import type { CertificateLifecycleStatus } from "./certificate-lifecycle";
import type { CertificatePortfolioEntry } from "./certificate-portfolio";
import {
  CERTIFICATE_EXPORT_FORBIDDEN_FIELDS,
  CERTIFICATE_EXPORT_FORMAT_VERSION,
  CERTIFICATE_EXPORT_FORMATS,
  CERTIFICATE_SHARE_PAYLOAD_VERSION,
  assembleCertificateExport,
  buildCertificateExportDownload,
  buildCertificateExportFileName,
  certificateExportMediaType,
  describeCertificateExportContents,
  describeCertificateExportFormat,
  describeCertificateExportSummary,
  isCurrentlyValidForExport,
  normalizeCertificateExportFormat,
  renderCertificateExportAsMarkdown,
  serializeCertificateExport,
  toCertificateSharePayload,
  toExportedCertificate
} from "./certificate-export";

function entry(
  overrides: Partial<CertificatePortfolioEntry> = {}
): CertificatePortfolioEntry {
  return {
    certificateId: "11111111-1111-4111-8111-111111111111",
    certificateTitle: "Network Defence Practitioner",
    issuer: "Technical Learning Platform",
    certificateDefinitionStableId: "network-defence",
    certificateDefinitionVersion: 3,
    issuedAt: "2026-02-01T10:00:00.000Z",
    status: "active",
    statusEffectiveAt: "2026-02-01T10:00:00.000Z",
    competencySummary: [{ title: "Segment a network", version: 2 }],
    verificationReference: `cert1_${"a1b2c3d4".repeat(6)}`,
    ...overrides
  };
}

describe("projecting a certificate into its export representation", () => {
  it("carries exactly the approved fields", () => {
    const exported = toExportedCertificate(
      entry({ expiresAt: "2027-02-01T10:00:00.000Z" })
    );

    expect(Object.keys(exported).sort()).toEqual(
      [
        "certificateTitle",
        "issuer",
        "certificateDefinitionStableId",
        "certificateDefinitionVersion",
        "issuedAt",
        "status",
        "statusLabel",
        "statusExplanation",
        "expiresAt",
        "currentlyValid",
        "competencySummary",
        "verificationReference"
      ].sort()
    );
  });

  it("carries the values through unchanged", () => {
    const exported = toExportedCertificate(entry());

    expect(exported.certificateTitle).toBe("Network Defence Practitioner");
    expect(exported.issuer).toBe("Technical Learning Platform");
    expect(exported.certificateDefinitionStableId).toBe("network-defence");
    expect(exported.certificateDefinitionVersion).toBe(3);
    expect(exported.issuedAt).toBe("2026-02-01T10:00:00.000Z");
    expect(exported.competencySummary).toEqual([
      { title: "Segment a network", version: 2 }
    ]);
    expect(exported.verificationReference).toBe(entry().verificationReference);
  });

  it("omits expiry entirely when the certificate does not expire", () => {
    expect(toExportedCertificate(entry())).not.toHaveProperty("expiresAt");
  });

  it("includes the verification reference — the point of the export", () => {
    expect(toExportedCertificate(entry()).verificationReference).toMatch(
      /^cert1_/
    );
  });

  it("never carries the certificate id or any identity field", () => {
    const exported = toExportedCertificate(entry()) as unknown as Record<string, unknown>;

    for (const forbidden of CERTIFICATE_EXPORT_FORBIDDEN_FIELDS) {
      expect(exported).not.toHaveProperty(forbidden);
    }
  });

  it("copies the competency summary rather than sharing it", () => {
    const source = entry();
    const exported = toExportedCertificate(source);

    exported.competencySummary[0]!.version = 99;

    expect(source.competencySummary[0]!.version).toBe(2);
  });

  it("does not leak a field added to the portfolio entry", () => {
    const smuggled = {
      ...entry(),
      holderName: "Real Person",
      evidenceIds: ["ev-1"]
    } as CertificatePortfolioEntry;

    const exported = toExportedCertificate(smuggled) as unknown as Record<string, unknown>;

    expect(exported).not.toHaveProperty("holderName");
    expect(exported).not.toHaveProperty("evidenceIds");
  });
});

describe("current validity fails closed", () => {
  it("treats only an active certificate as currently valid", () => {
    expect(isCurrentlyValidForExport("active")).toBe(true);
  });

  it.each(["superseded", "expired", "revoked", "corrected"] as const)(
    "never exports a %s certificate as currently valid",
    (status) => {
      const exported = toExportedCertificate(entry({ status }));

      expect(exported.currentlyValid).toBe(false);
      expect(exported.status).toBe(status);
    }
  );

  it("carries every lifecycle status through unchanged", () => {
    for (const status of CERTIFICATE_LIFECYCLE_STATUSES) {
      const exported = toExportedCertificate(entry({ status }));

      expect(exported.status).toBe(status);
      expect(exported.statusLabel.length).toBeGreaterThan(0);
      expect(exported.statusExplanation.length).toBeGreaterThan(0);
    }
  });

  it("states a revoked status in words, never by omission", () => {
    const exported = toExportedCertificate(entry({ status: "revoked" }));

    expect(exported.statusLabel.toLowerCase()).toContain("revoked");
  });
});

describe("assembling the export", () => {
  it("stamps the format version and the supplied clock", () => {
    const result = assembleCertificateExport({
      entries: [entry()],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(result.formatVersion).toBe(CERTIFICATE_EXPORT_FORMAT_VERSION);
    expect(result.generatedAt).toBe("2026-08-18T12:00:00.000Z");
  });

  it("counts totals and current validity separately", () => {
    const result = assembleCertificateExport({
      entries: [
        entry({ certificateId: "a" }),
        entry({ certificateId: "b", status: "revoked" }),
        entry({ certificateId: "c", status: "expired" })
      ],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(result.totalCount).toBe(3);
    expect(result.currentlyValidCount).toBe(1);
  });

  it("lists certificates that could not be included, never dropping them", () => {
    const result = assembleCertificateExport({
      entries: [],
      generatedAt: "2026-08-18T12:00:00.000Z",
      unavailableCertificates: [{ reason: "Details unavailable" }]
    });

    expect(result.certificates).toEqual([]);
    expect(result.unavailableCertificates).toEqual([
      { reason: "Details unavailable" }
    ]);
    expect(result.totalCount).toBe(0);
  });

  it("does not count an unavailable certificate as exported", () => {
    const result = assembleCertificateExport({
      entries: [entry()],
      generatedAt: "2026-08-18T12:00:00.000Z",
      unavailableCertificates: [{ reason: "Status unavailable" }]
    });

    expect(result.totalCount).toBe(1);
    expect(result.currentlyValidCount).toBe(1);
  });

  it("returns an empty export cleanly", () => {
    const result = assembleCertificateExport({
      entries: [],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(result.certificates).toEqual([]);
    expect(result.unavailableCertificates).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.currentlyValidCount).toBe(0);
  });

  it("does not mutate the caller's unavailable list", () => {
    const unavailable = [{ reason: "Details unavailable" }];
    const result = assembleCertificateExport({
      entries: [],
      generatedAt: "2026-08-18T12:00:00.000Z",
      unavailableCertificates: unavailable
    });

    result.unavailableCertificates.push({ reason: "Injected" });

    expect(unavailable).toHaveLength(1);
  });

  it("is deterministic for the same input", () => {
    const input = {
      entries: [entry()],
      generatedAt: "2026-08-18T12:00:00.000Z"
    };

    expect(assembleCertificateExport(input)).toEqual(
      assembleCertificateExport(input)
    );
  });

  it("preserves the order the portfolio already determined", () => {
    const result = assembleCertificateExport({
      entries: [
        entry({ certificateTitle: "First" }),
        entry({ certificateTitle: "Second" })
      ],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(result.certificates.map((item) => item.certificateTitle)).toEqual([
      "First",
      "Second"
    ]);
  });
});

describe("telling the student what they are taking away", () => {
  it("names the verification reference and the omissions", () => {
    const contents = describeCertificateExportContents().join(" ");

    expect(contents).toContain("verification reference");
    expect(contents).toContain("does not include your name");
  });

  it("summarises with counts, not a claim about validity", () => {
    const summary = describeCertificateExportSummary(
      assembleCertificateExport({
        entries: [entry(), entry({ status: "revoked" })],
        generatedAt: "2026-08-18T12:00:00.000Z"
      })
    );

    expect(summary).toBe("Export prepared: 2 certificates, 1 currently valid.");
  });

  it("uses singular wording for one certificate", () => {
    const summary = describeCertificateExportSummary(
      assembleCertificateExport({
        entries: [entry()],
        generatedAt: "2026-08-18T12:00:00.000Z"
      })
    );

    expect(summary).toContain("1 certificate,");
  });
});

describe("portable formats", () => {
  it("offers exactly the two approved text formats", () => {
    expect(CERTIFICATE_EXPORT_FORMATS).toEqual(["json", "markdown"]);
  });

  it("normalizes unknown input to the archival format", () => {
    expect(normalizeCertificateExportFormat("markdown")).toBe("markdown");
    expect(normalizeCertificateExportFormat("json")).toBe("json");
    expect(normalizeCertificateExportFormat("pdf")).toBe("json");
    expect(normalizeCertificateExportFormat(undefined)).toBe("json");
    expect(normalizeCertificateExportFormat(null)).toBe("json");
  });

  it("describes each format in plain language", () => {
    expect(describeCertificateExportFormat("markdown")).toContain("Markdown");
    expect(describeCertificateExportFormat("json")).toContain("JSON");
  });

  it("declares the matching media type", () => {
    expect(certificateExportMediaType("markdown")).toBe("text/markdown");
    expect(certificateExportMediaType("json")).toBe("application/json");
  });

  it("names the file from the date and format only", () => {
    const result = assembleCertificateExport({
      entries: [entry()],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(buildCertificateExportFileName(result, "json")).toBe(
      "certificates-2026-08-18.json"
    );
    expect(buildCertificateExportFileName(result, "markdown")).toBe(
      "certificates-2026-08-18.md"
    );
  });

  it("never puts a certificate title in the file name", () => {
    const result = assembleCertificateExport({
      entries: [entry({ certificateTitle: "Secret Programme" })],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(buildCertificateExportFileName(result, "json")).not.toContain(
      "Secret"
    );
  });
});

describe("serializing the export", () => {
  const built = assembleCertificateExport({
    entries: [entry({ expiresAt: "2027-02-01T10:00:00.000Z" })],
    generatedAt: "2026-08-18T12:00:00.000Z"
  });

  it("round-trips through JSON without loss", () => {
    expect(JSON.parse(serializeCertificateExport(built, "json"))).toEqual(built);
  });

  it("renders Markdown as headings and lists, not an image", () => {
    const markdown = serializeCertificateExport(built, "markdown");

    expect(markdown).toContain("# Your certificates");
    expect(markdown).toContain("## Network Defence Practitioner");
    expect(markdown).toContain("- Issued by: Technical Learning Platform");
    expect(markdown).toContain("- Valid until: 2027-02-01T10:00:00.000Z");
    expect(markdown).not.toContain("<img");
    expect(markdown).not.toContain("data:image");
  });

  it("includes the verification reference in the readable file", () => {
    expect(serializeCertificateExport(built, "markdown")).toContain(
      "Verification reference: cert1_"
    );
  });

  it("writes a revoked status into the readable file", () => {
    const revoked = assembleCertificateExport({
      entries: [entry({ status: "revoked" })],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(
      renderCertificateExportAsMarkdown(revoked).toLowerCase()
    ).toContain("revoked");
  });

  it("lists unavailable certificates in the readable file", () => {
    const partial = assembleCertificateExport({
      entries: [],
      generatedAt: "2026-08-18T12:00:00.000Z",
      unavailableCertificates: [{ reason: "Details unavailable" }]
    });

    expect(renderCertificateExportAsMarkdown(partial)).toContain(
      "could not be included"
    );
  });

  /**
   * Asserted on smuggled VALUES rather than field names: the export's own
   * plain-language contents legitimately mention "your scores" when telling the
   * student what is left out, so a name-based scan would match this module's
   * own privacy notice instead of a leak.
   */
  it("never writes identity or evidence data into the readable file", () => {
    const smuggled = {
      ...entry(),
      holderName: "Real Person",
      email: "real.person@example.com",
      score: 91,
      evidenceIds: ["ev1_leaked"],
      certificateId: "11111111-1111-4111-8111-111111111111"
    } as CertificatePortfolioEntry;

    const markdown = renderCertificateExportAsMarkdown(
      assembleCertificateExport({
        entries: [smuggled],
        generatedAt: "2026-08-18T12:00:00.000Z"
      })
    );

    for (const leak of [
      "Real Person",
      "real.person@example.com",
      "91",
      "ev1_leaked",
      "11111111-1111-4111-8111-111111111111"
    ]) {
      expect(markdown).not.toContain(leak);
    }
  });
});

describe("handing the student a file", () => {
  const built = assembleCertificateExport({
    entries: [entry()],
    generatedAt: "2026-08-18T12:00:00.000Z"
  });

  it("bundles the file name, media type and contents together", () => {
    expect(buildCertificateExportDownload(built, "markdown")).toEqual({
      fileName: "certificates-2026-08-18.md",
      mediaType: "text/markdown",
      content: renderCertificateExportAsMarkdown(built)
    });
  });

  it("bundles the archival format the same way", () => {
    const download = buildCertificateExportDownload(built, "json");

    expect(download.fileName).toBe("certificates-2026-08-18.json");
    expect(download.mediaType).toBe("application/json");
    expect(JSON.parse(download.content)).toEqual(built);
  });

  it("produces a non-empty file even for an empty export", () => {
    const empty = assembleCertificateExport({
      entries: [],
      generatedAt: "2026-08-18T12:00:00.000Z"
    });

    expect(
      buildCertificateExportDownload(empty, "markdown").content.length
    ).toBeGreaterThan(0);
  });
});

describe("the share payload is designed, not resolved", () => {
  it("carries only what an external reader needs", () => {
    const payload = toCertificateSharePayload(toExportedCertificate(entry()));

    expect(Object.keys(payload).sort()).toEqual(
      [
        "payloadVersion",
        "verificationReference",
        "certificateTitle",
        "issuer",
        "issuedAt",
        "status",
        "statusLabel",
        "competencySummary"
      ].sort()
    );
    expect(payload.payloadVersion).toBe(CERTIFICATE_SHARE_PAYLOAD_VERSION);
  });

  it("carries no student identity and no share url", () => {
    const payload = toCertificateSharePayload(
      toExportedCertificate(entry())
    ) as unknown as Record<string, unknown>;

    for (const forbidden of CERTIFICATE_EXPORT_FORBIDDEN_FIELDS) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it("reports a revoked certificate as revoked to a future reader", () => {
    const payload = toCertificateSharePayload(
      toExportedCertificate(entry({ status: "revoked" as CertificateLifecycleStatus }))
    );

    expect(payload.status).toBe("revoked");
    expect(payload.statusLabel.toLowerCase()).toContain("revoked");
  });
});
