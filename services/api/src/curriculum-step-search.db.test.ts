import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  assertDisposableLocalTestDatabase,
  createTestDatabasePsql
} from "../test-support/test-db-psql";
import {
  escapeCurriculumSearchPattern,
  type CurriculumQueryVariant
} from "@tlp/shared-types";
import {
  RECORD_SEARCH_FUNCTION,
  searchPublishedCurriculumRecords,
  type CurriculumRecordRow
} from "./curriculum-record-search";
import {
  MISSION_CONTEXT_FUNCTION,
  STEP_SEARCH_FUNCTION,
  STEP_SEARCH_PAGE_SIZE,
  buildStepSearchArguments,
  searchPublishedStepBodies,
  type StepBodySearchOutcome
} from "./curriculum-step-search";
import {
  buildAliasAwareQueryVariants,
  findFirstMatch,
  toRetrievalPattern
} from "./search-aliases";
import { searchCurriculum } from "./curriculum-search";
import { createUserScopedSupabaseClient } from "./supabase";

/**
 * Founder direction G-006: `searchCurriculum` is run end to end here. Only the
 * client FACTORY is replaced, by the learner-scoped psql client below, so every
 * read it makes is a real function call under real RLS in real PostgreSQL.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

/**
 * WP-005 / Founder direction G-001 — step-body search against REAL PostgreSQL.
 *
 * The database is a disposable local PostgreSQL with
 * `scripts/test-db/supabase-platform-shim.sql` and then EVERY migration in
 * `supabase/migrations` applied unchanged (`scripts/test-db-apply-migrations.sh`).
 * CI provides it and runs this file with `TLP_REQUIRE_TEST_DATABASE=1`, so a
 * missing database fails there. Anywhere else, with no `TLP_TEST_DATABASE_URL`,
 * the database suites skip. With one, nothing connects unless the shared guard
 * `scripts/test-db-guard.sh` accepts it: a single localhost URL with no query
 * parameters, `TLP_TEST_DATABASE_DISPOSABLE=1`, and no libpq environment
 * override pointing anywhere else (Founder direction G-003).
 *
 * ## The learner-scoped path
 *
 * Every search runs the way PostgREST runs a learner's request: inside a
 * transaction, `SET LOCAL ROLE authenticated` with the learner's JWT claims in
 * `request.jwt.claims`, then the function call. So the real row level security
 * policies, the real grants and the real SECURITY INVOKER functions decide what
 * comes back. The service's own `searchPublishedStepBodies` is driven through a
 * client whose `rpc` does exactly that, and which can impose a PostgREST-style
 * `max-rows` cap on every response. The PostgREST HTTP layer itself is not in
 * the loop; for an `rpc` it only forwards named arguments and applies the cap.
 *
 * ## Titles and descriptions (Founder direction G-005)
 *
 * `search_published_curriculum_records` matches course, mission, competency
 * and learning-path titles and descriptions by the same rules, and is driven
 * here through the service's own `searchPublishedCurriculumRecords` and called
 * directly as a learner. Its whole-word acronyms run as PostgreSQL's own `\y`
 * regular expressions; nothing in this file translates or imitates them.
 *
 * ## One concept, one order (Founder direction G-006)
 *
 * The whole `searchCurriculum` service runs against the database with only its
 * client factory replaced by the learner-scoped client above, and every form
 * of the ARP and VLAN alias groups must return the identical ordered results
 * at limit 1, 2, 3 and the full list.
 *
 * ## Latency
 *
 * The 500 ms target is measured twice over a fixture larger than today's
 * content: PostgreSQL's own execution time (EXPLAIN ANALYZE), and the
 * service's end-to-end time including every psql round trip. Both are printed,
 * so the CI log records the observed numbers.
 */

const DATABASE_URL = process.env.TLP_TEST_DATABASE_URL ?? "";
const REQUIRE_DATABASE = process.env.TLP_REQUIRE_TEST_DATABASE === "1";
const LATENCY_BUDGET_MS = 500;

const RUN = `wp005db-${randomUUID().slice(0, 8)}`;
const LEARNER_ID = randomUUID();

it("has a disposable test database whenever one is required", () => {
  if (!REQUIRE_DATABASE) return;
  expect(DATABASE_URL, "TLP_TEST_DATABASE_URL").not.toBe("");
  expect(() => assertDisposableLocalTestDatabase(process.env)).not.toThrow();
});

/* ------------------------------------------------------------------ *
 * psql access — the only database client, with no new dependency
 * ------------------------------------------------------------------ */

let guardedPsql: ((script: string) => string) | undefined;

/**
 * Founder direction G-003: the shared guard (`scripts/test-db-guard.sh`)
 * approves the URL, the disposable marker and the libpq environment before the
 * first connection, or every database test fails without connecting.
 */
function psql(script: string): string {
  guardedPsql ??= createTestDatabasePsql(process.env);
  return guardedPsql(script);
}

/** A dollar-quoted literal whose tag cannot occur in the text. */
function literal(text: string): string {
  const tag = `$t${randomUUID().replace(/-/g, "")}$`;
  if (text.includes(tag)) throw new Error("literal tag collision");
  return `${tag}${text}${tag}`;
}

/** Runs `statement` exactly as PostgREST runs a learner request. */
function asRole(statement: string, role: "authenticated" | "anon" = "authenticated"): string {
  const claims = JSON.stringify({ sub: LEARNER_ID, role }).replace(/'/g, "''");
  return psql(
    [
      "begin;",
      `set local role ${role};`,
      `set local "request.jwt.claims" to '${claims}';`,
      statement,
      "commit;"
    ].join("\n")
  );
}

const SIGNATURES: Record<string, Record<string, string>> = {
  [STEP_SEARCH_FUNCTION]: {
    p_phrases: "text[]",
    p_acronyms: "text[]",
    p_after: "text",
    p_page_size: "integer"
  },
  [MISSION_CONTEXT_FUNCTION]: {
    p_stable_ids: "text[]",
    p_after: "text",
    p_page_size: "integer"
  },
  [RECORD_SEARCH_FUNCTION]: {
    p_source: "text",
    p_phrases: "text[]",
    p_acronyms: "text[]",
    p_after: "text",
    p_page_size: "integer"
  }
};

/** The SQL that calls one function with named arguments taken from JSON. */
function functionCall(fn: string, args: Record<string, unknown>): string {
  const signature = SIGNATURES[fn];
  if (!signature) throw new Error(`unknown function ${fn}`);
  const json = `${literal(JSON.stringify(args))}::jsonb`;
  const named = Object.entries(signature).map(([name, type]) =>
    type === "text[]"
      ? `${name} => array(select jsonb_array_elements_text(${json} -> '${name}'))`
      : `${name} => (${json} ->> '${name}')::${type}`
  );
  return `public.${fn}(${named.join(", ")})`;
}

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
  rows: number;
}

/** A learner-scoped client exposing the one method the service uses. */
function learnerClient(options: { maxRows?: number } = {}) {
  const calls: RpcCall[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      try {
        const cap = options.maxRows === undefined ? "" : ` limit ${options.maxRows}`;
        const output = asRole(
          `select coalesce(json_agg(r), '[]'::json) from (select * from ${functionCall(fn, args)}${cap}) as r;`
        );
        const data = JSON.parse(output) as unknown[];
        calls.push({ fn, args, rows: data.length });
        return { data, error: null };
      } catch (error) {
        // The service reports only "unavailable"; keep the cause in the CI log.
        console.error(`[WP-005 db test] ${fn} failed: ${String(error)}`);
        return { data: null, error };
      }
    }
  };
  return { client, calls };
}

function variantsFor(query: string): {
  variants: CurriculumQueryVariant[];
  patterns: ReturnType<typeof toRetrievalPattern>[];
} {
  const variants = buildAliasAwareQueryVariants(query);
  const patterns = variants.map((variant) =>
    toRetrievalPattern(variant, escapeCurriculumSearchPattern(variant.value))
  );
  return { variants, patterns };
}

async function searchSteps(
  query: string,
  options: { maxRows?: number; recordMissions?: string[] } = {}
): Promise<{ outcome: StepBodySearchOutcome; calls: RpcCall[]; elapsedMs: number }> {
  const { variants, patterns } = variantsFor(query);
  const { client, calls } = learnerClient(options);
  const started = performance.now();
  const outcome = await searchPublishedStepBodies(
    client as never,
    patterns,
    variants,
    options.recordMissions ?? []
  );
  return { outcome, calls, elapsedMs: performance.now() - started };
}

const RECORD_SOURCES = ["learning_paths", "courses", "missions", "competencies"] as const;

/**
 * Founder direction G-005: the service's own record reader, over all four
 * sources, through the learner-scoped client, with the arguments
 * `searchCurriculum` builds for the query. Real regular expressions, real
 * policies; nothing here translates or imitates PostgreSQL matching.
 */
async function searchRecords(
  query: string,
  options: { maxRows?: number; overFetch?: number } = {}
): Promise<{
  bySource: Record<string, CurriculumRecordRow[]>;
  calls: RpcCall[];
  elapsedMs: number;
}> {
  const { variants, patterns } = variantsFor(query);
  const match = buildStepSearchArguments(patterns, variants);
  const { client, calls } = learnerClient(options);
  const bySource: Record<string, CurriculumRecordRow[]> = {};
  const started = performance.now();
  for (const source of RECORD_SOURCES) {
    const read = await searchPublishedCurriculumRecords(
      client as never,
      source,
      match,
      options.overFetch ?? 400
    );
    if (read.readFailed) throw new Error(`the ${source} record read failed`);
    bySource[source] = read.rows;
  }
  return { bySource, calls, elapsedMs: performance.now() - started };
}

/** Our fixture's stable ids, per source, from one record search. */
const oursBySource = (prefix: string, bySource: Record<string, CurriculumRecordRow[]>) =>
  Object.fromEntries(
    RECORD_SOURCES.map((source) => [
      source,
      (bySource[source] ?? [])
        .map((row) => row.stable_id)
        .filter((id) => id.startsWith(prefix))
        .sort()
    ])
  );

/* ------------------------------------------------------------------ *
 * Fixture — inserted as the database owner, removed afterwards
 * ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

interface Fixture {
  learning_paths: Row[];
  courses: Row[];
  learning_modules: Row[];
  missions: Row[];
  mission_steps: Row[];
  competencies: Row[];
}

function fixtureBuilder(prefix: string) {
  const fixture: Fixture = {
    learning_paths: [],
    courses: [],
    learning_modules: [],
    missions: [],
    mission_steps: [],
    competencies: []
  };
  let position = 0;
  const pathId = randomUUID();
  fixture.learning_paths.push({
    id: pathId,
    stable_id: `${prefix}path`,
    version: 1,
    title: "Fixture path",
    publication_state: "published"
  });

  const course = (key: string, title: string, state = "published", description?: string) => {
    const id = randomUUID();
    fixture.courses.push({
      id,
      stable_id: `${prefix}${key}`,
      version: 1,
      learning_path_id: pathId,
      title,
      description: description ?? null,
      position: (position += 1),
      publication_state: state
    });
    return id;
  };
  const competency = (
    key: string,
    title: string,
    extra: { state?: string; description?: string } = {}
  ) => {
    fixture.competencies.push({
      id: randomUUID(),
      stable_id: `${prefix}${key}`,
      version: 1,
      title,
      description: extra.description ?? null,
      publication_state: extra.state ?? "published"
    });
  };
  const module = (courseId: string, key: string, state = "published") => {
    const id = randomUUID();
    fixture.learning_modules.push({
      id,
      stable_id: `${prefix}${key}`,
      version: 1,
      course_id: courseId,
      title: `Module ${key}`,
      position: (position += 1),
      publication_state: state
    });
    return id;
  };
  const mission = (
    moduleId: string,
    key: string,
    title: string,
    extra: { version?: number; state?: string; description?: string } = {}
  ) => {
    const id = randomUUID();
    fixture.missions.push({
      id,
      stable_id: `${prefix}${key}`,
      version: extra.version ?? 1,
      module_id: moduleId,
      title,
      description: extra.description ?? null,
      position: (position += 1),
      publication_state: extra.state ?? "published"
    });
    return id;
  };
  const step = (missionId: string, stepPosition: number, payload: Row) => {
    fixture.mission_steps.push({
      id: randomUUID(),
      mission_id: missionId,
      stable_id: `s${String(stepPosition + 1).padStart(2, "0")}`,
      position: stepPosition,
      step_type: payload.type,
      payload
    });
  };
  return { fixture, course, module, mission, step, competency };
}

function insertFixture(fixture: Fixture): void {
  const from = (table: keyof Fixture, columns: string) =>
    `from jsonb_to_recordset((select data from wp005_fixture) -> '${table}') as x(${columns})`;
  psql(
    [
      `create temporary table wp005_fixture as select ${literal(JSON.stringify(fixture))}::jsonb as data;`,
      `insert into public.learning_paths (id, stable_id, version, title, publication_state)
         select x.id, x.stable_id, x.version, x.title, x.publication_state
         ${from("learning_paths", "id uuid, stable_id text, version integer, title text, publication_state text")};`,
      `insert into public.courses (id, stable_id, version, learning_path_id, title, description, position, publication_state)
         select x.id, x.stable_id, x.version, x.learning_path_id, x.title, x.description, x.position, x.publication_state
         ${from("courses", "id uuid, stable_id text, version integer, learning_path_id uuid, title text, description text, position integer, publication_state text")};`,
      `insert into public.learning_modules (id, stable_id, version, course_id, title, position, publication_state)
         select x.id, x.stable_id, x.version, x.course_id, x.title, x.position, x.publication_state
         ${from("learning_modules", "id uuid, stable_id text, version integer, course_id uuid, title text, position integer, publication_state text")};`,
      `insert into public.missions (id, stable_id, version, module_id, title, description, position, publication_state)
         select x.id, x.stable_id, x.version, x.module_id, x.title, x.description, x.position, x.publication_state
         ${from("missions", "id uuid, stable_id text, version integer, module_id uuid, title text, description text, position integer, publication_state text")};`,
      `insert into public.mission_steps (id, mission_id, stable_id, position, step_type, payload)
         select x.id, x.mission_id, x.stable_id, x.position, x.step_type, x.payload
         ${from("mission_steps", "id uuid, mission_id uuid, stable_id text, position integer, step_type text, payload jsonb")};`,
      `insert into public.competencies (id, stable_id, version, title, description, publication_state)
         select x.id, x.stable_id, x.version, x.title, x.description, x.publication_state
         ${from("competencies", "id uuid, stable_id text, version integer, title text, description text, publication_state text")};`
    ].join("\n")
  );
}

function removeFixtures(): void {
  // Courses, modules, missions and steps all cascade from the path.
  // Competencies stand alone.
  psql(
    [
      `delete from public.learning_paths where stable_id like ${literal(`${RUN}-%`)};`,
      `delete from public.competencies where stable_id like ${literal(`${RUN}-%`)};`
    ].join("\n")
  );
}

const ours = (prefix: string, outcome: StepBodySearchOutcome) =>
  [...outcome.hits.keys()].filter((id) => id.startsWith(prefix)).sort();

/* ------------------------------------------------------------------ *
 * Behaviour
 * ------------------------------------------------------------------ */

const B = `${RUN}-b-`;

describe.skipIf(DATABASE_URL === "")("step search against real PostgreSQL and RLS", { timeout: 60_000 }, () => {
  beforeAll(() => {
    const { fixture, course, module, mission, step } = fixtureBuilder(B);
    const networking = course("networking", "Networking Foundations");
    const addresses = module(networking, "addresses");

    const m4 = mission(addresses, "m4-the-prefix", "The prefix and the decision");
    step(m4, 0, {
      type: "concept",
      title: "Asking for the hardware address",
      paragraphs: [
        "PC-A needs a MAC address before it can build the frame.",
        "The request PC-A sent is called ARP. It asks which MAC address belongs to a local IPv4 address."
      ]
    });
    step(m4, 1, {
      type: "concept",
      paragraphs: ["The frobnicator is a placeholder word that appears only in this step."]
    });
    step(m4, 2, {
      type: "prediction",
      prompt: "What will PC-A do next?",
      expectedOutcome: "It sends an obsidianlynx request."
    });

    const spelled = mission(addresses, "spelled-out", "Resolving local addresses");
    step(spelled, 0, {
      type: "concept",
      paragraphs: ["This mission spells out the Address Resolution Protocol in full."]
    });

    const sharp = mission(addresses, "sharp", "Sharp habits");
    step(sharp, 0, {
      type: "concept",
      paragraphs: ["Keep your skills sharp; practise sharpshooting.", "Keep it\nsharp."]
    });

    const draft = mission(addresses, "draft", "A draft mission", { state: "draft" });
    step(draft, 0, { type: "concept", paragraphs: ["zephyrquokka appears only in a draft step."] });

    const draftCourse = course("draft-course", "Unpublished course", "draft");
    const draftCourseModule = module(draftCourse, "draft-course-module");
    const hidden = mission(draftCourseModule, "in-draft-course", "Published mission, draft course");
    step(hidden, 0, { type: "concept", paragraphs: ["quillfeather appears under a draft course."] });

    const draftModule = module(networking, "draft-module", "draft");
    const hiddenByModule = mission(draftModule, "in-draft-module", "Published mission, draft module");
    step(hiddenByModule, 0, { type: "concept", paragraphs: ["mossgranite appears under a draft module."] });

    // Two published versions: only the stale one says quasarword; only the
    // current one says nebulaword.
    const staleV1 = mission(addresses, "versioned", "Old title", { version: 1 });
    step(staleV1, 0, { type: "concept", paragraphs: ["Only the old version says quasarword."] });
    const currentV2 = mission(addresses, "versioned", "New title", { version: 2 });
    step(currentV2, 0, { type: "concept", paragraphs: ["Only the new version says nebulaword."] });

    const escaped = mission(addresses, "escaped", "Escaped text");
    step(escaped, 0, {
      type: "concept",
      paragraphs: [
        'If the answer is "quite a lot", you have not learned as much.',
        "Open C:\\Windows\\System32 and look around.",
        "Each hop reads the\n\trouting   table before forwarding.",
        "The host checks the cache.",
        "Then it broadcasts.",
        "The host is stuck.\nNAT rewrites the address."
      ]
    });

    // Founder direction G-003: every withheld field carries a unique value, and
    // each step has its own unique learner-visible word to match.
    const withheld = mission(addresses, "withheld", "Withheld fields");
    step(withheld, 0, {
      type: "prediction",
      prompt: "Predict what the cobaltheron host does next.",
      options: [{ id: "a", text: "It waits." }],
      expectedOutcome: "It sends a ravenquartz request."
    });
    step(withheld, 1, {
      type: "near_transfer",
      title: "Try the lanternmoth network",
      framing: "A new network, the same reasoning.",
      questions: [
        {
          questionStableId: "q1",
          type: "single_choice",
          prompt: "Which host answers?",
          options: [{ id: "a", text: "The router" }],
          correctOptionIds: ["a"],
          explanation: "Because the glimmerfjord host owns that address."
        }
      ]
    });
    step(withheld, 2, {
      type: "interaction",
      interactionStableId: "withheld-interaction",
      interactionType: "packet_journey",
      sourceKind: "authored",
      supportLevel: "guided",
      textEquivalent: "The thistlecomet frame crosses the switch.",
      parameters: { stages: [{ decision: "forward the emberwhistle frame" }] }
    });

    insertFixture(fixture);
  });

  afterAll(() => removeFixtures());

  /** A direct RPC call as an authenticated learner, every column of every row. */
  const callStepSearchDirectly = (word: string): Array<Record<string, unknown>> =>
    JSON.parse(
      asRole(
        `select coalesce(json_agg(r), '[]'::json) from (select * from ${functionCall(
          STEP_SEARCH_FUNCTION,
          { p_phrases: [word] }
        )}) as r;`
      )
    ) as Array<Record<string, unknown>>;

  const WITHHELD_VALUES = ["ravenquartz", "glimmerfjord", "emberwhistle"];
  const WITHHELD_KEYS = [
    "payload",
    "expectedOutcome",
    "questions",
    "correctOptionIds",
    "explanation",
    "parameters",
    "decision"
  ];

  it("G-003: the RPC, called directly by a learner, returns names and a snippet — no withheld field or value", () => {
    const visible: Array<[string, string, string]> = [
      ["cobaltheron", "s01", "Predict what the cobaltheron host does next."],
      ["lanternmoth", "s02", "Try the lanternmoth network A new network, the same reasoning."],
      ["thistlecomet", "s03", "The thistlecomet frame crosses the switch."]
    ];
    for (const [word, stepStableId, snippet] of visible) {
      const rows = callStepSearchDirectly(word);
      const serialized = JSON.stringify(rows);

      expect(rows, word).toHaveLength(1);
      expect(Object.keys(rows[0] ?? {}), word).toEqual([
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
      expect(rows[0]).toMatchObject({ mission_stable_id: `${B}withheld`, step_stable_id: stepStableId });
      expect(rows[0]?.step_snippet, word).toBe(snippet);
      for (const value of WITHHELD_VALUES) expect(serialized, `${word}: ${value}`).not.toContain(value);
      for (const key of WITHHELD_KEYS) expect(serialized, `${word}: ${key}`).not.toContain(`"${key}"`);
      // Visible-but-unsearched question and option text is not returned either.
      for (const text of ["Which host answers?", "The router", "It waits."]) {
        expect(serialized, `${word}: ${text}`).not.toContain(text);
      }
    }
  });

  it("G-003: searching for a withheld answer or parameter finds nothing, so it cannot reveal one exists", async () => {
    for (const value of WITHHELD_VALUES) {
      expect(callStepSearchDirectly(value), value).toEqual([]);
      expect(ours(B, (await searchSteps(value)).outcome), value).toEqual([]);
    }
  });

  it("G-003: a snippet is a short window of the step's text around the match", () => {
    const rows = callStepSearchDirectly("frobnicator");
    expect(rows[0]?.step_snippet).toBe(
      "The frobnicator is a placeholder word that appears only in this step."
    );

    // Long text is cut 60 characters before and 100 after the match.
    const filler = "x".repeat(200);
    const output = psql(
      [
        "begin;",
        `update public.mission_steps as s
            set payload = jsonb_build_object('type', 'concept',
                  'paragraphs', jsonb_build_array(${literal(`${filler} wombatquill ${filler}`)}::text))
           from public.missions as m
          where m.id = s.mission_id and m.stable_id = ${literal(`${B}m4-the-prefix`)} and s.position = 1;`,
        "set local role authenticated;",
        `select step_snippet from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: ["wombatquill"] })};`,
        "rollback;"
      ].join("\n")
    );
    expect(output).toBe(`…${"x".repeat(59)} wombatquill ${"x".repeat(99)}…`);
  });

  it("the functions are SECURITY INVOKER and only authenticated may execute them", () => {
    const rows = JSON.parse(
      psql(`select json_agg(json_build_object(
              'name', p.proname,
              'definer', p.prosecdef,
              'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
              'anon', has_function_privilege('anon', p.oid, 'execute')))
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('mission_step_searchable_text', 'current_published_missions',
                                '${STEP_SEARCH_FUNCTION}', '${MISSION_CONTEXT_FUNCTION}');`)
    ) as Array<{ name: string; definer: boolean; authenticated: boolean; anon: boolean }>;

    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row, row.name).toMatchObject({ definer: false, authenticated: true, anon: false });
    }
    expect(() =>
      asRole(`select count(*) from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: ["ARP"] })};`, "anon")
    ).toThrow(/permission denied/);
  });

  it("criterion 1: ARP and Address Resolution Protocol return the same missions, including Mission 4", async () => {
    const acronym = await searchSteps("ARP");
    const expanded = await searchSteps("address resolution protocol");

    expect(ours(B, acronym.outcome)).toEqual([`${B}m4-the-prefix`, `${B}spelled-out`]);
    expect(ours(B, expanded.outcome)).toEqual(ours(B, acronym.outcome));
  });

  it("criterion 2: arp gives the same result as ARP", async () => {
    const upper = await searchSteps("ARP");
    const lower = await searchSteps("arp");

    expect(ours(B, lower.outcome)).toEqual(ours(B, upper.outcome));
  });

  it("criterion 3: ARP is whole-word in PostgreSQL — never sharp or sharpshooting", async () => {
    const { outcome } = await searchSteps("ARP");
    expect(ours(B, outcome)).not.toContain(`${B}sharp`);

    const plural = await searchSteps("ARPs");
    expect(ours(B, plural.outcome)).toContain(`${B}m4-the-prefix`);
    expect(ours(B, plural.outcome)).not.toContain(`${B}sharp`);

    const word = await searchSteps("sharp");
    expect(ours(B, word.outcome)).toEqual([`${B}sharp`]);
  });

  it("criterion 4: a term only in a step body returns that mission, its step and a snippet", async () => {
    const { outcome } = await searchSteps("frobnicator");
    const hit = outcome.hits.get(`${B}m4-the-prefix`);

    expect(ours(B, outcome)).toEqual([`${B}m4-the-prefix`]);
    expect(hit).toMatchObject({ stepStableId: "s02", stepLabel: "Step 2", missionVersion: 1 });
    expect(findFirstMatch(hit?.text ?? "", variantsFor("frobnicator").variants)).toBeDefined();
    expect(outcome.missions.get(`${B}m4-the-prefix`)?.courseTitle).toBe("Networking Foundations");

    const titled = (await searchSteps("ARP")).outcome.hits.get(`${B}m4-the-prefix`);
    expect(titled?.stepLabel).toBe("Asking for the hardware address");
  });

  it("criterion 5: unpublished text never comes back — draft mission, course or module", async () => {
    for (const word of ["zephyrquokka", "quillfeather", "mossgranite"]) {
      const { outcome } = await searchSteps(word);
      expect(ours(B, outcome), word).toEqual([]);
      expect(JSON.stringify([...outcome.hits.values()]), word).not.toContain(word);
    }
  });

  it("criterion 5: an answer-bearing step field is never searched", async () => {
    const { outcome } = await searchSteps("obsidianlynx");
    expect(ours(B, outcome)).toEqual([]);
  });

  it("row level security decides: a policy hiding steps from the learner hides every match", () => {
    // Rolled back, so nothing persists. A RESTRICTIVE policy narrows what the
    // learner's role may read; a SECURITY INVOKER function must obey it.
    const output = psql(
      [
        "begin;",
        `create policy wp005_hide_steps on public.mission_steps as restrictive
           for select to authenticated using (false);`,
        "set local role authenticated;",
        `select count(*) from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: ["frobnicator"] })};`,
        "rollback;"
      ].join("\n")
    );
    expect(output).toBe("0");

    const visible = asRole(
      `select count(*) from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: ["frobnicator"] })};`
    );
    expect(Number(visible)).toBeGreaterThan(0);
  });

  it("G-002: each step's searchable text is stored once, generated from its payload", () => {
    const column = psql(
      `select attgenerated from pg_attribute
        where attrelid = 'public.mission_steps'::regclass and attname = 'searchable_text';`
    );
    expect(column).toBe("s");

    // The stored text is exactly what the function makes of every payload.
    const disagreeing = psql(
      `select count(*) from public.mission_steps
        where searchable_text is distinct from public.mission_step_searchable_text(payload);`
    );
    expect(disagreeing).toBe("0");

    // An answer-bearing field never reaches it.
    const answers = psql(
      `select count(*) from public.mission_steps s join public.missions m on m.id = s.mission_id
        where m.stable_id = ${literal(`${B}m4-the-prefix`)}
          and s.searchable_text ilike '%obsidianlynx%';`
    );
    expect(answers).toBe("0");
  });

  it("G-002: rewriting a step's payload is searchable at once, and its old text is gone", () => {
    const claims = JSON.stringify({ sub: LEARNER_ID, role: "authenticated" }).replace(/'/g, "''");
    // Rolled back, so nothing persists.
    const output = psql(
      [
        "begin;",
        `update public.mission_steps as s
            set payload = jsonb_build_object('type', 'concept', 'paragraphs', jsonb_build_array('Now it says kelpieword.'))
           from public.missions as m
          where m.id = s.mission_id and m.stable_id = ${literal(`${B}m4-the-prefix`)} and s.position = 1;`,
        "set local role authenticated;",
        `set local "request.jwt.claims" to '${claims}';`,
        ...["kelpieword", "frobnicator"].map(
          (word) =>
            `select count(*) from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: [word] })}
              where mission_stable_id = ${literal(`${B}m4-the-prefix`)};`
        ),
        "rollback;"
      ].join("\n")
    );
    expect(output.split("\n")).toEqual(["1", "0"]);
  });

  it("the curriculum writer may execute the stored-text function, and no search function", () => {
    const rows = JSON.parse(
      psql(`select json_object_agg(p.proname, has_function_privilege('service_role', p.oid, 'execute'))
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('mission_step_searchable_text', 'current_published_missions',
                                '${STEP_SEARCH_FUNCTION}', '${MISSION_CONTEXT_FUNCTION}');`)
    ) as Record<string, boolean>;

    expect(rows).toEqual({
      mission_step_searchable_text: true,
      current_published_missions: false,
      [STEP_SEARCH_FUNCTION]: false,
      [MISSION_CONTEXT_FUNCTION]: false
    });
  });

  it("the curriculum writer inserts and rewrites step payloads, and the stored text follows", () => {
    // As the authoring path writes: SET ROLE service_role. Rolled back, so
    // nothing persists.
    const mission = literal(`${B}m4-the-prefix`);
    const output = psql(
      [
        "begin;",
        "set local role service_role;",
        `insert into public.mission_steps (mission_id, stable_id, position, step_type, payload)
           select m.id, 'writer-step', 90, 'concept',
                  jsonb_build_object('type', 'concept', 'paragraphs', jsonb_build_array('Written by the  writer.'))
             from public.missions as m
            where m.stable_id = ${mission}
          returning searchable_text;`,
        `update public.mission_steps as s
            set payload = jsonb_build_object('type', 'concept', 'paragraphs', jsonb_build_array('Rewritten by the writer.'))
           from public.missions as m
          where m.id = s.mission_id and m.stable_id = ${mission} and s.stable_id = 'writer-step'
          returning s.searchable_text;`,
        "rollback;"
      ].join("\n")
    );
    expect(output.split("\n")).toEqual(["Written by the writer.", "Rewritten by the writer."]);
  });

  it("only the current published version is searched", async () => {
    expect(ours(B, (await searchSteps("quasarword")).outcome)).toEqual([]);

    const current = await searchSteps("nebulaword");
    expect(ours(B, current.outcome)).toEqual([`${B}versioned`]);
    expect(current.outcome.hits.get(`${B}versioned`)?.missionVersion).toBe(2);
    expect(current.outcome.candidates[0]?.value).toMatchObject({ version: 2, title: "New title" });
  });

  const escapedCases: Array<[string, string]> = [
    ["a quoted phrase", 'answer is "quite a lot"'],
    ["a backslash path", "C:\\Windows\\System32"],
    ["a phrase across a newline, tab and repeated spaces", "reads the routing table"],
    ["a phrase spanning two paragraphs", "cache. Then it"],
    ["an acronym straight after a newline", "NAT"]
  ];
  for (const [name, query] of escapedCases) {
    it(`matches decoded text: ${name}`, async () => {
      const { outcome } = await searchSteps(query);
      const hit = outcome.hits.get(`${B}escaped`);

      expect(ours(B, outcome)).toContain(`${B}escaped`);
      expect(findFirstMatch(hit?.text ?? "", variantsFor(query).variants)).toBeDefined();
    });
  }

  it("does not match text that only exists across the JSON encoding", async () => {
    const { outcome } = await searchSteps('answer is "quite" and then');
    expect(ours(B, outcome)).not.toContain(`${B}escaped`);
  });

  it("criterion 6: DHCP is an honest empty result, not an error", async () => {
    const { outcome } = await searchSteps("DHCP");
    expect(ours(B, outcome)).toEqual([]);
  });

  it("criterion 7: AD and Active Directory send the same terms to the database", () => {
    const acronym = variantsFor("AD");
    const expanded = variantsFor("Active Directory");
    const a = buildStepSearchArguments(acronym.patterns, acronym.variants);
    const e = buildStepSearchArguments(expanded.patterns, expanded.variants);

    expect(a.p_acronyms).toEqual(["AD"]);
    expect(e.p_acronyms).toEqual(["AD"]);
    expect(a.p_phrases.map((value) => value.toLowerCase())).toEqual(["active directory"]);
    expect(e.p_phrases.map((value) => value.toLowerCase())).toEqual(["active directory"]);
  });
});

/* ------------------------------------------------------------------ *
 * Founder direction G-005 — titles and descriptions in PostgreSQL
 * ------------------------------------------------------------------ */

const V = `${RUN}-v-`;

describe.skipIf(DATABASE_URL === "")("G-005: title and description search against real PostgreSQL and RLS", { timeout: 60_000 }, () => {
  beforeAll(() => {
    const { fixture, course, module, mission, step, competency } = fixtureBuilder(V);

    // The UAT shape: VLAN in a course title, a mission description and a
    // competency title. None of these rows has a step that names VLAN.
    const ros = course("router-on-a-stick", "VLANs and Router-on-a-Stick", "published",
      "Segmentation for a small office.");
    const trunks = module(ros, "trunks");
    const tagging = mission(trunks, "tagging", "Tagging frames", {
      description: "Carry each VLAN across one trunk link."
    });
    competency("vlan-design", "Design a VLAN plan", {
      description: "Choose identifiers per department."
    });

    // Each expanded name alone, in a description.
    course("virtual-lan", "Broadcast domains", "published",
      "Each Virtual LAN is its own broadcast domain.");
    course("full-name", "Switch configuration", "published",
      "A Virtual Local Area Network separates departments.");

    // ARP behaviour, and the substrings it must never match.
    course("arp-course", "ARP fundamentals", "published", "Start here.");
    mission(trunks, "resolution", "Resolving neighbours", {
      description: "The Address Resolution Protocol in practice."
    });
    course("sharp", "Sharp troubleshooting habits", "published",
      "Keep your diagnostic skills sharp; practise sharpshooting.");

    // Unpublished: never returned, whatever matches.
    course("draft-vlan", "VLAN drafts", "draft", "An unpublished VLAN course.");
    competency("retired-vlan", "Retired VLAN skill", { state: "retired" });
    mission(trunks, "draft-mission", "VLAN draft mission", { state: "draft" });

    // Wildcards are literal.
    course("literal", "Scoring 100% _x", "published");
    course("wild", "Scoring 1000 xx", "published");

    // A withheld step value under a matching mission: never reachable here.
    step(tagging, 0, {
      type: "prediction",
      prompt: "What does the trunk carry?",
      expectedOutcome: "Every vlanquartzword frame, tagged."
    });

    insertFixture(fixture);
  });

  afterAll(() => removeFixtures());

  const vlanRows = {
    learning_paths: [],
    courses: [`${V}full-name`, `${V}router-on-a-stick`, `${V}virtual-lan`],
    missions: [`${V}tagging`],
    competencies: [`${V}vlan-design`]
  };

  for (const query of ["VLAN", "vlan", "Virtual LAN", "Virtual Local Area Network"]) {
    it(`${query} returns the course, mission and competency whose title or description says VLAN`, async () => {
      const { bySource } = await searchRecords(query);
      const ours = oursBySource(V, bySource);

      expect(ours.courses).toContain(`${V}router-on-a-stick`);
      expect(ours.missions).toEqual([`${V}tagging`]);
      expect(ours.competencies).toEqual([`${V}vlan-design`]);
      // Every member of the group reaches every spelling of it.
      expect(ours).toEqual(vlanRows);
    });
  }

  // The open MEDIUM finding, against real PostgreSQL: punctuated plural and
  // possessive forms keep every member, including the full expanded name.
  for (const query of [
    "VLANs?",
    "VLAN's!",
    "Virtual LANs?",
    "Virtual LAN's?",
    "Virtual LAN’s!",
    "Virtual Local Area Networks?",
    "Virtual Local Area Network's!"
  ]) {
    it(`${query} still finds every member, including the full expanded name`, async () => {
      const { bySource } = await searchRecords(query);
      expect(oursBySource(V, bySource)).toEqual(vlanRows);
    });
  }

  it("segmentation still returns the Router-on-a-Stick course", async () => {
    const { bySource } = await searchRecords("segmentation");
    expect(oursBySource(V, bySource).courses).toEqual([`${V}router-on-a-stick`]);
  });

  it("ARP and Address Resolution Protocol return the same records, never sharp", async () => {
    const acronym = oursBySource(V, (await searchRecords("ARP")).bySource);
    const expanded = oursBySource(V, (await searchRecords("address resolution protocol")).bySource);
    const lower = oursBySource(V, (await searchRecords("arp")).bySource);

    expect(acronym.courses).toEqual([`${V}arp-course`]);
    expect(acronym.missions).toEqual([`${V}resolution`]);
    expect(expanded).toEqual(acronym);
    expect(lower).toEqual(acronym);

    const plural = oursBySource(V, (await searchRecords("ARPs")).bySource);
    expect(plural.courses).not.toContain(`${V}sharp`);
  });

  it("sharp still does not match ARP", async () => {
    const ours = oursBySource(V, (await searchRecords("sharp")).bySource);
    expect(ours.courses).toEqual([`${V}sharp`]);
    expect(ours.missions).toEqual([]);
  });

  it("an unpublished course, mission or competency is never returned", async () => {
    const { bySource } = await searchRecords("VLAN");
    const ids = Object.values(bySource).flat().map((row) => row.stable_id);
    for (const hidden of [`${V}draft-vlan`, `${V}retired-vlan`, `${V}draft-mission`]) {
      expect(ids).not.toContain(hidden);
    }
    expect(JSON.stringify(bySource)).not.toContain("unpublished VLAN course");
  });

  it("wildcard characters are literal", async () => {
    const ours = oursBySource(V, (await searchRecords("100% _x")).bySource);
    expect(ours.courses).toEqual([`${V}literal`]);
  });

  /** A direct RPC call as an authenticated learner, every column of every row. */
  const callRecordSearchDirectly = (
    source: string,
    args: Record<string, unknown>
  ): Array<Record<string, unknown>> =>
    JSON.parse(
      asRole(
        `select coalesce(json_agg(r), '[]'::json) from (select * from ${functionCall(
          RECORD_SEARCH_FUNCTION,
          { p_source: source, ...args }
        )}) as r;`
      )
    ) as Array<Record<string, unknown>>;

  it("G-003: the RPC, called directly by a learner, returns only the record's own display columns", () => {
    for (const source of RECORD_SOURCES) {
      const rows = callRecordSearchDirectly(source, { p_acronyms: ["VLAN"] }).filter((row) =>
        String(row.stable_id).startsWith(V)
      );
      for (const row of rows) {
        expect(Object.keys(row), source).toEqual([
          "stable_id",
          "version",
          "title",
          "description",
          "publication_state",
          "updated_at"
        ]);
        expect(row.publication_state).toBe("published");
      }
      const serialized = JSON.stringify(rows);
      for (const key of ["payload", "expectedOutcome", "id", "searchable_text"]) {
        expect(serialized, `${source}: ${key}`).not.toContain(`"${key}"`);
      }
      expect(serialized).not.toContain("vlanquartzword");
    }
  });

  it("G-003: searching for a withheld step value finds no record, so it cannot reveal one exists", async () => {
    for (const source of RECORD_SOURCES) {
      expect(callRecordSearchDirectly(source, { p_phrases: ["vlanquartzword"] }), source).toEqual([]);
    }
    const { bySource } = await searchRecords("vlanquartzword");
    expect(Object.values(bySource).flat()).toEqual([]);
  });

  it("an unknown source reads nothing", () => {
    expect(callRecordSearchDirectly("mission_steps", { p_phrases: ["VLAN"] })).toEqual([]);
    expect(callRecordSearchDirectly("learning_modules", { p_phrases: ["Module"] })).toEqual([]);
  });

  it("the function is SECURITY INVOKER and only authenticated may execute it", () => {
    const row = JSON.parse(
      psql(`select json_build_object(
              'definer', p.prosecdef,
              'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
              'anon', has_function_privilege('anon', p.oid, 'execute'),
              'service_role', has_function_privilege('service_role', p.oid, 'execute'))
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = '${RECORD_SEARCH_FUNCTION}';`)
    ) as Record<string, boolean>;

    expect(row).toEqual({ definer: false, authenticated: true, anon: false, service_role: false });
    expect(() =>
      asRole(
        `select count(*) from ${functionCall(RECORD_SEARCH_FUNCTION, { p_source: "courses", p_acronyms: ["VLAN"] })};`,
        "anon"
      )
    ).toThrow(/permission denied/);
  });

  it("row level security decides: a policy hiding courses from the learner hides every course match", () => {
    // Rolled back, so nothing persists.
    const output = psql(
      [
        "begin;",
        `create policy wp005_hide_courses on public.courses as restrictive
           for select to authenticated using (false);`,
        "set local role authenticated;",
        `select count(*) from ${functionCall(RECORD_SEARCH_FUNCTION, { p_source: "courses", p_acronyms: ["VLAN"] })};`,
        "rollback;"
      ].join("\n")
    );
    expect(output).toBe("0");

    const visible = asRole(
      `select count(*) from ${functionCall(RECORD_SEARCH_FUNCTION, { p_source: "courses", p_acronyms: ["VLAN"] })};`
    );
    expect(Number(visible)).toBeGreaterThan(0);
  });

  it("keyset pages under a server row cap return every match", async () => {
    const uncapped = await searchRecords("VLAN");
    const capped = await searchRecords("VLAN", { maxRows: 1 });

    expect(oursBySource(V, capped.bySource)).toEqual(oursBySource(V, uncapped.bySource));
    const coursePages = capped.calls.filter(
      (call) => call.fn === RECORD_SEARCH_FUNCTION && call.args.p_source === "courses"
    );
    expect(coursePages.length).toBeGreaterThanOrEqual(3);
    for (const call of capped.calls) expect(call.rows).toBeLessThanOrEqual(1);
    expect(coursePages.at(-1)?.rows).toBe(0);
  });

  it("a record read stops at its bounded over-fetch", async () => {
    const { bySource, calls } = await searchRecords("VLAN", { overFetch: 2 });
    expect(bySource.courses).toHaveLength(2);
    const coursePages = calls.filter(
      (call) => call.fn === RECORD_SEARCH_FUNCTION && call.args.p_source === "courses"
    );
    expect(coursePages.map((call) => call.args.p_page_size)).toEqual([2]);
  });

  it("clamps an oversized page request instead of failing", () => {
    const rows = asRole(
      `select count(*) from ${functionCall(RECORD_SEARCH_FUNCTION, {
        p_source: "courses",
        p_phrases: ["e"],
        p_page_size: 100000
      })};`
    );
    expect(Number(rows)).toBeLessThanOrEqual(100);
  });
});

/* ------------------------------------------------------------------ *
 * Founder direction G-006 — one concept, one order
 * ------------------------------------------------------------------ */

const G = `${RUN}-g-`;

describe.skipIf(DATABASE_URL === "")("G-006: every form of an alias group returns the identical ordered results against real PostgreSQL", { timeout: 60_000 }, () => {
  /**
   * The reviewer's fixture, per group: an acronym-only and an expanded-name-only
   * record in the title, and again in the description — four published
   * courses, more than limit 1, 2 or 3 holds. The expanded-name record sorts
   * first in stable-id order, so ranking the acronym form above the expanded
   * one (or the reverse) would change the result at every limit.
   */
  beforeAll(() => {
    const { fixture, course } = fixtureBuilder(G);
    course("arp-1-expanded-title", "Address Resolution Protocol fundamentals", "published", "Start here.");
    course("arp-2-acronym-title", "ARP fundamentals", "published", "Start here.");
    course("arp-3-expanded-description", "Neighbour discovery", "published",
      "The Address Resolution Protocol, step by step.");
    course("arp-4-acronym-description", "Reading captures", "published", "Two ARP requests were sent.");
    course("vlan-1-expanded-title", "Virtual Local Area Network basics", "published", "Start here.");
    course("vlan-2-acronym-title", "VLAN basics", "published", "Start here.");
    course("vlan-3-expanded-description", "Switch configuration", "published",
      "A Virtual Local Area Network separates departments.");
    course("vlan-4-acronym-description", "Trunk links", "published", "Carry each VLAN across one trunk link.");
    insertFixture(fixture);
  });

  afterAll(() => removeFixtures());

  /** The real service, every read through the learner-scoped client. */
  async function searchAsLearner(query: string, limit?: number): Promise<string[]> {
    const { client } = learnerClient();
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(() => client as never);
    const { results } = await searchCurriculum("g006-learner-token", {
      query,
      ...(limit === undefined ? {} : { limit })
    });
    return results.map((result) => result.sourceRecordStableId);
  }

  const groups: Array<{ name: string; forms: [string, string, ...string[]]; expected: string[] }> = [
    {
      name: "ARP",
      forms: ["ARP", "Address Resolution Protocol", "arp", "ARPs", "ARP's"],
      expected: [
        `${G}arp-1-expanded-title`,
        `${G}arp-2-acronym-title`,
        `${G}arp-3-expanded-description`,
        `${G}arp-4-acronym-description`
      ]
    },
    {
      name: "VLAN",
      forms: ["VLAN", "Virtual Local Area Network", "vlan", "Virtual LAN", "VLANs?"],
      expected: [
        `${G}vlan-1-expanded-title`,
        `${G}vlan-2-acronym-title`,
        `${G}vlan-3-expanded-description`,
        `${G}vlan-4-acronym-description`
      ]
    }
  ];

  for (const group of groups) {
    const [acronym, expanded] = group.forms;
    for (const limit of [1, 2, 3, undefined]) {
      const label = limit === undefined ? "the full list" : `limit ${limit}`;
      it(`${acronym} and ${expanded} return the identical ordered results at ${label}`, async () => {
        const expected = limit === undefined ? group.expected : group.expected.slice(0, limit);
        const fromAcronym = await searchAsLearner(acronym, limit);
        const fromExpanded = await searchAsLearner(expanded, limit);

        console.log(
          `[WP-005 G-006] ${label}: ${acronym} -> [${fromAcronym.map((id) => id.slice(G.length)).join(", ")}]; ` +
            `${expanded} -> [${fromExpanded.map((id) => id.slice(G.length)).join(", ")}]`
        );
        expect(fromAcronym).toEqual(expected);
        expect(fromExpanded).toEqual(fromAcronym);
        for (const form of group.forms.slice(2)) {
          expect(await searchAsLearner(form, limit), form).toEqual(fromAcronym);
        }
      });
    }
  }
});

/* ------------------------------------------------------------------ *
 * Pagination under a server row cap (review finding 1)
 * ------------------------------------------------------------------ */

const P = `${RUN}-p-`;

describe.skipIf(DATABASE_URL === "")("keyset pages under a server row cap", { timeout: 60_000 }, () => {
  beforeAll(() => {
    const { fixture, course, module, mission, step } = fixtureBuilder(P);
    const capped = course("capped", "Capped course");
    const unit = module(capped, "unit");
    for (let index = 0; index < 7; index += 1) {
      // Three published versions each, so version rows outnumber missions.
      for (const version of [1, 2, 3]) {
        const id = mission(unit, `step-${index}`, `Step mission ${index}`, { version });
        step(id, 0, {
          type: "concept",
          paragraphs: [version === 3 ? "A host sends tamarindword here." : "Ordinary prose."]
        });
      }
    }
    for (let index = 0; index < 5; index += 1) {
      for (const version of [1, 2]) {
        mission(unit, `record-${index}`, `Record mission ${index}`, { version });
      }
    }
    insertFixture(fixture);
  });

  afterAll(() => removeFixtures());

  const recordMissions = Array.from({ length: 5 }, (_, index) => `${P}record-${index}`);

  it("returns every match and every context whatever the cap", async () => {
    const uncapped = await searchSteps("tamarindword", { recordMissions });
    const capped = await searchSteps("tamarindword", { recordMissions, maxRows: 2 });

    const expected = Array.from({ length: 7 }, (_, index) => `${P}step-${index}`);
    expect(ours(P, uncapped.outcome)).toEqual(expected);
    expect(ours(P, capped.outcome)).toEqual(expected);
    for (const id of [...expected, ...recordMissions]) {
      expect(capped.outcome.missions.get(id), id).toMatchObject({ courseTitle: "Capped course" });
    }
    for (const id of expected) expect(capped.outcome.hits.get(id)?.missionVersion).toBe(3);
    for (const id of recordMissions) expect(capped.outcome.missions.get(id)?.version).toBe(2);

    // The cap really shortened pages, and reading went on past them.
    const stepPages = capped.calls.filter((call) => call.fn === STEP_SEARCH_FUNCTION);
    const contextPages = capped.calls.filter((call) => call.fn === MISSION_CONTEXT_FUNCTION);
    expect(stepPages.length).toBeGreaterThanOrEqual(4);
    expect(contextPages.length).toBeGreaterThanOrEqual(3);
    for (const call of capped.calls) {
      expect(call.rows).toBeLessThanOrEqual(2);
      expect(call.args.p_page_size).toBe(STEP_SEARCH_PAGE_SIZE);
    }
    expect(stepPages.at(-1)?.rows).toBe(0);
  });

  it("clamps an oversized page request instead of failing", () => {
    const rows = asRole(
      `select count(*) from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: ["e"], p_page_size: 100000 })};`
    );
    expect(Number(rows)).toBeLessThanOrEqual(100);
  });
});

/* ------------------------------------------------------------------ *
 * Latency (WP-005: within 500 ms on the local stack)
 * ------------------------------------------------------------------ */

const L = `${RUN}-l-`;
const LATENCY_MISSIONS = 60;
const LATENCY_STEPS_PER_MISSION = 20;

describe.skipIf(DATABASE_URL === "")("latency against real PostgreSQL", { timeout: 120_000 }, () => {
  beforeAll(() => {
    const { fixture, course, module, mission, step } = fixtureBuilder(L);
    const big = course("big", "Large course");
    const unit = module(big, "unit");
    const prose =
      "A switch forwards frames by destination MAC address, learning which port leads where from the source address of every frame it receives. ";
    for (let index = 0; index < LATENCY_MISSIONS; index += 1) {
      // A stale version too, so the version resolution has real work.
      for (const version of [1, 2]) {
        const id = mission(unit, `m-${index}`, `Latency mission ${index}`, { version });
        for (let position = 0; position < LATENCY_STEPS_PER_MISSION; position += 1) {
          step(id, position, {
            type: "concept",
            title: `Step ${position} of mission ${index}`,
            paragraphs: [
              prose.repeat(3),
              position === 11 ? "The host sends ARP to find its neighbour." : prose
            ]
          });
        }
      }
    }
    insertFixture(fixture);
    psql("analyze public.missions; analyze public.mission_steps; analyze public.learning_modules; analyze public.courses;");
  });

  afterAll(() => removeFixtures());

  it(`answers inside ${LATENCY_BUDGET_MS} ms, in the database and end to end`, async () => {
    const totalSteps = Number(psql("select count(*) from public.mission_steps;"));
    const { variants, patterns } = variantsFor("ARP");
    const args = {
      ...buildStepSearchArguments(patterns, variants),
      p_after: null,
      p_page_size: STEP_SEARCH_PAGE_SIZE
    };

    const executionMs: number[] = [];
    const endToEndMs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const plan = JSON.parse(
        asRole(`explain (analyze, format json) select * from ${functionCall(STEP_SEARCH_FUNCTION, args)};`)
      ) as Array<{ "Execution Time": number }>;
      executionMs.push(plan[0]?.["Execution Time"] ?? Number.POSITIVE_INFINITY);

      const { outcome, calls, elapsedMs } = await searchSteps("ARP");
      expect(ours(L, outcome)).toHaveLength(LATENCY_MISSIONS);
      // G-002: one full page and the empty page that ends the keyset read.
      expect(calls.map((call) => call.fn)).toEqual([STEP_SEARCH_FUNCTION, STEP_SEARCH_FUNCTION]);
      endToEndMs.push(elapsedMs);
    }

    const worst = (values: number[]) => Math.max(...values).toFixed(1);
    console.log(
      `[WP-005 latency] ${totalSteps} steps in the database (${LATENCY_MISSIONS * LATENCY_STEPS_PER_MISSION} current in this fixture); ` +
        `search_published_mission_steps execution worst ${worst(executionMs)} ms over 5 runs ` +
        `[${executionMs.map((value) => value.toFixed(1)).join(", ")}]; ` +
        `service end to end (all pages, psql round trips included) worst ${worst(endToEndMs)} ms ` +
        `[${endToEndMs.map((value) => value.toFixed(1)).join(", ")}]`
    );

    expect(Math.max(...executionMs)).toBeLessThan(LATENCY_BUDGET_MS);
    expect(Math.max(...endToEndMs)).toBeLessThan(LATENCY_BUDGET_MS);
  });

  /**
   * Founder direction G-005: a search now also reads the four record sources
   * through `search_published_curriculum_records`. Every database read one
   * search makes — four record reads and the step read, with every page — is
   * timed together, and must fit the same budget.
   */
  it(`answers every read of one search inside ${LATENCY_BUDGET_MS} ms, record sources included`, async () => {
    const { variants, patterns } = variantsFor("ARP");
    const args = {
      ...buildStepSearchArguments(patterns, variants),
      p_source: "missions",
      p_after: null,
      p_page_size: 100
    };

    const recordExecutionMs: number[] = [];
    const allReadsMs: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const plan = JSON.parse(
        asRole(`explain (analyze, format json) select * from ${functionCall(RECORD_SEARCH_FUNCTION, args)};`)
      ) as Array<{ "Execution Time": number }>;
      recordExecutionMs.push(plan[0]?.["Execution Time"] ?? Number.POSITIVE_INFINITY);

      const started = performance.now();
      const records = await searchRecords("ARP", { overFetch: 100 });
      const steps = await searchSteps("ARP");
      allReadsMs.push(performance.now() - started);

      expect(oursBySource(L, records.bySource).missions).toEqual([]);
      expect(ours(L, steps.outcome)).toHaveLength(LATENCY_MISSIONS);
    }

    const worst = (values: number[]) => Math.max(...values).toFixed(1);
    console.log(
      `[WP-005 latency] search_published_curriculum_records (missions) execution worst ${worst(recordExecutionMs)} ms over 5 runs ` +
        `[${recordExecutionMs.map((value) => value.toFixed(1)).join(", ")}]; ` +
        `every read of one search (4 record sources + step bodies, all pages, psql round trips included) worst ${worst(allReadsMs)} ms ` +
        `[${allReadsMs.map((value) => value.toFixed(1)).join(", ")}]`
    );

    expect(Math.max(...recordExecutionMs)).toBeLessThan(LATENCY_BUDGET_MS);
    expect(Math.max(...allReadsMs)).toBeLessThan(LATENCY_BUDGET_MS);
  });
});
