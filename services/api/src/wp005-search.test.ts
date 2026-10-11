import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumSearchInput } from "./curriculum-search";
import { approvedSearchAliasGroups } from "./search-aliases";

/**
 * WP-005 — acceptance criteria 1 to 8, through the real `searchCurriculum`.
 *
 * The client factory is mocked with a stand-in database that MODELS the
 * published-only row level security the migrations declare: every curriculum
 * node is readable only when published, and a `mission_steps` row only when its
 * owning mission is published (`20260831000100_mission_steps.sql`). Embedded
 * resources follow the same policies and behave as inner joins.
 *
 * NOT proven here: live PostgreSQL behaviour. The repository still has no live
 * PostgreSQL/RLS harness, so every published-only claim below is a query-level
 * and policy-model claim, not a live-RLS claim. The `imatch` whole-word
 * pattern is approximated with JavaScript's `\b`, which agrees with
 * PostgreSQL's `\y` for the ASCII text used here.
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
}

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

/**
 * The stand-in database.
 *
 * `hostile` turns OFF both the modelled policies and every publication `eq`
 * filter, which is what a broken policy plus a forgotten filter would look
 * like. Text matching still applies. It exists to prove the service's own
 * re-checks, not to describe real behaviour.
 */
function database(world: World, options: { hostile?: boolean } = {}) {
  const reads: ReadRecord[] = [];
  const hostile = options.hostile ?? false;
  const published = (row: Row | undefined) =>
    row !== undefined && (hostile || row.publication_state === "published");

  const visible = (table: keyof World, row: Row): boolean => {
    if (hostile) return true;
    if (table === "mission_steps") {
      return published(world.missions.find((mission) => mission.id === row.mission_id));
    }
    return published(row);
  };

  const fieldOf = (row: Row, column: string): string => {
    if (column.startsWith("payload->>")) {
      const value = (row.payload as Row | undefined)?.[column.slice("payload->>".length)];
      if (value === undefined || value === null) return "";
      return typeof value === "string" ? value : JSON.stringify(value);
    }
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

  const embed = (table: keyof World, select: string, row: Row): Row | undefined => {
    let result: Row = { ...row };
    if (table === "mission_steps" && select.includes("missions!inner(")) {
      const mission = world.missions.find((entry) => entry.id === row.mission_id);
      if (!published(mission) || !mission) return undefined;
      result = {
        ...result,
        missions: {
          stable_id: mission.stable_id,
          version: mission.version,
          publication_state: mission.publication_state
        }
      };
    }
    if (table === "missions" && select.includes("learning_modules!inner(")) {
      const module = world.learning_modules.find((entry) => entry.id === row.module_id);
      const course = world.courses.find((entry) => entry.id === module?.course_id);
      if (!published(module) || !published(course) || !course) return undefined;
      result = {
        ...result,
        learning_modules: {
          courses: {
            stable_id: course.stable_id,
            title: course.title,
            publication_state: course.publication_state
          }
        }
      };
    }
    return result;
  };

  const client = {
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

        let rows = world[table]
          .filter((row) => visible(table, row))
          .map((row) => embed(table, record.select, row))
          .filter((row): row is Row => row !== undefined);

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
  options: { hostile?: boolean } = {}
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
    expect(lower.db.reads.map((read) => read.or)).toEqual(
      upper.db.reads.map((read) => read.or)
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
    const stepRead = db.reads.find((read) => read.table === "mission_steps");
    expect(stepRead?.or).not.toContain("expectedOutcome");
    expect(stepRead?.or).not.toContain("questions");
  });

  it("every read states the publication requirement and uses the caller's token", async () => {
    const { db } = await search(networkingWorld(), { query: "ARP" });

    expect(db.token()).toBe(ACCESS_TOKEN);
    const stepRead = db.reads.find((read) => read.table === "mission_steps");
    expect(stepRead?.eqs).toContainEqual(["missions.publication_state", "published"]);
    expect(stepRead?.select).toContain("missions!inner(");
    for (const condition of stepRead?.or?.split(",") ?? []) {
      expect(condition).toMatch(/^payload->>[A-Za-z]+\.(ilike|imatch)\./);
    }

    for (const read of db.reads.filter((entry) => entry.table !== "mission_steps")) {
      expect(read.eqs).toContainEqual(["publication_state", "published"]);
    }
    for (const read of db.reads) {
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
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".rpc("]) {
      expect(code).not.toContain(write);
    }
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

describe("performance: the service's own work stays well inside 500 ms", () => {
  /**
   * In-process only. This measures the service's matching, resolution,
   * ranking and location work over a fixture larger than today's content. It
   * does NOT measure PostgreSQL; the local-stack timing needs a running
   * database and is recorded as not observed.
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
