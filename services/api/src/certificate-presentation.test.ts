import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CERT-009 structural, authority and privacy boundaries, plus executable
 * coverage of composition, the holder name and the accessible fallback.
 *
 * The client factory is mocked using the precedent introduced in CERT-005:
 * owner scoping, brand resolution and fallback behaviour cannot be proven by
 * reading source.
 *
 * NOT proven here: real RLS isolation, live query behaviour, rendered DOM,
 * print output or colour contrast. Those need live PostgreSQL and a browser,
 * neither of which this repository has.
 */
vi.mock("./supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

const service = read("./certificate-presentation.ts");
const server = read("./server.ts");
const serviceCode = stripTsComments(service);
const exportService = read("./certificate-export.ts");
const verificationService = read("./certificate-verification.ts");

const presentationRoute = server.slice(
  server.indexOf("// CERT-009 — the owner's branded certificate presentation."),
  server.indexOf('if (request.method === "GET" && pathname === "/certificates")')
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const REFERENCE = `cert1_${"a1".repeat(24)}`;

const certificateRow = {
  id: "certificate-1",
  certificate_definition_id: "definition-1",
  certificate_definition_stable_id: "certdef-net-foundations-001",
  certificate_definition_version: 3,
  verification_id: REFERENCE,
  issued_at: "2026-01-01T00:00:00.000Z",
  expires_at: null
};

function table(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.in = self;
  builder.maybeSingle = async () => result;
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

function clientReturning(
  tables: Record<string, { data?: unknown; error?: unknown }>
) {
  const seen: string[] = [];
  const eqCalls: Array<[string, unknown]> = [];

  const client = {
    from: (name: string) => {
      seen.push(name);
      const builder = table(tables[name] ?? { data: [], error: null }) as Record<
        string,
        unknown
      >;
      const originalEq = builder.eq as () => unknown;
      builder.eq = (column: string, value: unknown) => {
        eqCalls.push([column, value]);
        return originalEq();
      };
      return builder;
    }
  };

  return { client, seen, eqCalls };
}

const healthyTables: Record<string, { data?: unknown; error?: unknown }> = {
  certificates: { data: [certificateRow], error: null },
  certificate_lifecycle_events: { data: [], error: null },
  certificate_definitions: {
    data: [
      {
        id: "definition-1",
        title: "Network Foundations",
        issuer: "TLP",
        stable_id: "certdef-net-foundations-001",
        version: 3,
        plain_language_title: "Builds and defends a small network",
        plain_language_summary: "Can segment and defend a small network.",
        logo_text_alternative: "Technical Learning Platform logo"
      }
    ],
    error: null
  },
  certificate_competency_snapshots: {
    data: [
      {
        certificate_id: "certificate-1",
        competency_stable_id: "competency.subnetting",
        competency_version: 3
      }
    ],
    error: null
  },
  competencies: {
    data: [
      { stable_id: "competency.subnetting", version: 3, title: "Subnetting" }
    ],
    error: null
  },
  user_profiles: { data: { display_name: "Alex Rivera" }, error: null }
};

async function present(
  tables: Record<string, { data?: unknown; error?: unknown }>,
  userId = USER_ID
) {
  const { createServerSupabaseClient } = await import("./supabase");
  const { client, seen, eqCalls } = clientReturning(tables);
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof createServerSupabaseClient>
  );

  const { getStudentCertificatePresentation } = await import(
    "./certificate-presentation"
  );
  const result = await getStudentCertificatePresentation(userId);

  return { result, seen, eqCalls };
}

describe("A: composes CERT-006, never replaces it", () => {
  it("A: builds on the portfolio projection", () => {
    expect(serviceCode).toContain("getStudentCertificatePortfolio");
  });

  it("A2: performs no certificate, lifecycle or competency read of its own", () => {
    for (const forbidden of [
      '.from("certificates")',
      '.from("certificate_lifecycle_events")',
      '.from("certificate_competency_snapshots")',
      '.from("competencies")'
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("A3: reads only the two presentation concerns it owns", () => {
    const reads = serviceCode.match(/\.from\("([a-z_]+)"\)/g) ?? [];
    expect(reads.sort()).toEqual([
      '.from("certificate_definitions")',
      '.from("user_profiles")'
    ]);
  });

  it("A4: calculates no credential truth", () => {
    for (const forbidden of [
      "resolveEffectiveCertificateStatus",
      "evaluateCertificateEligibility",
      "issueStudentCertificate",
      "applyCertificateCorrection",
      "isValidCertificateLifecycleTransition"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("A5: writes nothing at all", () => {
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(serviceCode).not.toContain(write);
    }
  });
});

describe("B: owner-only", () => {
  it("B: the route uses the trusted identity as the subject", () => {
    expect(presentationRoute).toContain("trusted.identity.userId");
  });

  it("B2: no client-supplied identity can select whose certificates render", () => {
    for (const forbidden of [
      "body.userId",
      "body.studentId",
      'searchParams.get("userId")',
      'searchParams.get("studentId")'
    ]) {
      expect(presentationRoute).not.toContain(forbidden);
    }
  });

  it("B3: the route is a GET read only", () => {
    expect(presentationRoute).toContain('request.method === "GET"');
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(presentationRoute).not.toContain(`request.method === "${method}"`);
    }
  });

  it("B4: no admin or public presentation route exists", () => {
    expect(server).not.toContain("/admin/certificates/presentation");
    expect(server).not.toContain("/certificates/presentation/public");
    expect(server).not.toContain("/verify/presentation");
  });

  it("B5: no migration accompanies CERT-009", () => {
    const certificateMigrations = readdirSync(
      new URL("../../../supabase/migrations", import.meta.url)
    )
      .filter((name) => name.includes("certificate"))
      .sort();

    // The four migrations CERT-001, CERT-003, CERT-004 and CERT-008 authored.
    // CERT-009 is presentation only and adds none.
    expect(certificateMigrations).toEqual([
      "20260813000700_certificate_definition_foundation.sql",
      "20260813000800_certificate_issuance_foundation.sql",
      "20260813000900_certificate_lifecycle_foundation.sql",
      "20260813001000_certificate_correction_foundation.sql"
    ]);
  });
});

describe("C: holder identity stays out of public and export surfaces", () => {
  it("C: only CERT-009 reads the display name", () => {
    expect(serviceCode).toContain("display_name");
    expect(stripTsComments(exportService)).not.toContain("display_name");
    expect(stripTsComments(verificationService)).not.toContain("display_name");
  });

  it("C2: CERT-005 never reads user_profiles", () => {
    expect(stripTsComments(verificationService)).not.toContain("user_profiles");
  });

  it("C3: CERT-007 never reads user_profiles", () => {
    expect(stripTsComments(exportService)).not.toContain("user_profiles");
  });

  it("C4: the display name read is scoped to the caller", () => {
    expect(serviceCode).toContain('.eq("user_id", userId)');
  });

  it("C5: no other learner's name can be requested", () => {
    expect(serviceCode).not.toContain("displayNameFor");
    expect(presentationRoute).not.toContain("display_name");
  });
});

describe("D: no forbidden presentation capability", () => {
  it("D: no PDF or QR generation", () => {
    expect(serviceCode).not.toMatch(/\bpdf\b/i);
    expect(serviceCode).not.toMatch(/\bqr\b/i);
    expect(serviceCode).not.toContain("canvas");
    expect(serviceCode).not.toContain("toDataURL");
  });

  it("D2: no second verification token", () => {
    for (const forbidden of ["randomBytes", "shareToken", "verificationToken"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("D3: no binary brand asset registry", () => {
    for (const forbidden of ["logoUrl", "brandAssetId", "asset_id", "storage"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("D4: no AI dependency", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
  });
});

describe("E: executable presentation behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("E: presents the certificate with its brand treatment", async () => {
    const { result } = await present(healthyTables);

    expect(result.certificates).toHaveLength(1);
    const model = result.certificates[0]!;
    expect(model.certificateTitle).toBe("Network Foundations");
    expect(model.plainLanguageTitle).toBe("Builds and defends a small network");
    expect(model.logoTextAlternative).toBe("Technical Learning Platform logo");
    expect(model.isFallback).toBe(false);
  });

  it("E2: names the holder from their current display name", async () => {
    const { result } = await present(healthyTables);

    expect(result.certificates[0]?.holderName).toBe("Alex Rivera");
    expect(result.certificates[0]?.holderLabel).toBe("Issued to Alex Rivera");
  });

  it("E3: scopes the display name read to the caller", async () => {
    const { eqCalls } = await present(healthyTables, OTHER_USER_ID);

    for (const [column, value] of eqCalls.filter(([c]) => c === "user_id")) {
      expect(column).toBe("user_id");
      expect(value).toBe(OTHER_USER_ID);
    }
  });

  it("E4: preserves certificate truth through presentation", async () => {
    const { result } = await present(healthyTables);
    const model = result.certificates[0]!;

    expect(model.issuedAt).toBe(certificateRow.issued_at);
    expect(model.certificateDefinitionVersion).toBe(3);
    expect(model.verificationReference).toBe(REFERENCE);
    expect(model.certificateId).toBe("certificate-1");
  });

  it("E5: falls back accessibly when brand metadata is missing", async () => {
    const { result } = await present({
      ...healthyTables,
      certificate_definitions: {
        data: [
          {
            id: "definition-1",
            title: "Network Foundations",
            issuer: "TLP",
            stable_id: "other-stable-id",
            version: 99,
            plain_language_title: null,
            plain_language_summary: null,
            logo_text_alternative: null
          }
        ],
        error: null
      }
    });

    const model = result.certificates[0]!;
    expect(model.isFallback).toBe(true);
    expect(model.certificateTitle).toBe("Network Foundations");
    expect(model.verificationReference).toBe(REFERENCE);
    expect(model.statusLabel.length).toBeGreaterThan(0);
  });

  it("E6: a missing display name never blocks presentation", async () => {
    const { result } = await present({
      ...healthyTables,
      user_profiles: { data: null, error: { message: "unavailable" } }
    });

    expect(result.certificates).toHaveLength(1);
    expect(result.certificates[0]).not.toHaveProperty("holderName");
    expect(result.certificates[0]?.holderLabel).toBe("Issued to you");
  });

  it("E7: a revoked certificate is presented as revoked", async () => {
    const { result } = await present({
      ...healthyTables,
      certificate_lifecycle_events: {
        data: [
          {
            id: "event-1",
            certificate_id: "certificate-1",
            sequence_number: 1,
            previous_status: "active",
            new_status: "revoked",
            effective_at: "2026-03-01T00:00:00.000Z",
            occurred_at: "2026-03-01T00:00:00.000Z"
          }
        ],
        error: null
      }
    });

    const model = result.certificates[0]!;
    expect(model.status).toBe("revoked");
    expect(model.statusLabel.toLowerCase()).toContain("revoked");
  });

  it("E8: a blank identifier is refused before any query", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockClear();

    const { getStudentCertificatePresentation } = await import(
      "./certificate-presentation"
    );

    await expect(getStudentCertificatePresentation("  ")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("E9: a whole-portfolio failure propagates rather than showing nothing", async () => {
    await expect(
      present({
        ...healthyTables,
        certificates: { data: null, error: { message: "unavailable" } }
      })
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });

  it("E10: an empty portfolio presents cleanly", async () => {
    const { result } = await present({
      ...healthyTables,
      certificates: { data: [], error: null }
    });

    expect(result.certificates).toEqual([]);
    expect(result.unavailableCount).toBe(0);
  });

  it("E11: the presentation never carries an identity or evidence field", async () => {
    const { result } = await present(healthyTables);
    const serialized = JSON.stringify(result);

    for (const leak of [USER_ID, "evidenceIds", "score", "actorId"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});
