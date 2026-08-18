import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS } from "@tlp/shared-types";

/**
 * The Supabase client is mocked so the verification outcomes can be exercised
 * for real rather than inferred from source.
 *
 * This is the first use of module mocking in this repository, introduced
 * deliberately: distinguishing "no such certificate" (404) from "the database
 * could not answer" (503) is a security-relevant behaviour, and no amount of
 * source inspection can prove which one a given failure produces. The mock is
 * scoped to this file and replaces only the client factory.
 */
vi.mock("./supabase", () => ({
  createServerSupabaseClient: vi.fn()
}));

/**
 * CERT-005 structural, privacy and security boundaries.
 *
 * This is the platform's only public data surface, so these assertions carry
 * more weight than usual: they prove what the public path cannot reach, which
 * no unit test on a pure function can establish.
 *
 * NOT proven here: enumeration resistance under real traffic, and RLS
 * behaviour of the privileged read. Both need a live database, which this
 * repository does not have.
 */

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

const service = read("./certificate-verification.ts");
const server = read("./server.ts");
const serviceCode = stripTsComments(service);

const verifyRoute = server.slice(
  server.indexOf("// CERT-005 — public certificate verification."),
  server.indexOf('pathname === "/ready"')
);

describe("Z: executable verification outcomes", () => {
  /**
   * These execute the real `verifyCertificateByReference`. The three outcomes
   * below are separate CERT-005 requirements and are proven independently:
   * a missing certificate is 404, a failing dependency is 503, and a malformed
   * reference is rejected before any lookup at all.
   */
  const VALID_REFERENCE = `cert1_${"a1".repeat(24)}`;

  /** A chainable, awaitable stand-in for one Supabase table query. */
  function table(result: { data?: unknown; error?: unknown }) {
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    builder.select = self;
    builder.eq = self;
    builder.maybeSingle = async () => result;
    builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return builder;
  }

  function clientReturning(
    tables: Record<string, { data?: unknown; error?: unknown }>
  ) {
    return {
      from: (name: string) => table(tables[name] ?? { data: null, error: null })
    };
  }

  const certificateRow = {
    id: "certificate-1",
    certificate_definition_id: "definition-1",
    certificate_definition_stable_id: "certdef-net-foundations-001",
    certificate_definition_version: 3,
    issued_at: "2026-01-01T00:00:00.000Z",
    expires_at: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadService() {
    return import("./certificate-verification");
  }

  async function mockedClientFactory() {
    const supabase = await import("./supabase");
    return vi.mocked(supabase.createServerSupabaseClient);
  }

  it("A: a well-formed unknown reference with a healthy dependency is not_found", async () => {
    const factory = await mockedClientFactory();
    factory.mockReturnValue(
      // The query succeeds and simply matches nothing.
      clientReturning({ certificates: { data: null, error: null } }) as never
    );

    const { verifyCertificateByReference } = await loadService();
    const result = await verifyCertificateByReference(VALID_REFERENCE);

    expect(result).toEqual({ outcome: "not_found" });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("B: a well-formed reference with a failing dependency is unavailable", async () => {
    const factory = await mockedClientFactory();
    factory.mockReturnValue(
      clientReturning({
        certificates: { data: null, error: { message: "connection reset" } }
      }) as never
    );

    const { verifyCertificateByReference } = await loadService();
    const result = await verifyCertificateByReference(VALID_REFERENCE);

    expect(result).toEqual({ outcome: "unavailable" });
    // Critically, a dependency failure is never reported as not_found.
    expect(result.outcome).not.toBe("not_found");
  });

  it("B2: a thrown dependency error is unavailable, never not_found", async () => {
    const factory = await mockedClientFactory();
    factory.mockImplementation(() => {
      throw new Error("Server Supabase configuration is not available");
    });

    const { verifyCertificateByReference } = await loadService();
    const result = await verifyCertificateByReference(VALID_REFERENCE);

    expect(result).toEqual({ outcome: "unavailable" });
  });

  it("B3: a failure on any later query is also unavailable", async () => {
    const factory = await mockedClientFactory();
    factory.mockReturnValue(
      clientReturning({
        certificates: { data: certificateRow, error: null },
        certificate_definitions: { data: null, error: { message: "boom" } }
      }) as never
    );

    const { verifyCertificateByReference } = await loadService();
    expect(await verifyCertificateByReference(VALID_REFERENCE)).toEqual({
      outcome: "unavailable"
    });
  });

  it("C: a malformed reference is rejected before any lookup", async () => {
    const factory = await mockedClientFactory();

    const { verifyCertificateByReference } = await loadService();

    for (const malformed of [
      "not-a-reference",
      "cert1_short",
      `cert1_${"a1".repeat(23)}`,
      "cert1_%",
      ""
    ]) {
      expect(await verifyCertificateByReference(malformed)).toEqual({
        outcome: "malformed_reference"
      });
    }

    // The decisive assertion: the client factory was never reached, so no
    // malformed or probing reference ever became a database query.
    expect(factory).not.toHaveBeenCalled();
  });

  it("D: a healthy lookup returns the curated payload and no identity", async () => {
    const factory = await mockedClientFactory();
    factory.mockReturnValue(
      clientReturning({
        certificates: { data: certificateRow, error: null },
        certificate_definitions: {
          data: { title: "Network Foundations", issuer: "TLP" },
          error: null
        },
        certificate_lifecycle_events: { data: [], error: null },
        certificate_competency_snapshots: {
          data: [
            { competency_stable_id: "competency.subnetting", competency_version: 3 }
          ],
          error: null
        },
        competencies: { data: { title: "Subnetting" }, error: null }
      }) as never
    );

    const { verifyCertificateByReference } = await loadService();
    const result = await verifyCertificateByReference(VALID_REFERENCE);

    expect(result.outcome).toBe("verified");
    if (result.outcome !== "verified") return;

    expect(result.certificate.certificateTitle).toBe("Network Foundations");
    expect(result.certificate.status).toBe("active");
    expect(result.certificate.competencySummary).toEqual([
      { title: "Subnetting", version: 3 }
    ]);

    // Nothing identifying, internal or Evidence-derived reached the payload.
    for (const forbidden of CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS) {
      expect(result.certificate).not.toHaveProperty(forbidden);
    }
  });

  it("E: an incoherent lifecycle history is unavailable, not a fabricated state", async () => {
    const factory = await mockedClientFactory();
    factory.mockReturnValue(
      clientReturning({
        certificates: { data: certificateRow, error: null },
        certificate_definitions: {
          data: { title: "Network Foundations", issuer: "TLP" },
          error: null
        },
        // A sequence gap: replay cannot be trusted.
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
      }) as never
    );

    const { verifyCertificateByReference } = await loadService();
    const result = await verifyCertificateByReference(VALID_REFERENCE);

    expect(result).toEqual({ outcome: "unavailable" });
    expect(result.outcome).not.toBe("not_found");
    expect(result.outcome).not.toBe("verified");
  });

  it("E2: an unrecognised recorded status is unavailable", async () => {
    const factory = await mockedClientFactory();
    factory.mockReturnValue(
      clientReturning({
        certificates: { data: certificateRow, error: null },
        certificate_definitions: {
          data: { title: "Network Foundations", issuer: "TLP" },
          error: null
        },
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
      }) as never
    );

    const { verifyCertificateByReference } = await loadService();
    expect(await verifyCertificateByReference(VALID_REFERENCE)).toEqual({
      outcome: "unavailable"
    });
  });

  it("F: a revoked certificate is reported accurately, never as invalid", async () => {
    const factory = await mockedClientFactory();
    factory.mockReturnValue(
      clientReturning({
        certificates: { data: certificateRow, error: null },
        certificate_definitions: {
          data: { title: "Network Foundations", issuer: "TLP" },
          error: null
        },
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
        },
        certificate_competency_snapshots: { data: [], error: null }
      }) as never
    );

    const { verifyCertificateByReference } = await loadService();
    const result = await verifyCertificateByReference(VALID_REFERENCE);

    expect(result.outcome).toBe("verified");
    if (result.outcome !== "verified") return;
    expect(result.certificate.status).toBe("revoked");
  });
});

describe("A: the public route", () => {
  it("A: exposes exactly one verification path", () => {
    expect(verifyRoute).toContain(
      "pathname.match(\n      /^\\/certificates\\/verify\\/([^/]+)$/\n    )"
    );
    const verifyRoutes = server.match(/\/certificates\\\/verify/g) ?? [];
    expect(verifyRoutes.length).toBe(1);
  });

  it("A2: is deliberately unauthenticated", () => {
    // No trusted identity is resolved: an employer must not need an account.
    expect(verifyRoute).not.toContain("resolveTrustedRequestIdentity");
    expect(verifyRoute).not.toContain("requireFounderAdmin");
    expect(verifyRoute).not.toContain("accessToken");
  });

  it("A3: is GET only", () => {
    expect(verifyRoute).toContain('request.method === "GET"');
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(verifyRoute).not.toContain(`request.method === "${method}"`);
    }
    expect(verifyRoute).not.toContain("readJsonBody");
  });

  it("A4: accepts no query parameters", () => {
    // One reference in the path, nothing else. No filtering or searching.
    expect(verifyRoute).not.toContain("searchParams");
  });

  it("A5: maps each outcome to its approved status code", () => {
    expect(verifyRoute).toContain('code: "VALIDATION_ERROR"');
    expect(verifyRoute).toContain('code: "NOT_FOUND"');
    expect(verifyRoute).toContain('code: "DEPENDENCY_UNAVAILABLE"');
    expect(verifyRoute).toContain("sendJson(response, 200, { verification:");
  });

  it("A6: an unavailable result is never reported as invalid or missing", () => {
    expect(verifyRoute).toContain(
      "does not mean the certificate is invalid"
    );
    expect(verifyRoute).toContain("retryable: true");
  });

  it("A7: no public listing, search or collection route exists", () => {
    for (const forbidden of [
      "/certificates/public",
      "/certificates/search",
      "/certificates/all",
      "/verify/user",
      "/verify/student"
    ]) {
      expect(server).not.toContain(forbidden);
    }
  });
});

describe("B: exact-equality lookup only", () => {
  it("B: looks up by exact verification reference", () => {
    expect(service).toContain('.eq("verification_id", reference)');
  });

  it("B2: no prefix, LIKE, pattern or ordering lookup exists", () => {
    for (const forbidden of [
      ".like(",
      ".ilike(",
      ".match(",
      ".filter(",
      ".order(",
      ".range(",
      ".textSearch(",
      ".limit("
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("B3: the format is validated before any query", () => {
    const validateAt = serviceCode.indexOf(
      "isCertificateVerificationReference(reference)"
    );
    const queryAt = serviceCode.indexOf("createServerSupabaseClient()");
    expect(validateAt).toBeGreaterThan(-1);
    expect(queryAt).toBeGreaterThan(validateAt);
  });

  it("B4: at most one certificate can be returned", () => {
    expect(service).toContain(".maybeSingle()");
    expect(serviceCode).not.toContain("certificates\")\n      .select(\"*\")");
  });
});

describe("C: no holder identity is reachable", () => {
  it("C: user_id is never selected", () => {
    expect(serviceCode).not.toContain("user_id");
    expect(serviceCode).not.toContain("userId");
  });

  it("C2: the profile table is never queried", () => {
    expect(serviceCode).not.toContain("user_profiles");
    expect(serviceCode).not.toContain("display_name");
    expect(serviceCode).not.toContain("displayName");
    expect(serviceCode).not.toContain("auth.users");
    expect(serviceCode).not.toContain("email");
  });

  it("C3: no forbidden field is passed into the public payload", () => {
    // Scoped to the builder call: internal structures may legitimately carry
    // identifiers the resolver needs (a lifecycle event has a certificateId),
    // but none of them may be handed to the payload builder.
    const builderCall = service.slice(
      service.indexOf("buildCertificateVerificationRecord({"),
      service.indexOf("    };\n  } catch {")
    );
    expect(builderCall.length).toBeGreaterThan(0);

    for (const forbidden of CERTIFICATE_VERIFICATION_FORBIDDEN_FIELDS) {
      expect(builderCall).not.toContain(`${forbidden}:`);
    }
  });

  it("C4: the internal certificate id never leaves the module", () => {
    // `id` is selected to join lifecycle history and snapshots, but is not a
    // field of the built payload.
    expect(service).toContain("buildCertificateVerificationRecord({");
    const builderCall = service.slice(
      service.indexOf("buildCertificateVerificationRecord({")
    );
    expect(builderCall).not.toContain("id: certificate.id");
    expect(builderCall).not.toContain("certificateId");
  });
});

describe("D: no Evidence is reachable", () => {
  it("D: no Evidence table is queried", () => {
    for (const table of [
      "evidence_records",
      "evidence_competency_links",
      "evidence_correction_events",
      "evidence_verification_references",
      "certificate_evidence_snapshots"
    ]) {
      expect(serviceCode).not.toContain(table);
    }
  });

  it("D2: only competency title and version are read", () => {
    expect(service).toContain(
      '.select("competency_stable_id,competency_version")'
    );
    expect(service).toContain('.select("title")');
  });

  it("D3: no Evidence concept appears in the service", () => {
    for (const forbidden of [
      "evidenceId",
      "evidenceOutcome",
      "resultState",
      "integrity",
      "digest",
      "score",
      "attempt",
      "labSession"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });
});

describe("E: CERT-004 lifecycle truth is reused", () => {
  it("E: the shared resolver derives status", () => {
    expect(service).toContain("resolveEffectiveCertificateStatus");
  });

  it("E2: no lifecycle logic is reimplemented", () => {
    for (const forbidden of [
      "isValidCertificateLifecycleTransition",
      "sequenceNumber >",
      "previousStatus ===",
      "calculateCertificateExpiry"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
    // No local status assignment.
    expect(serviceCode).not.toMatch(
      /status\s*=\s*"(active|expired|revoked|superseded|corrected)"/
    );
  });

  it("E3: an incoherent history fails closed as unavailable", () => {
    expect(service).toContain("if (!effective.sequenceValid)");
    const failClosed = service.slice(
      service.indexOf("if (!effective.sequenceValid)"),
      service.indexOf("if (!effective.sequenceValid)") + 120
    );
    expect(failClosed).toContain('outcome: "unavailable"');
  });

  it("E4: an unrecognised recorded status fails closed", () => {
    expect(service).toContain("isCertificateLifecycleStatus");
  });
});

describe("F: read-only privileged access, no public policy", () => {
  it("F: the service performs no write", () => {
    for (const write of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(serviceCode).not.toContain(write);
    }
  });

  it("F2: no migration introduces a public or anon policy", () => {
    for (const migration of [
      "20260813000700_certificate_definition_foundation.sql",
      "20260813000800_certificate_issuance_foundation.sql",
      "20260813000900_certificate_lifecycle_foundation.sql"
    ]) {
      const sql = readFileSync(
        new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
        "utf8"
      )
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n");
      expect(sql).not.toMatch(/\bto\s+anon\b/);
      expect(sql).not.toMatch(/\bto\s+public\b/);
    }
  });

  it("F3: CERT-005 adds no migration at all", () => {
    // Verified by the Wave 8 verifier too; asserted here so the intent is
    // visible beside the code.
    expect(serviceCode).not.toContain("create table");
    expect(serviceCode).not.toContain("create policy");
  });

  it("F4: the verification reference is never logged", () => {
    expect(serviceCode).not.toContain("console.log");
    expect(serviceCode).not.toContain("writeAuditEvent");
    expect(serviceCode).not.toContain("log(");
  });
});

describe("G: no CERT-006+ behaviour", () => {
  it("G: no portfolio, export, sharing, PDF, QR or branding exists", () => {
    for (const forbidden of [
      "portfolio",
      "shareLink",
      "share_link",
      "download",
      "pdf",
      "qr",
      "branding",
      "employer"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("G2: no CERT-008 workflow appears", () => {
    for (const forbidden of [
      "revoke",
      "correct",
      "supersedeCertificate",
      "restore",
      "replacementCertificate"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("G3: CERT-003's verification identifier is unchanged", () => {
    const issuance = read("./certificate-issuance.ts");
    expect(issuance).toContain('`cert1_${randomBytes(24).toString("hex")}`');
  });

  it("G4: AI holds no authority over verification", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
  });

  it("G5: credential kind is not consulted", () => {
    // CERT-005 stays credential-kind agnostic (DEC-029 to DEC-035).
    expect(serviceCode).not.toContain("certificateKind");
    expect(serviceCode).not.toContain("certificate_kind");
    expect(serviceCode).not.toContain("course_completion");
  });
});
