import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  escapeCurriculumSearchPattern,
  type CurriculumQueryVariant
} from "@tlp/shared-types";
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

/**
 * WP-005 / Founder direction G-001 — step-body search against REAL PostgreSQL.
 *
 * The database is a disposable local PostgreSQL with
 * `scripts/test-db/supabase-platform-shim.sql` and then EVERY migration in
 * `supabase/migrations` applied unchanged (`scripts/test-db-apply-migrations.sh`).
 * CI provides it and runs this file with `TLP_REQUIRE_TEST_DATABASE=1`, so a
 * missing database fails there. Anywhere else, with no `TLP_TEST_DATABASE_URL`,
 * the database suites skip.
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
  expect(["localhost", "127.0.0.1"]).toContain(new URL(DATABASE_URL).hostname);
});

/* ------------------------------------------------------------------ *
 * psql access — the only database client, with no new dependency
 * ------------------------------------------------------------------ */

function psql(script: string): string {
  if (!["localhost", "127.0.0.1"].includes(new URL(DATABASE_URL).hostname)) {
    throw new Error("Refusing a test database that is not on localhost");
  }
  return execFileSync(
    "psql",
    [DATABASE_URL, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"],
    { input: script, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim();
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
}

function fixtureBuilder(prefix: string) {
  const fixture: Fixture = {
    learning_paths: [],
    courses: [],
    learning_modules: [],
    missions: [],
    mission_steps: []
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

  const course = (key: string, title: string, state = "published") => {
    const id = randomUUID();
    fixture.courses.push({
      id,
      stable_id: `${prefix}${key}`,
      version: 1,
      learning_path_id: pathId,
      title,
      position: (position += 1),
      publication_state: state
    });
    return id;
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
  return { fixture, course, module, mission, step };
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
      `insert into public.courses (id, stable_id, version, learning_path_id, title, position, publication_state)
         select x.id, x.stable_id, x.version, x.learning_path_id, x.title, x.position, x.publication_state
         ${from("courses", "id uuid, stable_id text, version integer, learning_path_id uuid, title text, position integer, publication_state text")};`,
      `insert into public.learning_modules (id, stable_id, version, course_id, title, position, publication_state)
         select x.id, x.stable_id, x.version, x.course_id, x.title, x.position, x.publication_state
         ${from("learning_modules", "id uuid, stable_id text, version integer, course_id uuid, title text, position integer, publication_state text")};`,
      `insert into public.missions (id, stable_id, version, module_id, title, description, position, publication_state)
         select x.id, x.stable_id, x.version, x.module_id, x.title, x.description, x.position, x.publication_state
         ${from("missions", "id uuid, stable_id text, version integer, module_id uuid, title text, description text, position integer, publication_state text")};`,
      `insert into public.mission_steps (id, mission_id, stable_id, position, step_type, payload)
         select x.id, x.mission_id, x.stable_id, x.position, x.step_type, x.payload
         ${from("mission_steps", "id uuid, mission_id uuid, stable_id text, position integer, step_type text, payload jsonb")};`
    ].join("\n")
  );
}

function removeFixtures(): void {
  // Courses, modules, missions and steps all cascade from the path.
  psql(`delete from public.learning_paths where stable_id like ${literal(`${RUN}-%`)};`);
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

    insertFixture(fixture);
  });

  afterAll(() => removeFixtures());

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

      const { outcome, elapsedMs } = await searchSteps("ARP");
      expect(ours(L, outcome)).toHaveLength(LATENCY_MISSIONS);
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
});
