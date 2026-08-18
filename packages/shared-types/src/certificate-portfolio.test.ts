import { describe, expect, it } from "vitest";
import {
  assembleCertificatePortfolio,
  buildCertificatePortfolioFilterOptions,
  describePortfolioCount,
  describeUnavailableEntry,
  filterCertificatePortfolioEntries,
  normalizeCertificatePortfolioFilters,
  sortCertificatePortfolioEntries,
  type CertificatePortfolioEntry
} from "./certificate-portfolio";
import { CERTIFICATE_LIFECYCLE_STATUSES } from "./certificate-lifecycle";

function entry(
  overrides: Partial<CertificatePortfolioEntry> = {}
): CertificatePortfolioEntry {
  return {
    certificateId: "certificate-1",
    certificateTitle: "Network Foundations",
    issuer: "Technical Learning Platform",
    certificateDefinitionStableId: "certdef-net-foundations-001",
    certificateDefinitionVersion: 3,
    issuedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    statusEffectiveAt: "2026-01-01T00:00:00.000Z",
    competencySummary: [{ title: "Subnetting", version: 3 }],
    verificationReference: `cert1_${"a1".repeat(24)}`,
    ...overrides
  };
}

describe("A: portfolio composition", () => {
  it("A: composes the learner's owned certificates", () => {
    const portfolio = assembleCertificatePortfolio({ entries: [entry()] });
    expect(portfolio.entries).toHaveLength(1);
    expect(portfolio.totalCount).toBe(1);
    expect(portfolio.unavailableEntries).toEqual([]);
  });

  it("A2: an empty portfolio is represented, not an error", () => {
    const portfolio = assembleCertificatePortfolio({ entries: [] });
    expect(portfolio.entries).toEqual([]);
    expect(portfolio.totalCount).toBe(0);
    expect(describePortfolioCount(portfolio)).toBe(
      "You have not earned any certificates yet."
    );
  });

  it("A3: each entry carries title, issuer, dates and competencies", () => {
    const [only] = assembleCertificatePortfolio({ entries: [entry()] }).entries;
    expect(only?.certificateTitle).toBe("Network Foundations");
    expect(only?.issuer).toBe("Technical Learning Platform");
    expect(only?.issuedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(only?.competencySummary).toEqual([{ title: "Subnetting", version: 3 }]);
  });

  it("A4: the owner's verification reference is present", () => {
    const [only] = assembleCertificatePortfolio({ entries: [entry()] }).entries;
    expect(only?.verificationReference).toMatch(/^cert1_[a-f0-9]{48}$/);
  });

  it("A5: expiry appears only when the certificate has one", () => {
    expect(
      assembleCertificatePortfolio({ entries: [entry()] }).entries[0]
    ).not.toHaveProperty("expiresAt");
    expect(
      assembleCertificatePortfolio({
        entries: [entry({ expiresAt: "2027-01-01T00:00:00.000Z" })]
      }).entries[0]?.expiresAt
    ).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("B: every lifecycle status is presentable", () => {
  it("B: all five statuses survive composition unchanged", () => {
    for (const status of CERTIFICATE_LIFECYCLE_STATUSES) {
      const portfolio = assembleCertificatePortfolio({
        entries: [entry({ status })]
      });
      expect(portfolio.entries[0]?.status).toBe(status);
    }
  });

  it("B2: composition derives no status of its own", () => {
    // Whatever CERT-004 resolved is what appears; nothing is recomputed.
    const portfolio = assembleCertificatePortfolio({
      entries: [
        entry({ status: "revoked", statusEffectiveAt: "2026-05-05T00:00:00.000Z" })
      ]
    });
    expect(portfolio.entries[0]?.status).toBe("revoked");
    expect(portfolio.entries[0]?.statusEffectiveAt).toBe(
      "2026-05-05T00:00:00.000Z"
    );
  });
});

describe("C: filtering", () => {
  const active = entry({ certificateId: "c-active", status: "active" });
  const revoked = entry({
    certificateId: "c-revoked",
    status: "revoked",
    certificateDefinitionStableId: "certdef-other-001",
    certificateTitle: "Other Certificate"
  });

  it("C: filters by status", () => {
    expect(
      filterCertificatePortfolioEntries([active, revoked], { status: "revoked" })
    ).toEqual([revoked]);
  });

  it("C2: filters by certificate definition", () => {
    expect(
      filterCertificatePortfolioEntries([active, revoked], {
        certificateDefinitionStableId: "certdef-other-001"
      })
    ).toEqual([revoked]);
  });

  it("C3: filters combine", () => {
    expect(
      filterCertificatePortfolioEntries([active, revoked], {
        status: "active",
        certificateDefinitionStableId: "certdef-other-001"
      })
    ).toEqual([]);
  });

  it("C4: no filter returns everything owned", () => {
    expect(filterCertificatePortfolioEntries([active, revoked], {})).toHaveLength(
      2
    );
  });

  it("C5: an unrecognised filter value is ignored, not rejected", () => {
    expect(normalizeCertificatePortfolioFilters({ status: "banana" })).toEqual(
      {}
    );
    expect(
      normalizeCertificatePortfolioFilters({ status: "revoked" })
    ).toEqual({ status: "revoked" });
    expect(
      normalizeCertificatePortfolioFilters({
        certificateDefinitionStableId: "   "
      })
    ).toEqual({});
  });

  it("C6: filter options are derived from the full owned set", () => {
    // Narrowing to one status must not hide the way back.
    const portfolio = assembleCertificatePortfolio({
      entries: [active, revoked],
      filters: { status: "active" }
    });
    expect(portfolio.entries).toHaveLength(1);
    expect(portfolio.availableFilters.statuses).toHaveLength(2);
    expect(portfolio.totalCount).toBe(2);
  });

  it("C7: filter options count and label each status", () => {
    const options = buildCertificatePortfolioFilterOptions([
      active,
      entry({ certificateId: "c-2", status: "active" }),
      revoked
    ]);
    const activeOption = options.statuses.find((s) => s.value === "active");
    expect(activeOption?.count).toBe(2);
    expect(activeOption?.label).toBe("Active");
  });

  it("C8: filter options never reference a certificate the learner lacks", () => {
    const options = buildCertificatePortfolioFilterOptions([active]);
    expect(options.certificates).toEqual([
      { value: "certdef-net-foundations-001", label: "Network Foundations" }
    ]);
  });
});

describe("D: deterministic sorting", () => {
  it("D: most recently issued first", () => {
    const older = entry({ certificateId: "old", issuedAt: "2025-01-01T00:00:00.000Z" });
    const newer = entry({ certificateId: "new", issuedAt: "2026-06-01T00:00:00.000Z" });
    expect(
      sortCertificatePortfolioEntries([older, newer]).map((e) => e.certificateId)
    ).toEqual(["new", "old"]);
  });

  it("D2: order is total when issue dates tie", () => {
    const a = entry({ certificateId: "b", certificateTitle: "Alpha" });
    const b = entry({ certificateId: "a", certificateTitle: "Beta" });
    expect(
      sortCertificatePortfolioEntries([b, a]).map((e) => e.certificateTitle)
    ).toEqual(["Alpha", "Beta"]);
  });

  it("D3: identical input in any order yields identical output", () => {
    const entries = [
      entry({ certificateId: "a", issuedAt: "2026-01-01T00:00:00.000Z" }),
      entry({ certificateId: "b", issuedAt: "2026-01-01T00:00:00.000Z" }),
      entry({ certificateId: "c", issuedAt: "2026-02-01T00:00:00.000Z" })
    ];
    const forwards = sortCertificatePortfolioEntries(entries);
    const backwards = sortCertificatePortfolioEntries([...entries].reverse());
    expect(backwards).toEqual(forwards);
  });

  it("D4: sorting does not mutate its input", () => {
    const entries = [
      entry({ certificateId: "a", issuedAt: "2025-01-01T00:00:00.000Z" }),
      entry({ certificateId: "b", issuedAt: "2026-01-01T00:00:00.000Z" })
    ];
    const snapshot = entries.map((e) => e.certificateId);
    sortCertificatePortfolioEntries(entries);
    expect(entries.map((e) => e.certificateId)).toEqual(snapshot);
  });
});

describe("E: partial failure", () => {
  it("E: an unresolvable certificate is listed, not dropped", () => {
    const portfolio = assembleCertificatePortfolio({
      entries: [entry()],
      unavailableEntries: [
        { certificateId: "certificate-2", reason: "details_unavailable" }
      ]
    });
    expect(portfolio.entries).toHaveLength(1);
    expect(portfolio.unavailableEntries).toEqual([
      { certificateId: "certificate-2", reason: "details_unavailable" }
    ]);
  });

  it("E2: the rest of the portfolio stays usable", () => {
    const portfolio = assembleCertificatePortfolio({
      entries: [entry({ certificateId: "ok-1" }), entry({ certificateId: "ok-2" })],
      unavailableEntries: [{ certificateId: "bad", reason: "status_unavailable" }]
    });
    expect(portfolio.entries).toHaveLength(2);
    expect(portfolio.availableFilters.statuses.length).toBeGreaterThan(0);
  });

  it("E3: an unresolved certificate fabricates nothing", () => {
    const portfolio = assembleCertificatePortfolio({
      entries: [],
      unavailableEntries: [{ certificateId: "bad", reason: "status_unavailable" }]
    });
    const serialized = JSON.stringify(portfolio.unavailableEntries);
    for (const invented of [
      "active",
      "expired",
      "revoked",
      "Network",
      "cert1_",
      "competency"
    ]) {
      expect(serialized).not.toContain(invented);
    }
  });

  it("E4: unavailable wording reassures without inventing detail", () => {
    const message = describeUnavailableEntry();
    expect(message).toContain("still yours");
    expect(message).not.toMatch(/expired|revoked|invalid/i);
  });

  it("E5: unavailable entries are ordered deterministically", () => {
    const portfolio = assembleCertificatePortfolio({
      entries: [],
      unavailableEntries: [
        { certificateId: "b", reason: "details_unavailable" },
        { certificateId: "a", reason: "status_unavailable" }
      ]
    });
    expect(portfolio.unavailableEntries.map((e) => e.certificateId)).toEqual([
      "a",
      "b"
    ]);
  });
});

describe("F: presentation and privacy", () => {
  it("F: the count summary reflects filtering honestly", () => {
    expect(
      describePortfolioCount({ entries: [entry()], totalCount: 1 })
    ).toBe("1 certificate.");
    expect(
      describePortfolioCount({
        entries: [entry(), entry({ certificateId: "c-2" })],
        totalCount: 2
      })
    ).toBe("2 certificates.");
    expect(
      describePortfolioCount({ entries: [entry()], totalCount: 3 })
    ).toBe("1 of 3 certificates shown.");
  });

  it("F2: an entry carries no holder identity", () => {
    const value = entry() as unknown as Record<string, unknown>;
    for (const forbidden of [
      "userId",
      "user_id",
      "studentId",
      "displayName",
      "email",
      "holderName"
    ]) {
      expect(value).not.toHaveProperty(forbidden);
    }
  });

  it("F3: an entry carries no Evidence detail beyond pinned competencies", () => {
    const serialized = JSON.stringify(entry());
    for (const forbidden of [
      "evidenceId",
      "evidenceOutcome",
      "resultState",
      "digest",
      "score",
      "attempt",
      "labSession",
      "correction"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("F4: an entry carries no CERT-007 or CERT-008 field", () => {
    const value = entry() as unknown as Record<string, unknown>;
    for (const forbidden of [
      "shareUrl",
      "shareLink",
      "pdfUrl",
      "downloadUrl",
      "reason",
      "actorId",
      "replacementCertificateId"
    ]) {
      expect(value).not.toHaveProperty(forbidden);
    }
  });

  it("F5: the entry shape is exactly the approved field set", () => {
    expect(Object.keys(entry()).sort()).toEqual([
      "certificateDefinitionStableId",
      "certificateDefinitionVersion",
      "certificateId",
      "certificateTitle",
      "competencySummary",
      "issuedAt",
      "issuer",
      "status",
      "statusEffectiveAt",
      "verificationReference"
    ]);
  });

  it("F6: composition is deterministic", () => {
    const results = new Set<string>();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      results.add(
        JSON.stringify(assembleCertificatePortfolio({ entries: [entry()] }))
      );
    }
    expect(results.size).toBe(1);
  });
});
