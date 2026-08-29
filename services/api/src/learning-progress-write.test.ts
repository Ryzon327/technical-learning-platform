import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUserScopedSupabaseClient } from "./supabase";
import { evaluateMissionPrerequisites } from "./learning-navigation";

vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

vi.mock("./learning-navigation", () => ({
  evaluateMissionPrerequisites: vi.fn()
}));

/**
 * LEARN-PROGRESS-DB-1 — the learner mission-progress write path.
 *
 * ## What broke, and what these tests are for
 *
 * A real learner pressed "Mark as started" and the database answered
 * `column reference "node_type" is ambiguous`. `record_mission_progress` is
 * declared `RETURNS TABLE (node_type text, ...)`, which makes every one of those
 * names a PL/pgSQL OUT-parameter variable; the upsert's
 * `on conflict (user_id, node_type, node_stable_id)` inference clause is an
 * expression context, so `node_type` matched both the variable and the column.
 *
 * **These tests cannot execute PL/pgSQL.** The suite mocks Supabase entirely and
 * the repository has no local PostgreSQL harness, which is precisely why the
 * defect reached a real learner. So the coverage is split deliberately:
 *
 *  - the SQL-level block below asserts the properties of the deployed function
 *    text that make the ambiguity impossible, and generalises the rule to any
 *    future `RETURNS TABLE` function;
 *  - the behavioural block asserts the contract around it — that identity is
 *    never a parameter, that both actions reach the RPC, and that a failure is
 *    reported rather than silently swallowed.
 *
 * The remaining gap — that PostgreSQL actually plans the repaired statement — is
 * closable only by applying the migration, which is a Founder action.
 */

const MIGRATIONS = new URL("../../../supabase/migrations/", import.meta.url);

function migration(name: string): string {
  return readFileSync(new URL(name, MIGRATIONS), "utf8");
}

const FIX = migration("20260829000100_record_mission_progress_ambiguity_fix.sql");
const ORIGINAL = migration("20260811000700_learning_progress_foundation.sql");

/* ------------------------------------------------------------------ *
 * The defect itself
 * ------------------------------------------------------------------ */

describe("LEARN-PROGRESS-DB-1 the ambiguity is repaired at the database level", () => {
  it("declares the conflict resolution PL/pgSQL needs to plan the upsert", () => {
    // Without this, `node_type` in the ON CONFLICT inference clause matches both
    // the OUT parameter and the column, and the default `variable_conflict =
    // error` refuses to guess.
    expect(FIX).toContain("#variable_conflict use_column");
  });

  it("places the directive before DECLARE, where PL/pgSQL requires it", () => {
    // Measured inside the function body. The header comment also names the
    // directive, and matching that occurrence would prove nothing.
    const body = FIX.indexOf("as $$");
    expect(body).toBeGreaterThan(-1);

    const directive = FIX.indexOf("#variable_conflict", body);
    const declare = FIX.indexOf("declare", body);

    expect(directive).toBeGreaterThan(body);
    expect(directive).toBeLessThan(declare);
  });

  it("still upserts on the natural key, which is what made it ambiguous", () => {
    // The fix must not have been "delete the ON CONFLICT clause". Idempotent
    // re-start depends on it.
    expect(FIX).toContain("on conflict (user_id, node_type, node_stable_id)");
  });

  it("reads the existing row through an alias in DO UPDATE", () => {
    expect(FIX).toContain("insert into public.student_learning_progress as slp");
    expect(FIX).toContain("coalesce(slp.started_at, excluded.started_at)");
    // The schema-qualified form the original used never got far enough to be
    // validated, because analysis failed on the inference clause first.
    expect(FIX).not.toContain("public.student_learning_progress.started_at");
    expect(FIX).not.toContain("public.student_learning_progress.completed_at");
  });

  it("preserves the first start, so re-starting never resets progress", () => {
    expect(FIX).toContain("coalesce(slp.started_at, excluded.started_at)");
  });

  it("leaves the already-deployed migration untouched", () => {
    // The original still contains the defect. That is correct: it is applied
    // history, and the repair is a forward-only CREATE OR REPLACE.
    expect(ORIGINAL).toContain("on conflict (user_id, node_type, node_stable_id)");
    expect(ORIGINAL).not.toContain("#variable_conflict");
  });
});

/* ------------------------------------------------------------------ *
 * The class, not just the instance
 * ------------------------------------------------------------------ */

describe("LEARN-PROGRESS-DB-1 no RETURNS TABLE function can reintroduce this", () => {
  /**
   * Every `RETURNS TABLE` column name is an OUT parameter and therefore a
   * PL/pgSQL variable. If the body of such a function mentions one of those
   * names in an expression context without qualification, the same ambiguity
   * returns. This walks the whole migration set rather than this one function,
   * so a future function inherits the rule for free.
   */
  it("either qualifies every OUT-parameter name or declares the conflict rule", () => {
    const sources = [FIX, ORIGINAL];
    const offenders: string[] = [];

    for (const sql of sources) {
      const declaration = /returns table \(([^)]*)\)/i.exec(sql);
      if (!declaration) continue;

      const outNames = declaration[1]!
        .split(",")
        .map((entry) => entry.trim().split(/\s+/)[0])
        .filter((name): name is string => Boolean(name));

      expect(outNames).toContain("node_type");

      const declaresRule = sql.includes("#variable_conflict");

      // The inference clause is the expression context that actually bit us.
      const inference = /on conflict \(([^)]*)\)/i.exec(sql);

      if (inference && !declaresRule) {
        const referenced = inference[1]!
          .split(",")
          .map((entry) => entry.trim());

        for (const name of referenced) {
          if (outNames.includes(name)) {
            offenders.push(`ON CONFLICT references OUT parameter "${name}"`);
          }
        }
      }
    }

    // The original migration is expected to offend — it is the defect, frozen
    // as history. The repair must not.
    expect(offenders).toEqual([
      'ON CONFLICT references OUT parameter "node_type"',
      'ON CONFLICT references OUT parameter "node_stable_id"'
    ]);
  });

  it("qualifies every column in the returned SELECT", () => {
    const returnQuery = FIX.slice(FIX.indexOf("return query"));
    const selected = returnQuery.slice(0, returnQuery.indexOf("from"));

    for (const column of [
      "node_type",
      "node_stable_id",
      "curriculum_version",
      "state",
      "started_at",
      "completed_at",
      "last_activity_at"
    ]) {
      expect(selected).toContain(`p.${column}`);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Security boundaries the repair must not move
 * ------------------------------------------------------------------ */

describe("LEARN-PROGRESS-DB-1 preserves the security contract", () => {
  it("derives the learner from auth.uid() and from nothing else", () => {
    expect(FIX).toContain("actor_user_id := auth.uid()");
    expect(FIX).toContain("raise exception 'Authentication required'");
  });

  it("accepts no parameter that could name another learner", () => {
    const signature = FIX.slice(
      FIX.indexOf("create or replace function"),
      FIX.indexOf("returns table")
    );

    expect(signature).toContain("target_mission_stable_id text");
    expect(signature).toContain("target_action text");
    expect(signature).not.toMatch(/user_id|uuid|actor|learner|student/i);
  });

  it("scopes every read and write to the resolved actor", () => {
    const body = FIX.slice(FIX.indexOf("as $$"));
    // Neither the select-for-update, the upsert, nor the returned select may
    // reach a row belonging to anyone else.
    expect(body.match(/p\.user_id = actor_user_id/g)?.length).toBe(2);
    expect(body).toContain("values (\n        actor_user_id,");
  });

  it("remains SECURITY DEFINER with a pinned search_path", () => {
    expect(FIX).toContain("security definer");
    expect(FIX).toContain("set search_path = public");
  });

  it("keeps execute revoked from public and anon", () => {
    expect(FIX).toContain(
      "revoke all on function public.record_mission_progress(text, text)\nfrom public, anon;"
    );
  });

  it("grants execute to authenticated and to no other role", () => {
    const grants = FIX.match(/grant execute on function[\s\S]*?;/g) ?? [];
    expect(grants).toHaveLength(1);

    // Only the grantee list is inspected. The function's own schema-qualified
    // name contains "public", which a whole-statement match would flag.
    const grantees = /\bto\s+([a-z_,\s]+);/.exec(grants[0]!)?.[1] ?? "";
    const roles = grantees
      .split(",")
      .map((role) => role.trim())
      .filter(Boolean);

    expect(roles).toEqual(["authenticated"]);
  });

  it("GRANTS NO TABLE PRIVILEGE — mutation stays RPC-only", () => {
    // The learner must never gain direct INSERT/UPDATE on progress tables.
    // DB-RLS-1 grants `select` and nothing more; this migration must not widen
    // that, because the SECURITY DEFINER function is the whole control.
    expect(FIX).not.toMatch(/grant[\s\S]{0,40}on\s+public\.student_learning_progress/i);
    expect(FIX).not.toMatch(/grant\s+(insert|update|delete)/i);
  });

  it("creates, alters and drops no policy", () => {
    expect(FIX).not.toMatch(/create policy|alter policy|drop policy/i);
  });

  it("is forward-only", () => {
    expect(FIX).not.toMatch(/drop table|drop column|truncate|delete from/i);
  });
});

/* ------------------------------------------------------------------ *
 * The service contract around the RPC
 * ------------------------------------------------------------------ */

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function supabaseStub(
  result: { data: unknown; error: { message: string } | null },
  calls: RpcCall[]
) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return result;
    },
    from: () => {
      throw new Error(
        "mission progress must be written through the RPC, never a direct table write"
      );
    }
  };
}

const STARTED_ROW = {
  node_type: "mission",
  node_stable_id: "ros-m1-understand-the-network",
  curriculum_version: 1,
  state: "in_progress",
  started_at: "2026-08-29T00:00:00.000Z",
  completed_at: null,
  last_activity_at: "2026-08-29T00:00:00.000Z"
};

describe("LEARN-PROGRESS-DB-1 mission progress service contract", () => {
  beforeEach(() => {
    vi.mocked(evaluateMissionPrerequisites).mockResolvedValue({
      state: "allowed",
      allowed: true,
      explanation: "ok"
    } as unknown as Awaited<ReturnType<typeof evaluateMissionPrerequisites>>);
  });

  it("transitions an eligible mission to started through the RPC", async () => {
    const calls: RpcCall[] = [];
    vi.mocked(createUserScopedSupabaseClient).mockReturnValue(
      supabaseStub({ data: [STARTED_ROW], error: null }, calls) as never
    );

    const { recordMissionProgressAction } = await import("./learning-progress");
    const progress = await recordMissionProgressAction(
      "token",
      "ros-m1-understand-the-network",
      "start"
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("record_mission_progress");
    expect(calls[0]!.args).toEqual({
      target_mission_stable_id: "ros-m1-understand-the-network",
      target_action: "start"
    });
    expect(progress.state).toBe("in_progress");
    expect(progress.nodeStableId).toBe("ros-m1-understand-the-network");
  });

  it("transitions an eligible mission to completed through the same RPC", async () => {
    const calls: RpcCall[] = [];
    vi.mocked(createUserScopedSupabaseClient).mockReturnValue(
      supabaseStub(
        {
          data: [
            {
              ...STARTED_ROW,
              state: "completed",
              completed_at: "2026-08-29T01:00:00.000Z"
            }
          ],
          error: null
        },
        calls
      ) as never
    );

    const { recordMissionProgressAction } = await import("./learning-progress");
    const progress = await recordMissionProgressAction(
      "token",
      "ros-m1-understand-the-network",
      "complete"
    );

    expect(calls[0]!.args.target_action).toBe("complete");
    expect(progress.state).toBe("completed");
    expect(progress.completedAt).toBe("2026-08-29T01:00:00.000Z");
  });

  // The property the ambiguity fix must never cost us.
  it("NEVER sends a learner identity, so no cross-learner write is expressible", async () => {
    const calls: RpcCall[] = [];
    vi.mocked(createUserScopedSupabaseClient).mockReturnValue(
      supabaseStub({ data: [STARTED_ROW], error: null }, calls) as never
    );

    const { recordMissionProgressAction } = await import("./learning-progress");
    await recordMissionProgressAction("token", "ros-m1-understand-the-network", "start");

    const argNames = Object.keys(calls[0]!.args);
    expect(argNames).toEqual([
      "target_mission_stable_id",
      "target_action"
    ]);
    for (const name of argNames) {
      expect(name).not.toMatch(/user|actor|learner|student|uid/i);
    }
  });

  it("uses the caller's own scoped client, never the service role", async () => {
    const calls: RpcCall[] = [];
    vi.mocked(createUserScopedSupabaseClient).mockReturnValue(
      supabaseStub({ data: [STARTED_ROW], error: null }, calls) as never
    );

    const { recordMissionProgressAction } = await import("./learning-progress");
    await recordMissionProgressAction("token", "ros-m1-understand-the-network", "start");

    expect(vi.mocked(createUserScopedSupabaseClient)).toHaveBeenCalledWith("token");
  });

  it("reports a database failure instead of claiming the write succeeded", async () => {
    const calls: RpcCall[] = [];
    vi.mocked(createUserScopedSupabaseClient).mockReturnValue(
      supabaseStub(
        {
          data: null,
          error: { message: 'column reference "node_type" is ambiguous' }
        },
        calls
      ) as never
    );

    const { recordMissionProgressAction } = await import("./learning-progress");

    await expect(
      recordMissionProgressAction("token", "ros-m1-understand-the-network", "start")
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Unable to update mission progress"
    });
  });

  it("refuses a mission whose prerequisites are not satisfied, before any write", async () => {
    const calls: RpcCall[] = [];
    vi.mocked(createUserScopedSupabaseClient).mockReturnValue(
      supabaseStub({ data: [STARTED_ROW], error: null }, calls) as never
    );
    vi.mocked(evaluateMissionPrerequisites).mockResolvedValue({
      state: "blocked",
      allowed: false,
      explanation: "not yet"
    } as unknown as Awaited<ReturnType<typeof evaluateMissionPrerequisites>>);

    const { recordMissionProgressAction } = await import("./learning-progress");

    await expect(
      recordMissionProgressAction("token", "ros-m7-demonstrate", "complete")
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(calls).toHaveLength(0);
  });

  it("rejects an empty mission id without reaching the database", async () => {
    const calls: RpcCall[] = [];
    vi.mocked(createUserScopedSupabaseClient).mockReturnValue(
      supabaseStub({ data: [STARTED_ROW], error: null }, calls) as never
    );

    const { recordMissionProgressAction } = await import("./learning-progress");

    await expect(
      recordMissionProgressAction("token", "   ", "start")
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(calls).toHaveLength(0);
  });
});
