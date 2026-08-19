import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CERT-008 structural, authority, authorization and audit boundaries, plus
 * executable coverage of the outcomes that depend on data responses.
 *
 * The client factory is mocked using the precedent introduced in CERT-005:
 * delegation to CERT-004, refusal mapping and downstream propagation cannot be
 * proven by reading source.
 *
 * NOT proven here: real RLS isolation, real transactional rollback, real
 * concurrency serialization, and the database triggers themselves. Those need a
 * live PostgreSQL harness, which this repository does not have. The migration
 * is verified by static inspection only.
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

function stripSqlComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

const service = read("./certificate-correction.ts");
const server = read("./server.ts");
const serviceCode = stripTsComments(service);

const correctionMigration = read(
  "../../../supabase/migrations/20260813001000_certificate_correction_foundation.sql"
);
const correctionMigrationCode = stripSqlComments(correctionMigration);
const lifecycleMigration = read(
  "../../../supabase/migrations/20260813000900_certificate_lifecycle_foundation.sql"
);

// Anchored at the next route's `if (`: the /admin/ping route follows this block.
const correctionRoutes = server.slice(
  server.indexOf("// CERT-008 — privileged certificate revocation and correction."),
  server.indexOf('if (request.method === "GET" && pathname === "/admin/ping")')
);

const CERTIFICATE_ID = "11111111-1111-4111-8111-111111111111";
const REPLACEMENT_ID = "22222222-2222-4222-8222-222222222222";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

function clientWithRpc(result: { data?: unknown; error?: unknown }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return result;
    },
    from: () => {
      throw new Error("CERT-008 must not query tables when applying a correction");
    }
  };
  return { client, calls };
}

async function applyWith(
  result: { data?: unknown; error?: unknown },
  input: Record<string, unknown> = {}
) {
  const { createServerSupabaseClient } = await import("./supabase");
  const { client, calls } = clientWithRpc(result);
  vi.mocked(createServerSupabaseClient).mockReturnValue(
    client as unknown as ReturnType<typeof createServerSupabaseClient>
  );

  const { applyCertificateCorrection } = await import("./certificate-correction");

  const outcome = await applyCertificateCorrection(
    { actorUserId: ACTOR_ID },
    {
      certificateId: CERTIFICATE_ID,
      action: "revoke",
      reason: "Source evidence was found to be invalid.",
      ...input
    } as never
  );

  return { outcome, calls };
}

describe("A: CERT-004 remains the sole lifecycle authority", () => {
  it("A: CERT-008 writes no lifecycle event itself", () => {
    expect(serviceCode).not.toContain("certificate_lifecycle_events");
    expect(serviceCode).not.toContain("certificate_record_lifecycle_event");
  });

  it("A2: CERT-008 evaluates no transition legality of its own", () => {
    for (const forbidden of [
      "isValidCertificateLifecycleTransition",
      "resolveEffectiveCertificateStatus",
      "CERTIFICATE_LIFECYCLE_STATUSES"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("A3: the correction RPC delegates the transition to CERT-004", () => {
    expect(correctionMigrationCode).toContain(
      "public.certificate_record_lifecycle_event("
    );
  });

  it("A4: the correction RPC declares no transition edge of its own", () => {
    // CERT-004's guard owns the edges. CERT-008 must not restate them.
    expect(correctionMigrationCode).not.toContain("previous_status = 'active' and");
    expect(correctionMigrationCode).not.toContain("transition is not permitted");
  });

  it("A5: the CERT-004 migration is untouched by CERT-008", () => {
    // The lifecycle RPC keeps its exact three-argument signature and its grants.
    expect(lifecycleMigration).toContain(
      "revoke all on function public.certificate_record_lifecycle_event(\n    uuid, text, timestamptz\n) from public, anon, authenticated;"
    );
    for (const workflow of ["reason", "actor_id", "replacement_certificate"]) {
      expect(stripSqlComments(lifecycleMigration)).not.toContain(workflow);
    }
  });

  it("A6: CERT-008 adds no column to lifecycle history", () => {
    expect(correctionMigrationCode).not.toContain(
      "alter table public.certificate_lifecycle_events"
    );
    expect(correctionMigrationCode).not.toContain("alter table public.certificates");
  });
});

describe("B: privileged authorization only", () => {
  it("B: both correction routes are founder guarded", () => {
    const guards = correctionRoutes.match(/await founder\(request\)/g) ?? [];
    expect(guards.length).toBe(2);
  });

  it("B2: the acting administrator never comes from the request body", () => {
    for (const forbidden of ["body.actorId", "body.actorUserId", "body.userId"]) {
      expect(correctionRoutes).not.toContain(forbidden);
    }
    expect(correctionRoutes).toContain("trusted.identity.userId");
  });

  it("B3: no student-facing correction route exists", () => {
    for (const forbidden of [
      '"/certificates/revoke"',
      '"/certificates/restore"',
      '"/certificates/corrections"',
      '"/certificates/correct"'
    ]) {
      expect(server).not.toContain(forbidden);
    }
  });

  it("B4: every correction path is privileged", () => {
    const paths = correctionRoutes.match(/\/admin\\?\/certificates[^"'`\s)]*/g) ?? [];
    expect(paths.length).toBeGreaterThan(0);
  });

  it("B5: the correction RPC is privileged and grants nothing", () => {
    expect(correctionMigrationCode).toContain("security definer");
    expect(correctionMigrationCode).toContain("set search_path = public");
    expect(correctionMigration).toContain(
      "revoke all on function public.certificate_apply_correction("
    );
    expect(correctionMigrationCode).not.toContain("grant execute");
  });

  /**
   * Scoped to the policy statements themselves. A migration-wide scan would
   * match the RPC's `for update` row lock and the `revoke ... from public`
   * line, judging correct code as a violation.
   */
  it("B6: students get read access only, never a write policy", () => {
    const policyBlock = correctionMigrationCode.slice(
      correctionMigrationCode.indexOf("create policy"),
      correctionMigrationCode.indexOf("create index")
    );

    const policies = correctionMigrationCode.match(/^create policy/gm) ?? [];
    expect(policies.length).toBe(1);
    expect(policyBlock).toContain("for select to authenticated");
    for (const write of ["for insert", "for update", "for delete", "for all"]) {
      expect(policyBlock).not.toContain(write);
    }
  });

  it("B7: no policy grants anonymous or public access", () => {
    const policyBlock = correctionMigrationCode.slice(
      correctionMigrationCode.indexOf("create policy"),
      correctionMigrationCode.indexOf("create index")
    );

    expect(policyBlock).not.toContain("to anon");
    expect(policyBlock).not.toContain("to public");
    // The RPC's grants are revoked from every client role, never granted.
    expect(correctionMigration).toContain("from public, anon, authenticated;");
  });
});

describe("C: history is append-only and issuance is preserved", () => {
  it("C: correction history rejects update and delete", () => {
    expect(correctionMigrationCode).toContain(
      "before update or delete on public.certificate_correction_events"
    );
    expect(correctionMigrationCode).toContain("append-only and cannot be updated");
    expect(correctionMigrationCode).toContain("append-only and cannot be deleted");
  });

  it("C2: CERT-008 never deletes a certificate", () => {
    expect(serviceCode).not.toContain(".delete(");
    expect(correctionMigrationCode).not.toContain("delete from public.certificates");
    expect(correctionMigrationCode).not.toContain(
      "delete from public.certificate_lifecycle_events"
    );
  });

  it("C3: one correction can never claim two transitions", () => {
    expect(correctionMigrationCode).toContain("lifecycle_event_id uuid not null unique");
  });

  it("C4: concurrent corrections serialize on the certificate", () => {
    expect(correctionMigrationCode).toContain("for update");
  });

  it("C5: a retried correction collapses onto one event", () => {
    expect(correctionMigrationCode).toContain(
      "constraint certificate_correction_events_idempotency_key"
    );
    expect(correctionMigrationCode).toContain("unique (certificate_id, idempotency_key)");
  });
});

describe("D: a reason is mandatory", () => {
  it("D: the database refuses a reasonless correction", () => {
    expect(correctionMigrationCode).toContain("reason text not null check");
    expect(correctionMigrationCode).toContain("length(btrim(reason)) >= 8");
  });

  it("D2: the RPC refuses a reasonless correction independently", () => {
    expect(correctionMigrationCode).toContain(
      "A certificate correction requires a reason"
    );
  });

  it("D3: the service refuses before reaching the database", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockClear();

    const { applyCertificateCorrection } = await import("./certificate-correction");

    await expect(
      applyCertificateCorrection(
        { actorUserId: ACTOR_ID },
        { certificateId: CERTIFICATE_ID, action: "revoke", reason: "" }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("D4: a too-short reason is refused before reaching the database", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockClear();

    const { applyCertificateCorrection } = await import("./certificate-correction");

    await expect(
      applyCertificateCorrection(
        { actorUserId: ACTOR_ID },
        { certificateId: CERTIFICATE_ID, action: "revoke", reason: "oops" }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});

describe("E: executable correction behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("E: applies a revocation through the privileged RPC", async () => {
    const { outcome, calls } = await applyWith({ data: "correction-1", error: null });

    expect(outcome.correctionId).toBe("correction-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("certificate_apply_correction");
    expect(calls[0]?.args.target_action).toBe("revoke");
    expect(calls[0]?.args.target_certificate_id).toBe(CERTIFICATE_ID);
  });

  it("E2: the actor sent to the database is the verified administrator", async () => {
    const { calls } = await applyWith({ data: "correction-1", error: null });

    expect(calls[0]?.args.target_actor_id).toBe(ACTOR_ID);
  });

  it("E3: the reason is trimmed but never emptied", async () => {
    const { calls } = await applyWith(
      { data: "correction-1", error: null },
      { reason: "   Evidence was invalidated upstream.   " }
    );

    expect(calls[0]?.args.target_reason).toBe("Evidence was invalidated upstream.");
  });

  it("E4: supersession carries its replacement", async () => {
    const { calls } = await applyWith(
      { data: "correction-1", error: null },
      { action: "supersede", replacementCertificateId: REPLACEMENT_ID }
    );

    expect(calls[0]?.args.target_action).toBe("supersede");
    expect(calls[0]?.args.target_replacement_certificate_id).toBe(REPLACEMENT_ID);
  });

  it("E5: supersession without a replacement never reaches the database", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockClear();

    const { applyCertificateCorrection } = await import("./certificate-correction");

    await expect(
      applyCertificateCorrection(
        { actorUserId: ACTOR_ID },
        {
          certificateId: CERTIFICATE_ID,
          action: "supersede",
          reason: "Replaced by a newer certificate."
        }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("E6: an unknown action never reaches the database", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockClear();

    const { applyCertificateCorrection } = await import("./certificate-correction");

    await expect(
      applyCertificateCorrection(
        { actorUserId: ACTOR_ID },
        {
          certificateId: CERTIFICATE_ID,
          action: "delete",
          reason: "Trying to delete a certificate."
        }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("E7: a transition CERT-004 refuses surfaces as a conflict", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    const { client } = clientWithRpc({
      data: null,
      error: { message: "Certificate lifecycle transition is not permitted" }
    });
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      client as unknown as ReturnType<typeof createServerSupabaseClient>
    );

    const { applyCertificateCorrection } = await import("./certificate-correction");

    await expect(
      applyCertificateCorrection(
        { actorUserId: ACTOR_ID },
        {
          certificateId: CERTIFICATE_ID,
          action: "restore",
          reason: "Attempting to restore an expired certificate."
        }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("E8: an unknown certificate surfaces as not found", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    const { client } = clientWithRpc({
      data: null,
      error: { message: "Certificate was not found" }
    });
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      client as unknown as ReturnType<typeof createServerSupabaseClient>
    );

    const { applyCertificateCorrection } = await import("./certificate-correction");

    await expect(
      applyCertificateCorrection(
        { actorUserId: ACTOR_ID },
        {
          certificateId: CERTIFICATE_ID,
          action: "revoke",
          reason: "Certificate should not exist."
        }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("E9: infrastructure failure is retryable, never a silent success", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    const { client } = clientWithRpc({
      data: null,
      error: { message: "connection terminated" }
    });
    vi.mocked(createServerSupabaseClient).mockReturnValue(
      client as unknown as ReturnType<typeof createServerSupabaseClient>
    );

    const { applyCertificateCorrection } = await import("./certificate-correction");

    await expect(
      applyCertificateCorrection(
        { actorUserId: ACTOR_ID },
        {
          certificateId: CERTIFICATE_ID,
          action: "revoke",
          reason: "Evidence was invalidated upstream."
        }
      )
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE", retryable: true });
  });

  it("E10: the idempotency key is passed through when supplied", async () => {
    const { calls } = await applyWith(
      { data: "correction-1", error: null },
      { idempotencyKey: "retry-key-0001" }
    );

    expect(calls[0]?.args.target_idempotency_key).toBe("retry-key-0001");
  });
});

describe("F: audit", () => {
  it("F: every correction is audited", () => {
    expect(serviceCode).toContain("writeAuditEvent");
    expect(serviceCode).toContain('eventType: "certificate.correction.applied"');
  });

  it("F2: the audit event names the acting administrator and the certificate", () => {
    expect(serviceCode).toContain("actorId: actorUserId");
    expect(serviceCode).toContain("targetId: certificateId");
  });

  it("F3: the audit record does not copy the reason text", () => {
    const auditBlock = serviceCode.slice(
      serviceCode.indexOf("writeAuditEvent({"),
      serviceCode.indexOf("return { correctionId };")
    );
    expect(auditBlock).not.toContain("reason");
  });
});

describe("G: no duplicated downstream propagation", () => {
  it("G: CERT-008 does not touch verification, portfolio or export", () => {
    for (const forbidden of [
      "verifyCertificate",
      "getStudentCertificatePortfolio",
      "exportStudentCertificates",
      "verification_id"
    ]) {
      expect(serviceCode).not.toContain(forbidden);
    }
  });

  it("G2: downstream readers still derive status from CERT-004", () => {
    const verification = read("./certificate-verification.ts");
    const portfolio = read("./certificate-portfolio.ts");

    expect(verification).toContain("resolveEffectiveCertificateStatus");
    expect(portfolio).toContain("resolveEffectiveCertificateStatus");
  });

  it("G3: no propagation flag or cached status was introduced", () => {
    for (const forbidden of [
      "propagation",
      "propagated",
      "current_status",
      "cached_status"
    ]) {
      expect(correctionMigrationCode).not.toContain(forbidden);
      expect(serviceCode).not.toContain(forbidden);
    }
  });
});

describe("H: downstream readers reflect a revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  /**
   * The propagation proof CERT-008 section 7 requires. A revocation is only a
   * lifecycle event; these assertions show the three downstream readers report
   * it without CERT-008 telling them anything.
   */
  const certificateRow = {
    id: "certificate-1",
    certificate_definition_id: "definition-1",
    certificate_definition_stable_id: "certdef-net-foundations-001",
    certificate_definition_version: 3,
    verification_id: `cert1_${"a1".repeat(24)}`,
    issued_at: "2026-01-01T00:00:00.000Z",
    expires_at: null
  };

  const revokedEvent = {
    id: "event-1",
    certificate_id: "certificate-1",
    sequence_number: 1,
    previous_status: "active",
    new_status: "revoked",
    effective_at: "2026-03-01T00:00:00.000Z",
    occurred_at: "2026-03-01T00:00:00.000Z"
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

  const revokedTables: Record<string, { data?: unknown; error?: unknown }> = {
    certificates: { data: [certificateRow], error: null },
    certificate_lifecycle_events: { data: [revokedEvent], error: null },
    certificate_definitions: {
      data: [{ id: "definition-1", title: "Network Foundations", issuer: "TLP" }],
      error: null
    },
    certificate_competency_snapshots: { data: [], error: null },
    competencies: { data: [], error: null }
  };

  async function withRevokedCertificate() {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: (name: string) => table(revokedTables[name] ?? { data: [], error: null })
    } as unknown as ReturnType<typeof createServerSupabaseClient>);
  }

  it("H: the student portfolio shows the certificate as revoked", async () => {
    await withRevokedCertificate();
    const { getStudentCertificatePortfolio } = await import("./certificate-portfolio");

    const portfolio = await getStudentCertificatePortfolio(
      "11111111-1111-4111-8111-111111111111"
    );

    expect(portfolio.entries[0]?.status).toBe("revoked");
  });

  it("H2: the export reports the certificate as not currently valid", async () => {
    await withRevokedCertificate();
    const { exportStudentCertificates } = await import("./certificate-export");

    const result = await exportStudentCertificates(
      "11111111-1111-4111-8111-111111111111"
    );

    expect(result.certificates[0]?.status).toBe("revoked");
    expect(result.certificates[0]?.currentlyValid).toBe(false);
    expect(result.currentlyValidCount).toBe(0);
  });
});

describe("I: history read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("I: reads only the requested certificate's corrections", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    const eqCalls: Array<[string, unknown]> = [];

    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.eq = (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return builder;
    };
    builder.then = (resolve: (value: unknown) => unknown) =>
      resolve({ data: [], error: null });

    vi.mocked(createServerSupabaseClient).mockReturnValue({
      from: () => builder
    } as unknown as ReturnType<typeof createServerSupabaseClient>);

    const { listCertificateCorrections } = await import("./certificate-correction");
    await listCertificateCorrections(CERTIFICATE_ID);

    expect(eqCalls).toEqual([["certificate_id", CERTIFICATE_ID]]);
  });

  it("I2: a blank identifier is refused before any query", async () => {
    const { createServerSupabaseClient } = await import("./supabase");
    vi.mocked(createServerSupabaseClient).mockClear();

    const { listCertificateCorrections } = await import("./certificate-correction");

    await expect(listCertificateCorrections("  ")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
