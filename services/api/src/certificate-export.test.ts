import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CERT-007 structural, ownership and privacy boundaries, plus executable
 * coverage of the outcomes that depend on data responses.
 *
 * The client factory is mocked using the precedent introduced in CERT-005 and
 * reused in CERT-006: ownership scoping and partial-failure degradation cannot
 * be proven by reading source.
 *
 * NOT proven here: real RLS cross-user isolation and live query behaviour.
 * Those need a live PostgreSQL harness, which this repository does not have.
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

const service = read("./certificate-export.ts");
const server = read("./server.ts");
const serviceCode = stripTsComments(service);

// Anchored at the next route's `if (`: the CERT-002 discovery comment follows
// this block, so slicing to a later comment would invert the range.
const exportRoute = server.slice(
  server.indexOf("// CERT-007 — the student's own certificate export."),
  server.indexOf("// CERT-002 — certificates a student may select for evaluation.")
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

const definitionRow = {
  id: "definition-1",
  title: "Network Foundations",
  issuer: "TLP"
};

const snapshotRow = {
  certificate_id: "certificate-1",
  competency_stable_id: "competency.subnetting",
  competency_version: 3
};

const competencyRow = {
  stable_id: "competency.subnetting",
  version: 3,
  title: "Subnetting"
};

/** A chainable, awaitable stand-in for one Supabase table query. */
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

const healthyTables = {
  certificates: { data: [certificateRow], error: null },
  certificate_lifecycle_events: { data: [], error: null },
  certificate_definitions: { data: [definitionRow], error: null },
  certificate_competency_snapshots: { data: [snapshotRow], error: null },
  competencies: { data: [competencyRow], error: null }
};

async function runExport(
  tables: Record<string, { data?: unknown; error?: unknown }>,
  userId = USER_ID
) {
  const { createServerSupabaseClient } = await import("./supabase");
  const { client, seen, eqCalls } = clientReturning(tables);
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof createServerSupabaseClient>
  );

  const { exportStudentCertificates } = await import("./certificate-export");
  const result = await exportStudentCertificates(userId);

  return { result, seen, eqCalls };
}

describe("A: route ownership", () => {
  it("A: exactly one export route exists, and it is a POST", () => {
    expect(exportRoute).toContain(
      'request.method === "POST" && pathname === "/certificates/export"'
    );
    for (const method of ["GET", "PATCH", "PUT", "DELETE"]) {
      expect(exportRoute).not.toContain(`request.method === "${method}"`);
    }
  });

  it("A2: the route uses the trusted identity as the subject", () => {
    expect(exportRoute).toContain("trusted.identity.userId");
  });

  it("A3: no client-supplied identity can select whose certificates export", () => {
    for (const forbidden of ["body.userId", "body.studentId", "searchParams.get(\"userId\")"]) {
      expect(exportRoute).not.toContain(forbidden);
    }
  });

  it("A4: no admin or public export route exists", () => {
    expect(server).not.toContain("/admin/certificates/export");
    expect(server).not.toContain("/certificates/export/public");
    expect(server).not.toContain("/share/certificates");
  });
});

describe("B: source-of-truth boundaries", () => {
  it("B: the service derives no lifecycle status of its own", () => {
    expect(serviceCode).not.toContain("resolveEffectiveCertificateStatus");
    expect(serviceCode).not.toContain('"active"');
    expect(serviceCode).not.toContain('"revoked"');
  });

  it("B2: the export composes the CERT-006 portfolio rather than re-reading", () => {
    expect(serviceCode).toContain("getStudentCertificatePortfolio");
    expect(serviceCode).not.toContain('.from("certificates")');
    expect(serviceCode).not.toContain(".select(");
  });

  it("B3: the service evaluates no eligibility and issues nothing", () => {
    for (const forbidden of [
      "evaluateCertificateEligibility",
      "issueStudentCertificate",
      "certificate_issue"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("B4: the service writes no certificate data", () => {
    for (const forbidden of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });
});

describe("C: no CERT-008 or CERT-009 behaviour", () => {
  it("C: no lifecycle control leaked into the export path", () => {
    expect(serviceCode).not.toMatch(/\brevoke\b/i);
    expect(serviceCode).not.toMatch(/\brestore\b/i);
    expect(serviceCode).not.toMatch(/replacementCertificate/i);
  });

  it("C2: no branding, presentation asset or holder identity", () => {
    for (const forbidden of [
      "logo",
      "brandAsset",
      "typography",
      "displayName",
      "holderName",
      "user_profiles"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("C3: no share link is minted anywhere", () => {
    for (const forbidden of ["shareToken", "share_link", "shareUrl", "randomBytes"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("C4: no AI dependency exists in the export path", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
  });
});

describe("D: executable export behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("D: exports the student's certificate with its verification reference", async () => {
    const { result } = await runExport(healthyTables);

    expect(result.totalCount).toBe(1);
    expect(result.certificates[0]?.certificateTitle).toBe("Network Foundations");
    expect(result.certificates[0]?.verificationReference).toBe(REFERENCE);
    expect(result.certificates[0]?.currentlyValid).toBe(true);
  });

  it("D2: scopes every read to the caller's own user id", async () => {
    const { eqCalls } = await runExport(healthyTables);

    const userScoped = eqCalls.filter(([column]) => column === "user_id");
    expect(userScoped.length).toBeGreaterThan(0);
    for (const [, value] of userScoped) {
      expect(value).toBe(USER_ID);
    }
  });

  it("D3: a different caller cannot receive the first caller's scoping", async () => {
    const { eqCalls } = await runExport(healthyTables, OTHER_USER_ID);

    for (const [column, value] of eqCalls.filter(([c]) => c === "user_id")) {
      expect(column).toBe("user_id");
      expect(value).toBe(OTHER_USER_ID);
    }
  });

  it("D4: refuses a blank identifier before any query", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockClear();

    const { exportStudentCertificates } = await import("./certificate-export");

    await expect(exportStudentCertificates("  ")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("D5: a revoked certificate is exported as not currently valid", async () => {
    const { result } = await runExport({
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

    expect(result.certificates[0]?.status).toBe("revoked");
    expect(result.certificates[0]?.currentlyValid).toBe(false);
    expect(result.currentlyValidCount).toBe(0);
  });

  it("D6: a certificate whose details cannot resolve is listed, not dropped", async () => {
    const { result } = await runExport({
      ...healthyTables,
      certificate_definitions: { data: [], error: null }
    });

    expect(result.certificates).toHaveLength(0);
    expect(result.unavailableCertificates).toHaveLength(1);
    expect(result.unavailableCertificates[0]?.reason.length).toBeGreaterThan(0);
  });

  it("D7: a whole-portfolio failure raises rather than implying none", async () => {
    await expect(
      runExport({
        ...healthyTables,
        certificates: { data: null, error: { message: "unavailable" } }
      })
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });

  it("D8: an empty portfolio exports cleanly", async () => {
    const { result } = await runExport({
      ...healthyTables,
      certificates: { data: [], error: null }
    });

    expect(result.totalCount).toBe(0);
    expect(result.certificates).toEqual([]);
    expect(result.unavailableCertificates).toEqual([]);
  });

  it("D9: the export never carries the certificate id or student identity", async () => {
    const { result } = await runExport(healthyTables);
    const serialized = JSON.stringify(result);

    for (const leak of [certificateRow.id, USER_ID, definitionRow.id]) {
      expect(serialized).not.toContain(leak);
    }
  });

  it("D10: the export is stamped with the format version", async () => {
    const { result } = await runExport(healthyTables);

    expect(result.formatVersion).toBe("certificate-export-v1");
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
