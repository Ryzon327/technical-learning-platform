import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CERT-003 structural, security and integrity boundaries.
 *
 * Reads the implementation and migration from disk, matching the convention
 * used by evidence.test.ts and the other certificate suites. These prove
 * boundaries a unit test cannot reach: ordering inside the issuance sequence,
 * what the RPC is allowed to do, and what the schema does not contain.
 *
 * NOT proven here: transaction rollback and true concurrent issuance. Those
 * require a live PostgreSQL harness, which this repository does not have.
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

function stripSqlComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

const service = read("./certificate-issuance.ts");
const server = read("./server.ts");
const migration = read(
  "../../../supabase/migrations/20260813000800_certificate_issuance_foundation.sql"
);

const serviceCode = stripTsComments(service);
const migrationCode = stripSqlComments(migration);

const issuanceRoute = server.slice(
  server.indexOf("// CERT-003 — the student's own issued certificates"),
  server.indexOf("// CERT-002 — certificates a student may select")
);

const rpcBody = migration.slice(
  migration.indexOf("create or replace function public.certificate_issue"),
  migration.indexOf("revoke all on function public.certificate_issue")
);

describe("A: authorization boundary", () => {
  it("A: the issuance route uses the trusted identity as the subject", () => {
    expect(issuanceRoute).toContain("resolveTrustedRequestIdentity(request)");
    expect(issuanceRoute).toContain(
      "issueStudentCertificate(trusted.identity.userId"
    );
  });

  it("A2: no client-supplied identity can choose the recipient", () => {
    for (const forbidden of ["userId:", "studentId", "user_id", "subjectId"]) {
      expect(issuanceRoute).not.toContain(forbidden);
    }
    // The body carries only which certificate version to issue.
    expect(issuanceRoute).toContain("stableId: String(body.stableId");
    expect(issuanceRoute).toContain("version: Number(body.version)");
  });

  it("A3: the approved student certificate routes are exactly seven", () => {
    // CERT-004 added the own-certificate status read.
    const routes = (
      server.match(/pathname === "\/certificates[^"]*"/g) ?? []
    ).sort();
    expect(routes).toEqual([
      'pathname === "/certificates"',
      'pathname === "/certificates/definitions"',
      'pathname === "/certificates/eligibility"',
      'pathname === "/certificates/export"',
      'pathname === "/certificates/issuance"',
      'pathname === "/certificates/portfolio"',
      'pathname === "/certificates/presentation"'
    ]);
  });

  it("A4: the certificate collection is read-only and no record route exists", () => {
    // CERT-004 authorizes a GET at /certificates. A collection write would be a
    // lifecycle control, which CERT-008 owns.
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(server).not.toMatch(
        new RegExp(`request\\.method === "${method}" && pathname === "/certificates"`)
      );
    }
    expect(server).not.toMatch(/pathname\.match\(\/\^\\\/certificates\\\//);
  });

  it("A5: issuance writes through the server-authoritative client only", () => {
    expect(service).toContain("createServerSupabaseClient()");
    expect(serviceCode).not.toContain("createUserScopedSupabaseClient");
  });
});

describe("B: eligibility is re-evaluated, never trusted from the client", () => {
  it("B: the authoritative CERT-002 evaluator is called at issuance", () => {
    expect(service).toContain("getStudentCertificateEligibility");
    expect(service).toContain('from "./certificate-eligibility"');
  });

  it("B2: no eligibility claim is accepted from the request", () => {
    for (const forbidden of [
      "body.eligible",
      "body.status",
      "body.eligibility",
      "body.evidenceIds",
      "body.competenc"
    ]) {
      expect(issuanceRoute).not.toContain(forbidden);
    }
  });

  it("B3: issuance does not re-implement qualification", () => {
    for (const forbidden of [
      "qualifiesForDemonstration",
      "deriveEvidenceOutcome",
      "qualifiesAsDemonstrationEvidence",
      "resolveEffectiveEvidenceState",
      "isEffectivelyTrustedEvidence",
      "evaluateCertificateEligibility"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("B4: the decision comes from the shared pure decider", () => {
    expect(service).toContain("decideCertificateIssuance");
    expect(service).toContain("if (!decision.issuable)");
  });

  it("B5: no latest or newest version substitution exists", () => {
    expect(serviceCode).not.toMatch(/\bnewest\b/i);
    expect(serviceCode).not.toContain(".order(");
    expect(service).toContain("'latest' is not supported");
  });
});

describe("C: idempotency", () => {
  it("C: the existing certificate is looked up before any evaluation", () => {
    const existingAt = serviceCode.indexOf("findExistingCertificate(userId");
    const evaluateAt = serviceCode.indexOf("getStudentCertificateEligibility(");
    expect(existingAt).toBeGreaterThan(-1);
    expect(evaluateAt).toBeGreaterThan(existingAt);
  });

  it("C2: a replay returns the existing record and reports it", () => {
    expect(service).toContain("alreadyIssued: true");
    expect(service).toContain("alreadyIssued: false");
  });

  it("C3: a lost uniqueness race re-reads the winner", () => {
    expect(service).toContain('error.code === "23505"');
    expect(service).toContain("const winner = await findExistingCertificate");
  });

  it("C4: the database enforces one certificate per student per version", () => {
    expect(migration).toContain("certificates_student_definition_key");
    expect(migration).toContain("unique (user_id, certificate_definition_id)");
  });

  it("C5: the RPC also refuses to create a second record", () => {
    expect(rpcBody).toContain("existing_certificate_id");
    expect(rpcBody).toContain("return existing_certificate_id;");
  });

  it("C6: a replay emits no second issuance audit event", () => {
    // The audit call sits after the RPC, on the creation path only.
    const replayReturn = serviceCode.indexOf(
      "return { certificate: existing, alreadyIssued: true };"
    );
    const auditAt = serviceCode.indexOf('eventType: "certificate.issued"');
    expect(replayReturn).toBeGreaterThan(-1);
    expect(auditAt).toBeGreaterThan(replayReturn);
  });
});

describe("D: transaction-time integrity", () => {
  it("D: the RPC confirms the definition before creating anything", () => {
    const publishedAt = rpcBody.indexOf("definition_state <> 'published'");
    const supersededAt = rpcBody.indexOf("definition_superseded is not null");
    const insertAt = rpcBody.indexOf("insert into public.certificates");

    expect(publishedAt).toBeGreaterThan(-1);
    expect(supersededAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(publishedAt);
    expect(insertAt).toBeGreaterThan(supersededAt);
  });

  it("D2: the definition row is locked for the transaction", () => {
    expect(rpcBody).toContain("for update");
  });

  it("D3: relied-upon Evidence is confirmed before creating anything", () => {
    const driftAt = rpcBody.indexOf(
      "Authoritative Evidence changed after eligibility was evaluated"
    );
    const insertAt = rpcBody.indexOf("insert into public.certificates");
    expect(driftAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(driftAt);
  });

  it("D4: the record and both snapshots are created in one function body", () => {
    expect(rpcBody).toContain("insert into public.certificates");
    expect(rpcBody).toContain(
      "insert into public.certificate_competency_snapshots"
    );
    expect(rpcBody).toContain(
      "insert into public.certificate_evidence_snapshots"
    );
  });

  it("D5: the RPC is a confirmer, never a second evaluator", () => {
    // Every Evidence check is an equality comparison against the observed
    // value. No Wave 7 resolution or CERT-002 arithmetic may appear.
    for (const forbidden of [
      "previous_effective_state",
      "new_effective_state",
      "minimum_count",
      "require_positive_outcome",
      "resultState = 'passed'",
      "order by",
      "limit 1"
    ]) {
      expect(rpcBody).not.toContain(forbidden);
    }
    expect(rpcBody).toContain("is distinct from pinned.state");
    expect(rpcBody).toContain("is distinct from pinned.correction_count");
  });

  it("D6: the RPC never searches for replacement Evidence", () => {
    // Snapshot rows may only reference Evidence that was pinned.
    expect(rpcBody).toContain(
      "Certificate Evidence snapshot references unpinned Evidence"
    );
    expect(rpcBody).not.toContain("evidence_competency_links");
  });

  it("D7: the RPC follows the privileged convention and grants nothing", () => {
    expect(rpcBody).toContain("security definer");
    expect(rpcBody).toContain("set search_path = public");
    expect(migration).toContain(
      "revoke all on function public.certificate_issue"
    );
    expect(migrationCode).not.toContain("grant execute");
  });
});

describe("E: schema and RLS", () => {
  it("E: creates exactly the three approved tables", () => {
    const tables = migration.match(/create table if not exists public\.\w+/g) ?? [];
    expect(tables).toEqual([
      "create table if not exists public.certificates",
      "create table if not exists public.certificate_competency_snapshots",
      "create table if not exists public.certificate_evidence_snapshots"
    ]);
  });

  it("E2: RLS is enabled on all three tables", () => {
    for (const table of [
      "certificates",
      "certificate_competency_snapshots",
      "certificate_evidence_snapshots"
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
    }
  });

  it("E3: only student SELECT policies exist", () => {
    const policies = migration.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBe(3);
    for (const policy of policies) {
      expect(policy).toContain("for select");
      expect(policy).toContain("to authenticated");
      expect(policy).not.toMatch(/for\s+(insert|update|delete|all)\b/i);
    }
    expect(migrationCode).not.toMatch(/\bto\s+(anon|public)\b/);
  });

  it("E4: issued certificates are immutable", () => {
    expect(migration).toContain("guard_certificate_immutable");
    expect(migration).toContain(
      "Issued Certificate Records are immutable in CERT-003"
    );
    expect(migration).toContain("guard_certificate_snapshot_immutable");
  });

  it("E5: the definition pin cannot drift", () => {
    expect(migration).toContain("guard_certificate_definition_pin");
    expect(migration).toContain(
      "Certificate definition pin must match the exact definition version"
    );
  });

  it("E6: justifying references cannot be deleted away", () => {
    expect(migration).toContain(
      "references public.certificate_definitions(id) on delete restrict"
    );
    expect(migration).toContain(
      "references public.evidence_records(id) on delete restrict"
    );
  });

  it("E7: the verification identifier is opaque and unique", () => {
    expect(migration).toContain("verification_id text not null unique");
    expect(migration).toContain("'^cert1_[a-f0-9]{48}$'");
    expect(service).toContain("randomBytes(24).toString(\"hex\")");
  });
});

describe("F: snapshots are references, not copied truth", () => {
  it("F: snapshot tables store identifiers and version pins only", () => {
    const competencyTable = migration.slice(
      migration.indexOf(
        "create table if not exists public.certificate_competency_snapshots"
      ),
      migration.indexOf(
        "create table if not exists public.certificate_evidence_snapshots"
      )
    );
    const evidenceTable = migration.slice(
      migration.indexOf(
        "create table if not exists public.certificate_evidence_snapshots"
      ),
      migration.indexOf("create index if not exists idx_certificates_user")
    );

    for (const forbidden of [
      "digest",
      "integrity",
      "outcome",
      "result_state",
      "effective_state",
      "metadata",
      "jsonb",
      "correction"
    ]) {
      expect(competencyTable).not.toContain(forbidden);
      expect(evidenceTable).not.toContain(forbidden);
    }
  });

  it("F2: the evidence snapshot preserves the exact competency version", () => {
    expect(migration).toContain("competency_stable_id text not null");
    expect(migration).toContain("competency_version integer not null");
  });
});

describe("G: no CERT-004+ behaviour", () => {
  it("G: the schema has no lifecycle, expiration or revocation column", () => {
    for (const forbidden of [
      "status text",
      "lifecycle",
      "expires_at",
      "expiration",
      "revoked_at",
      "revocation",
      "superseded_by_certificate",
      "presentation_metadata"
    ]) {
      expect(migrationCode).not.toContain(forbidden);
    }
  });

  it("G2: the service implements no lifecycle or verification behaviour", () => {
    for (const forbidden of [
      "revoke",
      "expiresAt",
      "expirationMonths",
      "lifecycle",
      "portfolio",
      "shareLink",
      "employer",
      "pdf"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("G3: no public verification route or page exists", () => {
    expect(server).not.toMatch(/pathname === "\/verify/);
    expect(server).not.toContain("/certificates/verify");
    expect(serviceCode).not.toContain("/verify/");
  });

  it("G4: no notification or email delivery is attempted", () => {
    for (const forbidden of ["sendEmail", "notify", "smtp", "EmailProvider"]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("G5: AI holds no authority over issuance", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    expect(migrationCode).not.toMatch(/openai|anthropic|ollama/i);
  });
});

describe("H: audit", () => {
  it("H: issuance is audited through the existing platform mechanism", () => {
    expect(service).toContain("writeAuditEvent");
    expect(service).toContain('eventType: "certificate.issued"');
    expect(service).toContain('from "./audit"');
  });

  it("H2: the audit event carries no evidence content or identity", () => {
    const auditBlock = service.slice(
      service.indexOf('eventType: "certificate.issued"'),
      service.indexOf('eventType: "certificate.issued"') + 600
    );
    for (const forbidden of ["metadata: eligibility", "evidenceIds", "email"]) {
      expect(auditBlock).not.toContain(forbidden);
    }
  });

  it("H3: no certificate-specific audit table was created", () => {
    expect(migrationCode).not.toContain("audit");
  });
});
