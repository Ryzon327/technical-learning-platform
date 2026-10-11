import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumSearchInput } from "./curriculum-search";
import { STEP_SEARCH_PAGE_SIZE, stepSearchableText } from "./curriculum-step-search";
import { approvedSearchAliasGroups } from "./search-aliases";

/**
 * WP-005 — acceptance criteria 1 to 8, through the real `searchCurriculum`.
 *
 * The client factory is mocked with a stand-in database that MODELS the
 * published-only row level security the migrations declare: every curriculum
 * node is readable only when published, and a `mission_steps` row only when its
 * owning mission is published (`20260831000100_mission_steps.sql`). The two
 * step-search database functions
 * (`20261011000100_curriculum_step_search_functions.sql`) are modelled with the
 * same visibility, keyset pages and, optionally, a PostgREST-style server row
 * cap (`maxRows`).
 *
 * NOT proven here: live PostgreSQL behaviour. That is
 * `curriculum-step-search.db.test.ts`, which runs the real functions under the
 * real policies against PostgreSQL with every migration applied, in CI. The
 * whole-word pattern is approximated here with JavaScript's `\b`.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

const ACCESS_TOKEN = "wp005-access-token";

type Row = Record<string, unknown>;

interface World {
  learning_paths: Row[];
  courses: Row[];
  learning_modules: Row[];
  missions: Row[];
  competencies: Row[];
  mission_steps: Row[];
}

interface ReadRecord {
  table: string;
  select: string;
  eqs: Array<[string, unknown]>;
  or?: string;
  limit?: number;
  args?: Record<string, unknown>;
}

const STEP_RPC = "rpc:search_published_mission_steps";
const CONTEXT_RPC = "rpc:published_mission_contexts";

let sequence = 0;
const nextId = () =>
  `00000000-0000-4000-8000-${String((sequence += 1)).padStart(12, "0")}`;

function node(stableId: string, title: string, extra: Row = {}): Row {
  return {
    id: nextId(),
    stable_id: stableId,
    version: 1,
    title,
    description: null,
    publication_state: "published",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...extra
  };
}

function step(mission: Row, position: number, payload: Row): Row {
  return {
    id: nextId(),
    mission_id: mission.id,
    stable_id: `s${String(position + 1).padStart(2, "0")}-fixture`,
    position,
    step_type: payload.type,
    payload
  };
}

interface DatabaseOptions {
  hostile?: boolean;
  /**
   * A PostgREST `max-rows` cap on function responses: no step-search or
   * mission-context page carries more rows than this, whatever was asked for.
   */
  maxRows?: number;
  /** Ignores `p_after`, as a broken server would. */
  ignoreCursor?: boolean;
}

/**
 * The stand-in database.
 *
 * `hostile` turns OFF both the modelled policies and every publication `eq`
 * filter, which is what a broken policy plus a forgotten filter would look
 * like. Text matching still applies. It exists to prove the service's own
 * re-checks, not to describe real behaviour.
 */
function database(world: World, options: DatabaseOptions = {}) {
  const reads: ReadRecord[] = [];
  const hostile = options.hostile ?? false;
  const cap = (rows: Row[]) =>
    options.maxRows === undefined ? rows : rows.slice(0, options.maxRows);
  const published = (row: Row | undefined) =>
    row !== undefined && (hostile || row.publication_state === "published");

  const visible = (row: Row): boolean => hostile || published(row);

  const fieldOf = (row: Row, column: string): string => {
    const value = row[column];
    return typeof value === "string" ? value : "";
  };

  const matches = (row: Row, condition: string): boolean => {
    const parsed = /^(.+?)\.(ilike|imatch)\.(.*)$/.exec(condition);
    if (!parsed) throw new Error(`unparseable condition: ${condition}`);
    const [, column = "", operator, value = ""] = parsed;
    const haystack = fieldOf(row, column);
    if (operator === "imatch") {
      return new RegExp(value.replace(/\\y/g, "\\b"), "i").test(haystack);
    }
    const term = value.replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1");
    return haystack.toLowerCase().includes(term.toLowerCase());
  };

  /** `current_published_missions()`: highest version with a published module and course. */
  const currentMissions = () => {
    const current = new Map<string, { mission: Row; course: Row }>();
    for (const mission of world.missions) {
      const module = world.learning_modules.find((entry) => entry.id === mission.module_id);
      const course = world.courses.find((entry) => entry.id === module?.course_id);
      if (!published(mission) || !published(module) || !published(course) || !course) continue;
      const incumbent = current.get(String(mission.stable_id));
      if (!incumbent || Number(mission.version) > Number(incumbent.mission.version)) {
        current.set(String(mission.stable_id), { mission, course });
      }
    }
    return [...current.values()].sort((a, b) =>
      String(a.mission.stable_id) < String(b.mission.stable_id) ? -1 : 1
    );
  };

  const stepMatches = (body: string, args: Record<string, unknown>): boolean =>
    ((args.p_phrases as string[]) ?? []).some((phrase) =>
      body.toLowerCase().includes(phrase.trim().toLowerCase())
    ) ||
    ((args.p_acronyms as string[]) ?? [])
      .filter((term) => /^[A-Za-z0-9]+$/.test(term))
      .some((term) => new RegExp(`\\b${term}s?\\b`, "i").test(body));

  const rpcRows = (name: string, args: Record<string, unknown>): Row[] => {
    const after = options.ignoreCursor ? null : (args.p_after as string | null);
    const pageSize = Math.min(Math.max(Number(args.p_page_size ?? 50), 1), 100);
    const missions = currentMissions().filter(
      ({ mission }) => after === null || String(mission.stable_id) > after
    );

    if (name === "search_published_mission_steps") {
      const rows: Row[] = [];
      for (const { mission, course } of missions) {
        const step = world.mission_steps
          .filter((entry) => entry.mission_id === mission.id)
          .sort((a, b) => Number(a.position) - Number(b.position))
          .find((entry) => stepMatches(stepSearchableText(entry.payload as Row), args));
        if (!step) continue;
        rows.push({
          mission_stable_id: mission.stable_id,
          mission_version: mission.version,
          mission_title: mission.title,
          mission_description: mission.description,
          mission_publication_state: mission.publication_state,
          mission_updated_at: mission.updated_at,
          course_title: course.title,
          step_stable_id: step.stable_id,
          step_position: step.position,
          step_payload: step.payload
        });
      }
      return rows.slice(0, pageSize);
    }

    if (name === "published_mission_contexts") {
      const wanted = (args.p_stable_ids as string[]) ?? [];
      return missions
        .filter(({ mission }) => wanted.includes(String(mission.stable_id)))
        .map(({ mission, course }) => ({
          mission_stable_id: mission.stable_id,
          mission_version: mission.version,
          mission_title: mission.title,
          course_title: course.title
        }))
        .slice(0, pageSize);
    }

    throw new Error(`unexpected database function: ${name}`);
  };

  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      reads.push({ table: `rpc:${name}`, select: "", eqs: [], args });
      return Promise.resolve({ data: cap(rpcRows(name, args)), error: null });
    },
    from: (table: keyof World) => {
      const record: ReadRecord = { table, select: "", eqs: [] };
      let narrowed: { column: string; values: unknown[] } | undefined;
      const orders: Array<{ column: string; descending: boolean }> = [];
      let offset = 0;
      const builder: Record<string, unknown> = {};
      builder.select = (columns: string) => {
        record.select = columns;
        return builder;
      };
      builder.eq = (column: string, value: unknown) => {
        record.eqs.push([column, value]);
        return builder;
      };
      builder.or = (value: string) => {
        record.or = value;
        return builder;
      };
      builder.in = (column: string, values: unknown[]) => {
        narrowed = { column, values };
        return builder;
      };
      builder.order = (column: string, order?: { ascending?: boolean }) => {
        orders.push({ column, descending: order?.ascending === false });
        return builder;
      };
      builder.range = (from: number, to: number) => {
        offset = from;
        return (builder.limit as (value: number) => unknown)(to - from + 1);
      };
      builder.limit = (value: number) => {
        record.limit = value;
        reads.push(record);

        let rows = world[table].filter((row) => visible(row));

        if (!hostile) {
          rows = rows.filter((row) =>
            record.eqs.every(([column, expected]) => {
              if (column.includes(".")) {
                const [parent = "", child = ""] = column.split(".");
                return (row[parent] as Row | undefined)?.[child] === expected;
              }
              return row[column] === expected;
            })
          );
        }
        if (record.or) {
          const conditions = record.or.split(",");
          rows = rows.filter((row) => conditions.some((c) => matches(row, c)));
        }
        if (narrowed) {
          const { column, values } = narrowed;
          rows = rows.filter((row) => values.includes(row[column]));
        }
        if (orders.length > 0) {
          rows = [...rows].sort((a, b) => {
            for (const { column, descending } of orders) {
              const left = a[column] as string | number;
              const right = b[column] as string | number;
              if (left === right) continue;
              const ascending = left < right ? -1 : 1;
              return descending ? -ascending : ascending;
            }
            return 0;
          });
        }

        return Promise.resolve({ data: rows.slice(offset, offset + value), error: null });
      };
      return builder;
    }
  };

  let tokenSeen = "";
  return {
    factory: (token: string) => {
      tokenSeen = token;
      return client;
    },
    reads,
    token: () => tokenSeen
  };
}

async function search(
  world: World,
  input: CurriculumSearchInput,
  options: DatabaseOptions = {}
) {
  const { createUserScopedSupabaseClient } = await import("./supabase");
  const db = database(world, options);
  vi.mocked(createUserScopedSupabaseClient).mockImplementation(db.factory as never);
  const { searchCurriculum } = await import("./curriculum-search");
  const results = await searchCurriculum(ACCESS_TOKEN, input);
  return { results, db };
}

const idsOf = (results: { results: { sourceRecordStableId: string }[] }) =>
  results.results.map((result) => result.sourceRecordStableId);

/* ------------------------------------------------------------------ *
 * Fixture world — placeholder text in the shape of the real content
 * ------------------------------------------------------------------ */

function networkingWorld(): World {
  const path = node("it-foundations", "IT and Cybersecurity Foundations");
  const course = node("networking-foundations", "Networking Foundations", {
    learning_path_id: path.id,
    description: "Understand how one network carries traffic."
  });
  const sharp = node("course-sharp-habits", "Sharp troubleshooting habits", {
    learning_path_id: path.id,
    description: "Keep your diagnostic skills sharp."
  });
  const module = node("nf-mod2-addresses-and-boundaries", "Addresses and boundaries", {
    course_id: course.id
  });

  const mission4 = node("nf-m4-the-prefix-and-the-decision", "The prefix and the decision", {
    module_id: module.id,
    description: "Decide whether a destination is on the local network."
  });
  const spelledOut = node("nf-fixture-resolution-spelled-out", "Resolving local addresses", {
    module_id: module.id,
    description: "Find the hardware address of a neighbour."
  });
  const draft = node("nf-fixture-draft", "A draft mission", {
    module_id: module.id,
    publication_state: "draft"
  });

  const windows = node("windows-domain-foundations", "Windows Domain Foundations", {
    learning_path_id: path.id
  });
  const advanced = node("course-advanced-addressing", "Advanced addressing", {
    learning_path_id: path.id,
    description: "Upload and broadcast addresses, read carefully."
  });
  const domainModule = node("wd-mod1-domains", "Domains", { course_id: windows.id });
  const domains = node("wd-m1-domains-and-forests", "Domains and forests", {
    module_id: domainModule.id,
    description: "Plan an Active Directory forest."
  });

  return {
    learning_paths: [path],
    courses: [course, sharp, windows, advanced],
    learning_modules: [module, domainModule],
    missions: [mission4, spelledOut, draft, domains],
    competencies: [
      node("ad.replication", "AD replication", {
        description: "How domain controllers copy changes."
      })
    ],
    mission_steps: [
      step(mission4, 0, {
        type: "concept",
        title: "Asking for the hardware address",
        paragraphs: [
          "PC-A needs a MAC address before it can build the frame.",
          "The request PC-A sent is called ARP. It asks which MAC address belongs to a local IPv4 address."
        ]
      }),
      step(mission4, 1, {
        type: "concept",
        paragraphs: ["The frobnicator is a placeholder word that appears only in this step."]
      }),
      step(mission4, 2, {
        type: "prediction",
        prompt: "What will PC-A do next?",
        expectedOutcome: "It sends an obsidianlynx request."
      }),
      step(spelledOut, 0, {
        type: "concept",
        paragraphs: ["This mission spells out the Address Resolution Protocol in full."]
      }),
      step(draft, 0, {
        type: "concept",
        paragraphs: ["zephyrquokka appears only in an unpublished step."]
      })
    ]
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("criterion 1: ARP and Address Resolution Protocol return the same results", () => {
  it("returns the same set, including Networking Foundations Mission 4", async () => {
    const world = networkingWorld();
    const acronym = await search(world, { query: "ARP" });
    const expanded = await search(world, { query: "address resolution protocol" });

    expect(new Set(idsOf(expanded.results))).toEqual(new Set(idsOf(acronym.results)));
    expect(idsOf(acronym.results)).toContain("nf-m4-the-prefix-and-the-decision");
    expect(idsOf(acronym.results)).toContain("nf-fixture-resolution-spelled-out");
  });

  it("tells the learner both terms were searched", async () => {
    const { results } = await search(networkingWorld(), { query: "ARP" });

    expect(results.queryAdjustment).toEqual({
      originalQuery: "ARP",
      effectiveQuery: "Address Resolution Protocol",
      adjustmentKind: "alias"
    });
  });
});

describe("criterion 2: arp gives the same results as ARP", () => {
  it("returns the identical result list and issues the identical reads", async () => {
    const world = networkingWorld();
    const upper = await search(world, { query: "ARP" });
    const lower = await search(world, { query: "arp" });

    expect(idsOf(lower.results)).toEqual(idsOf(upper.results));
    expect(lower.db.reads.map((read) => [read.or, read.args])).toEqual(
      upper.db.reads.map((read) => [read.or, read.args])
    );
  });
});

describe("criterion 3: sharp does not return ARP results", () => {
  it("searching sharp finds the sharp course and no ARP lesson", async () => {
    const { results } = await search(networkingWorld(), { query: "sharp" });

    expect(idsOf(results)).toEqual(["course-sharp-habits"]);
    expect(idsOf(results)).not.toContain("nf-m4-the-prefix-and-the-decision");
  });

  it("searching ARP never matches the word sharp", async () => {
    const { results } = await search(networkingWorld(), { query: "ARP" });

    expect(idsOf(results)).not.toContain("course-sharp-habits");
  });

  function embeddedWorld(): World {
    const world = networkingWorld();
    const path = world.learning_paths[0] as Row;
    world.courses.push(
      node("course-sharpshooting", "Sharpshooting drills", {
        learning_path_id: path.id,
        description: "Practise sharpshooting."
      }),
      node("course-sharps-edge", "The sharp's edge", {
        learning_path_id: path.id,
        description: "Keep a sharp's edge on your skills."
      })
    );
    return world;
  }

  for (const query of ["ARPs", "ARP's", "ARP’s"]) {
    it(`${query} finds the ARP lesson and never an embedded substring`, async () => {
      const { results, db } = await search(embeddedWorld(), { query });

      expect(idsOf(results)).toContain("nf-m4-the-prefix-and-the-decision");
      expect(idsOf(results)).not.toContain("course-sharpshooting");
      expect(idsOf(results)).not.toContain("course-sharps-edge");
      expect(idsOf(results)).not.toContain("course-sharp-habits");
      for (const read of db.reads) {
        expect(read.or ?? "").not.toMatch(/ilike\.%ARP/i);
      }
      // The step-search function receives the acronym as a whole word only.
      for (const read of db.reads.filter((entry) => entry.table === STEP_RPC)) {
        expect(read.args?.p_acronyms).toEqual(["ARP"]);
        expect(read.args?.p_phrases).not.toContainEqual(expect.stringMatching(/^arp/i));
      }
    });
  }
});

describe("ranking judges a match by the rule that found it", () => {
  /**
   * Two missions matched ONLY through their steps. The one whose title embeds
   * "arp" ("Sharp skills") sorts LATER neutrally, so if ranking credited that
   * substring as title precision it would jump ahead.
   */
  function stepOnlyWorld(): World {
    const world = networkingWorld();
    const module = world.learning_modules[0] as Row;
    const plain = node("nf-fixture-a-plain", "Listening on the wire", {
      module_id: module.id,
      description: "Watch what a host sends."
    });
    const sharp = node("nf-fixture-z-sharp", "Sharp skills", {
      module_id: module.id,
      description: "Practise reading captures."
    });
    world.missions.push(plain, sharp);
    world.mission_steps.push(
      step(plain, 0, { type: "concept", paragraphs: ["The host sends an ARP request."] }),
      step(sharp, 0, { type: "concept", paragraphs: ["An ARP reply comes back."] })
    );
    return world;
  }

  it("a step-only match under a title embedding the acronym keeps the stable order", async () => {
    const { results } = await search(stepOnlyWorld(), { query: "ARP" });
    const ids = idsOf(results);

    expect(ids).toContain("nf-fixture-a-plain");
    expect(ids).toContain("nf-fixture-z-sharp");
    expect(ids.indexOf("nf-fixture-a-plain")).toBeLessThan(
      ids.indexOf("nf-fixture-z-sharp")
    );
  });

  /**
   * A course that names ARP in its plural or possessive form matches the
   * learner's own query, so it must rank in the exact tier, above a course that
   * only matched the spelled-out alias — even though the alias course sorts
   * first neutrally.
   */
  function pluralWorld(): World {
    const world = networkingWorld();
    const path = world.learning_paths[0] as Row;
    world.courses.push(
      node("course-a-alias-only", "Neighbour discovery", {
        learning_path_id: path.id,
        description: "The Address Resolution Protocol, step by step."
      }),
      node("course-b-acronym", "Reading captures", {
        learning_path_id: path.id,
        description: "Two ARP requests were sent."
      })
    );
    return world;
  }

  for (const query of ["ARPs", "ARP's"]) {
    it(`${query} ranks the acronym match above the alias-only match`, async () => {
      const { results } = await search(pluralWorld(), { query });
      const ids = idsOf(results);

      expect(ids).toContain("course-a-alias-only");
      expect(ids).toContain("course-b-acronym");
      expect(ids.indexOf("course-b-acronym")).toBeLessThan(
        ids.indexOf("course-a-alias-only")
      );
    });
  }
});

describe("criterion 4: a term only in a step body returns that step's mission", () => {
  it("returns the mission with a snippet containing the term", async () => {
    const { results } = await search(networkingWorld(), { query: "frobnicator" });

    expect(idsOf(results)).toEqual(["nf-m4-the-prefix-and-the-decision"]);
    const location = results.matchLocations?.[0];
    expect(location).toMatchObject({
      documentId: results.results[0]?.documentId,
      foundIn: "step",
      trail: [
        { kind: "course", title: "Networking Foundations" },
        { kind: "mission", title: "The prefix and the decision" },
        { kind: "step", title: "Step 2" }
      ]
    });
    expect(location?.snippet?.match).toBe("frobnicator");
    expect(
      `${location?.snippet?.before}${location?.snippet?.match}${location?.snippet?.after}`
    ).toContain("The frobnicator is a placeholder word");
  });

  it("names a titled step by its own title, and marks the acronym as written", async () => {
    const { results } = await search(networkingWorld(), { query: "ARP" });
    const index = idsOf(results).indexOf("nf-m4-the-prefix-and-the-decision");
    const location = results.matchLocations?.[index];

    expect(location?.trail.at(-1)).toEqual({
      kind: "step",
      title: "Asking for the hardware address"
    });
    expect(location?.snippet?.match).toBe("ARP");
  });

  it("a record match is located in its own title or description", async () => {
    const { results } = await search(networkingWorld(), { query: "Active Directory" });
    const index = idsOf(results).indexOf("wd-m1-domains-and-forests");

    expect(results.matchLocations?.[index]).toMatchObject({
      foundIn: "description",
      trail: [
        { kind: "course", title: "Windows Domain Foundations" },
        { kind: "mission", title: "Domains and forests" }
      ],
      snippet: { match: "Active Directory" }
    });
  });

  it("a location never carries an internal identifier or a ranking internal", async () => {
    const { results } = await search(networkingWorld(), { query: "ARP" });
    const serialized = JSON.stringify(results.matchLocations);

    expect(serialized).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    for (const forbidden of ["matchKind", "score", "relevance", "titlePrecision"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("criterion 5: text from an unpublished step is never returned", () => {
  it("a word that exists only in an unpublished step finds nothing", async () => {
    const { results } = await search(networkingWorld(), { query: "zephyrquokka" });

    expect(results.count).toBe(0);
    expect(JSON.stringify(results)).not.toContain("zephyrquokka");
  });

  it("even a database returning unpublished rows cannot surface them", async () => {
    const { results } = await search(
      networkingWorld(),
      { query: "zephyrquokka" },
      { hostile: true }
    );

    expect(results.count).toBe(0);
    expect(JSON.stringify(results)).not.toContain("zephyrquokka");
    expect(idsOf(results)).not.toContain("nf-fixture-draft");
  });

  it("a withheld, answer-bearing step field is never searched or quoted", async () => {
    const { results, db } = await search(networkingWorld(), { query: "obsidianlynx" });

    expect(results.count).toBe(0);
    expect(JSON.stringify(results)).not.toContain("obsidianlynx");
    const stepRead = db.reads.find((read) => read.table === STEP_RPC);
    expect(Object.keys(stepRead?.args ?? {}).sort()).toEqual([
      "p_acronyms",
      "p_after",
      "p_page_size",
      "p_phrases"
    ]);
  });

  it("every read states the publication requirement and uses the caller's token", async () => {
    const { db } = await search(networkingWorld(), { query: "ARP" });

    expect(db.token()).toBe(ACCESS_TOKEN);
    const functionReads = db.reads.filter((read) => read.table.startsWith("rpc:"));
    expect(functionReads.map((read) => read.table)).toContain(STEP_RPC);
    for (const read of functionReads) {
      expect([STEP_RPC, CONTEXT_RPC]).toContain(read.table);
      expect(read.args?.p_page_size).toBe(STEP_SEARCH_PAGE_SIZE);
    }

    for (const read of db.reads.filter((entry) => !entry.table.startsWith("rpc:"))) {
      expect(read.eqs).toContainEqual(["publication_state", "published"]);
      expect(read.limit).toBeGreaterThan(0);
    }
  });

  it("the step search path has no service-role client and writes nothing", () => {
    const source = readFileSync(
      new URL("./curriculum-step-search.ts", import.meta.url),
      "utf8"
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    expect(code).not.toContain("createServerSupabaseClient");
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".from("]) {
      expect(code).not.toContain(write);
    }
    // One call site, reached only with the two read-only search functions,
    // whose SQL `wp005-step-search-sql.test.ts` checks.
    expect(code.match(/\.rpc\(/g)).toHaveLength(1);
    expect(code).toContain('STEP_SEARCH_FUNCTION = "search_published_mission_steps"');
    expect(code).toContain('MISSION_CONTEXT_FUNCTION = "published_mission_contexts"');
  });
});

describe("criterion 6: DHCP returns the honest empty result, not an error", () => {
  it("resolves with zero results and no error", async () => {
    const { results } = await search(networkingWorld(), { query: "DHCP" });

    expect(results.results).toEqual([]);
    expect(results.count).toBe(0);
    expect(results).not.toHaveProperty("matchLocations");
  });

  it("the expanded form is just as honestly empty", async () => {
    const { results } = await search(networkingWorld(), {
      query: "Dynamic Host Configuration Protocol"
    });

    expect(results.count).toBe(0);
  });
});

describe("criterion 7: AD and Active Directory still return the same results", () => {
  it("returns the same set", async () => {
    const world = networkingWorld();
    const acronym = await search(world, { query: "AD" });
    const expanded = await search(world, { query: "Active Directory" });

    expect(new Set(idsOf(acronym.results))).toEqual(new Set(idsOf(expanded.results)));
    expect(idsOf(acronym.results).sort()).toEqual([
      "ad.replication",
      "wd-m1-domains-and-forests"
    ]);
  });

  it("AD never matches advanced, addressing, upload, broadcast or read", async () => {
    const { results } = await search(networkingWorld(), { query: "AD" });

    expect(idsOf(results)).not.toContain("course-advanced-addressing");
  });
});

describe("criterion 8: every alias pair resolves both directions, end to end", () => {
  /**
   * For every ordered pair (from, to) in every group of the checked-in data
   * set: a published mission whose ONLY mention is `to`, in a step body, is
   * found by searching `from`.
   */
  it("finds a step that names only the other member", async () => {
    const groups = approvedSearchAliasGroups();
    let checked = 0;

    for (const group of groups) {
      for (const from of group.members) {
        for (const to of group.members) {
          if (from === to) continue;
          const course = node("fixture-course", "Fixture course");
          const module = node("fixture-module", "Fixture module", { course_id: course.id });
          const mission = node("fixture-mission", "Fixture mission", { module_id: module.id });
          const world: World = {
            learning_paths: [],
            courses: [course],
            learning_modules: [module],
            missions: [mission],
            competencies: [],
            mission_steps: [
              step(mission, 0, {
                type: "concept",
                paragraphs: [`This lesson mentions ${to} once.`]
              })
            ]
          };

          vi.resetModules();
          const { results } = await search(world, { query: from });
          expect(idsOf(results), `${from} -> ${to}`).toEqual(["fixture-mission"]);
          checked += 1;
        }
      }
    }

    expect(checked).toBeGreaterThan(groups.length * 2 - 1);
  });
});

describe("ranking: title matches, then alias matches, then step-body matches", () => {
  function rankingWorld(reverse = false): World {
    const course = node("networking-foundations", "Networking Foundations");
    const module = node("nf-mod", "Module", { course_id: course.id });
    const titleMatch = node("course-arp-fundamentals", "ARP fundamentals", {
      description: "Start here."
    });
    const aliasMatch = node("nf-mission-protocol", "Address Resolution Protocol in practice", {
      module_id: module.id
    });
    const stepOnlyA = node("nf-mission-a", "Local delivery", { module_id: module.id });
    const stepOnlyB = node("nf-mission-b", "Building the frame", { module_id: module.id });
    const order = <T>(items: T[]) => (reverse ? [...items].reverse() : items);

    return {
      learning_paths: [],
      courses: order([course, titleMatch]),
      learning_modules: [module],
      missions: order([aliasMatch, stepOnlyA, stepOnlyB]),
      competencies: [],
      mission_steps: order([
        step(stepOnlyB, 0, { type: "concept", paragraphs: ["Then ARP answers."] }),
        step(stepOnlyA, 0, { type: "concept", paragraphs: ["First, ARP asks."] })
      ])
    };
  }

  it("orders the bands and keeps ties in the stable neutral order", async () => {
    const { results } = await search(rankingWorld(), { query: "ARP" });

    expect(idsOf(results)).toEqual([
      "course-arp-fundamentals",
      "nf-mission-protocol",
      "nf-mission-a",
      "nf-mission-b"
    ]);
    expect(results.matchLocations?.map((location) => location.foundIn)).toEqual([
      "title",
      "title",
      "step",
      "step"
    ]);
  });

  it("is deterministic whatever order the database returns rows in", async () => {
    const forward = await search(rankingWorld(), { query: "ARP" });
    vi.resetModules();
    const reversed = await search(rankingWorld(true), { query: "ARP" });

    expect(idsOf(reversed.results)).toEqual(idsOf(forward.results));
  });

  it("a step-body match is never truncated in favour of nothing, and never outranks a record", async () => {
    const { results } = await search(rankingWorld(), { query: "ARP", limit: 2 });

    expect(idsOf(results)).toEqual(["course-arp-fundamentals", "nf-mission-protocol"]);
    expect(results.matchLocations).toHaveLength(2);
  });

  it("facets still count exactly the returned results, step matches included", async () => {
    const { results } = await search(rankingWorld(), { query: "ARP" });
    const total = (results.facets?.contentTypes ?? []).reduce(
      (sum, facet) => sum + facet.count,
      0
    );

    expect(total).toBe(results.count);
    expect(results.matchLocations).toHaveLength(results.count);
  });

  it("a content-type filter removes step matches like any other mission", async () => {
    const { results } = await search(rankingWorld(), {
      query: "ARP",
      contentTypes: ["course"]
    });

    expect(idsOf(results)).toEqual(["course-arp-fundamentals"]);
  });
});

describe("version resolution for step matches", () => {
  it("surfaces only the highest published version of a mission", async () => {
    const course = node("c", "Course");
    const module = node("m", "Module", { course_id: course.id });
    const v1 = node("nf-mission", "Old title", { module_id: module.id, version: 1 });
    const v2 = node("nf-mission", "New title", { module_id: module.id, version: 2 });
    const world: World = {
      learning_paths: [],
      courses: [course],
      learning_modules: [module],
      missions: [v1, v2],
      competencies: [],
      mission_steps: [
        step(v1, 0, { type: "concept", paragraphs: ["Only the old version says quasarword."] })
      ]
    };

    const { results } = await search(world, { query: "quasarword" });

    // The current version no longer teaches it, so the stale step is not shown.
    expect(results.count).toBe(0);
  });
});

describe("step retrieval sees the decoded text the re-check matches", () => {
  /**
   * The database function matches decoded, whitespace-compacted text, never a
   * field's escaped JSON. These cases run against real PostgreSQL in
   * `curriculum-step-search.db.test.ts`; here they pin the service's handling.
   */
  function oneStepWorld(payload: Row): World {
    const course = node("c", "Course");
    const module = node("m", "Module", { course_id: course.id });
    const mission = node("mission-escaped", "Escaped", { module_id: module.id });
    return {
      learning_paths: [],
      courses: [course],
      learning_modules: [module],
      missions: [mission],
      competencies: [],
      mission_steps: [step(mission, 0, { type: "concept", ...payload })]
    };
  }

  const cases: Array<{ name: string; payload: Row; query: string; match: string }> = [
    {
      name: "a quoted phrase in a paragraph",
      payload: {
        paragraphs: [
          "This is the habit worth taking away, and it costs nothing to apply: after any result, ask what else would have produced exactly the same thing. If the answer is \"quite a lot\", you have not learned as much as it feels like you have."
        ]
      },
      query: 'answer is "quite a lot"',
      match: 'answer is "quite a lot"'
    },
    {
      name: "a backslash path in a paragraph",
      payload: { paragraphs: ["Open C:\\Windows\\System32 and look around."] },
      query: "C:\\Windows\\System32",
      match: "C:\\Windows\\System32"
    },
    {
      name: "a phrase across a newline and tab in a paragraph",
      payload: { paragraphs: ["Each hop reads the\n\trouting   table before forwarding."] },
      query: "reads the routing table",
      match: "reads the routing table"
    },
    {
      name: "a phrase across repeated spaces in a string field",
      payload: { title: "Reading   the\nforwarding decision" },
      query: "the forwarding decision",
      match: "the forwarding decision"
    },
    {
      name: "a phrase spanning two paragraphs",
      payload: { paragraphs: ["The host checks the cache.", "Then it broadcasts."] },
      query: "cache. Then it",
      match: "cache. Then it"
    },
    {
      name: "an acronym straight after a newline in a paragraph",
      payload: { paragraphs: ["The host is stuck.\nARP resolves the neighbour."] },
      query: "ARP",
      match: "ARP"
    }
  ];

  for (const { name, payload, query, match } of cases) {
    it(`finds ${name}`, async () => {
      const { results } = await search(oneStepWorld(payload), { query });

      expect(idsOf(results)).toEqual(["mission-escaped"]);
      expect(results.matchLocations?.[0]).toMatchObject({
        foundIn: "step",
        snippet: { match }
      });
    });
  }

  it("still never returns a step whose decoded text does not match", async () => {
    const { results } = await search(
      oneStepWorld({ paragraphs: ['The answer is "quite" and then a lot more.'] }),
      { query: 'answer is "quite a lot"' }
    );

    expect(results.count).toBe(0);
  });

  it("an acronym after an escape is still whole-word in the re-check", async () => {
    const { results } = await search(
      oneStepWorld({ paragraphs: ["Keep it\nsharp."] }),
      { query: "ARP" }
    );

    expect(results.count).toBe(0);
  });
});

describe("retrieval bounds never hide an eligible mission", () => {
  function boundsWorld(
    build: (module: Row) => { missions: Row[]; mission_steps: Row[] }
  ): World {
    const course = node("c", "Course");
    const module = node("m", "Module", { course_id: course.id });
    return {
      learning_paths: [],
      courses: [course],
      learning_modules: [module],
      competencies: [],
      ...build(module)
    };
  }

  const matchingSteps = (mission: Row, count: number) =>
    Array.from({ length: count }, (_, position) =>
      step(mission, position, { type: "concept", paragraphs: ["A host sends ARP here."] })
    );

  it("many matching steps in one mission do not crowd out another mission", async () => {
    const world = boundsWorld((module) => {
      const crowded = node("mission-crowded", "Crowded", { module_id: module.id });
      const single = node("mission-single", "Single", { module_id: module.id });
      return {
        missions: [crowded, single],
        mission_steps: [...matchingSteps(crowded, 8), ...matchingSteps(single, 1)]
      };
    });

    const { results } = await search(world, { query: "ARP", limit: 2 });

    expect(idsOf(results).sort()).toEqual(["mission-crowded", "mission-single"]);
  });

  it("matches in a stale version do not crowd out current content", async () => {
    const world = boundsWorld((module) => {
      const staleV1 = node("mission-stale", "Stale", { module_id: module.id, version: 1 });
      const current = node("mission-current", "Current", { module_id: module.id });
      const staleV2 = node("mission-stale", "Stale", { module_id: module.id, version: 2 });
      return {
        missions: [staleV1, current, staleV2],
        mission_steps: [...matchingSteps(staleV1, 8), ...matchingSteps(current, 1)]
      };
    });

    const { results } = await search(world, { query: "ARP", limit: 2 });

    expect(idsOf(results)).toEqual(["mission-current"]);
  });

  it("selects the same missions whatever order rows arrive in beyond the cap", async () => {
    const build = (reverse: boolean) =>
      boundsWorld((module) => {
        const missions = ["mission-1", "mission-2", "mission-3"].map((id) =>
          node(id, id, { module_id: module.id })
        );
        const steps = missions.flatMap((mission) => matchingSteps(mission, 4));
        return { missions, mission_steps: reverse ? steps.reverse() : steps };
      });

    const forward = await search(build(false), { query: "ARP", limit: 2 });
    vi.resetModules();
    const reversed = await search(build(true), { query: "ARP", limit: 2 });

    expect(idsOf(forward.results)).toHaveLength(2);
    expect(idsOf(reversed.results)).toEqual(idsOf(forward.results));
  });

  it("keeps the stable-id order when row ids oppose it across a page boundary", async () => {
    const world = boundsWorld((module) => {
      // Created first, so their row ids sort BEFORE mission-a's.
      const missionZ = node("mission-z", "Zulu", { module_id: module.id });
      const missionY = node("mission-y", "Yankee", { module_id: module.id });
      const missionA = node("mission-a", "Alpha", { module_id: module.id });
      return {
        missions: [missionZ, missionY, missionA],
        mission_steps: [
          ...matchingSteps(missionZ, 4),
          ...matchingSteps(missionY, 4),
          ...matchingSteps(missionA, 1)
        ]
      };
    });

    // A server cap of one row per response forces a page per mission.
    const { results, db } = await search(world, { query: "ARP", limit: 2 }, { maxRows: 1 });

    expect(idsOf(results)).toEqual(["mission-a", "mission-y"]);
    expect(db.reads.filter((read) => read.table === STEP_RPC).length).toBeGreaterThan(1);
  });

  it("a mission with many versions does not starve another of its version", async () => {
    const world = boundsWorld((module) => {
      const versioned = Array.from({ length: 9 }, (_, index) =>
        node("mission-versioned", "Versioned", { module_id: module.id, version: index + 1 })
      );
      const lone = node("mission-lone", "Lone", { module_id: module.id });
      const latest = versioned[versioned.length - 1] as Row;
      return {
        missions: [...versioned, lone],
        mission_steps: [...matchingSteps(latest, 1), ...matchingSteps(lone, 1)]
      };
    });

    const { results } = await search(world, { query: "ARP" });

    expect(idsOf(results).sort()).toEqual(["mission-lone", "mission-versioned"]);
    for (const location of results.matchLocations ?? []) {
      expect(location.foundIn).toBe("step");
      expect(location.trail[0]).toEqual({ kind: "course", title: "Course" });
    }
  });
});

describe("a server row cap never ends a function read early", () => {
  /**
   * Review finding: offset pages sized `stableIds.length * 4` treated a page a
   * server shortened as the last one, so later missions lost their version and
   * course context and their step matches were dropped. Keyset pages read on
   * until an empty page, so any cap only adds pages.
   */
  function cappedWorld(): World {
    const course = node("c", "Capped course");
    const module = node("m", "Module", { course_id: course.id });
    const missions: Row[] = [];
    const steps: Row[] = [];
    for (let index = 0; index < 6; index += 1) {
      const stableId = `mission-step-${index}`;
      // Three published versions each; only the current one teaches ARP.
      const versions = [1, 2, 3].map((version) =>
        node(stableId, `Step mission ${index}`, { module_id: module.id, version })
      );
      missions.push(...versions);
      steps.push(
        step(versions[0] as Row, 0, { type: "concept", paragraphs: ["Ordinary prose."] }),
        step(versions[2] as Row, 0, { type: "concept", paragraphs: ["A host sends ARP here."] })
      );
    }
    for (let index = 0; index < 5; index += 1) {
      for (const version of [1, 2]) {
        missions.push(
          node(`mission-title-${index}`, `ARP by title ${index}`, {
            module_id: module.id,
            version
          })
        );
      }
    }
    return {
      learning_paths: [],
      courses: [course],
      learning_modules: [module],
      missions,
      competencies: [],
      mission_steps: steps
    };
  }

  it("finds every step match and every mission's course when responses are capped", async () => {
    const { results, db } = await search(cappedWorld(), { query: "ARP", limit: 50 }, { maxRows: 2 });

    const ids = idsOf(results);
    for (let index = 0; index < 6; index += 1) expect(ids).toContain(`mission-step-${index}`);
    for (let index = 0; index < 5; index += 1) expect(ids).toContain(`mission-title-${index}`);
    for (const location of results.matchLocations ?? []) {
      expect(location.trail[0]).toEqual({ kind: "course", title: "Capped course" });
    }
    // More than one page of each, and every page after the first is keyed on
    // the last stable id already received.
    const stepPages = db.reads.filter((read) => read.table === STEP_RPC);
    const contextPages = db.reads.filter((read) => read.table === CONTEXT_RPC);
    expect(stepPages.length).toBeGreaterThan(2);
    expect(contextPages.length).toBeGreaterThan(2);
    expect(stepPages[0]?.args?.p_after).toBeNull();
    expect(stepPages[1]?.args?.p_after).toBe("mission-step-1");
  });

  it("returns the same results capped and uncapped", async () => {
    const uncapped = await search(cappedWorld(), { query: "ARP", limit: 50 });
    vi.resetModules();
    const capped = await search(cappedWorld(), { query: "ARP", limit: 50 }, { maxRows: 1 });

    expect(idsOf(capped.results)).toEqual(idsOf(uncapped.results));
    expect(capped.results.matchLocations).toEqual(uncapped.results.matchLocations);
  });

  it("a server that ignores the cursor fails closed instead of looping", async () => {
    await expect(
      search(cappedWorld(), { query: "ARP" }, { maxRows: 2, ignoreCursor: true })
    ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });
});

describe("performance: the service's own work stays well inside 500 ms", () => {
  /**
   * In-process only. This measures the service's resolution, ranking and
   * location work over a fixture larger than today's content. It does NOT
   * measure PostgreSQL; `curriculum-step-search.db.test.ts` does, in CI.
   */
  it("searches 800 published steps in under 500 ms", async () => {
    const course = node("c", "Course");
    const module = node("m", "Module", { course_id: course.id });
    const missions = Array.from({ length: 40 }, (_, index) =>
      node(`mission-${String(index).padStart(2, "0")}`, `Mission ${index}`, {
        module_id: module.id
      })
    );
    const world: World = {
      learning_paths: [],
      courses: [course],
      learning_modules: [module],
      missions,
      competencies: [],
      mission_steps: missions.flatMap((mission) =>
        Array.from({ length: 20 }, (_, position) =>
          step(mission, position, {
            type: "concept",
            paragraphs: [
              position === 7
                ? "A host sends ARP to find a neighbour."
                : "Ordinary instructional prose about frames and switches."
            ]
          })
        )
      )
    };

    const started = performance.now();
    const { results } = await search(world, { query: "ARP", limit: 100 });
    const elapsed = performance.now() - started;

    expect(results.count).toBe(40);
    expect(elapsed).toBeLessThan(500);
  });
});
