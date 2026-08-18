import { describe, expect, it } from "vitest";

/**
 * Behavioural tests for the portfolio's focus and verification-link logic.
 *
 * Source-scanning assertions (no export/share control, accessible markup,
 * no router) deliberately live in scripts/verify-wave8.sh instead: this is a
 * browser workspace with `types: ["vite/client"]` and no Node types, so
 * reading files from a test here would mean adding `@types/node` to a browser
 * package.
 */
import type { CertificatePortfolioEntry } from "@tlp/shared-types";
import {
  buildCertificateVerificationHref,
  buildPortfolioDetailRegionId,
  describePortfolioDetailToggle,
  isPortfolioCertificateSelected,
  resolvePortfolioSelection,
  selectPortfolioCertificate
} from "./certificate-portfolio-presentation";
import { readVerificationReferenceFromPath } from "./CertificateVerificationView";

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

describe("focusing a single certificate", () => {
  it("focuses a certificate that is not currently focused", () => {
    expect(selectPortfolioCertificate(null, "cert-a")).toBe("cert-a");
  });

  it("moves focus directly from one certificate to another", () => {
    expect(selectPortfolioCertificate("cert-a", "cert-b")).toBe("cert-b");
  });

  it("unfocuses the certificate that is already focused", () => {
    expect(selectPortfolioCertificate("cert-a", "cert-a")).toBeNull();
  });

  it("never reports two certificates as focused at once", () => {
    const entries = [
      entry({ certificateId: "cert-a" }),
      entry({ certificateId: "cert-b" })
    ];
    const selected = selectPortfolioCertificate(null, "cert-b");

    expect(isPortfolioCertificateSelected(entries, selected, "cert-a")).toBe(
      false
    );
    expect(isPortfolioCertificateSelected(entries, selected, "cert-b")).toBe(
      true
    );
  });
});

describe("resolving the focused certificate against what is on screen", () => {
  it("returns the focused entry with its full detail intact", () => {
    const entries = [
      entry({ certificateId: "cert-a", certificateTitle: "First" }),
      entry({
        certificateId: "cert-b",
        certificateTitle: "Second",
        issuer: "Technical Learning Platform",
        issuedAt: "2026-03-04T09:00:00.000Z",
        expiresAt: "2027-03-04T09:00:00.000Z",
        certificateDefinitionVersion: 5,
        status: "expired",
        competencySummary: [{ title: "Contain an incident", version: 4 }]
      })
    ];

    const focused = resolvePortfolioSelection(entries, "cert-b");

    expect(focused).not.toBeNull();
    expect(focused?.certificateTitle).toBe("Second");
    expect(focused?.issuer).toBe("Technical Learning Platform");
    expect(focused?.issuedAt).toBe("2026-03-04T09:00:00.000Z");
    expect(focused?.expiresAt).toBe("2027-03-04T09:00:00.000Z");
    expect(focused?.certificateDefinitionVersion).toBe(5);
    expect(focused?.status).toBe("expired");
    expect(focused?.competencySummary).toEqual([
      { title: "Contain an incident", version: 4 }
    ]);
  });

  it("returns nothing when no certificate is focused", () => {
    expect(resolvePortfolioSelection([entry()], null)).toBeNull();
  });

  it("drops a stale focus when filtering removes that certificate", () => {
    const beforeFiltering = [
      entry({ certificateId: "cert-a" }),
      entry({ certificateId: "cert-b" })
    ];
    const afterFiltering = beforeFiltering.filter(
      (candidate) => candidate.certificateId === "cert-a"
    );

    expect(resolvePortfolioSelection(beforeFiltering, "cert-b")).not.toBeNull();
    expect(resolvePortfolioSelection(afterFiltering, "cert-b")).toBeNull();
    expect(
      isPortfolioCertificateSelected(afterFiltering, "cert-b", "cert-a")
    ).toBe(false);
  });

  it("resolves nothing when the portfolio is empty", () => {
    expect(resolvePortfolioSelection([], "cert-a")).toBeNull();
  });
});

describe("the focus control", () => {
  it("offers to open details, naming the certificate", () => {
    expect(describePortfolioDetailToggle(entry(), false)).toBe(
      "View details for Network Defence Practitioner"
    );
  });

  it("offers to close details once they are open", () => {
    expect(describePortfolioDetailToggle(entry(), true)).toBe(
      "Hide details for Network Defence Practitioner"
    );
  });

  it("gives each certificate its own detail region id", () => {
    expect(buildPortfolioDetailRegionId("cert-a")).toBe(
      "certificate-cert-a-details"
    );
    expect(buildPortfolioDetailRegionId("cert-a")).not.toBe(
      buildPortfolioDetailRegionId("cert-b")
    );
  });
});

describe("the verification action reaches the CERT-005 public page", () => {
  it("points at the public verification path for this certificate", () => {
    expect(buildCertificateVerificationHref("cert1_abc123")).toBe(
      "/verify/cert1_abc123"
    );
  });

  /**
   * The contract proof: the link CERT-006 renders is parsed by CERT-005's own
   * path reader — the same function App.tsx uses to route — and yields back
   * exactly the reference the portfolio held. CERT-006 duplicates none of
   * CERT-005's verification logic; it only hands it a reference.
   */
  it("round-trips through CERT-005's own path reader", () => {
    const owned = entry();
    const href = buildCertificateVerificationHref(owned.verificationReference);

    expect(readVerificationReferenceFromPath(href)).toBe(
      owned.verificationReference
    );
  });

  it("round-trips references that would otherwise break the path", () => {
    for (const reference of ["cert1_a/b", "cert1_a b", "cert1_a%2Fb", "cert1_ü"]) {
      expect(
        readVerificationReferenceFromPath(
          buildCertificateVerificationHref(reference)
        )
      ).toBe(reference);
    }
  });

  it("produces a distinct verification target per certificate", () => {
    const first = entry({ verificationReference: "cert1_aaa" });
    const second = entry({ verificationReference: "cert1_bbb" });

    expect(buildCertificateVerificationHref(first.verificationReference)).not.toBe(
      buildCertificateVerificationHref(second.verificationReference)
    );
  });
});
