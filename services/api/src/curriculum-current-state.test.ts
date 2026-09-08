import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WP-G — the columns the publication reader may ask each table for.
 *
 * ## Why this file exists
 *
 * `curriculum-current-state.ts` had no test at all, and its only consumer is
 * the publication CLI. The first thing that exercised it was a Founder running
 * a dry run against the real database, which failed with:
 *
 *   [42703] column learning_paths.position does not exist
 *
 * Both readers selected one fixed column list for every table. That list is
 * correct for the ordered middle of the hierarchy and wrong at both ends: a
 * learning path is the root and has no siblings to order, and a competency is
 * not in the hierarchy at all and has neither `position` nor
 * `estimated_minutes`.
 *
 * The competency case had not even been reached — the reader asks about the
 * learning path first — so fixing the reported table alone would have moved
 * the failure to the next query.
 *
 * ## What is asserted, and why it is not a source grep
 *
 * Two layers. The first drives `readCurrentCurriculumState` through a fake
 * Supabase client and records every `.select(...)` the reader actually issues,
 * so the assertions are about queries the code makes rather than text it
 * contains. The second reads the migration that creates these tables and
 * requires the declared contract to agree with it — the check that would have
 * caught this defect before it reached a database, and that fails if either the
 * schema or the reader drifts.
 */

const selects: { table: string; columns: string }[] = [];

vi.mock("./supabase", () => ({
  createServerSupabaseClient: () => {
    const builder = (table: string) => ({
      select(columns: string) {
        selects.push({ table, columns });
        const result = { data: null, error: null };
        const chain: Record<string, unknown> = {
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => result,
          then: (resolve: (value: typeof result) => unknown) => resolve(result)
        };
        return chain;
      }
    });

    return { from: (table: string) => builder(table) };
  }
}));

vi.mock("./curriculum-admin", () => ({
  readMissionSteps: async () => ({ state: "available", steps: [] }),
  readPrerequisiteRules: async () => []
}));

vi.mock("./curriculum-quality", () => ({
  readMissionAssets: async () => ({ state: "available", assets: [] })
}));

const { readCurrentCurriculumState, curriculumNodeColumns } = await import(
  "./curriculum-current-state"
);

/** The smallest document that makes the reader visit every table. */
const DOCUMENT = {
  learningPath: { stableId: "path-1", title: "P", description: null },
  course: { stableId: "course-1", title: "C", description: null, position: 0 },
  modules: [{ stableId: "module-1", title: "M", description: null, position: 0 }],
  missions: [{ stableId: "mission-1", title: "X", description: null, position: 0 }],
  competencies: [{ stableId: "comp-1", title: "K", description: null }]
} as never;

beforeEach(() => {
  selects.length = 0;
});

/** Every select issued against one table, as column-name arrays. */
function columnsFor(table: string): string[][] {
  return selects
    .filter((entry) => entry.table === table)
    .map((entry) => entry.columns.split(",").map((column) => column.trim()));
}

describe("the publication reader asks each table only for columns it has", () => {
  it("never selects position from learning_paths", async () => {
    /*
      The exact defect, as the database reported it. Asserted on the queries the
      reader issues, so it fails whether the column list is inlined, assembled,
      or reintroduced through a shared constant.
    */
    await readCurrentCurriculumState(DOCUMENT);

    const queries = columnsFor("learning_paths");
    expect(queries.length).toBeGreaterThan(0);

    for (const columns of queries) {
      expect(`learning_paths selected: ${columns.join(",")}`).toBe(
        `learning_paths selected: ${columns.filter((c) => c !== "position").join(",")}`
      );
    }
  });

  it("never selects position or estimated_minutes from competencies", async () => {
    // The second instance, which the failing dry run never reached.
    await readCurrentCurriculumState(DOCUMENT);

    const queries = columnsFor("competencies");
    expect(queries.length).toBeGreaterThan(0);

    for (const columns of queries) {
      expect(columns).not.toContain("position");
      expect(columns).not.toContain("estimated_minutes");
    }
  });

  it("still selects position for every ordered table", async () => {
    /*
      The other half, and the reason this is not simply "stop asking for
      position": courses, modules and missions are siblings ordered within a
      parent, the reconciliation plan compares that order, and a reader that
      stopped returning it would silently make every reorder invisible.
    */
    await readCurrentCurriculumState(DOCUMENT);

    for (const table of ["courses", "learning_modules", "missions"]) {
      const queries = columnsFor(table);
      expect(`${table} was queried: ${queries.length > 0}`).toBe(
        `${table} was queried: true`
      );
      for (const columns of queries) {
        expect(columns).toContain("position");
        expect(columns).toContain("estimated_minutes");
      }
    }
  });

  it("issues the exact column list each table supports", async () => {
    /*
      The whole contract in one place, asserted as exact lists rather than as
      "contains" checks, so an extra column is as much a failure as a missing
      one. An extra column is the shape this defect took.

      A first version tried to say "no foreign key on a root table" with
      `endsWith("_id")` and failed on `stable_id`, which every table has. Naming
      the lists is both simpler and stricter.
    */
    await readCurrentCurriculumState(DOCUMENT);

    const expected: Record<string, string> = {
      learning_paths:
        "id,stable_id,version,publication_state,title,description,estimated_minutes",
      competencies: "id,stable_id,version,publication_state,title,description",
      courses:
        "id,stable_id,version,publication_state,title,description,position,estimated_minutes,learning_path_id",
      learning_modules:
        "id,stable_id,version,publication_state,title,description,position,estimated_minutes,course_id",
      missions:
        "id,stable_id,version,publication_state,title,description,position,estimated_minutes,module_id"
    };

    for (const [table, columns] of Object.entries(expected)) {
      const queries = columnsFor(table);
      expect(`${table} queried: ${queries.length > 0}`).toBe(
        `${table} queried: true`
      );
      for (const actual of queries) {
        expect(`${table}: ${actual.join(",")}`).toBe(`${table}: ${columns}`);
      }
    }
  });

  it("refuses to guess the columns of an undeclared table", () => {
    // Guessing is how this defect happened. A table nobody checked against the
    // migration must fail loudly rather than inherit someone else's shape.
    expect(() => curriculumNodeColumns("assessments", null)).toThrow(
      /No column contract is declared/
    );
  });
});

describe("the declared column contract matches the migration", () => {
  /*
    The check that ties code to schema. Everything above would still pass if
    both the reader and its expectations were wrong together; this reads the
    migration that actually creates these tables and compares.
  */
  const MIGRATION =
    "../../../supabase/migrations/20260811000300_curriculum_foundation.sql";

  const sql = readFileSync(new URL(MIGRATION, import.meta.url), "utf8");

  /** The column names inside one `create table` block. */
  function schemaColumns(table: string): string[] {
    const start = sql.indexOf(`create table if not exists public.${table} (`);
    if (start === -1) throw new Error(`no create table for ${table}`);
    const end = sql.indexOf("\n);", start);
    return sql
      .slice(start, end)
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => /^[a-z_]+ /.test(line))
      .map((line) => line.split(" ")[0] as string);
  }

  for (const [table, parent] of [
    ["learning_paths", null],
    ["courses", "learning_path_id"],
    ["learning_modules", "course_id"],
    ["missions", "module_id"],
    ["competencies", null]
  ] as const) {
    it(`asks ${table} for nothing the migration does not define`, () => {
      const defined = schemaColumns(table);
      const requested = curriculumNodeColumns(table, parent).split(",");

      for (const column of requested) {
        expect(`${table}.${column} exists: ${defined.includes(column)}`).toBe(
          `${table}.${column} exists: true`
        );
      }
    });
  }

  it("keeps position exactly where the schema orders siblings", () => {
    // Stated as a fact about the SCHEMA, so it survives any refactor of the
    // reader: position belongs to the three tables whose rows are ordered
    // within a parent, and to no others.
    const ordered = ["courses", "learning_modules", "missions"];
    const unordered = ["learning_paths", "competencies"];

    for (const table of ordered) {
      expect(`${table} has position: ${schemaColumns(table).includes("position")}`)
        .toBe(`${table} has position: true`);
    }
    for (const table of unordered) {
      expect(`${table} has position: ${schemaColumns(table).includes("position")}`)
        .toBe(`${table} has position: false`);
    }
  });
});
