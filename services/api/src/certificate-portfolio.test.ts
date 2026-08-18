import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CERT-006 structural, ownership and privacy boundaries, plus executable
 * coverage of the outcomes that depend on data responses.
 *
 * The client factory is mocked using the narrowly scoped precedent introduced
 * in CERT-005: ownership scoping and partial-failure degradation cannot be
 * proven by reading source.
 *
 * NOT proven here: real RLS cross-user isolation, live query behaviour and
 * performance. Those need a live PostgreSQL harness, which this repository does
 * not have.
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

const service = read("./certificate-portfolio.ts");
const server = read("./server.ts");
const serviceCode = stripTsComments(service);

// Bounded at the start of the CERT-004 route's `if`: the CERT-004 comment block
// precedes this one in the file, so slicing to it would invert the range.
const portfolioRoute = server.slice(
  server.indexOf("// CERT-006 — the learner's private certificate portfolio."),
  server.indexOf('if (request.method === "GET" && pathname === "/certificates")')
);

const USER_ID = "11111111-1111-4111-8111-111111111111";
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
  const client = {
    from: (name: string) => {
      seen.push(name);
      return table(tables[name] ?? { data: [], error: null });
    }
  };
  return { client, seen };
}

async function loadService() {
  return import("./certificate-portfolio");
}

async function mockedFactory() {
  const supabase = await import("./supabase");
  return vi.mocked(supabase.createServerSupabaseClient);
}

const healthyTables = {
  certificates: { data: [certificateRow], error: null },
  certificate_lifecycle_events: { data: [], error: null },
  certificate_definitions: {
    data: [
      { id: "definition-1", title: "Network Foundations", issuer: "TLP" }
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
  }
};

describe("Z: executable portfolio behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("A: an owner receives an enriched portfolio", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning(healthyTables);
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    const portfolio = await getStudentCertificatePortfolio(USER_ID);

    expect(portfolio.totalCount).toBe(1);
    const [only] = portfolio.entries;
    expect(only?.certificateTitle).toBe("Network Foundations");
    expect(only?.issuer).toBe("TLP");
    expect(only?.status).toBe("active");
    expect(only?.competencySummary).toEqual([
      { title: "Subnetting", version: 3 }
    ]);
    expect(only?.verificationReference).toBe(REFERENCE);
  });

  it("B: a revoked certificate is presented with its recorded status", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning({
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
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    const portfolio = await getStudentCertificatePortfolio(USER_ID);
    expect(portfolio.entries[0]?.status).toBe("revoked");
  });

  it("C: an incoherent history degrades to unavailable, never a fabricated status", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning({
      ...healthyTables,
      // Sequence gap: replay cannot be trusted.
      certificate_lifecycle_events: {
        data: [
          {
            id: "event-2",
            certificate_id: "certificate-1",
            sequence_number: 2,
            previous_status: "active",
            new_status: "revoked",
            effective_at: "2026-03-01T00:00:00.000Z",
            occurred_at: "2026-03-01T00:00:00.000Z"
          }
        ],
        error: null
      }
    });
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    const portfolio = await getStudentCertificatePortfolio(USER_ID);

    expect(portfolio.entries).toEqual([]);
    expect(portfolio.unavailableEntries).toEqual([
      { certificateId: "certificate-1", reason: "status_unavailable" }
    ]);
    // The owned certificate was not dropped.
    expect(portfolio.unavailableEntries).toHaveLength(1);
  });

  it("C2: a missing definition degrades to unavailable, keeping the rest usable", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning({
      ...healthyTables,
      certificates: {
        data: [
          certificateRow,
          {
            ...certificateRow,
            id: "certificate-2",
            certificate_definition_id: "definition-missing"
          }
        ],
        error: null
      }
    });
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    const portfolio = await getStudentCertificatePortfolio(USER_ID);

    expect(portfolio.entries).toHaveLength(1);
    expect(portfolio.entries[0]?.certificateId).toBe("certificate-1");
    expect(portfolio.unavailableEntries).toEqual([
      { certificateId: "certificate-2", reason: "details_unavailable" }
    ]);
  });

  it("C3: an unrecognised recorded status degrades to unavailable", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning({
      ...healthyTables,
      certificate_lifecycle_events: {
        data: [
          {
            id: "event-1",
            certificate_id: "certificate-1",
            sequence_number: 1,
            previous_status: "active",
            new_status: "quarantined",
            effective_at: "2026-03-01T00:00:00.000Z",
            occurred_at: "2026-03-01T00:00:00.000Z"
          }
        ],
        error: null
      }
    });
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    const portfolio = await getStudentCertificatePortfolio(USER_ID);
    expect(portfolio.unavailableEntries[0]?.reason).toBe("details_unavailable");
  });

  it("D: every read is scoped to the caller's own user id", async () => {
    const factory = await mockedFactory();
    const eqCalls: unknown[][] = [];

    const client = {
      from: (_name: string) => {
        const builder: Record<string, unknown> = {};
        const self = () => builder;
        builder.select = self;
        builder.in = self;
        builder.eq = (...args: unknown[]) => {
          eqCalls.push(args);
          return builder;
        };
        builder.maybeSingle = async () => ({ data: null, error: null });
        builder.then = (resolve: (value: unknown) => unknown) =>
          resolve({ data: [], error: null });
        return builder;
      }
    };
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    await getStudentCertificatePortfolio(USER_ID);

    // The certificates query is filtered on the trusted user id.
    expect(eqCalls).toContainEqual(["user_id", USER_ID]);
  });

  it("D2: a blank identifier is refused before any query", async () => {
    const factory = await mockedFactory();
    const { getStudentCertificatePortfolio } = await loadService();

    await expect(getStudentCertificatePortfolio("  ")).rejects.toThrow(
      /student identifier is required/i
    );
    expect(factory).not.toHaveBeenCalled();
  });

  it("E: a whole-portfolio dependency failure raises rather than implying none", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning({
      certificates: { data: null, error: { message: "connection reset" } }
    });
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    await expect(getStudentCertificatePortfolio(USER_ID)).rejects.toThrow(
      /Unable to read your certificates/
    );
  });

  it("F: filters narrow the view without hiding the way back", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning({
      ...healthyTables,
      certificates: {
        data: [
          certificateRow,
          { ...certificateRow, id: "certificate-2", verification_id: `cert1_${"b2".repeat(24)}` }
        ],
        error: null
      }
    });
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    const portfolio = await getStudentCertificatePortfolio(USER_ID, {
      status: "revoked"
    });

    expect(portfolio.entries).toEqual([]);
    expect(portfolio.totalCount).toBe(2);
    expect(portfolio.availableFilters.statuses[0]?.value).toBe("active");
  });

  it("G: an owner with no certificates gets an empty portfolio, not an error", async () => {
    const factory = await mockedFactory();
    const { client } = clientReturning({
      certificates: { data: [], error: null }
    });
    factory.mockReturnValue(client as never);

    const { getStudentCertificatePortfolio } = await loadService();
    const portfolio = await getStudentCertificatePortfolio(USER_ID);
    expect(portfolio.entries).toEqual([]);
    expect(portfolio.totalCount).toBe(0);
  });
});

describe("H: route and ownership boundary", () => {
  it("H: the route resolves the trusted identity as the subject", () => {
    expect(portfolioRoute).toContain("resolveTrustedRequestIdentity(request)");
    expect(portfolioRoute).toContain("trusted.identity.userId");
  });

  it("H2: no client-supplied identity can select whose portfolio is read", () => {
    for (const forbidden of [
      "body.userId",
      "body.studentId",
      'searchParams.get("userId")',
      'searchParams.get("studentId")',
      "readJsonBody"
    ]) {
      expect(portfolioRoute).not.toContain(forbidden);
    }
  });

  it("H3: the route is GET only", () => {
    expect(portfolioRoute).toContain('request.method === "GET"');
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(portfolioRoute).not.toContain(`request.method === "${method}"`);
    }
  });

  it("H4: only approved filter parameters are accepted", () => {
    expect(portfolioRoute).toContain('searchParams.get("status")');
    expect(portfolioRoute).toContain(
      'searchParams.get("certificateDefinitionStableId")'
    );
    expect(portfolioRoute).toContain("normalizeCertificatePortfolioFilters");
  });

  it("H5: no anonymous or admin portfolio route exists", () => {
    expect(server).not.toContain("/admin/certificates/portfolio");
    const portfolioRoutes = (
      server.match(/pathname === "\/certificates\/portfolio"/g) ?? []
    ).length;
    expect(portfolioRoutes).toBe(1);
  });

  it("H6: the service scopes its read to the user", () => {
    expect(service).toContain('.eq("user_id", userId)');
  });
});

describe("I: source-of-truth boundaries", () => {
  it("I: lifecycle status comes from the CERT-004 resolver", () => {
    expect(service).toContain("resolveEffectiveCertificateStatus");
  });

  it("I2: no lifecycle logic is reimplemented", () => {
    for (const forbidden of [
      "isValidCertificateLifecycleTransition",
      "calculateCertificateExpiry",
      "PERMITTED_TRANSITIONS"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
    expect(serviceCode).not.toMatch(
      /status\s*=\s*"(active|expired|revoked|superseded|corrected)"/
    );
  });

  it("I3: eligibility and issuance are not touched", () => {
    for (const forbidden of [
      "evaluateCertificateEligibility",
      "getStudentCertificateEligibility",
      "issueStudentCertificate",
      "decideCertificateIssuance"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("I4: competency provenance is read, never recomputed", () => {
    expect(service).toContain("certificate_competency_snapshots");
    expect(serviceCode).not.toContain("evidence_competency_links");
    expect(serviceCode).not.toContain("qualifiesForDemonstration");
  });

  it("I5: the portfolio performs no write", () => {
    for (const write of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(serviceCode).not.toContain(write);
    }
  });
});

describe("J: privacy", () => {
  it("J: no profile or email data is read", () => {
    for (const forbidden of ["user_profiles", "display_name", "email", "auth.users"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("J2: no Evidence table is read", () => {
    for (const table of [
      "evidence_records",
      "evidence_correction_events",
      "evidence_verification_references",
      "certificate_evidence_snapshots"
    ]) {
      expect(serviceCode).not.toContain(table);
    }
  });

  it("J3: no Evidence detail concept appears", () => {
    for (const forbidden of [
      "evidenceId",
      "evidenceOutcome",
      "resultState",
      "integrity",
      "digest",
      "score"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });
});

describe("K: CERT-004 and CERT-005 contracts are unchanged", () => {
  it("K: StudentCertificateRecord still carries no verification reference", () => {
    const lifecycleTypes = readFileSync(
      new URL(
        "../../../packages/shared-types/src/certificate-lifecycle.ts",
        import.meta.url
      ),
      "utf8"
    );
    const recordShape = lifecycleTypes.slice(
      lifecycleTypes.indexOf("export interface StudentCertificateRecord"),
      lifecycleTypes.indexOf("export interface StudentCertificateRecord") + 500
    );
    expect(recordShape).not.toContain("verificationId");
    expect(recordShape).not.toContain("verificationReference");
  });

  it("K2: the CERT-004 lifecycle service still has no verification data", () => {
    const lifecycleService = read("./certificate-lifecycle.ts");
    expect(stripTsComments(lifecycleService)).not.toContain("verification_id");
  });

  it("K3: the CERT-005 public DTO gained no field", () => {
    const verificationTypes = readFileSync(
      new URL(
        "../../../packages/shared-types/src/certificate-verification.ts",
        import.meta.url
      ),
      "utf8"
    );
    const dto = verificationTypes.slice(
      verificationTypes.indexOf(
        "export interface CertificateVerificationRecord"
      ),
      verificationTypes.indexOf("export type CertificateVerificationOutcome")
    );
    expect(dto).not.toContain("holder");
    expect(dto).not.toContain("userId");
    expect(dto).not.toContain("verificationId");
  });

  it("K4: the CERT-004 route still exists unchanged", () => {
    expect(server).toContain('pathname === "/certificates"');
    expect(server).toContain("listStudentCertificateRecords(");
  });
});

describe("L: no CERT-007+ behaviour", () => {
  it("L: no export, share, download, PDF or QR behaviour exists", () => {
    for (const forbidden of [
      "shareLink",
      "share_link",
      "shareUrl",
      "download",
      "pdf",
      "qr",
      "branding",
      "employer"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("L2: no CERT-008 workflow exists", () => {
    for (const forbidden of [
      "revoke",
      "restore",
      "replacementCertificate",
      "correctCertificate"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("L3: no lifecycle event history is surfaced", () => {
    // The portfolio shows current status only; CERT-004 keeps the history.
    expect(serviceCode).not.toContain("lifecycleHistory");
    expect(serviceCode).not.toContain("transitionHistory");
  });

  it("L4: AI holds no authority", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
  });

  it("L5: credential kind is not consulted", () => {
    expect(serviceCode).not.toContain("certificateKind");
    expect(serviceCode).not.toContain("course_completion");
  });
});
