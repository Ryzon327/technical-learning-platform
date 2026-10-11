import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurriculumSearchInput } from "./curriculum-search";
import { RECORD_SEARCH_PAGE_SIZE } from "./curriculum-record-search";
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
  args?: Record<string, unknown>;
}

const STEP_RPC = "rpc:search_published_mission_steps";
const CONTEXT_RPC = "rpc:published_mission_contexts";
const RECORD_RPC = "rpc:search_published_curriculum_records";
const RECORD_SOURCES = ["learning_paths", "courses", "missions", "competencies"];

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
  /**
   * Answers the Nth (0-based) call of the named function with `data` and no
   * error, as a broken server might, instead of a page of rows.
   */
  missingData?: { fn: string; page: number; data: unknown };
}

/**
 * The stand-in database.
 *
 * `hostile` turns OFF both the modelled policies and every function's own
 * publication requirement, which is what a broken policy plus a forgotten
 * filter would look like. Text matching still applies. It exists to prove the
 * service's own re-checks, not to describe real behaviour.
 *
 * Founder direction G-005: titles and descriptions are matched by the
 * `search_published_curriculum_records` function
 * (`20261012000100_curriculum_record_search_function.sql`), modelled here
 * with the same rules as the step-search function.
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

  /** The function's snippet: 60 characters before the earliest match, 100 after. */
  const snippetOf = (body: string, args: Record<string, unknown>): string | null => {
    const hits: Array<{ at: number; length: number }> = [];
    for (const phrase of (args.p_phrases as string[]) ?? []) {
      const needle = phrase.trim().toLowerCase();
      const at = needle === "" ? -1 : body.toLowerCase().indexOf(needle);
      if (at >= 0) hits.push({ at, length: needle.length });
    }
    for (const term of ((args.p_acronyms as string[]) ?? []).filter((value) =>
      /^[A-Za-z0-9]+$/.test(value)
    )) {
      const found = new RegExp(`\\b${term}s?\\b`, "i").exec(body);
      if (found) hits.push({ at: found.index, length: found[0].length });
    }
    hits.sort((a, b) => a.at - b.at || b.length - a.length);
    const first = hits[0];
    if (!first) return null;
    const from = Math.max(0, first.at - 60);
    const to = first.at + first.length + 100;
    return `${from > 0 ? "…" : ""}${body.slice(from, to)}${to < body.length ? "…" : ""}`;
  };

  const rpcRows = (name: string, args: Record<string, unknown>): Row[] => {
    const after = options.ignoreCursor ? null : (args.p_after as string | null);
    const pageSize = Math.min(Math.max(Number(args.p_page_size ?? 50), 1), 100);

    // G-005 `search_published_curriculum_records`: the title or the
    // description of one source, one row per stable id at its highest
    // matching version, in stable-id order.
    if (name === "search_published_curriculum_records") {
      const source = String(args.p_source);
      if (!RECORD_SOURCES.includes(source)) throw new Error(`unknown source: ${source}`);
      const highest = new Map<string, Row>();
      for (const row of world[source as keyof World]) {
        if (!visible(row)) continue;
        if (!["title", "description"].some((field) => stepMatches(fieldOf(row, field), args))) {
          continue;
        }
        const incumbent = highest.get(String(row.stable_id));
        if (!incumbent || Number(row.version) > Number(incumbent.version)) {
          highest.set(String(row.stable_id), row);
        }
      }
      return [...highest.values()]
        .sort((a, b) => (String(a.stable_id) < String(b.stable_id) ? -1 : 1))
        .filter((row) => after === null || String(row.stable_id) > after)
        .slice(0, pageSize)
        .map((row) => ({
          stable_id: row.stable_id,
          version: row.version,
          title: row.title,
          description: row.description,
          publication_state: row.publication_state,
          updated_at: row.updated_at
        }));
    }

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
        const payload = step.payload as Row;
        const text = (field: string) =>
          typeof payload[field] === "string" ? payload[field] : null;
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
          step_title: text("title"),
          step_label: text("label"),
          step_snippet: snippetOf(stepSearchableText(payload), args)
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
      reads.push({ table: `rpc:${name}`, args });
      const missing = options.missingData;
      if (
        missing?.fn === name &&
        reads.filter((read) => read.table === `rpc:${name}`).length - 1 === missing.page
      ) {
        return Promise.resolve({ data: missing.data, error: null });
      }
      return Promise.resolve({ data: cap(rpcRows(name, args)), error: null });
    }
    // No `from`: since G-005 every search read is a database function, so a
    // direct table read would fail here.
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
    expect(lower.db.reads.map((read) => [read.table, read.args])).toEqual(
      upper.db.reads.map((read) => [read.table, read.args])
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
      // Both search functions receive the acronym as a whole word only.
      const searches = db.reads.filter((entry) => [STEP_RPC, RECORD_RPC].includes(entry.table));
      expect(searches.filter((entry) => entry.table === RECORD_RPC).length).toBeGreaterThanOrEqual(4);
      for (const read of searches) {
        expect(read.args?.p_acronyms).toEqual(["ARP"]);
        expect(read.args?.p_phrases).not.toContainEqual(expect.stringMatching(/^arp/i));
      }
    });
  }

  /**
   * Review finding: "ARP?" kept the substring pattern "%ARP?%" beside its
   * whole-word pattern, so "Keep your skills sharp?" was found — in a record
   * and, through the phrase "ARP?", in a step body.
   */
  function punctuatedWorld(): World {
    const world = networkingWorld();
    const path = world.learning_paths[0] as Row;
    const module = world.learning_modules[0] as Row;
    world.courses.push(
      node("course-sharp-question", "Sharp questions", {
        learning_path_id: path.id,
        description: "Keep your skills sharp? Stay sharp: always. Are the sharps? Is the sharp's? edge kept? Keep the sharp’s! edge."
      })
    );
    const stepSharp = node("nf-fixture-step-sharp", "Honing", {
      module_id: module.id,
      description: "Practise reading captures."
    });
    world.missions.push(stepSharp);
    world.mission_steps.push(
      step(stepSharp, 0, {
        type: "concept",
        paragraphs: [
          "Keep your skills sharp? Stay sharp: always. Are the sharps? Is the sharp's? edge kept? Keep the sharp’s! edge."
        ]
      })
    );
    return world;
  }

  for (const query of ["ARP?", "ARP:", "ARPs?", "ARP's?", "ARP’s!"]) {
    it(`${query} finds the ARP lesson and never a punctuated substring`, async () => {
      const { results, db } = await search(punctuatedWorld(), { query });

      expect(idsOf(results)).toContain("nf-m4-the-prefix-and-the-decision");
      expect(idsOf(results)).not.toContain("course-sharp-question");
      expect(idsOf(results)).not.toContain("course-sharp-habits");
      expect(idsOf(results)).not.toContain("nf-fixture-step-sharp");
      const searches = db.reads.filter((entry) => [STEP_RPC, RECORD_RPC].includes(entry.table));
      expect(searches.filter((entry) => entry.table === RECORD_RPC).length).toBeGreaterThanOrEqual(4);
      for (const read of searches) {
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
   * Founder direction G-006 supersedes "the acronym match ranks above the
   * alias-only match": both courses match in their description, so neither
   * form outranks the other and the neutral order decides — for the plural
   * and possessive forms exactly as for ARP and the expanded name.
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
    it(`${query} ranks two description matches in the neutral order, whichever form matched`, async () => {
      const { results } = await search(pluralWorld(), { query });
      const ids = idsOf(results);

      expect(ids).toContain("course-a-alias-only");
      expect(ids).toContain("course-b-acronym");
      expect(ids.indexOf("course-a-alias-only")).toBeLessThan(
        ids.indexOf("course-b-acronym")
      );
      for (const other of ["ARP", "Address Resolution Protocol"]) {
        vi.resetModules();
        const { results: same } = await search(pluralWorld(), { query: other });
        expect(idsOf(same), `${query} vs ${other}`).toEqual(ids);
      }
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
      expect([STEP_RPC, CONTEXT_RPC, RECORD_RPC]).toContain(read.table);
      if (read.table === RECORD_RPC) {
        // G-005: the record function states the publication requirement itself
        // (see `wp005-step-search-sql.test.ts`); its page is bounded.
        expect(RECORD_SOURCES).toContain(read.args?.p_source);
        expect(read.args?.p_page_size).toBeGreaterThan(0);
        expect(read.args?.p_page_size).toBeLessThanOrEqual(RECORD_SEARCH_PAGE_SIZE);
      } else {
        expect(read.args?.p_page_size).toBe(STEP_SEARCH_PAGE_SIZE);
      }
    }
    expect(
      functionReads
        .filter((read) => read.table === RECORD_RPC && read.args?.p_after === null)
        .map((read) => read.args?.p_source)
    ).toEqual(RECORD_SOURCES);

    // Every read is one of the three search functions; nothing reads a table.
    expect(db.reads.filter((entry) => !entry.table.startsWith("rpc:"))).toEqual([]);
  });

  it("even a database returning unpublished records cannot surface them", async () => {
    const world = networkingWorld();
    world.courses.push(
      node("course-draft-wordfinch", "Wordfinch drafts", {
        learning_path_id: (world.learning_paths[0] as Row).id,
        publication_state: "draft"
      })
    );
    world.competencies.push(
      node("comp-retired-wordfinch", "Retired wordfinch", { publication_state: "retired" })
    );

    const modelled = await search(world, { query: "wordfinch" });
    vi.resetModules();
    const { results } = await search(world, { query: "wordfinch" }, { hostile: true });

    expect(modelled.results.count).toBe(0);
    expect(results.count).toBe(0);
    expect(JSON.stringify(results)).not.toContain("wordfinch");
  });

  it("the record search path has no service-role client, writes nothing and reads no table", () => {
    const source = readFileSync(
      new URL("./curriculum-record-search.ts", import.meta.url),
      "utf8"
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    expect(code).not.toContain("createServerSupabaseClient");
    for (const write of [".insert(", ".update(", ".upsert(", ".delete(", ".from("]) {
      expect(code).not.toContain(write);
    }
    expect(code.match(/\.rpc\(/g)).toHaveLength(1);
    expect(code).toContain('RECORD_SEARCH_FUNCTION = "search_published_curriculum_records"');
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

/**
 * Founder direction G-005: on UAT, VLAN and vlan returned nothing although
 * course, mission and competency titles say VLAN. Record titles and
 * descriptions are now matched by a database function; real PostgreSQL is
 * `curriculum-step-search.db.test.ts`. This pins the service end to end.
 */
describe("G-005: an acronym or its expanded names find titles and descriptions", () => {
  function vlanWorld(): World {
    const path = node("it-foundations", "IT and Cybersecurity Foundations");
    const course = node("course-router-on-a-stick", "VLANs and Router-on-a-Stick", {
      learning_path_id: path.id,
      description: "Segmentation for a small office."
    });
    const module = node("ros-mod1", "Trunks", { course_id: course.id });
    const mission = node("ros-m1-tagging", "Tagging frames", {
      module_id: module.id,
      description: "Carry each VLAN across one trunk link."
    });
    const sharp = node("course-sharp-habits", "Sharp troubleshooting habits", {
      learning_path_id: path.id,
      description: "Keep your diagnostic skills sharp."
    });
    return {
      learning_paths: [path],
      courses: [course, sharp],
      learning_modules: [module],
      missions: [mission],
      competencies: [
        node("comp-vlan-design", "Design a VLAN plan", {
          description: "Choose identifiers per department."
        })
      ],
      mission_steps: []
    };
  }

  const expected = ["comp-vlan-design", "course-router-on-a-stick", "ros-m1-tagging"];

  for (const query of ["VLAN", "vlan", "VLANs", "Virtual LAN", "Virtual Local Area Network"]) {
    it(`${query} returns the course, mission and competency that name VLAN`, async () => {
      const { results, db } = await search(vlanWorld(), { query });

      expect(idsOf(results).sort()).toEqual(expected);
      for (const read of db.reads.filter((entry) => entry.table === RECORD_RPC)) {
        expect(read.args?.p_acronyms).toEqual(["VLAN"]);
      }
    });
  }

  it("segmentation still returns the Router-on-a-Stick course", async () => {
    const { results } = await search(vlanWorld(), { query: "segmentation" });

    expect(idsOf(results)).toEqual(["course-router-on-a-stick"]);
  });

  it("ARP still never returns sharp", async () => {
    const { results } = await search(vlanWorld(), { query: "ARP" });

    expect(idsOf(results)).toEqual([]);
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

  /**
   * Review finding: "VLANs?" spent the whole variant cap before reaching
   * Virtual Local Area Network. Every punctuated plural and possessive form of
   * every acronym in every three-member group must still find a step that
   * names only another member.
   */
  it("a punctuated plural or possessive acronym finds every other member", async () => {
    const fullGroups = approvedSearchAliasGroups().filter(
      (group) => group.members.length === 3
    );
    expect(fullGroups.length).toBeGreaterThan(0);
    let checked = 0;

    for (const group of fullGroups) {
      for (const acronym of group.members.filter((member) => !/\s/.test(member))) {
        for (const from of [`${acronym}s?`, `${acronym}'s?`, `${acronym}’s!`, `${acronym}s!`]) {
          for (const to of group.members) {
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
    }

    expect(checked).toBeGreaterThanOrEqual(12);
  });

  /**
   * Review finding: "Virtual LANs?" spent the whole variant cap before reaching
   * Virtual Local Area Network. Every punctuated plural and possessive form of
   * every expanded member of every three-member group must still find a step
   * that names only another member — or only itself.
   */
  it("a punctuated plural or possessive expanded name finds every member", async () => {
    const fullGroups = approvedSearchAliasGroups().filter(
      (group) => group.members.length === 3
    );
    expect(fullGroups.length).toBeGreaterThan(0);
    let checked = 0;

    for (const group of fullGroups) {
      for (const expanded of group.members.filter((member) => /\s/.test(member))) {
        for (const from of [`${expanded}s?`, `${expanded}'s?`, `${expanded}’s!`, `${expanded}s!`]) {
          for (const to of group.members) {
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
    }

    expect(checked).toBeGreaterThanOrEqual(24);
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

  /**
   * Review finding: in a typo recovery a description match and a step-only
   * match were both `typo` and `description_only`, so the stable-id order put
   * the step-only mission first and the limit dropped the description match.
   */
  function recoveryWorld(): World {
    const course = node("networking-foundations", "Networking Foundations");
    const module = node("nf-mod", "Module", { course_id: course.id });
    const stepOnly = node("nf-mission-a-step-only", "Alpha", { module_id: module.id });
    const described = node("nf-mission-z-described", "Zulu", {
      module_id: module.id,
      description: "Covers kubectl in depth."
    });
    return {
      learning_paths: [],
      courses: [course],
      learning_modules: [module],
      missions: [stepOnly, described],
      competencies: [],
      mission_steps: [
        step(stepOnly, 0, { type: "concept", paragraphs: ["Run kubectl get pods."] })
      ]
    };
  }

  it("a typo recovery ranks a description match before a step-only match", async () => {
    const { results } = await search(recoveryWorld(), { query: "kubctl" });

    expect(results.queryAdjustment?.adjustmentKind).toBe("typo");
    expect(idsOf(results)).toEqual(["nf-mission-z-described", "nf-mission-a-step-only"]);
    expect(results.matchLocations?.map((location) => location.foundIn)).toEqual([
      "description",
      "step"
    ]);
  });

  it("a typo recovery never truncates a description match for a step-only match", async () => {
    const { results } = await search(recoveryWorld(), { query: "kubctl", limit: 1 });

    expect(results.queryAdjustment?.adjustmentKind).toBe("typo");
    expect(idsOf(results)).toEqual(["nf-mission-z-described"]);
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

/**
 * Founder direction G-006 (2026-10-11): an acronym and its approved expansions
 * are one concept, so every form of an alias group returns the identical
 * ordered results at every limit, ranked by where the match is — title, then
 * description, then step body — with ties in the neutral order.
 *
 * Review finding (independent review 1 of 39b856b): "ARP fundamentals" and
 * "Address Resolution Protocol fundamentals" with limit=1 returned different
 * courses for ARP and Address Resolution Protocol. Here each form has a title
 * match and a description match, and the expanded-name record sorts first
 * neutrally, so the old acronym-first ranking would fail at every limit.
 */
describe("G-006: every form of an alias group returns the identical ordered results", () => {
  function oneConceptWorld(): World {
    const path = node("g006-path", "Fixture path");
    const course = (stableId: string, title: string, description: string) =>
      node(stableId, title, { learning_path_id: path.id, description });
    const host = course("g006-host", "Fixture host course", "Hosts the missions.");
    const module = node("g006-module", "Module", { course_id: host.id });
    const arpStep = node("g006-mission-arp-step", "Listening on the wire", {
      module_id: module.id
    });
    const vlanStep = node("g006-mission-vlan-step", "Separating departments", {
      module_id: module.id
    });

    return {
      learning_paths: [path],
      courses: [
        host,
        course("g006-arp-1-expanded-title", "Address Resolution Protocol fundamentals", "Start here."),
        course("g006-arp-2-acronym-title", "ARP fundamentals", "Start here."),
        course("g006-arp-3-expanded-description", "Neighbour discovery", "The Address Resolution Protocol, step by step."),
        course("g006-arp-4-acronym-description", "Reading captures", "Two ARP requests were sent."),
        course("g006-vlan-1-expanded-title", "Virtual Local Area Network basics", "Start here."),
        course("g006-vlan-2-acronym-title", "VLAN basics", "Start here."),
        course("g006-vlan-3-expanded-description", "Switch configuration", "A Virtual Local Area Network separates departments."),
        course("g006-vlan-4-acronym-description", "Trunk links", "Carry each VLAN across one trunk link.")
      ],
      learning_modules: [module],
      missions: [arpStep, vlanStep],
      competencies: [],
      mission_steps: [
        step(arpStep, 0, { type: "concept", paragraphs: ["The host sends an ARP request."] }),
        step(vlanStep, 0, { type: "concept", paragraphs: ["Each VLAN is its own broadcast domain."] })
      ]
    };
  }

  const groups: Array<{ name: string; forms: string[]; expected: string[] }> = [
    {
      name: "ARP",
      forms: ["ARP", "Address Resolution Protocol", "arp", "address resolution protocol", "ARPs", "ARP's", "ARP?"],
      expected: [
        "g006-arp-1-expanded-title",
        "g006-arp-2-acronym-title",
        "g006-arp-3-expanded-description",
        "g006-arp-4-acronym-description",
        "g006-mission-arp-step"
      ]
    },
    {
      name: "VLAN",
      forms: ["VLAN", "Virtual Local Area Network", "vlan", "Virtual LAN", "VLANs?", "Virtual Local Area Network's"],
      expected: [
        "g006-vlan-1-expanded-title",
        "g006-vlan-2-acronym-title",
        "g006-vlan-3-expanded-description",
        "g006-vlan-4-acronym-description",
        "g006-mission-vlan-step"
      ]
    }
  ];

  for (const group of groups) {
    for (const limit of [1, 2, 3, undefined]) {
      it(`${group.name}: every form returns the identical ordered results at limit ${limit ?? "default (full list)"}`, async () => {
        const expected = limit === undefined ? group.expected : group.expected.slice(0, limit);
        for (const query of group.forms) {
          vi.resetModules();
          const { results } = await search(oneConceptWorld(), {
            query,
            ...(limit === undefined ? {} : { limit })
          });
          expect(idsOf(results), query).toEqual(expected);
        }
      });
    }

    it(`${group.name}: ranks by where the match is — title, description, then step body`, async () => {
      const { results } = await search(oneConceptWorld(), { query: group.forms[0] as string });
      expect(results.matchLocations?.map((location) => location.foundIn)).toEqual([
        "title",
        "title",
        "description",
        "description",
        "step"
      ]);
    });
  }

  it("is deterministic whatever order the database returns rows in", async () => {
    const reversed = (): World => {
      const world = oneConceptWorld();
      return {
        ...world,
        courses: [...world.courses].reverse(),
        missions: [...world.missions].reverse(),
        mission_steps: [...world.mission_steps].reverse()
      };
    };
    for (const query of ["ARP", "Address Resolution Protocol", "VLAN", "Virtual Local Area Network"]) {
      vi.resetModules();
      const forward = await search(oneConceptWorld(), { query });
      vi.resetModules();
      const backward = await search(reversed(), { query });
      expect(idsOf(backward.results), query).toEqual(idsOf(forward.results));
    }
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

    // G-005: the record read pages on past the cap the same way.
    const missionRecordPages = db.reads.filter(
      (read) => read.table === RECORD_RPC && read.args?.p_source === "missions"
    );
    expect(missionRecordPages.length).toBeGreaterThan(2);
    expect(missionRecordPages[0]?.args?.p_after).toBeNull();
    expect(missionRecordPages[1]?.args?.p_after).toBe("mission-title-1");
  });

  it("a record read stops at its bounded over-fetch, never before", async () => {
    const { db } = await search(cappedWorld(), { query: "ARP", limit: 1 }, { maxRows: 2 });

    // limit 1 reads at most 4 matching missions by their own record: two
    // capped pages of two, and no third page.
    const missionRecordPages = db.reads.filter(
      (read) => read.table === RECORD_RPC && read.args?.p_source === "missions"
    );
    expect(missionRecordPages.map((read) => read.args?.p_page_size)).toEqual([4, 2]);
    expect(missionRecordPages.map((read) => read.args?.p_after)).toEqual([
      null,
      "mission-title-1"
    ]);
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

  /**
   * Review finding: a response with no error and no data was read as an empty
   * page — the end of the read. On the first page that reported no step
   * matches; on a later page it returned partial results as complete.
   */
  describe("a response with no rows array fails closed", () => {
    const functions = [
      "search_published_mission_steps",
      "published_mission_contexts",
      "search_published_curriculum_records"
    ];
    for (const fn of functions) {
      for (const page of [0, 1]) {
        for (const data of [null, undefined, { rows: [] }, "[]"]) {
          it(`${fn}, page ${page}, data ${JSON.stringify(data) ?? "undefined"}`, async () => {
            await expect(
              search(
                cappedWorld(),
                { query: "ARP", limit: 50 },
                { maxRows: 2, missingData: { fn, page, data } }
              )
            ).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
          });
        }
      }
    }
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
