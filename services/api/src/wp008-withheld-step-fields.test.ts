import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STEP_PAYLOAD_FUNCTION } from "./curriculum";
import { STEP_SEARCH_FUNCTION } from "./curriculum-step-search";

/**
 * WP-008 — learners stop reading withheld step fields directly.
 *
 * Runs everywhere, with no database. What the migration DOES is proven against
 * real PostgreSQL in `curriculum-step-search.db.test.ts` (the WP-008 block);
 * this file pins what must hold in the repository text:
 *
 *   criterion 6  a guard that fails if any migration, now or later, leaves a
 *                client role able to SELECT `mission_steps.payload`
 *   criterion 5  no client-side secret or service-role usage in `apps/web`
 *
 * and the shape of `20261013000100` itself.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MIGRATIONS = join(ROOT, "supabase/migrations");
const WP008_MIGRATION = "20261013000100_mission_step_payload_withholding.sql";

const CLIENT_ROLES = ["authenticated", "anon", "public"] as const;
const WITHHELD_COLUMN = "payload";

/**
 * Statements of a SQL file: comments dropped, quotes and dollar-quotes
 * honoured (function bodies contain semicolons), whitespace collapsed,
 * lower-cased.
 */
function sqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buffer = "";
  let index = 0;
  let dollarTag: string | undefined;
  let inSingle = false;

  while (index < sql.length) {
    const rest = sql.slice(index);
    const ch = sql[index] ?? "";

    if (dollarTag !== undefined) {
      // Comments inside a function body are dropped too, so two bodies that
      // differ only in commentary compare equal.
      if (rest.startsWith("--")) {
        const end = sql.indexOf("\n", index);
        index = end === -1 ? sql.length : end;
      } else if (rest.startsWith(dollarTag)) {
        buffer += dollarTag;
        index += dollarTag.length;
        dollarTag = undefined;
      } else {
        buffer += ch;
        index += 1;
      }
      continue;
    }
    if (inSingle) {
      buffer += ch;
      if (ch === "'") inSingle = false;
      index += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buffer += ch;
      index += 1;
      continue;
    }
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
      continue;
    }
    const tag = /^\$[A-Za-z_]*\$/.exec(rest)?.[0];
    if (tag !== undefined) {
      dollarTag = tag;
      buffer += tag;
      index += tag.length;
      continue;
    }
    if (ch === ";") {
      statements.push(buffer);
      buffer = "";
      index += 1;
      continue;
    }
    buffer += ch;
    index += 1;
  }
  if (buffer.trim() !== "") statements.push(buffer);

  return statements
    .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
    .filter((statement) => statement !== "");
}

const roleList = (text: string) =>
  text
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role !== "");

interface ReadAccess {
  /** Table-level SELECT, which covers every column including the payload. */
  table: boolean;
  /** Columns granted by a column-level SELECT. */
  columns: Set<string>;
}

/**
 * What each client role may SELECT from `mission_steps` after applying the
 * given statements in order, plus every statement that hands a client role a
 * privileged role outright. Unknown shapes that touch the table are reported
 * rather than guessed at.
 */
function missionStepReadAccess(statements: readonly string[]): {
  access: Record<string, ReadAccess>;
  problems: string[];
} {
  const access: Record<string, ReadAccess> = Object.fromEntries(
    CLIENT_ROLES.map((role) => [role, { table: false, columns: new Set<string>() }])
  );
  const problems: string[] = [];
  const target = String.raw`(?:table )?(?:public\.)?mission_steps`;
  // Unquoted role names only. Anything else is not parsed, so it falls through
  // to "refusing to guess" rather than being silently ignored.
  const roles = String.raw`([a-z_]+(?: ?, ?[a-z_]+)*)`;
  const grantTail = String.raw`(?: granted by [a-z_]+)?(?: with grant option)?$`;

  for (const statement of statements) {
    // Role membership: a client role that is granted a privileged role
    // inherits everything it can read.
    const membership = new RegExp(
      String.raw`^grant (service_role|postgres|supabase_admin|authenticator) to ${roles}(?: with .*)?(?: granted by [a-z_]+)?$`
    ).exec(statement);
    if (membership) {
      for (const role of roleList(membership[2] ?? "")) {
        if ((CLIENT_ROLES as readonly string[]).includes(role)) {
          problems.push(`${role} is granted the ${membership[1]} role: ${statement}`);
        }
      }
      continue;
    }

    const blanket = new RegExp(String.raw`^grant (.+?) on all tables in schema public to ${roles}${grantTail}`).exec(
      statement
    );
    if (blanket) {
      if (/\b(select|all)\b/.test(blanket[1] ?? "")) {
        for (const role of roleList(blanket[2] ?? "")) {
          const entry = access[role];
          if (entry) entry.table = true;
        }
      }
      continue;
    }

    const grant = new RegExp(String.raw`^grant (.+?) on ${target} to ${roles}${grantTail}`).exec(statement);
    if (grant) {
      const privileges = grant[1] ?? "";
      for (const role of roleList(grant[2] ?? "")) {
        const entry = access[role];
        if (!entry) continue;
        for (const match of privileges.matchAll(
          /\b(select|insert|update|delete|truncate|references|trigger|all(?: privileges)?)\b\s*(?:\(([^)]*)\))?/g
        )) {
          const verb = match[1] ?? "";
          if (verb !== "select" && !verb.startsWith("all")) continue;
          if (match[2] === undefined) {
            entry.table = true;
          } else {
            for (const column of roleList(match[2])) entry.columns.add(column);
          }
        }
      }
      continue;
    }

    const revoke = new RegExp(
      String.raw`^revoke (?:grant option for )?(.+?) on ${target} from ${roles}(?: granted by [a-z_]+)?(?: cascade| restrict)?$`
    ).exec(statement);
    if (revoke) {
      const privileges = revoke[1] ?? "";
      for (const role of roleList(revoke[2] ?? "")) {
        const entry = access[role];
        if (!entry) continue;
        for (const match of privileges.matchAll(
          /\b(select|insert|update|delete|truncate|references|trigger|all(?: privileges)?)\b\s*(?:\(([^)]*)\))?/g
        )) {
          const verb = match[1] ?? "";
          if (verb !== "select" && !verb.startsWith("all")) continue;
          if (match[2] === undefined) {
            // REVOKE on the table also revokes the column privileges.
            entry.table = false;
            entry.columns.clear();
          } else {
            for (const column of roleList(match[2])) entry.columns.delete(column);
          }
        }
      }
      continue;
    }

    if (/^(grant|revoke) /.test(statement) && /\bmission_steps\b/.test(statement)) {
      problems.push(`unrecognised privilege statement on mission_steps, refusing to guess: ${statement}`);
    }
  }

  return { access, problems };
}

/** Every client role that could read the withheld payload, and why. */
function payloadExposures(statements: readonly string[]): string[] {
  const { access, problems } = missionStepReadAccess(statements);
  const exposures = [...problems];
  for (const role of CLIENT_ROLES) {
    const entry = access[role];
    if (entry?.table) exposures.push(`${role} holds a table-level SELECT on mission_steps`);
    if (entry?.columns.has(WITHHELD_COLUMN)) {
      exposures.push(`${role} holds SELECT on mission_steps.${WITHHELD_COLUMN}`);
    }
  }
  return exposures;
}

const migrationFiles = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const allStatements = migrationFiles.flatMap((name) =>
  sqlStatements(readFileSync(join(MIGRATIONS, name), "utf8"))
);

describe("criterion 6: no migration leaves a client role able to read the raw step payload", () => {
  it("after every migration, in order, no client role can SELECT mission_steps.payload", () => {
    expect(migrationFiles).toContain(WP008_MIGRATION);
    expect(payloadExposures(allStatements)).toEqual([]);
  });

  it("learners keep exactly the learner-visible columns the search function needs", () => {
    const { access } = missionStepReadAccess(allStatements);
    expect([...(access.authenticated?.columns ?? [])].sort()).toEqual([
      "id",
      "label_text",
      "mission_id",
      "position",
      "searchable_text",
      "stable_id",
      "title_text"
    ]);
    expect(access.anon).toEqual({ table: false, columns: new Set() });
    expect(access.public).toEqual({ table: false, columns: new Set() });
  });

  it("would have failed before WP-008: the original table-wide grant exposes the payload", () => {
    const before = migrationFiles
      .filter((name) => name < WP008_MIGRATION)
      .flatMap((name) => sqlStatements(readFileSync(join(MIGRATIONS, name), "utf8")));
    expect(payloadExposures(before)).toEqual([
      "authenticated holds a table-level SELECT on mission_steps"
    ]);
  });

  // The guard against a FUTURE migration: each of these, appended after every
  // existing migration, must be caught.
  const regrants: Array<[string, string]> = [
    ["a table-wide re-grant to authenticated", "grant select on public.mission_steps to authenticated;"],
    ["a table-wide re-grant to anon", "grant select on table public.mission_steps to anon;"],
    ["GRANT ALL", "grant all on public.mission_steps to authenticated;"],
    ["GRANT ALL PRIVILEGES to PUBLIC", "grant all privileges on public.mission_steps to public;"],
    ["a column grant of the payload", "grant select (payload) on public.mission_steps to authenticated;"],
    [
      "the payload hidden in a longer column list",
      "grant select (stable_id, payload, position) on public.mission_steps to anon;"
    ],
    [
      "a column grant among other privileges",
      "grant update (position), select (id, payload) on public.mission_steps to authenticated;"
    ],
    ["a blanket schema grant", "grant select on all tables in schema public to authenticated;"],
    ["membership of the service role", "grant service_role to authenticated;"],
    ["a GRANTED BY clause", "grant select on public.mission_steps to authenticated granted by postgres;"],
    ["an unparseable privilege statement", 'grant select on public.mission_steps to "authenticated";']
  ];
  for (const [name, statement] of regrants) {
    it(`catches ${name}`, () => {
      expect(payloadExposures([...allStatements, ...sqlStatements(statement)])).not.toEqual([]);
    });
  }

  it("does not flag a later grant of learner-visible columns or of the service role", () => {
    expect(
      payloadExposures([
        ...allStatements,
        ...sqlStatements(
          "grant select (title_text) on public.mission_steps to authenticated;\n" +
            "grant select, insert, update on public.mission_steps to service_role;"
        )
      ])
    ).toEqual([]);
  });

  it("a later REVOKE of the whole table also clears column grants", () => {
    const { access } = missionStepReadAccess([
      ...allStatements,
      ...sqlStatements("revoke select on public.mission_steps from authenticated;")
    ]);
    expect(access.authenticated).toEqual({ table: false, columns: new Set() });
  });
});

/* ------------------------------------------------------------------ *
 * The WP-008 migration
 * ------------------------------------------------------------------ */

const wp008 = sqlStatements(readFileSync(join(MIGRATIONS, WP008_MIGRATION), "utf8"));

function functionDefinition(name: string): string {
  return wp008.find((statement) => statement.startsWith(`create or replace function public.${name}(`)) ?? "";
}

describe("the WP-008 migration", () => {
  it("revokes every client privilege on mission_steps before granting columns by name", () => {
    const revoke = wp008.indexOf("revoke all on table public.mission_steps from public, anon, authenticated");
    const grant = wp008.findIndex((statement) =>
      statement.startsWith("grant select (") && statement.endsWith("on public.mission_steps to authenticated")
    );
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
  });

  it("adds the step title and label as generated columns derived from the payload", () => {
    for (const field of ["title", "label"]) {
      expect(wp008).toContain(
        `alter table public.mission_steps add column if not exists ${field}_text text generated always as ( ` +
          `case when jsonb_typeof(payload -> '${field}') = 'string' then payload ->> '${field}' end ) stored`
      );
    }
  });

  it("keeps the step search SECURITY INVOKER and stops it reading the payload", () => {
    const search = functionDefinition(STEP_SEARCH_FUNCTION);
    expect(search).toContain("security invoker");
    expect(search).not.toContain("security definer");
    expect(search).not.toMatch(/\bpayload\b/);
    expect(search).toContain("s.title_text as step_title");
    expect(search).toContain("s.label_text as step_label");
    expect(search).toContain("s.searchable_text as body");
  });

  it("changes nothing else in the step search: the body equals the applied one but for title and label", () => {
    const applied = sqlStatements(
      readFileSync(join(MIGRATIONS, "20261011000100_curriculum_step_search_functions.sql"), "utf8")
    ).find((statement) => statement.startsWith(`create or replace function public.${STEP_SEARCH_FUNCTION}(`));
    const normalise = (definition: string) =>
      definition
        .replace(
          "case when jsonb_typeof(s.payload -> 'title') = 'string' then s.payload ->> 'title' end as step_title",
          "s.title_text as step_title"
        )
        .replace(
          "case when jsonb_typeof(s.payload -> 'label') = 'string' then s.payload ->> 'label' end as step_label",
          "s.label_text as step_label"
        );
    expect(applied).toBeDefined();
    expect(functionDefinition(STEP_SEARCH_FUNCTION)).toBe(normalise(applied ?? ""));
  });

  it("the payload reader is SECURITY INVOKER, publication-checked and executable by service_role alone", () => {
    const reader = functionDefinition(STEP_PAYLOAD_FUNCTION);
    expect(reader).toContain("security invoker");
    expect(reader).not.toContain("security definer");
    expect(reader).toContain("set search_path = pg_catalog, public");
    expect(reader).toContain("where s.mission_id = p_mission_id and m.publication_state = 'published'");
    expect(wp008).toContain(
      `revoke all on function public.${STEP_PAYLOAD_FUNCTION}(uuid) from public, anon, authenticated`
    );
    const grants = wp008.filter((statement) => statement.startsWith("grant execute"));
    expect(grants).toEqual([`grant execute on function public.${STEP_PAYLOAD_FUNCTION}(uuid) to service_role`]);
  });

  it("names no RETURNS TABLE column with an unquoted PostgreSQL keyword", () => {
    // Function parameter and RETURNS TABLE column names cannot be reserved or
    // column-name keywords unless quoted; `position integer` is a syntax error.
    const keywords = new Set([
      "all", "and", "any", "array", "as", "asc", "between", "bigint", "bit", "boolean", "both", "case",
      "cast", "char", "character", "check", "coalesce", "collate", "column", "constraint", "create",
      "current_date", "current_role", "current_time", "current_timestamp", "current_user", "dec",
      "decimal", "default", "desc", "distinct", "do", "else", "end", "except", "exists", "extract",
      "false", "fetch", "float", "for", "foreign", "from", "grant", "greatest", "group", "grouping",
      "having", "in", "inout", "int", "integer", "intersect", "interval", "into", "leading", "least",
      "limit", "localtime", "localtimestamp", "national", "nchar", "none", "normalize", "not", "null",
      "nullif", "numeric", "offset", "on", "only", "or", "order", "out", "overlay", "placing",
      "position", "precision", "primary", "real", "references", "returning", "row", "select",
      "session_user", "setof", "smallint", "some", "substring", "symmetric", "table", "then", "time",
      "timestamp", "to", "trailing", "treat", "trim", "true", "union", "unique", "user", "using",
      "values", "varchar", "when", "where", "window", "with"
    ]);
    const offenders: string[] = [];
    for (const statement of wp008.filter((s) => s.startsWith("create or replace function"))) {
      const columns = /\breturns table \((.*?)\) language\b/.exec(statement)?.[1] ?? "";
      for (const column of columns.split(",")) {
        const name = column.trim().split(" ")[0] ?? "";
        if (keywords.has(name)) offenders.push(`${statement.slice(27, 80)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
    expect(functionDefinition(STEP_PAYLOAD_FUNCTION)).toContain('returns table ( stable_id text, "position" integer,');
  });

  it("changes no policy, RLS setting or table, and writes no data beyond its schema-version row", () => {
    for (const forbidden of [
      "create policy",
      "drop policy",
      "alter policy",
      "disable row level security",
      "no force row level security",
      "create table",
      "drop table",
      "drop column",
      "update public.",
      "delete from",
      "truncate",
      "security definer",
      "set role",
      "bypassrls",
      "alter default privileges"
    ]) {
      expect(wp008.join("\n"), forbidden).not.toContain(forbidden);
    }
    expect(wp008.filter((statement) => statement.startsWith("insert into"))).toEqual([
      "insert into public.platform_schema_version (component, version) values ('mission-step-payload-withholding', '0.1.0') on conflict (component, version) do nothing"
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * Criterion 5: no client-side secret or service-role usage in apps/web
 * ------------------------------------------------------------------ */

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (entry === "node_modules" || entry === "dist") return [];
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("criterion 5: the browser holds no secret and no service-role access", () => {
  const WEB = join(ROOT, "apps/web");
  const sources = filesUnder(WEB).filter((path) =>
    /\.(ts|tsx|js|jsx|mjs|cjs|html|json)$/.test(path)
  );

  it("scans the web app's sources", () => {
    expect(sources.some((path) => path.endsWith("src/lib/supabase.ts"))).toBe(true);
    expect(sources.length).toBeGreaterThan(20);
  });

  const forbidden: Array<[string, RegExp]> = [
    ["a service-role name", /service[_\s-]?role/i],
    ["the server Supabase client", /createServerSupabaseClient/],
    ["the server-side payload reader", new RegExp(STEP_PAYLOAD_FUNCTION)],
    ["a direct mission_steps read", /from\(\s*["'`]mission_steps["'`]|rest\/v1\/mission_steps/],
    ["a secret-named variable", /\b(?:SECRET|PRIVATE_KEY|API_KEY)\b/],
    ["a JWT-shaped literal", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./]
  ];
  for (const [name, pattern] of forbidden) {
    it(`contains no ${name}`, () => {
      const offenders = sources.filter((path) => pattern.test(readFileSync(path, "utf8")));
      expect(offenders.map((path) => path.slice(ROOT.length))).toEqual([]);
    });
  }

  it("reads only the public Supabase URL and anon key from its environment", () => {
    const variables = new Set(
      sources.flatMap((path) =>
        [...readFileSync(path, "utf8").matchAll(/import\.meta\.env\.(\w+)/g)].map((match) => match[1])
      )
    );
    expect([...variables].sort()).toEqual(["DEV", "VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_URL"]);
  });
});
