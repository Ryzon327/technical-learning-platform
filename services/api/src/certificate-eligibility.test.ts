import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CERT-002 structural, authorization and scope boundaries.
 *
 * Reads the implementation from disk, matching the convention established by
 * evidence.test.ts and certificate-admin.test.ts. These prove boundaries that
 * cannot be proven by calling a function: whose eligibility is evaluated, which
 * proof source is used, that evaluation writes nothing, and that no CERT-003+
 * behaviour leaked in.
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

const service = read("./certificate-eligibility.ts");
const server = read("./server.ts");
const serviceCode = stripTsComments(service);

const eligibilityRoute = server.slice(
  server.indexOf("// CERT-002 — the student's own certificate eligibility."),
  server.indexOf("const evidenceCorrectionsMatch")
);

describe("authorization boundary", () => {
  it("A: the route evaluates only the authenticated caller", () => {
    expect(eligibilityRoute).toContain("resolveTrustedRequestIdentity(request)");
    expect(eligibilityRoute).toContain("trusted.identity.userId");
  });

  it("A2: no client-supplied user identifier can become the subject", () => {
    for (const forbidden of [
      "userId",
      "studentId",
      "subjectUserId",
      "user_id"
    ]) {
      expect(eligibilityRoute).not.toContain(`searchParams.get("${forbidden}")`);
    }
    // A read route takes no body, so nothing can be smuggled in one.
    expect(eligibilityRoute).not.toContain("readJsonBody");
  });

  it("A3: the route is a GET read only", () => {
    expect(eligibilityRoute).toContain('request.method === "GET"');
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(eligibilityRoute).not.toContain(`request.method === "${method}"`);
    }
  });

  it("A4: exactly the six approved student certificate routes exist", () => {
    // CERT-002 owns an eligibility read and the discovery read that feeds its
    // selector; CERT-003 owns the issuance request; CERT-004 owns the
    // own-certificate status read. Any other student certificate route is
    // unapproved.
    const studentCertificateRoutes = (
      server.match(/pathname === "\/certificates[^"]*"/g) ?? []
    ).sort();
    expect(studentCertificateRoutes).toEqual([
      'pathname === "/certificates"',
      'pathname === "/certificates/definitions"',
      'pathname === "/certificates/eligibility"',
      'pathname === "/certificates/export"',
      'pathname === "/certificates/issuance"',
      'pathname === "/certificates/portfolio"'
    ]);
  });

  it("A5: no admin eligibility endpoint exists in this batch", () => {
    expect(server).not.toContain("/admin/certificates/eligibility");
    expect(serviceCode).not.toContain("requireFounderAdmin");
  });

  it("A6: the service requires a student identifier from the caller", () => {
    expect(service).toContain("A student identifier is required");
  });
});

describe("student certificate discovery endpoint", () => {
  const discoveryRoute = server.slice(
    server.indexOf(
      "// CERT-002 — certificates a student may select for evaluation."
    ),
    server.indexOf("// CERT-002 — the student's own certificate eligibility.")
  );

  it("L: the discovery route is authenticated", () => {
    expect(discoveryRoute).toContain("resolveTrustedRequestIdentity(request)");
    expect(discoveryRoute).toContain(
      'pathname === "/certificates/definitions"'
    );
  });

  it("L2: the discovery route is read-only", () => {
    expect(discoveryRoute).toContain('request.method === "GET"');
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(discoveryRoute).not.toContain(`request.method === "${method}"`);
    }
    expect(discoveryRoute).not.toContain("readJsonBody");
  });

  it("L3: it returns published, non-superseded definitions only", () => {
    expect(service).toContain('.eq("publication_state", "published")');
    expect(service).toContain('.is("superseded_by_definition_id", null)');
  });

  it("L4: it exposes only the fields the selector needs", () => {
    expect(service).toContain(
      '.select("stable_id,version,title,description,plain_language_title")'
    );
    // Administrative and policy fields stay out of the student surface.
    for (const withheld of [
      "issuer",
      "effective_at",
      "expiration_months",
      "verification_permitted",
      "publication_state,",
      "superseded_by_definition_id,"
    ]) {
      expect(
        service.slice(
          service.indexOf(".select(\"stable_id"),
          service.indexOf(".select(\"stable_id") + 120
        )
      ).not.toContain(withheld);
    }
  });

  it("L5: discovery performs no eligibility calculation", () => {
    const discovery = serviceCode.slice(
      serviceCode.indexOf(
        "export async function listSelectableCertificateDefinitions"
      ),
      serviceCode.indexOf("function normalizeLocator")
    );
    for (const forbidden of [
      "evaluateCertificateEligibility",
      "qualifiesForDemonstration",
      "eligible",
      "getAuthoritativeCompetencyEvidenceReferences"
    ]) {
      expect(discovery).not.toContain(forbidden);
    }
  });

  it("L6: discovery accepts no user identifier and no client input", () => {
    expect(discoveryRoute).not.toContain("searchParams");
    expect(discoveryRoute).not.toContain("userId");
    expect(discoveryRoute).not.toContain("studentId");
  });

  it("L7: discovery never selects a version by ordering", () => {
    // Sorting happens in TypeScript for presentation; no database ORDER BY
    // may pick a version.
    expect(serviceCode).not.toContain('.order(');
    expect(serviceCode).not.toContain('.limit(');
  });

  it("L8: discovery is a read with no mutation", () => {
    const discovery = serviceCode.slice(
      serviceCode.indexOf(
        "export async function listSelectableCertificateDefinitions"
      ),
      serviceCode.indexOf("function normalizeLocator")
    );
    for (const write of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
      expect(discovery).not.toContain(write);
    }
  });
});

describe("proof source and exact version", () => {
  it("B: eligibility is proven from Wave 7 version-exact Evidence links", () => {
    expect(service).toContain(
      "getAuthoritativeCompetencyEvidenceReferences"
    );
    expect(service).toContain('from "./evidence-competency"');
  });

  it("B2: student_competency_state is never read", () => {
    // That model is unique on (user_id, competency_stable_id) and collapses
    // versions, so it cannot prove an exact pinned competency version.
    expect(serviceCode).not.toContain("student_competency_state");
    expect(serviceCode).not.toContain("listStudentCompetencyState");
    expect(serviceCode).not.toContain("student_competency_evidence_refs");
  });

  it("B3: no latest-version fallback or mapping rule exists", () => {
    expect(serviceCode).not.toMatch(/newest/i);
    expect(serviceCode).not.toMatch(/order\(/);
    expect(serviceCode).not.toMatch(/\.limit\(/);
    expect(serviceCode).not.toMatch(/fallback/i);

    // "latest" may appear only in the message refusing it, never in logic.
    const latestLines = serviceCode
      .split("\n")
      .filter((line) => /latest/i.test(line));
    expect(latestLines.length).toBeGreaterThan(0);
    for (const line of latestLines) {
      expect(line).toContain("is not supported");
    }

    expect(service).toContain(
      "An exact Certificate Definition version is required"
    );
  });

  it("B4: an exact positive integer version is mandatory", () => {
    expect(service).toContain("Number.isInteger(input.version)");
    expect(service).toContain("input.version <= 0");
  });

  it("B5: the canonical CERT-001 reader supplies requirements", () => {
    // No second Certificate Definition model is built here.
    expect(service).toContain("getCertificateDefinition");
    expect(serviceCode).not.toContain(
      "certificate_definition_competencies"
    );
    expect(serviceCode).not.toContain(
      "certificate_definition_evidence_policies"
    );
  });

  it("B6: no second qualifying-evidence rule is defined", () => {
    for (const forbidden of [
      "deriveEvidenceOutcome",
      "qualifiesAsDemonstrationEvidence",
      "resolveEffectiveEvidenceState",
      "isEffectivelyTrustedEvidence"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });
});

describe("evaluation is side-effect free", () => {
  it("C: the service performs no write of any kind", () => {
    for (const write of [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      ".rpc("
    ]) {
      expect(serviceCode).not.toContain(write);
    }
  });

  it("C2: no eligibility result is persisted", () => {
    expect(serviceCode).not.toContain("certificate_eligibility");
    expect(serviceCode).not.toContain("eligibility_snapshots");
    expect(serviceCode).not.toContain("eligibility_history");
  });

  it("C3: no migration introduces an eligibility table", () => {
    // CERT-002 adds no migration at all. The only certificate migration is
    // Batch 1's, whose comments mention eligibility solely to exclude it — so
    // the SQL itself is inspected with comments stripped.
    const migrationSql = readFileSync(
      new URL(
        "../../../supabase/migrations/20260813000700_certificate_definition_foundation.sql",
        import.meta.url
      ),
      "utf8"
    )
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");

    expect(migrationSql).not.toContain("eligibility");
  });

  it("C4: evaluation emits no audit event, matching Wave 7 read paths", () => {
    expect(serviceCode).not.toContain("writeAuditEvent");
  });

  it("C5: Evidence and Certificate Definition truth are never altered", () => {
    expect(serviceCode).not.toContain("evidence_records");
    expect(serviceCode).not.toContain("evidence_competency_links");
    expect(serviceCode).not.toContain("evidence_correction_events");
  });
});

describe("three distinct eligibility states", () => {
  it("D: a dependency failure returns unknown, never ineligible", () => {
    expect(service).toContain("isDependencyFailure");
    expect(service).toContain('"DEPENDENCY_UNAVAILABLE"');
    expect(service).toContain('unknownReason: "dependency_unavailable"');
    expect(service).toContain("buildUnknownEligibilityResult");
  });

  it("D2: an unpublished definition returns unknown, never ineligible", () => {
    expect(service).toContain('unknownReason: "definition_not_published"');
    expect(service).toContain(
      'definition.publicationState !== "published"'
    );
  });

  it("D3: a missing definition is a genuine not-found, not an outcome", () => {
    expect(service).toContain('code: "NOT_FOUND"');
    expect(service).toContain(
      "Certificate Definition version was not found"
    );
  });

  it("D4: the service never fabricates an ineligible verdict itself", () => {
    // Only the shared evaluator decides eligible/ineligible.
    expect(serviceCode).not.toContain('"ineligible"');
    expect(serviceCode).not.toContain('status: "eligible"');
    expect(service).toContain("evaluateCertificateEligibility");
  });
});

describe("CERT-003 through CERT-009 remain unimplemented", () => {
  it("E: no issuance exists", () => {
    for (const forbidden of [
      "issueCertificate",
      "issueStudentCertificate",
      "grantCertificate",
      "mintCertificate",
      "student_certificates",
      "issued_certificates"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
      expect(eligibilityRoute).not.toContain(forbidden);
    }
  });

  it("E2: no certificate identifier or verification identifier is created", () => {
    for (const forbidden of [
      "certificateId",
      "verificationId",
      "verificationCode",
      "randomUUID",
      "randomBytes",
      "gen_random"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("E3: no lifecycle state or expiration timestamp is created", () => {
    for (const forbidden of [
      "lifecycle",
      "expiresAt",
      "expires_at",
      "expirationDate",
      "expirationMonths",
      "revoke"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }

    // superseded_by_definition_id is READ as a discovery filter — an explicit
    // Founder decision that a definition was replaced. CERT-002 never writes
    // it and never changes a definition's lifecycle.
    expect(serviceCode).toContain(
      '.is("superseded_by_definition_id", null)'
    );
    expect(serviceCode).not.toContain("supersedeCertificateDefinition");
    expect(serviceCode).not.toMatch(
      /update\([^)]*superseded_by_definition_id/
    );
  });

  it("E4: no sharing, export or rendering surface exists", () => {
    // The @tlp/shared-types package specifier is not a sharing feature.
    const withoutPackageName = serviceCode
      .replace(/@tlp\/shared-types/g, "")
      .toLowerCase();

    for (const forbidden of [
      "sharelink",
      "share_link",
      "sharetoken",
      "employer",
      "pdf",
      "render",
      "branding",
      "portfolio"
    ]) {
      expect(withoutPackageName).not.toContain(forbidden);
    }
  });

  it("F: AI holds no authority over eligibility", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    expect(eligibilityRoute).not.toMatch(
      /openai|anthropic|ollama|ai[-_ ]?gateway/i
    );
  });
});

describe("CERT-001 and Wave 7 surfaces are unchanged", () => {
  it("G: the privileged CERT-001 routes still exist and stay founder-guarded", () => {
    const adminBlock = server.slice(
      server.indexOf(
        "// CERT-001 — privileged Certificate Definition authoring."
      ),
      server.indexOf('pathname === "/admin/ping"')
    );
    const guards = adminBlock.match(/await founder\(request\)/g) ?? [];
    // Nine CERT-001 authoring routes plus the two CERT-008 correction routes.
    // Every one of them still resolves the founder admin path.
    expect(guards.length).toBe(11);
  });

  it("G2: no student route reaches Certificate Definition authoring", () => {
    for (const authoring of [
      "createDraftCertificateDefinition",
      "updateCertificateDefinition",
      "setCertificateDefinitionCompetencies",
      "setCertificateDefinitionEvidencePolicies",
      "transitionCertificateDefinitionState",
      "supersedeCertificateDefinition"
    ]) {
      expect(eligibilityRoute).not.toContain(authoring);
      expect(serviceCode).not.toContain(authoring);
    }
  });

  it("G3: the Wave 7 evidence routes are untouched", () => {
    expect(server).toContain('pathname === "/evidence/portfolio"');
    expect(server).toContain('pathname === "/evidence"');
    expect(server).toContain('pathname === "/evidence/export"');
  });
});
