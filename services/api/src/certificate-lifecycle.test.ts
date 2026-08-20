import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CERT-004 structural, security and boundary checks.
 *
 * Reads the implementation and migration from disk, matching the convention of
 * the other certificate suites. These prove what a unit test cannot: which
 * routes exist, what the schema does not contain, and that CERT-003's
 * guarantees survived.
 *
 * NOT proven here: transaction rollback and concurrent transitions. Those need
 * a live PostgreSQL harness, which this repository does not have.
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

const service = read("./certificate-lifecycle.ts");
const server = read("./server.ts");
const migration = read(
  "../../../supabase/migrations/20260813000900_certificate_lifecycle_foundation.sql"
);
const issuanceMigration = read(
  "../../../supabase/migrations/20260813000800_certificate_issuance_foundation.sql"
);

const serviceCode = stripTsComments(service);
const migrationCode = stripSqlComments(migration);

// Bounded at the start of the next route's `if`, not at its pathname literal:
// the POST route declares its method before its path, so slicing at the literal
// would drag `request.method === "POST"` into this block.
const readRoute = server.slice(
  server.indexOf("// CERT-004 — the student's own certificates"),
  server.indexOf(
    'if (request.method === "POST" && pathname === "/certificates/issuance")'
  )
);

const lifecycleRpc = migration.slice(
  migration.indexOf(
    "create or replace function public.certificate_record_lifecycle_event"
  ),
  migration.indexOf(
    "revoke all on function public.certificate_record_lifecycle_event"
  )
);

const reissuedIssueRpc = migration.slice(
  migration.indexOf("create or replace function public.certificate_issue"),
  migration.indexOf("revoke all on function public.certificate_issue")
);

describe("A: student read boundary", () => {
  it("A: the read route uses the trusted identity as the subject", () => {
    expect(readRoute).toContain("resolveTrustedRequestIdentity(request)");
    expect(readRoute).toContain(
      "listStudentCertificateRecords(\n          trusted.identity.userId\n        )"
    );
  });

  it("A2: no client-supplied identity can select whose records are read", () => {
    for (const forbidden of [
      "body.userId",
      "body.studentId",
      'searchParams.get("userId")',
      'searchParams.get("studentId")',
      "readJsonBody"
    ]) {
      expect(readRoute).not.toContain(forbidden);
    }
  });

  it("A3: the read route is GET only", () => {
    expect(readRoute).toContain('request.method === "GET"');
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      expect(readRoute).not.toContain(`request.method === "${method}"`);
    }
  });

  it("A4: exactly the seven approved student certificate routes exist", () => {
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

  it("A5: the service scopes every read to the caller", () => {
    expect(service).toContain('.eq("user_id", userId)');
    expect(service).toContain("requireUserId(userId)");
  });

  it("A6: status is derived with trusted server time", () => {
    expect(service).toContain("new Date().toISOString()");
    expect(service).toContain("resolveEffectiveCertificateStatus");
  });
});

describe("B: no student lifecycle control", () => {
  it("B: no lifecycle transition route exists at all", () => {
    expect(server).not.toContain("/certificates/lifecycle");
    expect(server).not.toContain("/certificates/revoke");
    expect(server).not.toContain("/certificates/status");
    expect(server).not.toContain("recordCertificateLifecycleTransition");
  });

  it("B2: the transition machinery is unreachable from HTTP", () => {
    // The machinery exists for CERT-008 to call; CERT-004 exposes no workflow,
    // so server.ts must neither import nor invoke it.
    expect(service).toContain(
      "export async function recordCertificateLifecycleTransition"
    );
    expect(server).not.toContain("recordCertificateLifecycleTransition");
    const lifecycleImport =
      server.match(/import \{([^}]*)\} from "\.\/certificate-lifecycle"/)?.[1] ??
      "";
    expect(lifecycleImport).toContain("listStudentCertificateRecords");
    expect(lifecycleImport).not.toContain("recordCertificate");
  });

  it("B3: no student write policy exists on lifecycle history", () => {
    const policies = migration.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policies.length).toBe(1);
    expect(policies[0]).toContain("for select");
    expect(policies[0]).toContain("to authenticated");
    expect(policies[0]).toContain("auth.uid() = user_id");
    expect(policies[0]).not.toMatch(/for\s+(insert|update|delete|all)\b/i);
    expect(migrationCode).not.toMatch(/\bto\s+(anon|public)\b/);
  });
});

describe("C: append-only historical truth", () => {
  it("C: lifecycle history rejects update and delete", () => {
    expect(migration).toContain("guard_certificate_lifecycle_append_only");
    expect(migration).toContain(
      "Certificate lifecycle history is append-only"
    );
    expect(migration).toContain(
      "before update or delete on public.certificate_lifecycle_events"
    );
  });

  it("C2: history is contiguous and self-validating", () => {
    expect(migration).toContain(
      "unique (certificate_id, sequence_number)"
    );
    expect(migration).toContain("previous_status text not null");
    expect(migration).toContain("new_status text not null");
    expect(migration).toContain(
      "Certificate lifecycle events must be contiguous"
    );
    expect(migration).toContain(
      "Certificate lifecycle event does not follow the recorded status"
    );
  });

  it("C3: a no-op transition cannot be recorded", () => {
    expect(migration).toContain("previous_status <> new_status");
  });

  it("C4: only the approved edges are accepted by the database", () => {
    expect(migration).toContain(
      "new.previous_status = 'active' and new.new_status in ('superseded', 'revoked', 'corrected', 'expired')"
    );
    expect(migration).toContain(
      "new.previous_status = 'revoked' and new.new_status = 'active'"
    );
    expect(migration).toContain(
      "Certificate lifecycle transition is not permitted"
    );
  });

  it("C5: concurrent transitions serialize on the certificate", () => {
    expect(lifecycleRpc).toContain("for update");
    expect(lifecycleRpc).toContain("last_sequence + 1");
  });

  it("C6: the transition RPC is privileged and grants nothing", () => {
    expect(lifecycleRpc).toContain("security definer");
    expect(lifecycleRpc).toContain("set search_path = public");
    expect(migration).toContain(
      "revoke all on function public.certificate_record_lifecycle_event"
    );
    expect(migrationCode).not.toContain("grant execute");
  });
});

describe("D: no cached status", () => {
  it("D: no mutable current status column was introduced", () => {
    // Word-bounded: previous_status and new_status are the append-only history
    // columns and must not be mistaken for a cached current status.
    for (const forbidden of [
      /\bcurrent_status\b/,
      /\blifecycle_status\b/,
      /^\s+status\s+text/m,
      /add column if not exists status\b/
    ]) {
      expect(migrationCode).not.toMatch(forbidden);
    }
    // Scoped to the table definition: PL/pgSQL `declare` blocks legitimately
    // hold local status variables that are not columns.
    const lifecycleTable = migrationCode.slice(
      migrationCode.indexOf(
        "create table if not exists public.certificate_lifecycle_events"
      ),
      migrationCode.indexOf("create index if not exists idx_certificate_lifecycle_events_certificate")
    );
    const statusColumns = lifecycleTable.match(/^\s+\w*status\s+text/gm) ?? [];
    expect(statusColumns.map((line) => line.trim())).toEqual([
      "previous_status text",
      "new_status text"
    ]);
  });

  it("D2: status is resolved at read time from the three sources of truth", () => {
    expect(service).toContain("resolveEffectiveCertificateStatus({");
    expect(service).toContain("issuedAt: certificate.issued_at");
    expect(service).toContain("expiresAt: certificate.expires_at");
    expect(service).toContain("events: eventsByCertificate.get");
  });

  it("D3: the service never assigns a status itself", () => {
    expect(serviceCode).not.toMatch(/status\s*=\s*"(active|revoked|expired)"/);
  });
});

describe("E: pinned expiry", () => {
  it("E: expires_at is added to the issued record", () => {
    expect(migration).toContain(
      "alter table public.certificates"
    );
    expect(migration).toContain("add column if not exists expires_at timestamptz");
  });

  it("E2: the expiry is pinned inside the issuance transaction", () => {
    expect(reissuedIssueRpc).toContain("definition_expiration_months");
    expect(reissuedIssueRpc).toContain(
      "make_interval(months => definition_expiration_months)"
    );
    expect(reissuedIssueRpc).toContain("expires_at_value");
  });

  it("E3: the pin comes from the issuance-time definition", () => {
    // Read from the same locked definition row the issuance already confirmed.
    const selectAt = reissuedIssueRpc.indexOf("d.expiration_months");
    const pinAt = reissuedIssueRpc.indexOf("make_interval");
    expect(selectAt).toBeGreaterThan(-1);
    expect(pinAt).toBeGreaterThan(selectAt);
  });

  it("E4: the certificate row remains immutable, so the pin cannot move", () => {
    expect(issuanceMigration).toContain("guard_certificate_immutable");
    expect(migrationCode).not.toContain("drop trigger if exists certificates_immutable");
    expect(migrationCode).not.toContain("update public.certificates");
  });
});

describe("F: CERT-003 guarantees survive the RPC redefinition", () => {
  it("F: the redefined issuance RPC keeps every confirmation, in order", () => {
    const publishedAt = reissuedIssueRpc.indexOf(
      "definition_state <> 'published'"
    );
    const supersededAt = reissuedIssueRpc.indexOf(
      "definition_superseded is not null"
    );
    const driftAt = reissuedIssueRpc.indexOf("Authoritative Evidence changed");
    const lockAt = reissuedIssueRpc.indexOf("for update");
    const insertAt = reissuedIssueRpc.indexOf("insert into public.certificates");

    for (const marker of [publishedAt, supersededAt, driftAt, lockAt]) {
      expect(marker).toBeGreaterThan(-1);
      expect(insertAt).toBeGreaterThan(marker);
    }
  });

  it("F2: idempotency is preserved", () => {
    expect(reissuedIssueRpc).toContain("existing_certificate_id");
    expect(reissuedIssueRpc).toContain("return existing_certificate_id;");
    expect(issuanceMigration).toContain(
      "unique (user_id, certificate_definition_id)"
    );
  });

  it("F3: the pin-completeness confirmation is untouched", () => {
    expect(reissuedIssueRpc).toContain("is distinct from pinned.correction_count");
    expect(reissuedIssueRpc).toContain("is distinct from pinned.state");
    expect(reissuedIssueRpc).toContain("references unpinned Evidence");
  });

  it("F4: the RPC is still not a second evaluator", () => {
    for (const forbidden of [
      "previous_effective_state",
      "minimum_count",
      "require_positive_outcome",
      "evidence_competency_links"
    ]) {
      expect(reissuedIssueRpc).not.toContain(forbidden);
    }
  });

  it("F5: the signature is unchanged, so no caller changes", () => {
    expect(reissuedIssueRpc).toContain("target_user_id uuid");
    expect(reissuedIssueRpc).toContain("snap_evidence_competency_versions integer[]");
    expect(migration).toContain(
      "revoke all on function public.certificate_issue"
    );
  });
});

describe("G: no CERT-005+ behaviour", () => {
  it("G: no CERT-008 workflow field exists", () => {
    for (const forbidden of [
      "reason",
      "actor_id",
      "replacement_certificate",
      "notification",
      "notify"
    ]) {
      expect(migrationCode).not.toContain(forbidden);
    }
  });

  it("G2: the service implements no revoke, correct or restore workflow", () => {
    for (const forbidden of [
      "revokeCertificate",
      "correctCertificate",
      "supersedeCertificate",
      "restoreCertificate"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("G3: no public verification surface exists", () => {
    // The lifecycle service never reads or exposes the verification identifier.
    expect(serviceCode).not.toContain("verification_id");
    expect(serviceCode).not.toContain("verificationId");
    expect(server).not.toMatch(/pathname === "\/verify/);
    expect(server).not.toContain("/certificates/verify");

    // The migration carries CERT-003's issuance RPC forward, which legitimately
    // names the verification identifier it mints. What must not exist is a new
    // verification table, policy or lookup.
    expect(migrationCode).not.toMatch(/create table[^;]*verification/i);
    expect(migrationCode).not.toMatch(/create policy[^;]*verification/i);
    expect(migrationCode).not.toMatch(/\bto\s+(anon|public)\b/);
  });

  it("G4: no portfolio, export, sharing or branding behaviour exists", () => {
    // Strip the TS `export` keyword and the @tlp/shared-types specifier, which
    // are language and packaging, not features.
    const featureText = serviceCode
      .replace(/\bexport\b/g, "")
      .replace(/@tlp\/shared-types/g, "")
      .toLowerCase();

    for (const forbidden of [
      "portfolio",
      "sharelink",
      "share_link",
      "sharing",
      "pdf",
      "branding",
      "employer"
    ]) {
      expect(featureText).not.toContain(forbidden);
    }
  });

  it("G5: AI holds no authority over lifecycle", () => {
    expect(serviceCode).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    expect(migrationCode).not.toMatch(/openai|anthropic|ollama/i);
  });

  it("G6: transitions are audited through the existing mechanism", () => {
    expect(service).toContain("writeAuditEvent");
    expect(service).toContain("certificate.lifecycle.transitioned");
    expect(migrationCode).not.toContain("audit");
  });
});
