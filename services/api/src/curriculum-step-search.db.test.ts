import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  assertDisposableLocalTestDatabase,
  createTestDatabasePsql
} from "../test-support/test-db-psql";
import {
  AppError,
  MISSION_VERSION_UNAVAILABLE_REASON,
  escapeCurriculumSearchPattern,
  resolvePersistedMissionSteps,
  type CurriculumQueryVariant
} from "@tlp/shared-types";
import {
  STEP_PAYLOAD_FUNCTION,
  checkLearnerNearTransferAnswer,
  getLearnerMissionInstruction
} from "./curriculum";
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
import { createServerSupabaseClient, createUserScopedSupabaseClient } from "./supabase";

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

/**
 * Runs `statement` exactly as PostgREST runs a learner request — or, for
 * WP-008's server-side payload read, as the API's service-role request.
 */
function asRole(
  statement: string,
  role: "authenticated" | "anon" | "service_role" = "authenticated"
): string {
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

    // Review finding: a lower-case or all-capitals plural or possessive is the
    // same concept, matched as a whole word — never "sharpshooting".
    for (const query of ["arps", "ARPS", "Arps", "arp's", "ARP'S", "arps?"]) {
      expect(oursBySource(V, (await searchRecords(query)).bySource), query).toEqual(acronym);
    }
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
      forms: ["ARP", "Address Resolution Protocol", "arp", "ARPs", "ARP's", "arps", "ARPS", "arp's"],
      expected: [
        `${G}arp-1-expanded-title`,
        `${G}arp-2-acronym-title`,
        `${G}arp-3-expanded-description`,
        `${G}arp-4-acronym-description`
      ]
    },
    {
      name: "VLAN",
      forms: ["VLAN", "Virtual Local Area Network", "vlan", "Virtual LAN", "VLANs?", "vlans", "VLANS"],
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
 * DEC-073 — the bounded over-fetch keeps the ranked order
 * ------------------------------------------------------------------ */

const T = `${RUN}-t-`;

describe.skipIf(DATABASE_URL === "")("DEC-073: a small limit returns the head of the full ranked list against real PostgreSQL", { timeout: 60_000 }, () => {
  /**
   * The reviewer's fixture: five courses that match ARP only in their
   * descriptions sort BEFORE the one course whose title says ARP, so a read
   * that held only the first `limit * 4` rows by stable id lost the title
   * match at limit 1. Two words that merely contain "arp" must never match.
   */
  beforeAll(() => {
    const { fixture, course } = fixtureBuilder(T);
    course("arp-1-description", "Reading captures", "published", "Two ARP requests were sent.");
    course("arp-2-description", "Neighbour discovery", "published",
      "The Address Resolution Protocol, step by step.");
    course("arp-3-description", "Host tables", "published", "Each host keeps arp replies.");
    course("arp-4-description", "Switch flooding", "published", "Broadcast ARPs reach every port.");
    course("arp-5-description", "Cache timers", "published", "An ARP's entry ages out.");
    course("arp-6-title", "ARP in practice", "published", "Start here.");
    course("arp-7-sharp", "Sharpshooting drills", "published", "Keep the sharps and harps apart.");
    insertFixture(fixture);
  });

  afterAll(() => removeFixtures());

  async function searchAsLearner(query: string, limit?: number): Promise<string[]> {
    const { client } = learnerClient();
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(() => client as never);
    const { results } = await searchCurriculum("dec073-learner-token", {
      query,
      ...(limit === undefined ? {} : { limit })
    });
    return results.map((result) => result.sourceRecordStableId);
  }

  const expected = [
    `${T}arp-6-title`,
    `${T}arp-1-description`,
    `${T}arp-2-description`,
    `${T}arp-3-description`,
    `${T}arp-4-description`,
    `${T}arp-5-description`
  ];

  for (const query of ["ARP", "Address Resolution Protocol", "arp", "arps", "ARPS", "arp's", "ARP'S"]) {
    it(`${query}: every limit returns the head of the full ranked list, title match first`, async () => {
      const full = await searchAsLearner(query);
      expect(full, query).toEqual(expected);
      expect(full).not.toContain(`${T}arp-7-sharp`);
      for (const limit of [1, 2, 3, 5]) {
        expect(await searchAsLearner(query, limit), `${query} at limit ${limit}`).toEqual(
          full.slice(0, limit)
        );
      }
    });
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
 * WP-008 — learners cannot read withheld step fields
 * ------------------------------------------------------------------ */

/**
 * A learner-scoped stand-in for the supabase-js table builder, covering the
 * calls `getLearnerMissionInstruction` makes on the learner's client
 * (`from().select().eq().order().limit().maybeSingle()` and an awaited list).
 * Each read runs as one SELECT under `role`, with the real grants and policies.
 */
function tableClient(role: "authenticated" | "anon") {
  const ident = (name: string): string => {
    if (!/^[a-z_]+$/.test(name)) throw new Error(`unexpected identifier ${name}`);
    return name;
  };
  return {
    from: (table: string) => {
      let columns = "*";
      const filters: Array<[string, unknown]> = [];
      const orders: Array<[string, boolean]> = [];
      let limit: number | undefined;
      const run = (): { data: Array<Record<string, unknown>> | null; error: unknown } => {
        const select = columns === "*" ? "*" : columns.split(",").map((c) => ident(c.trim())).join(", ");
        const where = filters.length
          ? ` where ${filters.map(([c, v]) => `${ident(c)}::text = ${literal(String(v))}`).join(" and ")}`
          : "";
        const order = orders.length
          ? ` order by ${orders.map(([c, asc]) => `${ident(c)} ${asc ? "asc" : "desc"}`).join(", ")}`
          : "";
        const cap = limit === undefined ? "" : ` limit ${Number(limit)}`;
        try {
          const output = asRole(
            `select coalesce(json_agg(r), '[]'::json) from (select ${select} from public.${ident(table)}${where}${order}${cap}) as r;`,
            role
          );
          return { data: JSON.parse(output) as Array<Record<string, unknown>>, error: null };
        } catch (error) {
          console.error(`[WP-008 db test] ${table} read failed: ${String(error)}`);
          return { data: null, error };
        }
      };
      interface Builder {
        select(value: string): Builder;
        eq(column: string, value: unknown): Builder;
        order(column: string, options?: { ascending?: boolean }): Builder;
        limit(value: number): Builder;
        maybeSingle(): Promise<unknown>;
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown): Promise<unknown>;
      }
      const builder: Builder = {
        select(value) {
          columns = value;
          return builder;
        },
        eq(column, value) {
          filters.push([column, value]);
          return builder;
        },
        order(column, options) {
          orders.push([column, options?.ascending !== false]);
          return builder;
        },
        limit(value) {
          limit = value;
          return builder;
        },
        maybeSingle() {
          const result = run();
          return Promise.resolve(result.error ? result : { data: result.data?.[0] ?? null, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve(run()).then(resolve, reject);
        }
      };
      return builder;
    }
  };
}

/** The API's server-side client: only the payload function, as service_role. */
function payloadClient(role: "service_role" | "authenticated" = "service_role") {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, ...args });
      if (fn !== STEP_PAYLOAD_FUNCTION) throw new Error(`unexpected server rpc ${fn}`);
      try {
        const output = asRole(
          `select coalesce(json_agg(r), '[]'::json) from (select * from public.${STEP_PAYLOAD_FUNCTION}(p_mission_id => ${literal(String(args.p_mission_id))}::uuid)) as r;`,
          role
        );
        return { data: JSON.parse(output) as unknown[], error: null };
      } catch (error) {
        console.error(`[WP-008 db test] ${fn} failed: ${String(error)}`);
        return { data: null, error };
      }
    }
  };
}

const W = `${RUN}-w-`;

/**
 * Every withheld field in the fixture carries one of these, and each appears
 * NOWHERE else, so finding one in any learner-readable output is a leak.
 */
const WP008_WITHHELD = {
  expectedOutcome: "wpeightexpectedmarker",
  nearTransferExplanation: "wpeightexplanationmarker",
  decision: "wpeightdecisionmarker",
  faultExplanation: "wpeightfaultmarker",
  actionObservation: "wpeightactionmarker",
  confirmation: "wpeightconfirmationmarker",
  knowledgeCheckExplanation: "wpeightknowledgemarker",
  predictionReason: "wpeightpredictionmarker"
} as const;
const WP008_WITHHELD_VALUES = Object.values(WP008_WITHHELD);
const WP008_WITHHELD_KEYS = [
  "payload",
  "expectedOutcome",
  "correctOptionIds",
  "explanation",
  "parameters",
  "decision",
  "actions",
  "confirmation",
  "knowledgeChecks",
  "correctOption"
];
/** Learner-visible text: it must stay findable, which proves rows are still readable. */
const WP008_VISIBLE = "wpeightlessonword";

/**
 * A CONTRACT-VALID packet journey carrying every answer-bearing interaction
 * field, each marked with a withheld value. Valid, so the API projects it
 * rather than reporting `content_error` — an invalid fixture would let a leak
 * from the interaction projection pass unnoticed.
 */
function wp008Interaction(supportLevel: string): Row {
  return {
    type: "interaction",
    interactionStableId: "wp8-journey",
    interactionType: "packet_journey",
    sourceKind: "authored_teaching",
    supportLevel,
    textEquivalent: `The ${WP008_VISIBLE} frame crosses the switch.`,
    parameters: {
      interactionType: "packet_journey",
      nodes: [
        {
          nodeId: "pc-a",
          label: "PC-A",
          role: "host",
          interfaces: [{ interfaceId: "pc-a-eth0", label: "eth0", attributes: [] }]
        },
        {
          nodeId: "r-1",
          label: "Router-1",
          role: "router",
          interfaces: [{ interfaceId: "r-1-gi0", label: "Gi0/0", attributes: [] }]
        }
      ],
      links: [{ linkId: "link-a", label: "PC-A to Router-1", endpoints: ["pc-a-eth0", "r-1-gi0"] }],
      traffic: {
        label: "an ICMP echo request",
        sourceNodeId: "pc-a",
        destinationNodeId: "r-1",
        startActionLabel: "Send the ping"
      },
      stages: [
        {
          stageId: "s1",
          atNodeId: "pc-a",
          narration: `PC-A sends the ${WP008_VISIBLE} request.`,
          decision: WP008_WITHHELD.decision,
          outcome: "proceeds",
          prediction: {
            prompt: `Where does the ${WP008_VISIBLE} request go?`,
            options: ["To Router-1", "Nowhere"],
            correctOption: "To Router-1",
            explanation: WP008_WITHHELD.predictionReason
          }
        },
        {
          stageId: "s2",
          atNodeId: "r-1",
          narration: "The frame arrives at Router-1 and is discarded.",
          outcome: "stops",
          viaLinkId: "link-a",
          knowledgeChecks: [
            {
              checkId: "k1",
              prompt: "Which device discarded it?",
              options: ["PC-A", "Router-1"],
              correctOption: "Router-1",
              explanation: WP008_WITHHELD.knowledgeCheckExplanation
            }
          ]
        }
      ],
      fault: {
        atNodeId: "r-1",
        symptom: `The ${WP008_VISIBLE} ping reports loss.`,
        stopsAtStageId: "s2",
        explanation: WP008_WITHHELD.faultExplanation
      },
      actions: [
        {
          actionId: "fix",
          label: "Add the subinterface",
          resolvesFault: true,
          observation: WP008_WITHHELD.actionObservation
        }
      ],
      confirmation: { narration: WP008_WITHHELD.confirmation, summary: "One subinterface per VLAN." }
    }
  };
}

/** The interaction-bearing support levels, and the withheld ones among them. */
const WP008_WITHHOLDING_LEVELS = ["challenge_me", "prove_it"] as const;

it("WP-008: every withheld-interaction fixture is contract-valid, so the API projects it", () => {
  for (const supportLevel of [...WP008_WITHHOLDING_LEVELS, "show_me"]) {
    const payload = wp008Interaction(supportLevel);
    const outcome = resolvePersistedMissionSteps([
      { stableId: "s01", position: 0, stepType: payload.type, payload }
    ]);
    expect(outcome.state === "content_error" ? outcome.errors : [], supportLevel).toEqual([]);
    expect(outcome.state, supportLevel).toBe("available");  }
});

describe.skipIf(DATABASE_URL === "")("WP-008: withheld step fields against real PostgreSQL", { timeout: 60_000 }, () => {
  const ids: Record<string, string> = {};

  beforeAll(() => {
    const { fixture, course, module, mission, step } = fixtureBuilder(W);
    const unit = module(course("course", "Withholding course"), "unit");

    // A mission the API must still render: every step is valid.
    ids.lesson = mission(unit, "lesson", "Withholding lesson");
    step(ids.lesson, 0, {
      type: "concept",
      title: `Reading the ${WP008_VISIBLE} network`,
      paragraphs: [`A ${WP008_VISIBLE} paragraph a learner reads.`]
    });
    step(ids.lesson, 1, {
      type: "prediction",
      prompt: `What happens to the ${WP008_VISIBLE} frame?`,
      options: ["It is delivered", "It is dropped"],
      expectedOutcome: `It is dropped, because ${WP008_WITHHELD.expectedOutcome}.`
    });
    step(ids.lesson, 2, {
      type: "near_transfer",
      title: `Try a ${WP008_VISIBLE} network`,
      framing: "A different network, the same reasoning.",
      questions: [
        {
          questionStableId: "q1",
          type: "single_choice",
          prompt: "Which device joins two networks?",
          options: [
            { optionId: "router", text: "The router" },
            { optionId: "switch", text: "The switch" }
          ],
          correctOptionIds: ["router"],
          explanation: `Only the router ${WP008_WITHHELD.nearTransferExplanation} joins two networks.`
        }
      ]
    });

    // Every answer-bearing interaction field, valid, at each level that
    // withholds them: CHALLENGE ME strips them, PROVE IT withholds it whole.
    ids.raw = mission(unit, "raw", "Withheld interaction");
    step(ids.raw, 0, wp008Interaction("challenge_me"));
    ids.proved = mission(unit, "proved", "Withheld demonstration");
    step(ids.proved, 0, wp008Interaction("prove_it"));
    // The same journey at a teaching level, which delivers them: the control
    // that proves the markers are detectable in a projected response.
    ids.taught = mission(unit, "taught", "Taught interaction");
    step(ids.taught, 0, wp008Interaction("show_me"));

    // Unpublished: row level security must still hide it.
    ids.draft = mission(unit, "draft", "Draft withholding mission", { state: "draft" });
    step(ids.draft, 0, { type: "concept", paragraphs: ["wpeightdraftword is only in a draft step."] });

    insertFixture(fixture);
  });

  afterAll(() => removeFixtures());

  const leaks = (serialized: string, allowedKeys: readonly string[] = []): string[] => [
    ...WP008_WITHHELD_VALUES.filter((value) => serialized.includes(value)),
    ...WP008_WITHHELD_KEYS.filter(
      (key) => !allowedKeys.includes(key) && serialized.includes(`"${key}"`)
    )
  ];

  /* --- criterion 1: direct table reads ---------------------------- */

  const deniedReads: Array<[string, string]> = [
    ["the raw payload", "select payload from public.mission_steps"],
    ["one withheld field of the payload", "select payload ->> 'expectedOutcome' from public.mission_steps"],
    ["every column", "select * from public.mission_steps"],
    ["the whole row as JSON", "select to_jsonb(s) from public.mission_steps as s"],
    ["the payload through a filter", "select id from public.mission_steps where payload::text like '%marker%'"],
    ["the payload through a function", "select public.mission_step_searchable_text(payload) from public.mission_steps"],
    ["the step type", "select step_type from public.mission_steps"]
  ];
  for (const [name, statement] of deniedReads) {
    it(`criterion 1: a learner reading ${name} is denied`, () => {
      expect(() => asRole(`${statement};`)).toThrow(/permission denied/);
    });
  }

  it("criterion 1: the columns a learner may read carry no withheld field or value, and RLS still decides rows", () => {
    const rows = JSON.parse(
      asRole(
        `select coalesce(json_agg(r), '[]'::json) from (
           select id, mission_id, stable_id, position, searchable_text, title_text, label_text
           from public.mission_steps) as r;`
      )
    ) as Array<Record<string, unknown>>;
    const serialized = JSON.stringify(rows);

    expect(leaks(serialized)).toEqual([]);
    // Published steps are still readable, the draft one is not.
    const ours = rows.filter((row) => Object.values(ids).includes(String(row.mission_id)));
    expect(ours.map((row) => row.mission_id).sort()).toEqual(
      [ids.lesson, ids.lesson, ids.lesson, ids.raw, ids.proved, ids.taught].sort()
    );
    expect(serialized).toContain(WP008_VISIBLE);
    expect(serialized).not.toContain("wpeightdraftword");
  });

  it("criterion 1: the payload reader is not callable by a learner", () => {
    expect(() =>
      asRole(`select count(*) from public.${STEP_PAYLOAD_FUNCTION}(${literal(ids.lesson ?? "")}::uuid);`)
    ).toThrow(/permission denied/);
  });

  /* --- criterion 2: every learner-callable view and function ------ */

  it("criterion 2: the only learner-callable function touching mission_steps is the step search, and no view reads it", () => {
    const functions = JSON.parse(
      psql(`select coalesce(json_agg(p.proname order by p.proname), '[]'::json)
              from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.prosrc ilike '%mission_steps%'
               and (has_function_privilege('authenticated', p.oid, 'execute')
                    or has_function_privilege('anon', p.oid, 'execute'));`)
    ) as string[];
    expect(functions).toEqual([STEP_SEARCH_FUNCTION]);

    const views = psql(
      `select count(*) from pg_views where schemaname = 'public' and definition ilike '%mission_steps%';`
    );
    expect(views).toBe("0");
  });

  it("criterion 2: the step search, called directly by a learner, returns no withheld field or value", () => {
    const searches = [WP008_VISIBLE, "frame", "network", ...WP008_WITHHELD_VALUES];
    for (const word of searches) {
      const serialized = asRole(
        `select coalesce(json_agg(r), '[]'::json) from (select * from ${functionCall(STEP_SEARCH_FUNCTION, {
          p_phrases: [word]
        })}) as r;`
      );
      expect(leaks(serialized), word).toEqual([]);
    }
    // A withheld value finds nothing, so search cannot reveal it exists.
    for (const value of WP008_WITHHELD_VALUES) {
      expect(
        asRole(`select count(*) from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: [value] })};`),
        value
      ).toBe("0");
    }
  });

  it("criterion 2: the step search still names the step from its title, now without reading the payload", () => {
    const rows = JSON.parse(
      asRole(
        `select coalesce(json_agg(r), '[]'::json) from (select * from ${functionCall(STEP_SEARCH_FUNCTION, {
          p_phrases: ["paragraph a learner reads"]
        })}) as r;`
      )
    ) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      mission_stable_id: `${W}lesson`,
      step_stable_id: "s01",
      step_title: `Reading the ${WP008_VISIBLE} network`,
      step_label: null
    });
  });

  /* --- criterion 3: anon reads nothing ----------------------------- */

  for (const statement of [
    "select stable_id from public.mission_steps",
    "select searchable_text from public.mission_steps",
    "select payload from public.mission_steps",
    `select count(*) from ${functionCall(STEP_SEARCH_FUNCTION, { p_phrases: ["network"] })}`
  ]) {
    it(`criterion 3: anon is denied: ${statement.slice(0, 60)}`, () => {
      expect(() => asRole(`${statement};`, "anon")).toThrow(/permission denied/);
    });
  }

  it("criterion 3: anon holds no privilege on mission_steps and cannot call the payload reader", () => {
    expect(
      psql(`select has_any_column_privilege('anon', 'public.mission_steps', 'select')
                or has_table_privilege('anon', 'public.mission_steps', 'select,insert,update,delete,truncate,references,trigger');`)
    ).toBe("f");
    expect(() =>
      asRole(`select count(*) from public.${STEP_PAYLOAD_FUNCTION}(${literal(ids.lesson ?? "")}::uuid);`, "anon")
    ).toThrow(/permission denied/);
  });

  /* --- criterion 4: the lesson still renders and validates -------- */

  /** The real service, with the learner's client and the server client both real-database backed. */
  function learnerAndServerClients() {
    const server = payloadClient();
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(() => tableClient("authenticated") as never);
    vi.mocked(createServerSupabaseClient).mockImplementation(() => server as never);
    return server;
  }

  async function renderAsLearner(missionStableId: string) {
    const server = learnerAndServerClients();
    const response = await getLearnerMissionInstruction("learner-token", missionStableId);
    return { response, server };
  }

  it("criterion 4: the learner's old direct step read is now refused by the database", () => {
    expect(() =>
      asRole(
        `select stable_id, position, step_type, payload from public.mission_steps where mission_id = ${literal(ids.lesson ?? "")};`
      )
    ).toThrow(/permission denied/);
  });

  it("criterion 4: the lesson still renders through the API, in order, with no withheld field", async () => {
    const { response, server } = await renderAsLearner(`${W}lesson`);

    expect(server.calls).toEqual([{ fn: STEP_PAYLOAD_FUNCTION, p_mission_id: ids.lesson }]);
    expect(response.instruction.state).toBe("available");
    if (response.instruction.state !== "available") return;
    expect(response.instruction.steps.map((s) => [s.stableId, s.content.type])).toEqual([
      ["s01", "concept"],
      ["s02", "prediction"],
      ["s03", "near_transfer"]
    ]);
    const serialized = JSON.stringify(response);
    expect(serialized).toContain(WP008_VISIBLE);
    expect(serialized).not.toContain(WP008_WITHHELD.expectedOutcome);
    expect(serialized).not.toContain("expectedOutcome");
    // WP-008 / DEC-074: EVERY withheld field and value, near-transfer answers
    // and explanations included, is absent from the lesson response.
    expect(leaks(serialized)).toEqual([]);
    expect(serialized).not.toContain('"answers"');
  });

  it("criterion 4: every learner-facing lesson response carries no withheld field or value", async () => {
    // Every withholding mission the learner can open, through the real API
    // read. Each must actually render, or the absence below would be vacuous.
    for (const missionStableId of [`${W}lesson`, `${W}raw`, `${W}proved`]) {
      const { response } = await renderAsLearner(missionStableId);
      expect(response.instruction.state, missionStableId).toBe("available");
      const serialized = JSON.stringify(response);
      expect(serialized, missionStableId).toContain(WP008_VISIBLE);
      // `parameters` is the learner projection's own key on an available
      // interaction; every answer-bearing field inside it is still checked.
      expect(leaks(serialized, ["parameters"]), missionStableId).toEqual([]);
      expect(serialized, missionStableId).not.toContain('"answers"');
    }
  });

  it("criterion 4: at CHALLENGE ME the interaction renders, with its observations and without its answers", async () => {
    const { response } = await renderAsLearner(`${W}raw`);

    expect(response.instruction.state).toBe("available");
    if (response.instruction.state !== "available") return;
    expect(response.instruction.steps).toHaveLength(1);
    const content = JSON.parse(JSON.stringify(response.instruction.steps[0]?.content)) as Row;
    expect(content).toMatchObject({
      type: "interaction",
      interactionStableId: "wp8-journey",
      supportLevel: "challenge_me",
      textEquivalent: `The ${WP008_VISIBLE} frame crosses the switch.`,
      presentation: {
        state: "available",
        parameters: {
          interactionType: "packet_journey",
          nodes: [{ nodeId: "pc-a" }, { nodeId: "r-1" }],
          stages: [
            {
              stageId: "s1",
              narration: `PC-A sends the ${WP008_VISIBLE} request.`,
              prediction: {
                prompt: `Where does the ${WP008_VISIBLE} request go?`,
                options: ["To Router-1", "Nowhere"]
              }
            },
            { stageId: "s2", viaLinkId: "link-a" }
          ],
          fault: { symptom: `The ${WP008_VISIBLE} ping reports loss.`, stopsAtStageId: "s2" }
        }
      }
    });
    expect(leaks(JSON.stringify(content), ["parameters"])).toEqual([]);
  });

  it("criterion 4: at PROVE IT the teaching interaction is withheld whole, and its text equivalent survives", async () => {
    const { response } = await renderAsLearner(`${W}proved`);

    expect(response.instruction.state).toBe("available");
    if (response.instruction.state !== "available") return;
    expect(response.instruction.steps.map((s) => s.content)).toEqual([
      {
        type: "interaction",
        interactionStableId: "wp8-journey",
        interactionType: "packet_journey",
        sourceKind: "authored_teaching",
        supportLevel: "prove_it",
        textEquivalent: `The ${WP008_VISIBLE} frame crosses the switch.`,
        presentation: { state: "withheld", reason: "protected_demonstration" }
      }
    ]);
    expect(leaks(JSON.stringify(response))).toEqual([]);
  });

  it("criterion 4: the control — at SHOW ME the same journey delivers every marker, so their absence above is meaningful", async () => {
    const { response } = await renderAsLearner(`${W}taught`);

    expect(response.instruction.state).toBe("available");
    const serialized = JSON.stringify(response);
    expect(
      [
        WP008_WITHHELD.decision,
        WP008_WITHHELD.predictionReason,
        WP008_WITHHELD.knowledgeCheckExplanation,
        WP008_WITHHELD.faultExplanation,
        WP008_WITHHELD.actionObservation,
        WP008_WITHHELD.confirmation
      ].filter((value) => !serialized.includes(value))
    ).toEqual([]);
  });

  /*
    Criterion 4, through the TRUSTED SERVER PATH (review finding, MEDIUM).

    The learner submits an answer to the API's real check, which resolves the
    mission through the learner's real RLS-scoped client and reads the
    withheld `correctOptionIds` from the real `mission_steps.payload` through
    the service-role-only payload function. Nothing about the answer is
    obtained from a learner response first — the lesson response, above,
    carries none.

    This replaces a test that read the answer out of the learner response and
    compared it locally, which is exactly the exposure DEC-074 closes.
  */
  async function checkAsLearner(selectedOptionIds: readonly string[], questionStableId = "q1") {
    const server = learnerAndServerClients();
    const result = await checkLearnerNearTransferAnswer("learner-token", `${W}lesson`, {
      // G-009: the version the lesson was served at (the fixture's only one).
      missionVersion: 1,
      stepStableId: "s03",
      questionStableId,
      selectedOptionIds
    });
    return { result, server };
  }

  it("criterion 4: a correct near-transfer answer still validates on the server", async () => {
    const { result, server } = await checkAsLearner(["router"]);

    expect(result).toEqual({
      correct: true,
      explanation: `Only the router ${WP008_WITHHELD.nearTransferExplanation} joins two networks.`
    });
    expect(server.calls).toEqual([{ fn: STEP_PAYLOAD_FUNCTION, p_mission_id: ids.lesson }]);
  });

  it("criterion 4: a wrong near-transfer answer still fails on the server, without the answer key", async () => {
    for (const wrong of [["switch"], ["router", "switch"]]) {
      const { result } = await checkAsLearner(wrong);
      expect(result.correct, wrong.join(",")).toBe(false);
      // G-007, DEC-074: a wrong submission must not read the authored
      // correctOptionIds back out of the response.
      expect(Object.keys(result).sort(), wrong.join(",")).toEqual(["correct", "explanation"]);
    }
  });

  it("criterion 4: the check returns only the verdict and that question's feedback", async () => {
    const { result } = await checkAsLearner(["switch"]);

    expect(Object.keys(result).sort()).toEqual(["correct", "explanation"]);
    // The explanation is the post-commitment feedback for THIS question, and
    // is the only withheld value the check may return. No other withheld
    // field or value comes with it.
    const serialized = JSON.stringify(result);
    const others = WP008_WITHHELD_VALUES.filter(
      (value) => value !== WP008_WITHHELD.nearTransferExplanation
    );
    expect(others.filter((value) => serialized.includes(value))).toEqual([]);
    for (const key of WP008_WITHHELD_KEYS.filter((key) => key !== "explanation")) {
      expect(serialized, key).not.toContain(`"${key}"`);
    }
  });

  // G-009 changed the expected refusal from NOT_FOUND to the version-unavailable
  // CONFLICT: the check resolves an exact published version, and a draft has
  // none. The service still never reads its steps.
  it("criterion 4: the check refuses an unpublished mission, and the service never reads its steps", async () => {
    const server = learnerAndServerClients();
    await expect(
      checkLearnerNearTransferAnswer("learner-token", `${W}draft`, {
        missionVersion: 1,
        stepStableId: "s01",
        questionStableId: "q1",
        selectedOptionIds: ["router"]
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      details: { reason: MISSION_VERSION_UNAVAILABLE_REASON }
    });
    expect(server.calls).toEqual([]);
  });

  it("criterion 4: the check refuses a question or option the mission does not author", async () => {
    await expect(checkAsLearner(["router"], "no-such-question")).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    await expect(checkAsLearner(["router", "hub"])).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("criterion 4: an unpublished mission is still not found, and the service never reads its steps", async () => {
    const server = learnerAndServerClients();
    await expect(getLearnerMissionInstruction("learner-token", `${W}draft`)).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
    expect(server.calls).toEqual([]);
  });

  it("criterion 4: the payload reader restates publication, so even service_role gets nothing for a draft", () => {
    const count = (missionId: string) =>
      asRole(
        `select count(*) from public.${STEP_PAYLOAD_FUNCTION}(${literal(missionId)}::uuid);`,
        "service_role"
      );
    expect(count(ids.draft ?? "")).toBe("0");
    expect(count(ids.lesson ?? "")).toBe("3");
  });

  /* --- criterion 6: the privilege guard ---------------------------- */

  const privilegeReport = `select json_build_object(
      'authenticated_table', has_table_privilege('authenticated', 'public.mission_steps', 'select'),
      'authenticated_payload', has_column_privilege('authenticated', 'public.mission_steps', 'payload', 'select'),
      'anon_any', has_any_column_privilege('anon', 'public.mission_steps', 'select'),
      'public_any', has_any_column_privilege('public', 'public.mission_steps', 'select'),
      'authenticated_visible', has_column_privilege('authenticated', 'public.mission_steps', 'searchable_text', 'select'),
      'service_role_payload', has_column_privilege('service_role', 'public.mission_steps', 'payload', 'select'))::text;`;
  const EXPECTED_PRIVILEGES = {
    authenticated_table: false,
    authenticated_payload: false,
    anon_any: false,
    public_any: false,
    authenticated_visible: true,
    service_role_payload: true
  };

  it("criterion 6: after every migration, no client role may select the raw payload", () => {
    expect(JSON.parse(psql(privilegeReport))).toEqual(EXPECTED_PRIVILEGES);
  });

  it("criterion 6: the guard notices a re-grant of the payload (rolled back)", () => {
    for (const regrant of [
      "grant select on public.mission_steps to authenticated;",
      "grant select (payload) on public.mission_steps to authenticated;",
      "grant select on public.mission_steps to anon;"
    ]) {
      const report = JSON.parse(psql(["begin;", regrant, privilegeReport, "rollback;"].join("\n")));
      expect(report, regrant).not.toEqual(EXPECTED_PRIVILEGES);
    }
  });

  it("the migration removes hosted default privileges: ALL granted beforehand still ends with no payload access", () => {
    // Hosted Supabase grants new tables to anon and authenticated by default
    // privilege. Simulate that, re-run the migration, and roll it all back.
    const migration = readFileSync(
      new URL("../../../supabase/migrations/20261013000100_mission_step_payload_withholding.sql", import.meta.url),
      "utf8"
    );
    const report = JSON.parse(
      psql(
        [
          "begin;",
          "grant all on public.mission_steps to anon, authenticated;",
          migration,
          privilegeReport,
          "rollback;"
        ].join("\n")
      )
    );
    expect(report).toEqual(EXPECTED_PRIVILEGES);
  });
});

/* ------------------------------------------------------------------ *
 * G-009 — a near-transfer check is bound to the version the learner opened
 * ------------------------------------------------------------------ */

const X = `${RUN}-x-`;

/**
 * Unique withheld markers, one set per mission version. Each appears only in
 * that version's authored explanation, so finding one anywhere it should not
 * be — or the wrong one in a verdict — is detectable.
 */
const G009_MARKERS = {
  1: "gninevoneexplanationmarker",
  2: "gninevtwoexplanationmarker",
  3: "gninevthreeexplanationmarker"
} as const;

/**
 * One near-transfer step whose step, question and option stable ids are the
 * SAME in every version; only the correct answer and its explanation differ.
 * That is the case the review found: reused ids let one version's answer be
 * judged against another's key.
 */
function g009NearTransfer(version: 1 | 2 | 3, correctOptionId: "router" | "switch"): Row {
  return {
    type: "near_transfer",
    title: "Try a versioned network",
    framing: "The same question in every version.",
    questions: [
      {
        questionStableId: "q1",
        type: "single_choice",
        prompt: "Which device answers this version's question?",
        options: [
          { optionId: "router", text: "The router" },
          { optionId: "switch", text: "The switch" }
        ],
        correctOptionIds: [correctOptionId],
        explanation: `Version ${version} says ${G009_MARKERS[version]}.`
      }
    ]
  };
}

describe.skipIf(DATABASE_URL === "")("G-009: a near-transfer check is judged against the version the learner opened", { timeout: 60_000 }, () => {
  let moduleId = "";
  let nextPosition = 100;
  const missionIds: Record<string, string> = {};

  /** Insert one version of one mission, with its near-transfer step, as the owner. */
  function insertVersion(key: string, version: 1 | 2 | 3, state: string, correctOptionId: "router" | "switch"): string {
    const id = randomUUID();
    insertFixture({
      learning_paths: [],
      courses: [],
      learning_modules: [],
      competencies: [],
      missions: [
        {
          id,
          stable_id: `${X}${key}`,
          version,
          module_id: moduleId,
          title: `Versioned mission ${key} v${version}`,
          description: null,
          position: (nextPosition += 1),
          publication_state: state
        }
      ],
      mission_steps: [
        {
          id: randomUUID(),
          mission_id: id,
          stable_id: "s01",
          position: 0,
          step_type: "near_transfer",
          payload: g009NearTransfer(version, correctOptionId)
        }
      ]
    });
    missionIds[`${key}@${version}`] = id;
    return id;
  }

  function setState(missionId: string, state: string): void {
    psql(
      `update public.missions set publication_state = ${literal(state)} where id = ${literal(missionId)}::uuid;`
    );
  }

  /** The real service, with both clients real-database backed, as in WP-008 above. */
  function clients() {
    const server = payloadClient();
    vi.mocked(createUserScopedSupabaseClient).mockImplementation(() => tableClient("authenticated") as never);
    vi.mocked(createServerSupabaseClient).mockImplementation(() => server as never);
    return server;
  }

  async function check(key: string, missionVersion: number, selectedOptionIds: readonly string[]) {
    const server = clients();
    const outcome = await checkLearnerNearTransferAnswer("learner-token", `${X}${key}`, {
      missionVersion,
      stepStableId: "s01",
      questionStableId: "q1",
      selectedOptionIds
    }).then(
      (result) => ({ result, error: undefined }),
      (error: unknown) => ({ result: undefined, error })
    );
    return { ...outcome, server };
  }

  /** Every withheld field name and every version's marker, found in `serialized`. */
  const withheld = (serialized: string): string[] => [
    ...Object.values(G009_MARKERS).filter((marker) => serialized.includes(marker)),
    ...["correctOptionIds", "explanation", "answers", "payload"].filter((key) =>
      serialized.includes(`"${key}"`)
    )
  ];

  /** Assert a refusal is exactly the version-unavailable response, and carries nothing else. */
  function expectVersionUnavailable(error: unknown, label: string): void {
    expect(error, label).toBeInstanceOf(AppError);
    const body = (error as AppError).toJSON();
    expect(body, label).toEqual({
      code: "CONFLICT",
      message: "This activity was updated. Please reload to continue.",
      retryable: false,
      details: { reason: MISSION_VERSION_UNAVAILABLE_REASON }
    });
    const serialized = JSON.stringify(body);
    expect(withheld(serialized), label).toEqual([]);
    for (const absent of ['"correct"', '"version"', '"missionVersion"', "router", "switch"]) {
      expect(serialized, `${label}: ${absent}`).not.toContain(absent);
    }
  }

  beforeAll(() => {
    const { fixture, course, module } = fixtureBuilder(X);
    moduleId = module(course("course", "Versioned course"), "unit");
    insertFixture(fixture);

    // Test (a): two missions that will each have v2 published while v1 is open.
    insertVersion("kept", 1, "published", "router");
    insertVersion("retired", 1, "published", "router");

    // Test (b): one version in each unavailable state, and one published control.
    insertVersion("states", 1, "retired", "router");
    insertVersion("states", 2, "published", "switch");
    insertVersion("states", 3, "draft", "router");
  });

  afterAll(() => removeFixtures());

  /*
    Test (a). The learner opens v1, then v2 is published with the same step,
    question and option ids but a different correct answer. Run twice: with v1
    still published, and with v1 retired after v2 is published.
  */
  for (const retireAfterPublishing of [false, true]) {
    const key = retireAfterPublishing ? "retired" : "kept";
    const label = retireAfterPublishing ? "v1 retired after v2 is published" : "v1 still published";

    it(`(a) ${label}: a v1 submission is never judged against v2`, async () => {
      // 1. The learner opens the lesson: v1 is the highest published version.
      clients();
      const opened = await getLearnerMissionInstruction("learner-token", `${X}${key}`);
      expect(opened.mission.version).toBe(1);
      expect(opened.instruction.state).toBe("available");
      expect(withheld(JSON.stringify(opened))).toEqual([]);

      // 2. v2 is published while the lesson is open.
      insertVersion(key, 2, "published", "switch");
      if (retireAfterPublishing) setState(missionIds[`${key}@1`] ?? "", "retired");

      // The lesson read is unchanged: it now serves v2, the highest published.
      clients();
      const reloaded = await getLearnerMissionInstruction("learner-token", `${X}${key}`);
      expect(reloaded.mission.version).toBe(2);
      expect(reloaded.instruction.state).toBe("available");
      expect(withheld(JSON.stringify(reloaded))).toEqual([]);

      // 3. The learner submits answers to the lesson they OPENED, naming the
      // version it was served with.
      const openedVersion = opened.mission.version;
      const v1Correct = await check(key, openedVersion, ["router"]);
      const v2Correct = await check(key, openedVersion, ["switch"]);

      if (!retireAfterPublishing) {
        // v1's correct option is correct, with v1's explanation.
        expect(v1Correct.error).toBeUndefined();
        expect(v1Correct.result).toEqual({
          correct: true,
          explanation: `Version 1 says ${G009_MARKERS[1]}.`
        });
        // v2's correct option is WRONG for v1, and still v1's explanation.
        expect(v2Correct.error).toBeUndefined();
        expect(v2Correct.result).toEqual({
          correct: false,
          explanation: `Version 1 says ${G009_MARKERS[1]}.`
        });
        // Only v1's steps were read, never v2's.
        for (const { server } of [v1Correct, v2Correct]) {
          expect(server.calls).toEqual([
            { fn: STEP_PAYLOAD_FUNCTION, p_mission_id: missionIds[`${key}@1`] }
          ]);
        }
        for (const { result } of [v1Correct, v2Correct]) {
          const serialized = JSON.stringify(result);
          expect(serialized).not.toContain(G009_MARKERS[2]);
          expect(Object.keys(result ?? {}).sort()).toEqual(["correct", "explanation"]);
        }
      } else {
        // v1 is gone: the reload response, not a verdict, and no payload read.
        for (const [name, outcome] of [
          ["v1's correct option", v1Correct],
          ["v2's correct option", v2Correct]
        ] as const) {
          expect(outcome.result, name).toBeUndefined();
          expectVersionUnavailable(outcome.error, name);
          expect(outcome.server.calls, name).toEqual([]);
        }
      }

      // Control: a submission naming v2 is judged against v2, so the version
      // binding — not anything else — is what kept v1's verdicts on v1.
      const v2Submission = await check(key, 2, ["switch"]);
      expect(v2Submission.result).toEqual({
        correct: true,
        explanation: `Version 2 says ${G009_MARKERS[2]}.`
      });
      expect(v2Submission.server.calls).toEqual([
        { fn: STEP_PAYLOAD_FUNCTION, p_mission_id: missionIds[`${key}@2`] }
      ]);
    });
  }

  /*
    Test (b). A submission naming a version that is draft, retired or does not
    exist gets the version-unavailable response, never a verdict, and carries
    none of any version's withheld markers.
  */
  for (const [state, version] of [
    ["retired", 1],
    ["draft", 3],
    ["nonexistent", 9]
  ] as const) {
    it(`(b) a ${state} version gets the version-unavailable response and nothing from any version`, async () => {
      for (const selected of [["router"], ["switch"]]) {
        const outcome = await check("states", version, selected);
        expect(outcome.result, selected.join(",")).toBeUndefined();
        expectVersionUnavailable(outcome.error, `${state} ${selected.join(",")}`);
        // Refused before the service role was ever reached.
        expect(outcome.server.calls).toEqual([]);
      }
    });
  }

  it("(b) a mission the learner cannot see at all gets the same response", async () => {
    const outcome = await check("no-such-mission", 1, ["router"]);
    expectVersionUnavailable(outcome.error, "unknown mission");
    expect(outcome.server.calls).toEqual([]);
  });

  it("(b) control: the published version is judged, so the markers are detectable", async () => {
    const outcome = await check("states", 2, ["switch"]);
    expect(outcome.result).toEqual({
      correct: true,
      explanation: `Version 2 says ${G009_MARKERS[2]}.`
    });
    expect(withheld(JSON.stringify(outcome.result))).toEqual([G009_MARKERS[2], "explanation"]);
  });

  it("(item 4) at an available version, an unauthored step, question or option is still refused as before", async () => {
    clients();
    const ask = (request: { stepStableId: string; questionStableId: string; selectedOptionIds: string[] }) =>
      checkLearnerNearTransferAnswer("learner-token", `${X}states`, { missionVersion: 2, ...request });

    await expect(
      ask({ stepStableId: "s99", questionStableId: "q1", selectedOptionIds: ["router"] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ask({ stepStableId: "s01", questionStableId: "q9", selectedOptionIds: ["router"] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ask({ stepStableId: "s01", questionStableId: "q1", selectedOptionIds: ["hub"] })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
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
