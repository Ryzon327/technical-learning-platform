import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CERTIFICATE_DEFINITION_MATERIAL_FIELDS } from "@tlp/shared-types";

/**
 * CERT-001 structural and security boundaries.
 *
 * These read the implementation from disk, matching the convention established
 * by services/api/src/evidence.test.ts in Wave 7. They prove boundaries that
 * cannot be proven by calling a function: which routes exist, which
 * authorization path guards them, what the migration grants, and what the batch
 * deliberately does not contain.
 */

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

/**
 * Absence assertions must judge code, not commentary. This file's own sources
 * name the excluded Features (portfolio, verification, revalidation,
 * prerequisites) precisely in order to document that they are excluded, so a
 * naive full-text scan would flag the exclusion notes themselves.
 *
 * Only whole-line comments are removed, so string and regex literals containing
 * slashes are never mangled.
 */
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

const service = read("./certificate-admin.ts");
const server = read("./server.ts");
const migration = read(
  "../../../supabase/migrations/20260813000700_certificate_definition_foundation.sql"
);

const serviceCode = stripTsComments(service);
const migrationCode = stripSqlComments(migration);

/** The certificate route block, isolated from the rest of the router. */
const certificateRoutes = server.slice(
  server.indexOf("// CERT-001 — privileged Certificate Definition authoring."),
  server.indexOf('pathname === "/admin/ping"')
);

describe("privileged authoring boundary", () => {
  it("A: every certificate route resolves the founder admin path", () => {
    const routeGuards = certificateRoutes.match(/await founder\(request\)/g) ?? [];
    const routeReturns = certificateRoutes.match(/\n\s+return;/g) ?? [];

    expect(routeGuards.length).toBe(9);
    // One guard per route, and no route falls through without returning.
    expect(routeGuards.length).toBe(routeReturns.length);
  });

  it("A2: no certificate route uses the bare student identity path", () => {
    expect(certificateRoutes).not.toContain(
      "resolveTrustedRequestIdentity(request)"
    );
  });

  it("A3: every certificate authoring path sits under /admin/certificates", () => {
    const paths = server.match(/\/admin\/certificates\/[a-z-\\/^$()[\]+]*/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);

    const certificatePathLiterals =
      server.match(/pathname(?:\.match\(|\s*===\s*)[^\n]*certificate[^\n]*/gi) ??
      [];
    expect(certificatePathLiterals.length).toBeGreaterThan(0);

    for (const literal of certificatePathLiterals) {
      // Regex-literal routes escape the separators (\/admin\/certificates\/),
      // so compare against the unescaped form.
      const unescaped = literal.replace(/\\/g, "");

      // CERT-002 adds two approved student reads (eligibility and the discovery
      // read that feeds its selector); CERT-003 adds one approved student
      // write (issuance); CERT-004 adds the own-certificate status read. Every
      // other certificate route must still be privileged authoring under
      // /admin/certificates.
      if (
        unescaped.includes('"/certificates/eligibility"') ||
        unescaped.includes('"/certificates/definitions"') ||
        unescaped.includes('"/certificates/issuance"') ||
        unescaped.includes('pathname === "/certificates")')
      ) {
        continue;
      }

      expect(unescaped).toContain("/admin/certificates/");
    }
  });

  it("A4: authoring writes go through the server-authoritative client", () => {
    expect(service).toContain("createServerSupabaseClient()");
    expect(service).not.toContain("createUserScopedSupabaseClient");
  });

  it("A5: authoring is audited", () => {
    expect(service).toContain("writeAuditEvent");
    expect(service).toContain("certificate.definition.created");
    expect(service).toContain("certificate.definition.state_changed");
    expect(service).toContain("certificate.definition.superseded");
  });
});

describe("no student mutation surface", () => {
  it("B: exposes no non-admin certificate route beyond the approved surface", () => {
    // CERT-001 had no student certificate route. CERT-002 added two approved
    // reads, CERT-003 one approved write, CERT-004 the own-certificate status
    // read. Exact equality, so a fifth route fails: /certificates/* is never
    // generally permitted.
    const nonAdmin = (
      server.match(/pathname === "\/(?!admin)[^"]*certificate[^"]*"/gi) ?? []
    ).sort();
    expect(nonAdmin).toEqual([
      'pathname === "/certificates"',
      'pathname === "/certificates/definitions"',
      'pathname === "/certificates/eligibility"',
      'pathname === "/certificates/issuance"'
    ]);

    // The only permitted non-admin path-parameter certificate route is
    // CERT-005 public verification. A certificate RECORD route — which would
    // let anyone address a certificate by id — remains forbidden.
    const nonAdminMatch = (
      server.match(/\/\^\\\/(?!admin)[^/]*certificate[^\n]*/gi) ?? []
    ).map((literal) => literal.replace(/\\/g, ""));

    for (const literal of nonAdminMatch) {
      expect(literal).toContain("/certificates/verify/");
    }
    expect(nonAdminMatch.length).toBeLessThanOrEqual(1);
  });

  it("B2: grants no student write policy in the migration", () => {
    const policyBlocks = migration.match(/create policy[\s\S]*?;/g) ?? [];
    expect(policyBlocks.length).toBe(3);

    for (const block of policyBlocks) {
      expect(block).toContain("for select");
      expect(block).toContain("to authenticated");
      expect(block).not.toMatch(/for\s+(insert|update|delete|all)\b/i);
    }
  });

  it("B3: enables row level security on all three certificate tables", () => {
    for (const table of [
      "certificate_definitions",
      "certificate_definition_competencies",
      "certificate_definition_evidence_policies"
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
    }
  });

  it("B4: students may read published definitions only", () => {
    expect(migration).toContain("using (publication_state = 'published')");
    expect(migration).not.toMatch(/using \(true\)/);
    // Word-bounded so that "insert into public.platform_schema_version" is not
    // mistaken for a policy granted to the public role.
    expect(migrationCode).not.toMatch(/\bto\s+anon\b/);
    expect(migrationCode).not.toMatch(/\bto\s+public\b/);
  });
});

describe("normalized model and version identity", () => {
  it("C: creates exactly the three approved certificate tables", () => {
    const tables = migration.match(/create table if not exists public\.\w+/g) ?? [];
    expect(tables).toEqual([
      "create table if not exists public.certificate_definitions",
      "create table if not exists public.certificate_definition_competencies",
      "create table if not exists public.certificate_definition_evidence_policies"
    ]);
  });

  it("C2: enforces unique (stable_id, version)", () => {
    expect(migration).toContain("unique (stable_id, version)");
  });

  it("C3: normalizes requirements into columns, not JSON blobs", () => {
    expect(migration).not.toContain("jsonb");
    expect(migration).not.toContain(" json ");
    expect(migration).toContain("competency_stable_id text not null");
    expect(migration).toContain("competency_version integer not null");
    expect(migration).toContain("evidence_source_type text not null");
  });

  it("C4: the server always allocates the version", () => {
    expect(service).toContain("nextCertificateDefinitionVersion");

    // A caller cannot choose a version when AUTHORING, so a material change can
    // only ever create a new version rather than overwrite an existing one.
    //
    // Scoped to the authoring block: CERT-003 issuance legitimately reads a
    // version from the request to target one exact existing published version,
    // which is the opposite concern.
    const authoringBlock = server.slice(
      server.indexOf(
        "// CERT-001 — privileged Certificate Definition authoring."
      ),
      server.indexOf('pathname === "/admin/ping"')
    );
    expect(authoringBlock).not.toMatch(/version:\s*Number\(body\.version\)/);
  });
});

describe("exact competency version pinning", () => {
  it("D: resolves a requirement by stable id AND exact version", () => {
    expect(service).toContain('.eq("stable_id", competencyStableId)');
    expect(service).toContain('.eq("version", requirement.competencyVersion)');
  });

  it("D2: never substitutes a latest or newest competency version", () => {
    expect(serviceCode).not.toMatch(/latest/i);
    expect(serviceCode).not.toMatch(
      /order\("version"[^)]*\)[\s\S]{0,120}competenc/i
    );
    expect(service).toContain("UNRESOLVED_COMPETENCY_VERSION");
  });

  it("D3: the database guards the pin against drift", () => {
    expect(migration).toContain(
      "guard_certificate_definition_competency_pin"
    );
    expect(migration).toContain(
      "Certificate Definition competency pin must match the exact competency version"
    );
  });
});

describe("publication fails closed", () => {
  it("E: an unpublished required competency blocks publication", () => {
    expect(service).toContain("INELIGIBLE_COMPETENCY");
    expect(service).toContain('competency.publication_state !== "published"');
  });

  it("E2: an unresolvable competency version blocks publication", () => {
    const validate = service.slice(
      service.indexOf(
        "export async function validateCertificateDefinitionForPublication"
      )
    );
    expect(validate).toContain("UNRESOLVED_COMPETENCY_VERSION");
  });

  it("E3: publication is refused unless validation passes", () => {
    const transition = service.slice(
      service.indexOf(
        "export async function transitionCertificateDefinitionState"
      )
    );
    expect(transition).toContain('if (to === "published")');
    expect(transition).toContain("if (!validation.valid)");
    expect(transition).toContain(
      "Certificate Definition cannot be published until validation passes"
    );
  });

  it("E4: an invalid transition is rejected before any write", () => {
    expect(service).toContain("isValidCertificateDefinitionTransition");
  });
});

describe("published material immutability agrees with the database", () => {
  it("F: the freeze trigger guards every material scalar field", () => {
    const freeze = migration.slice(
      migration.indexOf(
        "create or replace function public.guard_certificate_definition_material_freeze"
      ),
      migration.indexOf("drop trigger if exists certificate_definitions_material_freeze")
    );

    // The TypeScript material field set and the SQL freeze must describe the
    // same conceptual fields. The two collection fields are enforced by the
    // separate requirement-row freeze, asserted below.
    const scalarColumns: Record<string, string> = {
      stableId: "stable_id",
      version: "version",
      issuer: "issuer",
      effectiveAt: "effective_at",
      expirationMonths: "expiration_months",
      verificationPermitted: "verification_permitted"
    };

    for (const field of CERTIFICATE_DEFINITION_MATERIAL_FIELDS) {
      if (field === "requiredCompetencies" || field === "evidencePolicies") {
        continue;
      }
      const column = scalarColumns[field];
      expect(column).toBeDefined();
      expect(freeze).toContain(
        `new.${column} is distinct from old.${column}`
      );
    }

    expect(freeze).toContain("Published Certificate Definition versions are materially immutable");
    expect(freeze).toContain("if old.publication_state = 'published'");
  });

  it("F2: requirement rows are frozen once the parent is published", () => {
    expect(migration).toContain(
      "guard_certificate_definition_requirement_freeze"
    );
    expect(migration).toContain(
      "Published Certificate Definition requirements are materially immutable"
    );
    expect(migration).toContain(
      "before insert or update or delete on public.certificate_definition_competencies"
    );
    expect(migration).toContain(
      "before insert or update or delete on public.certificate_definition_evidence_policies"
    );
  });

  it("F3: the freeze does not block retirement or supersession", () => {
    const freeze = migration.slice(
      migration.indexOf(
        "create or replace function public.guard_certificate_definition_material_freeze"
      ),
      migration.indexOf("drop trigger if exists certificate_definitions_material_freeze")
    );
    expect(freeze).not.toContain("new.publication_state is distinct from");
    expect(freeze).not.toContain("new.superseded_by_definition_id is distinct from");
  });

  it("F4: presentation stays editable on a published definition", () => {
    const freeze = migration.slice(
      migration.indexOf(
        "create or replace function public.guard_certificate_definition_material_freeze"
      ),
      migration.indexOf("drop trigger if exists certificate_definitions_material_freeze")
    );
    for (const column of [
      "title",
      "description",
      "plain_language_title",
      "plain_language_summary",
      "logo_text_alternative"
    ]) {
      expect(freeze).not.toContain(`new.${column} is distinct from`);
    }
  });

  it("F5: the service refuses a material edit before reaching the database", () => {
    expect(service).toContain("evaluateCertificateDefinitionEdit");
    expect(service).toContain(
      "Published Certificate Definition versions are materially immutable. Create a new version instead."
    );
  });
});

describe("supersession integrity", () => {
  it("G: self-supersession is blocked by a check constraint", () => {
    expect(migration).toContain(
      "certificate_definitions_no_self_supersession"
    );
    expect(migration).toContain("superseded_by_definition_id <> id");
  });

  it("G2: cycles are blocked by a bounded database walk", () => {
    expect(migration).toContain(
      "guard_certificate_definition_supersession"
    );
    expect(migration).toContain(
      "Certificate Definition supersession would create a cycle"
    );
    expect(migration).toContain("steps > max_steps");
  });

  it("G3: the service validates supersession before writing", () => {
    expect(service).toContain("validateCertificateDefinitionSupersession");
  });

  it("G4: supersession never deletes history", () => {
    expect(migration).toContain("on delete restrict");
    expect(service).not.toMatch(/\.delete\(\)[\s\S]{0,200}certificate_definitions"/);
  });
});

describe("atomic requirement replacement", () => {
  /**
   * Replacing a requirement set is DELETE + INSERT. Issued as two PostgREST
   * calls those are two transactions, so a failure between them would leave the
   * definition requiring nothing. These prove the replacement is a single
   * database transaction instead.
   *
   * The repository has no live-database test harness — every wave validates
   * migrations by static inspection — so these are structural proofs over the
   * SQL and the service, not executed rollbacks.
   */

  const replaceCompetencies = migration.slice(
    migration.indexOf(
      "create or replace function public.certificate_definition_replace_competencies"
    ),
    migration.indexOf(
      "revoke all on function public.certificate_definition_replace_competencies"
    )
  );

  const replacePolicies = migration.slice(
    migration.indexOf(
      "create or replace function public.certificate_definition_replace_evidence_policies"
    ),
    migration.indexOf(
      "revoke all on function public.certificate_definition_replace_evidence_policies"
    )
  );

  const setCompetencies = serviceCode.slice(
    serviceCode.indexOf(
      "export async function setCertificateDefinitionCompetencies"
    ),
    serviceCode.indexOf(
      "export async function setCertificateDefinitionEvidencePolicies"
    )
  );

  const setPolicies = serviceCode.slice(
    serviceCode.indexOf(
      "export async function setCertificateDefinitionEvidencePolicies"
    ),
    serviceCode.indexOf(
      "export async function validateCertificateDefinitionForPublication"
    )
  );

  it("A: a failed competency replacement cannot leave the set emptied", () => {
    // Both statements live inside one function body, so they share one
    // implicit transaction and a failed insert rolls the delete back.
    expect(replaceCompetencies).toContain(
      "delete from public.certificate_definition_competencies"
    );
    expect(replaceCompetencies).toContain(
      "insert into public.certificate_definition_competencies"
    );

    // The service must not issue its own delete against the child table, which
    // would reintroduce the two-transaction failure window.
    expect(setCompetencies).not.toMatch(/\.delete\(\)/);
    expect(setCompetencies).not.toMatch(
      /from\("certificate_definition_competencies"\)/
    );
    expect(setCompetencies).toContain(
      'rpc(\n    "certificate_definition_replace_competencies"'
    );
  });

  it("A2: all resolution happens before the destructive statement", () => {
    const resolveAt = setCompetencies.indexOf("UNRESOLVED_COMPETENCY_VERSION");
    const mutateAt = setCompetencies.indexOf(
      "certificate_definition_replace_competencies"
    );
    expect(resolveAt).toBeGreaterThan(-1);
    expect(mutateAt).toBeGreaterThan(resolveAt);
  });

  it("B: a failed evidence policy replacement cannot leave the set emptied", () => {
    expect(replacePolicies).toContain(
      "delete from public.certificate_definition_evidence_policies"
    );
    expect(replacePolicies).toContain(
      "insert into public.certificate_definition_evidence_policies"
    );

    expect(setPolicies).not.toMatch(/\.delete\(\)/);
    expect(setPolicies).not.toMatch(
      /from\("certificate_definition_evidence_policies"\)/
    );
    expect(setPolicies).toContain(
      'rpc(\n    "certificate_definition_replace_evidence_policies"'
    );
  });

  it("B2: validation happens before the destructive statement", () => {
    const validateAt = setPolicies.indexOf(
      "validateCertificateEvidencePolicies"
    );
    const mutateAt = setPolicies.indexOf(
      "certificate_definition_replace_evidence_policies"
    );
    expect(validateAt).toBeGreaterThan(-1);
    expect(mutateAt).toBeGreaterThan(validateAt);
  });

  it("C: a successful replacement replaces the complete set", () => {
    for (const body of [replaceCompetencies, replacePolicies]) {
      // Delete is scoped to the whole definition, not to a diff, so the result
      // is exactly the submitted set.
      expect(body).toContain(
        "where certificate_definition_id = target_definition_id"
      );
      // Every submitted element is inserted, matched positionally.
      expect(body).toContain("with ordinality");
      expect(body).toContain("if element_count > 0 then");
    }
  });

  it("C2: mismatched input arrays are rejected before any mutation", () => {
    for (const body of [replaceCompetencies, replacePolicies]) {
      const guardAt = body.indexOf("must be the same length");
      const deleteAt = body.indexOf("delete from public.");
      expect(guardAt).toBeGreaterThan(-1);
      expect(deleteAt).toBeGreaterThan(guardAt);
    }
  });

  it("C3: concurrent replacements are serialized on the parent row", () => {
    for (const body of [replaceCompetencies, replacePolicies]) {
      expect(body).toContain("for update");
    }
  });

  it("D: published requirements stay immutable inside the transaction", () => {
    for (const body of [replaceCompetencies, replacePolicies]) {
      const freezeAt = body.indexOf(
        "Published Certificate Definition requirements are materially immutable"
      );
      const deleteAt = body.indexOf("delete from public.");
      expect(freezeAt).toBeGreaterThan(-1);
      // The freeze check precedes the delete, so a published definition is
      // refused before anything is removed.
      expect(deleteAt).toBeGreaterThan(freezeAt);
      expect(body).toContain("if parent_state = 'published' then");
    }
  });

  it("D2: a missing definition is refused before any mutation", () => {
    for (const body of [replaceCompetencies, replacePolicies]) {
      const notFoundAt = body.indexOf("Certificate Definition was not found");
      const deleteAt = body.indexOf("delete from public.");
      expect(notFoundAt).toBeGreaterThan(-1);
      expect(deleteAt).toBeGreaterThan(notFoundAt);
    }
  });

  it("E: the replacement functions grant no student execution permission", () => {
    for (const fn of [
      "certificate_definition_replace_competencies",
      "certificate_definition_replace_evidence_policies"
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}`);
      // Matches the privileged-RPC convention of
      // curriculum_publish_learning_path_tree: revoked from every client role
      // and never granted back.
      expect(migration).toMatch(
        new RegExp(
          `revoke all on function public\\.${fn}[\\s\\S]{0,200}?from public, anon, authenticated;`
        )
      );
      expect(migration).not.toMatch(
        new RegExp(`grant execute on function public\\.${fn}`)
      );
    }
    expect(migrationCode).not.toContain("grant execute");
  });

  it("E2: the replacement functions follow the security definer convention", () => {
    for (const body of [replaceCompetencies, replacePolicies]) {
      expect(body).toContain("security definer");
      expect(body).toContain("set search_path = public");
      expect(body).toContain("language plpgsql");
    }
  });
});

describe("CERT-002 through CERT-009 remain unimplemented", () => {
  it("H: no eligibility evaluation exists", () => {
    for (const forbidden of [
      "evaluateEligibility",
      "isEligible",
      "eligibilityResult",
      "checkEligibility",
      "qualifies"
    ]) {
      expect(service).not.toContain(forbidden);
      expect(certificateRoutes).not.toContain(forbidden);
    }
  });

  it("H2: no issuance exists", () => {
    for (const forbidden of [
      "issueCertificate",
      "issuedCertificate",
      "grantCertificate",
      "mintCertificate"
    ]) {
      expect(service).not.toContain(forbidden);
      expect(certificateRoutes).not.toContain(forbidden);
    }
  });

  it("H3: no student certificate record or lifecycle exists", () => {
    expect(migration).not.toContain("student_certificates");
    expect(migration).not.toContain("issued_certificates");
    expect(migration).not.toContain("certificate_records");
    expect(migration).not.toContain("auth.users");
    expect(service).not.toContain("user_id");
    expect(service).not.toContain("revoke");
  });

  it("H4: no verification behaviour or identifier exists", () => {
    for (const forbidden of [
      "verificationId",
      "verificationCode",
      "verificationUrl",
      "verificationReference",
      "randomUUID",
      "randomBytes"
    ]) {
      expect(service).not.toContain(forbidden);
    }
    expect(migration).not.toContain("verification_id");
    expect(migration).not.toContain("verification_code");
    expect(migration).not.toContain("gen_random_bytes");
    // verification_permitted is the only verification concept present.
    expect(migration).toContain("verification_permitted boolean not null");
  });

  it("H5: the only verification route is the approved CERT-005 public surface", () => {
    // CERT-001 introduced no verification behaviour and still must not: the
    // definition authoring block stays free of it. CERT-005 owns exactly one
    // public verification path, and no other verification route may exist.
    expect(certificateRoutes).not.toContain("/verify");
    expect(server).not.toMatch(/pathname === "\/verify/);

    // The route literal spans two lines, so the regex literal itself is the
    // reliable anchor.
    const verificationRoutes =
      server.match(/\/\^\\\/[a-z-]*\\\/?verify[^\n]*/gi) ?? [];
    expect(verificationRoutes.length).toBe(1);
    expect(verificationRoutes[0]?.replace(/\\/g, "")).toContain(
      "/certificates/verify/"
    );
  });

  it("H6: no expiry calculation, scheduler or revalidation model exists", () => {
    for (const forbidden of [
      "expiresAt",
      "expires_at",
      "calculateExpiry",
      "revalidation",
      "setInterval",
      "cron"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
      expect(migrationCode).not.toContain(forbidden);
    }
  });

  it("H7: no prerequisite certificate relationship exists", () => {
    expect(migrationCode).not.toContain("prerequisite");
    expect(serviceCode).not.toContain("prerequisite");
  });

  it("H8: no portfolio, export, sharing or rendering surface exists", () => {
    for (const forbidden of [
      "portfolio",
      "shareToken",
      "share_link",
      "employer",
      "pdf",
      "render",
      "branding"
    ]) {
      expect(serviceCode.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it("H9: AI holds no authority in the certificate definition path", () => {
    for (const source of [service, migration, certificateRoutes]) {
      expect(source).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    }
  });
});
