import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MISSION_STEP_TYPES } from "@tlp/shared-types";

/**
 * MISSION-STEP-VOCAB-1 — the mission step vocabulary is defined twice, so the
 * two definitions are compared.
 *
 * ## Why this file exists
 *
 * `20260831000100_mission_steps.sql` deliberately duplicates ONE part of the
 * mission step contract in SQL: the `step_type` list. Its own header explains
 * why the rest is not duplicated — "two definitions drift" — and then the one
 * duplicated part drifted.
 *
 * DEC-054 was amended to add `near_transfer`. `MISSION_STEP_TYPES` gained it,
 * the parser gained it, two steps were authored with it, and no migration was
 * written. `validateMissionStep` therefore accepted a step the database
 * rejected, and the first Founder publication of Networking Foundations stopped
 * mid-course at `m1-s7-try-a-different-network` with a CHECK violation the
 * writer discarded.
 *
 * Nothing in the repository could have caught that. Every test on either side
 * was consistent with its own definition.
 *
 * ## Why it derives rather than declares
 *
 * A third hand-maintained list of the eight types would be a third thing to
 * forget. This reads the constraint out of the migration sources and compares
 * it to the exported constant, so the assertion has no copy of the answer and
 * cannot pass by being updated in the wrong place.
 *
 * It replays the migrations IN ORDER and takes the last definition, because a
 * later migration may legitimately widen the vocabulary again — as
 * `20260907000100` does. Pinning the first definition would make this fail on
 * exactly the change that repairs it.
 */

const MIGRATIONS_DIR = new URL("../../../supabase/migrations", import.meta.url);

/** `-- …` to end of line. Prose about the constraint is not the constraint. */
function stripLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/**
 * The table an `alter table` / `create table` statement most recently named
 * before `offset`. Ownership is read from the statement rather than assumed,
 * so a future `step_type` column on some other table cannot be mistaken for
 * this one.
 */
function owningTable(sql: string, offset: number): string | null {
  const before = sql.slice(0, offset);
  const matches = [
    ...before.matchAll(
      /(?:create table(?:\s+if not exists)?|alter table)\s+(?:public\.)?(\w+)/gi
    )
  ];
  const last = matches[matches.length - 1];
  const table = last?.[1];
  return table ? table.toLowerCase() : null;
}

type VocabularyEvent =
  | { kind: "define"; values: string[] }
  | { kind: "drop" };

/** Every statement in one migration that defines or removes the constraint. */
function eventsIn(rawSql: string): VocabularyEvent[] {
  const sql = stripLineComments(rawSql);
  const found: { at: number; event: VocabularyEvent }[] = [];

  const definition = /check\s*\(\s*step_type\s+in\s*\(([^)]*)\)/gi;
  for (const match of sql.matchAll(definition)) {
    const list = match[1];
    if (list === undefined) continue;
    if (owningTable(sql, match.index ?? 0) !== "mission_steps") continue;
    const values = [...list.matchAll(/'([^']*)'/g)]
      .map((v) => v[1])
      .filter((v): v is string => v !== undefined);
    found.push({ at: match.index ?? 0, event: { kind: "define", values } });
  }

  const removal = /alter table\s+(?:public\.)?mission_steps\s+drop constraint(?:\s+if exists)?\s+(\w+)/gi;
  for (const match of sql.matchAll(removal)) {
    const constraintName = match[1];
    if (constraintName === undefined) continue;
    if (!/step_type/i.test(constraintName)) continue;
    found.push({ at: match.index ?? 0, event: { kind: "drop" } });
  }

  return found.sort((a, b) => a.at - b.at).map((f) => f.event);
}

/**
 * The vocabulary a database has after every migration has been applied in
 * order. `null` means the constraint does not exist at the end — a dropped
 * constraint that nothing re-added, which is a failure and not a pass.
 */
function effectiveVocabulary(): string[] | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let current: string[] | null = null;
  for (const name of files) {
    const sql = readFileSync(new URL(name, `${MIGRATIONS_DIR.href}/`), "utf8");
    for (const event of eventsIn(sql)) {
      current = event.kind === "define" ? event.values : null;
    }
  }
  return current;
}

describe("mission step vocabulary: database versus shared types", () => {
  it("finds the constraint at all", () => {
    // The derivation failing open would make every assertion below vacuous.
    expect(effectiveVocabulary()).not.toBeNull();
  });

  it("admits exactly the approved shared vocabulary", () => {
    const database = effectiveVocabulary() ?? [];
    expect([...database].sort()).toEqual([...MISSION_STEP_TYPES].sort());
  });

  it("names the direction of any drift", () => {
    const database = new Set(effectiveVocabulary() ?? []);
    const shared = new Set<string>(MISSION_STEP_TYPES);

    // Authored content the database would reject at publication. This is the
    // failure that stopped the first Networking Foundations publication.
    const rejectedByDatabase = [...shared].filter((t) => !database.has(t));
    expect(rejectedByDatabase).toEqual([]);

    // Values the database would accept that no code can produce or render.
    const unreachable = [...database].filter((t) => !shared.has(t));
    expect(unreachable).toEqual([]);
  });

  it("still admits near_transfer specifically", () => {
    // Named explicitly because it is the value whose absence caused the
    // publication failure, and a set comparison alone would not say so.
    expect(effectiveVocabulary()).toContain("near_transfer");
    expect(MISSION_STEP_TYPES).toContain("near_transfer");
  });

  it("reads the vocabulary from migration sources rather than a copy", () => {
    // A guard on the guard: the derivation must actually reflect the files, so
    // a vocabulary that appears nowhere in any migration must not be reported.
    const database = effectiveVocabulary() ?? [];
    const allSql = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(new URL(name, `${MIGRATIONS_DIR.href}/`), "utf8"))
      .join("\n");

    for (const value of database) {
      expect(allSql).toContain(`'${value}'`);
    }
  });
});
