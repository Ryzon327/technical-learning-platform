import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURRICULUM_MATCH_SNIPPET_AFTER,
  CURRICULUM_MATCH_SNIPPET_BEFORE
} from "@tlp/shared-types";
import {
  RECORD_SEARCH_FUNCTION,
  RECORD_SEARCH_PAGE_SIZE
} from "./curriculum-record-search";
import {
  MISSION_CONTEXT_FUNCTION,
  SEARCHABLE_STEP_TEXT_FIELDS,
  STEP_SEARCH_FUNCTION,
  STEP_SEARCH_PAGE_SIZE,
  UNSEARCHED_STEP_FIELDS
} from "./curriculum-step-search";

/**
 * WP-005 / Founder direction G-001 — the step-search migration's contract,
 * read from its source. Runs everywhere, with no database.
 *
 * What the SQL DOES is proven against real PostgreSQL by
 * `curriculum-step-search.db.test.ts`. This file pins the properties that must
 * hold in the text itself: read-only, SECURITY INVOKER, the same field list as
 * the service, and authenticated-only execution.
 */
const MIGRATION = new URL(
  "../../../supabase/migrations/20261011000100_curriculum_step_search_functions.sql",
  import.meta.url
);

const sql = readFileSync(MIGRATION, "utf8");

/** Founder direction G-005: this migration is applied to UAT and never edited. */
const UAT_APPLIED_STEP_SEARCH_SHA256 =
  "6e7926e0e9ff9e263e8f9902e17cd7fa7601940e4837371d82ba4b0952809621";
const code = sql
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase();

const FUNCTIONS = [
  "mission_step_searchable_text",
  "current_published_missions",
  STEP_SEARCH_FUNCTION,
  MISSION_CONTEXT_FUNCTION
];

/** Each `create or replace function` statement, header and body. */
function definitions(): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /create or replace function public\.(\w+)\(([\s\S]*?)\n\$\$;/g;
  for (const match of code.matchAll(pattern)) {
    found.set(match[1] ?? "", match[0]);
  }
  return found;
}

describe("the step-search functions are read-only and run as the caller", () => {
  it("defines exactly the four functions the service relies on", () => {
    expect([...definitions().keys()].sort()).toEqual([...FUNCTIONS].sort());
  });

  for (const name of FUNCTIONS) {
    it(`${name} is SECURITY INVOKER, non-volatile and pins its search_path`, () => {
      const definition = definitions().get(name) ?? "";
      expect(definition).toContain("security invoker");
      expect(definition).not.toContain("security definer");
      expect(definition).toMatch(/\n(stable|immutable)\n/);
      expect(definition).toContain("set search_path = pg_catalog, public");
    });
  }

  it("contains no write, DDL beyond the functions and the stored text, or privileged role change", () => {
    for (const forbidden of [
      "security definer",
      "insert into public.mission",
      "insert into public.course",
      "update public.",
      "delete from",
      "truncate",
      "create table",
      "create index",
      "create extension",
      "create policy",
      "drop policy",
      "set role",
      "bypassrls"
    ]) {
      expect(code).not.toContain(forbidden);
    }
    // The only insert is the schema-version marker every migration records.
    expect(code.match(/insert into/g)).toHaveLength(1);
    expect(code).toContain("insert into public.platform_schema_version");
  });

  it("G-002: the only table change is the generated searchable text, stored once per step", () => {
    expect(code.match(/alter table/g)).toHaveLength(1);
    expect(code.replace(/\s+/g, " ")).toContain(
      "alter table public.mission_steps add column searchable_text text " +
        "generated always as (public.mission_step_searchable_text(payload)) stored;"
    );
  });

  it("G-002: the search matches the stored text and never rebuilds it per call", () => {
    const body = definitions().get(STEP_SEARCH_FUNCTION) ?? "";
    expect(body).toContain("s.searchable_text as body");
    expect(body).not.toContain("mission_step_searchable_text");
  });

  it("states the publication requirement on every curriculum table it reads", () => {
    const current = definitions().get("current_published_missions") ?? "";
    for (const alias of ["m", "lm", "c"]) {
      expect(current).toContain(`${alias}.publication_state = 'published'`);
    }
  });
});

describe("the database searches exactly the service's learner-visible fields", () => {
  it("lists SEARCHABLE_STEP_TEXT_FIELDS, in order, in both branches", () => {
    const body = definitions().get("mission_step_searchable_text") ?? "";
    const lists = [...body.matchAll(/array\[([\s\S]*?)\]/g)].map((match) =>
      [...(match[1] ?? "").matchAll(/'([^']+)'/g)].map((field) => field[1])
    );

    expect(lists).toHaveLength(2);
    const expected = SEARCHABLE_STEP_TEXT_FIELDS.map((field) => field.toLowerCase());
    for (const list of lists) expect(list).toEqual(expected);
  });

  it("never names an answer-bearing or withheld field", () => {
    for (const field of UNSEARCHED_STEP_FIELDS) {
      expect(code).not.toContain(`'${field.toLowerCase()}'`);
    }
  });

  it("G-003: the step search returns names and a snippet, never the step payload", () => {
    const body = definitions().get(STEP_SEARCH_FUNCTION) ?? "";
    const returns = /returns table \(([\s\S]*?)\n\)/.exec(body)?.[1] ?? "";
    const columns = returns
      .split(",")
      .map((column) => column.trim().split(/\s+/)[0])
      .filter(Boolean);

    expect(columns).toEqual([
      "mission_stable_id",
      "mission_version",
      "mission_title",
      "mission_description",
      "mission_publication_state",
      "mission_updated_at",
      "course_title",
      "step_stable_id",
      "step_position",
      "step_title",
      "step_label",
      "step_snippet"
    ]);
    expect(returns).not.toContain("jsonb");
    // The payload is read only for the step's own title and label.
    const payloadReads = [...body.matchAll(/s\.payload\s*(->>?)?\s*('[^']*')?/g)].map(
      (match) => match[2] ?? "(whole payload)"
    );
    expect([...new Set(payloadReads)].sort()).toEqual(["'label'", "'title'"]);
  });

  it("G-003: the snippet window is the service's snippet window", () => {
    const body = definitions().get(STEP_SEARCH_FUNCTION) ?? "";
    expect(body).toContain(`greatest(first_hit.at - ${CURRICULUM_MATCH_SNIPPET_BEFORE}, 1)`);
    expect(body).toContain(
      `first_hit.at + first_hit.len + ${CURRICULUM_MATCH_SNIPPET_AFTER} as to_at`
    );
    expect(body).toContain("substr(pg.body, win.from_at, win.to_at - win.from_at)");
  });

  it("builds a regular expression only from letters-and-digits terms", () => {
    const body = definitions().get(STEP_SEARCH_FUNCTION) ?? "";
    expect(body).toContain("where acronym.value ~ '^[a-za-z0-9]+$'");
    // Phrases are matched by position, never as a pattern.
    expect(body).toContain("strpos(lower(cand.body), n.needle) > 0");
    expect(body).not.toMatch(/\blike\b|\bilike\b|similar to/);
  });
});

describe("pages are keyset pages with a fixed cap", () => {
  it("both paged functions order by stable id, key on p_after and cap at 100", () => {
    for (const name of [STEP_SEARCH_FUNCTION, MISSION_CONTEXT_FUNCTION]) {
      const definition = definitions().get(name) ?? "";
      expect(definition).toMatch(/p_after is null or \w+\.mission_stable_id > p_after/);
      expect(definition).toMatch(/order by \w+\.(mission_)?stable_id\n/);
      expect(definition).toContain("limit least(greatest(coalesce(p_page_size, 50), 1), 100)");
    }
    // G-002: the service asks for the full cap, so no read takes more pages
    // than the database requires.
    expect(STEP_SEARCH_PAGE_SIZE).toBe(100);
  });
});

describe("execution is for authenticated learners only", () => {
  it("revokes every function from PUBLIC and anon and grants authenticated alone", () => {
    for (const name of FUNCTIONS) {
      expect(code).toMatch(
        new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`)
      );
      expect(code).toMatch(
        new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`)
      );
    }
    expect(code).not.toMatch(/grant execute on function [^;]*\b(anon|public)\s*;/);
  });

  it("grants the curriculum writer the stored-text function only, never the search functions", () => {
    // Writing a step evaluates the generated searchable_text column, so
    // service_role needs EXECUTE on exactly that function — granted explicitly,
    // not inherited from hosted platform defaults.
    expect(code).toContain(
      "grant execute on function public.mission_step_searchable_text(jsonb) to service_role;"
    );
    const serviceRoleGrants = [
      ...code.matchAll(/grant execute on function public\.(\w+)\([^)]*\) to ([^;]*);/g)
    ]
      .filter((match) => /\bservice_role\b/.test(match[2] ?? ""))
      .map((match) => match[1]);
    expect(serviceRoleGrants).toEqual(["mission_step_searchable_text"]);
  });
});

/**
 * Founder direction G-005 — the record-search migration's contract, read from
 * its source. A NEW migration: `20261011000100` is applied to UAT and is not
 * edited. Real behaviour is proven in `curriculum-step-search.db.test.ts`.
 */
describe("G-005: the record-search function is read-only, runs as the caller and matches like step search", () => {
  const recordSql = readFileSync(
    new URL(
      "../../../supabase/migrations/20261012000100_curriculum_record_search_function.sql",
      import.meta.url
    ),
    "utf8"
  );
  const recordCode = recordSql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
  const definition =
    /create or replace function public\.search_published_curriculum_records\(([\s\S]*?)\n\$\$;/.exec(
      recordCode
    )?.[0] ?? "";

  it("defines exactly one function, the one the service calls", () => {
    expect([...recordCode.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1])).toEqual([
      RECORD_SEARCH_FUNCTION
    ]);
    expect(definition).not.toBe("");
  });

  it("is SECURITY INVOKER, stable and pins its search_path", () => {
    expect(definition).toContain("security invoker");
    expect(definition).toMatch(/\nstable\n/);
    expect(definition).toContain("set search_path = pg_catalog, public");
  });

  it("contains no write, table change, index, policy or privileged role change", () => {
    for (const forbidden of [
      "security definer",
      "alter table",
      "update public.",
      "delete from",
      "truncate",
      "create table",
      "create index",
      "create extension",
      "create policy",
      "drop policy",
      "set role",
      "bypassrls",
      "mission_steps"
    ]) {
      expect(recordCode).not.toContain(forbidden);
    }
    expect(recordCode.match(/insert into/g)).toHaveLength(1);
    expect(recordCode).toContain("insert into public.platform_schema_version");
  });

  it("states the publication requirement for every source it reads", () => {
    const flat = definition.replace(/\s+/g, " ");
    for (const [table, alias] of [
      ["learning_paths", "lp"],
      ["courses", "c"],
      ["missions", "m"],
      ["competencies", "k"]
    ]) {
      expect(flat).toContain(
        `from public.${table} as ${alias} where p_source = '${table}' and ${alias}.publication_state = 'published'`
      );
    }
    expect(flat.match(/from public\.\w+/g)).toHaveLength(4);
  });

  it("matches with the step-search rules: strpos phrases and letters-and-digits whole words", () => {
    const step = definitions().get(STEP_SEARCH_FUNCTION) ?? "";
    for (const shared of [
      "select lower(btrim(phrase.value)) as needle",
      "where btrim(phrase.value) <> ''",
      "select '\\y' || acronym.value || 's?\\y' as pattern",
      "where acronym.value ~ '^[a-za-z0-9]+$'"
    ]) {
      expect(step).toContain(shared);
      expect(definition).toContain(shared);
    }
    expect(definition).not.toMatch(/\blike\b|\bilike\b|similar to/);
  });

  it("returns only the columns the search result already carries", () => {
    const returns = /returns table \(([\s\S]*?)\n\)/.exec(definition)?.[1] ?? "";
    const columns = returns
      .split(",")
      .map((column) => column.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(columns).toEqual([
      "stable_id",
      "version",
      "title",
      "description",
      "publication_state",
      "updated_at"
    ]);
  });

  it("pages by keyset on the stable id with a fixed cap", () => {
    expect(definition).toContain("where (p_after is null or r.record_id > p_after)");
    expect(definition).toMatch(/order by mt\.record_id\n/);
    expect(definition).toContain("limit least(greatest(coalesce(p_page_size, 50), 1), 100)");
    expect(RECORD_SEARCH_PAGE_SIZE).toBe(100);
  });

  it("revokes from PUBLIC and anon and grants authenticated alone", () => {
    expect(recordCode).toContain(
      `revoke all on function public.${RECORD_SEARCH_FUNCTION}(text, text[], text[], text, integer) from public, anon;`
    );
    expect(recordCode).toContain(
      `grant execute on function public.${RECORD_SEARCH_FUNCTION}(text, text[], text[], text, integer) to authenticated;`
    );
    expect(recordCode.match(/grant /g)).toHaveLength(1);
  });

  it("leaves the migration already applied to UAT exactly as it was", () => {
    // Pinned by its checksum at review head c6ecb86.
    expect(createHash("sha256").update(sql).digest("hex")).toBe(UAT_APPLIED_STEP_SEARCH_SHA256);
  });
});
