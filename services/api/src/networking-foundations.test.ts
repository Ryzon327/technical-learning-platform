import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCurriculumDocument,
  ROAS_COMPETENCIES,
  ROAS_MISSIONS,
  roasMissionsInLearningOrder,
  type CurriculumDocument,
  type CurriculumDocumentMission,
  type MissionCompetencyRelationship
} from "@tlp/shared-types";

/**
 * WP-J / J1 — the Networking Foundations curriculum architecture.
 *
 * ## Why this suite lives in `services/api`
 *
 * It needs three things at once: the REAL curriculum document parser, the REAL
 * Router-on-a-Stick authored content, and the ability to read a file from
 * `content/`. This package already does all three — it is where the publication
 * command lives — and it is the only workspace where they meet without a new
 * dependency or a cross-root import.
 *
 * The document is read from disk rather than imported, deliberately. Importing
 * it would let TypeScript infer a shape from the literal and quietly prove
 * nothing; reading text and handing it to `parseCurriculumDocument` proves the
 * file a reviewer sees is a file the publisher would accept.
 *
 * ## What this suite is for
 *
 * J1 authors architecture, not instruction. So these tests check the things
 * architecture can be wrong about — identity, ordering, competency
 * accountability, and the integrity of the develops/reinforces graph ACROSS the
 * learning path — and check nothing about whether the course teaches well,
 * which is Human UAT and cannot be asserted here (CURR-009 s14a).
 *
 * The absence checks matter as much as the presence ones. J1 must not author
 * steps, assets, assessments or Packet Journey content, and "must not" is only
 * meaningful if something fails when it appears.
 */

const REPOSITORY_ROOT = join(__dirname, "..", "..", "..");

const DOCUMENT_PATH = join(
  REPOSITORY_ROOT,
  "content",
  "curriculum",
  "networking-foundations.json"
);

const TRANSITION_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "lib",
  "wpj-course-transition.txt"
);

const LEDGER_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "lib",
  "wpj-concept-ledger.txt"
);

/** Parse the authored document with the real parser, or fail loudly. */
function loadDocument(): CurriculumDocument {
  const result = parseCurriculumDocument(
    JSON.parse(readFileSync(DOCUMENT_PATH, "utf8"))
  );

  if (!result.valid) {
    throw new Error(
      `the authored document does not parse:\n${result.errors.join("\n")}`
    );
  }

  return result.document;
}

const document = loadDocument();

/** Missions in the order a learner meets them: module position, then mission. */
function missionsInLearningOrder(): CurriculumDocumentMission[] {
  const modulePosition = new Map(
    document.modules.map((module) => [module.stableId, module.position])
  );

  return [...document.missions].sort((left, right) => {
    const byModule =
      (modulePosition.get(left.moduleStableId) ?? 0) -
      (modulePosition.get(right.moduleStableId) ?? 0);

    return byModule !== 0 ? byModule : left.position - right.position;
  });
}

/** One line of a `key|key|…` support file, comments and blanks removed. */
function readTable(path: string): string[][] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split("|"));
}

/* ------------------------------------------------------------------ *
 * The document itself
 * ------------------------------------------------------------------ */

describe("the authored course parses and is the approved architecture", () => {
  it("parses through the real curriculum document parser", () => {
    // `loadDocument` throws on any parse error, so reaching here is the
    // assertion. Restated explicitly so a reader is not left inferring it.
    expect(document.course.stableId).toBe("networking-foundations");
    expect(document.documentKind).toBe("production");
  });

  it("declares the approved four-module, eight-mission architecture", () => {
    expect(document.modules).toHaveLength(4);
    expect(document.missions).toHaveLength(8);

    expect(document.modules.map((module) => module.stableId)).toEqual([
      "nf-mod1-one-network",
      "nf-mod2-addresses-and-boundaries",
      "nf-mod3-reaching-another-network",
      "nf-mod4-prove-it-and-fix-it"
    ]);

    expect(missionsInLearningOrder().map((mission) => mission.stableId)).toEqual(
      [
        "nf-m1-what-a-network-is",
        "nf-m2-inside-one-network",
        "nf-m3-ipv4-the-second-identity",
        "nf-m4-the-prefix-and-the-decision",
        "nf-m5-the-default-gateway",
        "nf-m6-routers-and-the-journey",
        "nf-m7-testing-whether-it-works",
        "nf-m8-when-it-does-not-work"
      ]
    );
  });

  it("gives every module exactly two missions, in order", () => {
    for (const module of document.modules) {
      const missions = document.missions
        .filter((mission) => mission.moduleStableId === module.stableId)
        .map((mission) => mission.position)
        .sort();

      expect(missions).toEqual([0, 1]);
    }
  });

  it("uses unique stable ids across every identity it declares", () => {
    const ids = [
      document.learningPath.stableId,
      document.course.stableId,
      ...document.modules.map((node) => node.stableId),
      ...document.missions.map((node) => node.stableId),
      ...document.competencies.map((node) => node.stableId)
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("states the learner's entry assumptions on every mission", () => {
    // J1 authors no steps, so a mission's `description` is the only place an
    // entry assumption can live. BEGINNER-COMPLETE-1 permits required knowledge
    // to be established by explicit declaration, and "explicit" means the
    // learner is told, in words, before they begin.
    for (const mission of document.missions) {
      expect(mission.description).toContain(
        "Before this mission you should be able to:"
      );
    }
  });

  it("states the course's own entry assumptions, and assumes no networking", () => {
    const description = document.course.description;

    expect(description).toContain("operate a computer");
    expect(description).toContain("compare two numbers");
    expect(description).toContain("No networking vocabulary is assumed");
  });
});

/* ------------------------------------------------------------------ *
 * What J1 must NOT contain
 * ------------------------------------------------------------------ */

/**
 * The mission authority declaration, read as data.
 *
 * ## Why this is no longer a literal in this file
 *
 * J1 asserted that ALL EIGHT missions carried no instruction, which was the
 * right statement while J1 was the newest slice. Module 1 superseded it with an
 * allowlist: "exactly the authorized missions are authored, and every other
 * mission is still empty". A list rather than a count, so that authoring a
 * ninth step in M1 stayed legal while authoring a first step in M5 did not.
 *
 * That allowlist lived here, and an equivalent one lived in `verify-wpj.sh` as
 * a positional anchor, and five per-mission gates each held an opinion about
 * which mission came next. Six places, one fact. DEC-061 replaces all of them
 * with `scripts/lib/wpj-missions.txt`, and this reads that file rather than
 * restating it — so the declaration a reviewer reads is the declaration this
 * suite enforces.
 *
 * The invariant is unchanged: instruction appears in exactly the missions
 * approved for authored instruction, and in no other mission.
 */
const MISSION_DECLARATION_PATH = join(
  REPOSITORY_ROOT,
  "scripts",
  "lib",
  "wpj-missions.txt"
);

interface DeclaredMission {
  readonly position: number;
  readonly stableId: string;
  readonly state: string;
}

const DECLARATION: readonly DeclaredMission[] = readTable(
  MISSION_DECLARATION_PATH
).map(([position, stableId, state]) => ({
  position: Number(position),
  stableId: stableId ?? "",
  state: state ?? ""
}));

describe("the mission authority declaration governs what may carry instruction", () => {
  it("declares exactly the missions the document contains, in the same order", () => {
    expect(DECLARATION.map((entry) => entry.stableId)).toEqual(
      missionsInLearningOrder().map((mission) => mission.stableId)
    );
  });

  it("numbers the declared missions in increasing order from one", () => {
    expect(DECLARATION.map((entry) => entry.position)).toEqual(
      DECLARATION.map((_entry, index) => index + 1)
    );
  });

  it("declares every mission as either authored or unauthored, and nothing else", () => {
    for (const entry of DECLARATION) {
      expect(`${entry.stableId} ${entry.state}`).toBe(
        `${entry.stableId} ${entry.state === "unauthored" ? "unauthored" : "authored"}`
      );
      expect(["authored", "unauthored"]).toContain(entry.state);
    }
  });

  it("authors steps in the declared missions and nowhere else", () => {
    for (const entry of DECLARATION) {
      const found = document.missions.find(
        (m) => m.stableId === entry.stableId
      );
      const authored = (found?.steps.length ?? 0) > 0;

      expect(`${entry.stableId} authored: ${authored}`).toBe(
        `${entry.stableId} authored: ${entry.state === "authored"}`
      );
    }
  });

  /**
   * The terminal state, and what it does and does not mean.
   *
   * FULLY_AUTHORED is derived from the declaration rather than declared beside
   * it, because two representations of one fact would need reconciling. It
   * means every approved mission is STRUCTURALLY authored. It does not mean the
   * course is doctrine-approved, UAT-approved, publishable, migrated or
   * certification-ready — doctrine §23.2 is explicit that passing checks is not
   * completion, and no assertion here could establish otherwise.
   */
  it("contains no mission beyond the eight the declaration approves", () => {
    expect(document.missions).toHaveLength(8);
    expect(DECLARATION).toHaveLength(8);
  });

  it("keeps every mission's steps inside that mission", () => {
    // With no unauthored tail left, an empty step array no longer signals a
    // mission that has quietly acquired content. What still does is a step id
    // appearing under a mission it does not belong to.
    const order = missionsInLearningOrder();

    for (const [index, m] of order.entries()) {
      const prefix = `m${index + 1}-s`;
      const foreign = m.steps
        .map((step) => step.stableId)
        .filter((stableId) => !stableId.startsWith(prefix));

      expect(`${m.stableId} foreign steps: ${foreign.join(",")}`).toBe(
        `${m.stableId} foreign steps: `
      );
    }
  });

  it("authors no assets anywhere", () => {
    // Unchanged by Module 1: there is no curriculum asset hosting, so a
    // `diagram` step would have to name an asset whose URI could only be a
    // development host. The interactive topology is the visual instead.
    for (const mission of document.missions) {
      expect(mission.assets).toEqual([]);
    }
  });

  /**
   * Interactions are authored where the teaching needs one, and as many as the
   * teaching needs — never wherever authoring is permitted.
   *
   * Written as an explicit count per mission rather than a flat "one each",
   * because the right number is a property of what the mission teaches:
   *
   *   M1, M2  one journey each — each follows traffic across a topology
   *   M3, M5, M7
   *           none — each reads a machine's own report, which `command`
   *           already expresses honestly; a journey would animate nothing.
   *           M7 also comes straight after M6's definitive round trip, and its
   *           substance is inference rather than motion
   *   M4      TWO — the mission's whole subject is that one machine behaves
   *           differently for two destinations, and a single journey cannot
   *           show a difference. Splitting them is what makes the second one a
   *           changed context rather than a continuation.
   *   M6      one — a single continuous round trip. Its subject is one
   *           exchange crossing two networks and coming back, so splitting it
   *           would break the very continuity it exists to show.
   *   M8      one — the same round trip, begun with a fault in it. One journey
   *           rather than a broken one and a repaired one, because the repair
   *           and the continuation are the same causal sequence: the learner
   *           has to see the thing that stopped go on to work.
   *
   * A flat count would have forced a journey into Mission 3 and forbidden the
   * second one in Mission 4 — in both cases making the architecture, rather
   * than the teaching, decide the shape of the lesson.
   *
   * What stays absolute is the other half: a mission not listed here carries
   * no interaction at all, so a mission with nothing to animate cannot quietly
   * acquire a journey.
   */
  const JOURNEY_COUNTS: Readonly<Record<string, number>> = {
    "nf-m1-what-a-network-is": 1,
    "nf-m2-inside-one-network": 1,
    "nf-m4-the-prefix-and-the-decision": 2,
    "nf-m6-routers-and-the-journey": 1,
    "nf-m8-when-it-does-not-work": 1
  };

  it("authors interactions only where a journey is the teaching", () => {
    for (const mission of document.missions) {
      const interactions = mission.steps.filter(
        (step) => step.content.type === "interaction"
      );

      const expected = JOURNEY_COUNTS[mission.stableId] ?? 0;

      expect(`${mission.stableId} ${interactions.length}`).toBe(
        `${mission.stableId} ${expected}`
      );
    }
  });

  it("authors no assessment reference anywhere", () => {
    // Assessments are not publishable as documents, so a `practice` step could
    // name an assessment that nothing is able to resolve.
    const raw = readFileSync(DOCUMENT_PATH, "utf8");
    expect(raw).not.toContain("assessmentStableId");
  });

  it("authors no prerequisite rule", () => {
    // D6. The cross-document rule Router-on-a-Stick needs cannot be expressed
    // by the current contract, and inventing a rule this document can hold
    // would be the invalid workaround rather than the recorded transition.
    expect(document.prerequisiteRules).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Competency accountability inside Networking Foundations
 * ------------------------------------------------------------------ */

const WP_J_DEVELOPED = [
  "net.topology-literacy",
  "net.local-delivery",
  "net.address-identification",
  "net.ip-addressing",
  "net.subnet-boundaries",
  "net.default-gateway",
  "net.connectivity-verification"
] as const;

/** Which missions do `relationship` with `competency`, in learning order. */
function missionsDoing(
  competencyStableId: string,
  relationship: MissionCompetencyRelationship
): string[] {
  return missionsInLearningOrder()
    .filter((mission) =>
      mission.competencies.some(
        (link) =>
          link.competencyStableId === competencyStableId &&
          link.relationship === relationship
      )
    )
    .map((mission) => mission.stableId);
}

describe("every competency has exactly one accountable mission", () => {
  it("declares exactly the competencies WP-J is responsible for", () => {
    expect(document.competencies.map((competency) => competency.stableId).sort())
      .toEqual([...WP_J_DEVELOPED].sort());
  });

  it("develops each of them exactly once", () => {
    for (const competencyStableId of WP_J_DEVELOPED) {
      expect(missionsDoing(competencyStableId, "develops")).toHaveLength(1);
    }
  });

  it("reinforces a competency only after the mission that develops it", () => {
    const order = missionsInLearningOrder().map((mission) => mission.stableId);

    for (const competencyStableId of WP_J_DEVELOPED) {
      const developedAt = order.indexOf(
        missionsDoing(competencyStableId, "develops")[0]!
      );

      for (const reinforcedAt of missionsDoing(
        competencyStableId,
        "reinforces"
      )) {
        expect(order.indexOf(reinforcedAt)).toBeGreaterThan(developedAt);
      }
    }
  });

  it("gives every mission at least one required competency", () => {
    for (const mission of document.missions) {
      expect(
        mission.competencies.filter((link) => link.required).length
      ).toBeGreaterThan(0);
    }
  });

  it("maps every declared competency to a mission", () => {
    for (const competency of document.competencies) {
      const mapped = document.missions.some((mission) =>
        mission.competencies.some(
          (link) => link.competencyStableId === competency.stableId
        )
      );

      expect(mapped).toBe(true);
    }
  });

  it("does not claim to develop fault isolation", () => {
    // D1 and D9. Networking Foundations teaches a learner to reason about a
    // failure whose stopping point they are SHOWN. Narrowing an unlocated fault
    // across several boundary types is a larger capability and stays with
    // Router-on-a-Stick.
    const raw = readFileSync(DOCUMENT_PATH, "utf8");
    expect(raw).not.toContain("net.fault-isolation");
  });
});

/* ------------------------------------------------------------------ *
 * Reused competency identities
 * ------------------------------------------------------------------ */

describe("competencies reused from Router-on-a-Stick are reused, not redefined", () => {
  const roasById = new Map(
    ROAS_COMPETENCIES.map((competency) => [competency.stableId, competency])
  );

  it("repeats the authored title and description exactly", () => {
    // Competencies reconcile as parentless nodes keyed by stable id, and the
    // importer diffs title and description. A single reworded character turns a
    // reuse into an update — and into a refusal, once the Router-on-a-Stick row
    // is published. Byte equality is the whole requirement, so it is asserted
    // byte-for-byte rather than approximately.
    const reused = document.competencies.filter((competency) =>
      roasById.has(competency.stableId)
    );

    expect(reused.map((competency) => competency.stableId).sort()).toEqual([
      "net.connectivity-verification",
      "net.default-gateway",
      "net.ip-addressing",
      "net.subnet-boundaries"
    ]);

    for (const competency of reused) {
      const authored = roasById.get(competency.stableId)!;

      expect(competency.title).toBe(authored.title);
      expect(competency.description).toBe(authored.description);
    }
  });

  it("introduces exactly three competencies of its own", () => {
    // `net.address-identification` is additive by design. Reading an address
    // off an interface is a capability Linux, Windows, Security and every
    // troubleshooting course needs, and it is demonstrable on its own — but
    // `net.ip-addressing` also asserts prefix interpretation and a reachability
    // determination, so gating a later course on it would demand more than that
    // course needs. Narrowing the existing description instead was rejected:
    // evidence links pin a competency VERSION, and rewording in place would
    // change what past evidence means while still classifying as "current".
    const introduced = document.competencies.filter(
      (competency) => !roasById.has(competency.stableId)
    );

    expect(introduced.map((competency) => competency.stableId).sort()).toEqual([
      "net.address-identification",
      "net.local-delivery",
      "net.topology-literacy"
    ]);
  });

  it("leaves every reused competency's meaning exactly where it was", () => {
    // The correction is additive and nothing else. A new identity is a create;
    // a changed description on a published row is refused by the importer, and
    // would need the re-versioning capability WP-G deliberately defers.
    for (const competency of ROAS_COMPETENCIES) {
      const declared = document.competencies.find(
        (candidate) => candidate.stableId === competency.stableId
      );

      if (declared === undefined) continue;

      expect(declared.title).toBe(competency.title);
      expect(declared.description).toBe(competency.description);
    }
  });

  it("keeps every competency identity domain-scoped and reusable", () => {
    // The rule Router-on-a-Stick already enforces on itself: a competency whose
    // identity embeds a course node could never be reused by Linux, Windows or
    // Security, which is the whole reason foundations are authored once.
    for (const competency of document.competencies) {
      expect(competency.stableId.startsWith("net.")).toBe(true);
      expect(competency.stableId).not.toContain("networking-foundations");
      expect(competency.stableId).not.toContain("nf-");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Path-level integrity: Networking Foundations -> Router-on-a-Stick
 * ------------------------------------------------------------------ */

describe("the learning path holds together across both courses", () => {
  const transition = readTable(TRANSITION_PATH);

  it("describes only transitions that really exist in Router-on-a-Stick", () => {
    // A plan describing links that do not exist is worse than no plan: it would
    // pass its own check forever while describing nothing.
    for (const [missionStableId, competencyStableId, current] of transition) {
      const mission = ROAS_MISSIONS.find(
        (candidate) => candidate.stableId === missionStableId
      );

      expect(mission, `unknown mission ${missionStableId}`).toBeDefined();

      const link = mission?.competencies.find(
        (candidate) => candidate.competencyStableId === competencyStableId
      );

      expect(link, `unknown link ${missionStableId} -> ${competencyStableId}`)
        .toBeDefined();
      expect(link?.relationship).toBe(current);
    }
  });

  it("has not been applied: Router-on-a-Stick still holds its own relationships", () => {
    // J1 must not mutate Router-on-a-Stick. This is the assertion that says so,
    // and it fails the moment someone applies the transition without also
    // resolving D3 and updating this record.
    for (const [missionStableId, competencyStableId, current] of transition) {
      const link = ROAS_MISSIONS.find(
        (candidate) => candidate.stableId === missionStableId
      )?.competencies.find(
        (candidate) => candidate.competencyStableId === competencyStableId
      );

      expect(link?.relationship).toBe(current);
      expect(current).toBe("develops");
    }
  });

  it("yields exactly one development point per competency once applied", () => {
    // THE path-level invariant (D3), proved against the planned end state
    // rather than against today's source — which does not satisfy it, and is
    // not supposed to yet.
    const planned = new Map(
      transition.map(([mission, competency, , future]) => [
        `${mission}|${competency}`,
        future
      ])
    );

    const developedBy = new Map<string, string[]>();

    for (const mission of missionsInLearningOrder()) {
      for (const link of mission.competencies) {
        if (link.relationship !== "develops") continue;
        developedBy.set(link.competencyStableId, [
          ...(developedBy.get(link.competencyStableId) ?? []),
          `nf:${mission.stableId}`
        ]);
      }
    }

    for (const mission of roasMissionsInLearningOrder()) {
      for (const link of mission.competencies) {
        const relationship =
          planned.get(`${mission.stableId}|${link.competencyStableId}`) ??
          link.relationship;

        if (relationship !== "develops") continue;
        developedBy.set(link.competencyStableId, [
          ...(developedBy.get(link.competencyStableId) ?? []),
          `roas:${mission.stableId}`
        ]);
      }
    }

    for (const [competencyStableId, missions] of developedBy) {
      expect(missions, `${competencyStableId} is developed ${missions.length} times`)
        .toHaveLength(1);
    }
  });

  it("reinforces nothing before it is developed, across the whole path", () => {
    const planned = new Map(
      transition.map(([mission, competency, , future]) => [
        `${mission}|${competency}`,
        future
      ])
    );

    // Networking Foundations first, then Router-on-a-Stick: the path order
    // DEC-053 approved.
    const pathOrder = [
      ...missionsInLearningOrder().map((mission) => ({
        key: `nf:${mission.stableId}`,
        links: mission.competencies.map((link) => ({
          competencyStableId: link.competencyStableId,
          relationship: link.relationship as MissionCompetencyRelationship
        }))
      })),
      ...roasMissionsInLearningOrder().map((mission) => ({
        key: `roas:${mission.stableId}`,
        links: mission.competencies.map((link) => ({
          competencyStableId: link.competencyStableId,
          relationship:
            (planned.get(`${mission.stableId}|${link.competencyStableId}`) as
              | MissionCompetencyRelationship
              | undefined) ?? link.relationship
        }))
      }))
    ];

    const developedAt = new Map<string, number>();

    pathOrder.forEach((mission, index) => {
      for (const link of mission.links) {
        if (link.relationship !== "develops") continue;
        if (!developedAt.has(link.competencyStableId)) {
          developedAt.set(link.competencyStableId, index);
        }
      }
    });

    pathOrder.forEach((mission, index) => {
      for (const link of mission.links) {
        if (link.relationship !== "reinforces") continue;

        const development = developedAt.get(link.competencyStableId);

        expect(
          development,
          `${mission.key} reinforces ${link.competencyStableId}, which nothing develops`
        ).toBeDefined();

        expect(
          index,
          `${mission.key} reinforces ${link.competencyStableId} before it is developed`
        ).toBeGreaterThan(development!);
      }
    });
  });
});

/* ------------------------------------------------------------------ *
 * The concept ledger
 * ------------------------------------------------------------------ */

describe("every mission tells the learner where they are and what they are doing", () => {
  /**
   * DEC-063 — guide the learner.
   *
   * Founder UAT: a mission opened by continuing the previous one, so a learner
   * had no situation to be in and no stated goal. These pin the SHAPE, not the
   * wording: a scenario, an objective, and the activity soon after — so a
   * rewrite that keeps the meaning stays legal and a regression does not.
   */
  function opening(mission: (typeof document.missions)[number]) {
    const first = mission.steps[0]?.content;
    if (first === undefined || first.type !== "concept") {
      throw new Error(`${mission.stableId} does not open with a concept step`);
    }
    return first.paragraphs;
  }

  it("opens every mission with a concrete situation", () => {
    // A scenario names something in the world — a person, a machine, a report,
    // a request. A mission that opened on "In Mission 5 you watched..." is
    // continuity, not a situation.
    for (const mission of document.missions) {
      const scenario = opening(mission)[0] ?? "";

      expect(`${mission.stableId} has an opening: ${scenario.length > 0}`).toBe(
        `${mission.stableId} has an opening: true`
      );

      expect(
        `${mission.stableId} opens on continuity: ${/^in mission \d/i.test(scenario)}`
      ).toBe(`${mission.stableId} opens on continuity: false`);
    }
  });

  it("states what the learner is trying to accomplish, early", () => {
    /*
      DEC-063: the opening states an objective, within the first three
      paragraphs, before the learner is asked to do anything.

      This used to require the literal phrase "your job", which is the form
      seven missions use. Mission 8's architect-authored rewrite sets its
      objective as a direct instruction instead — "Start with the evidence. Run
      the same connectivity check you used in Mission 7" — which states the
      objective at least as plainly.

      So the accepted forms are ENUMERATED rather than reduced to one. That is
      the honest shape of this check: it records the two conventions the course
      actually authors, and it still fails a mission that sets no objective at
      all. Whether the objective is a GOOD one is Tier 3 review (CURR-009 s14a)
      and no string test can decide it.
    */
    const OBJECTIVE_FORMS = [
      "your job",
      "start with the evidence",
      "your task"
    ];

    for (const mission of document.missions) {
      const first = opening(mission).slice(0, 3).join(" ").toLowerCase();
      const stated = OBJECTIVE_FORMS.some((form) => first.includes(form));

      expect(`${mission.stableId} states an objective: ${stated}`).toBe(
        `${mission.stableId} states an objective: true`
      );

      // And it addresses the learner, rather than describing the mission.
      expect(`${mission.stableId} addresses the learner: ${first.includes("you")}`)
        .toBe(`${mission.stableId} addresses the learner: true`);
    }
  });

  it("keeps the scenario short enough to be orientation rather than reading", () => {
    // Not a word-count quality score: a ceiling on the two paragraphs whose
    // whole purpose is to get the learner oriented and moving. The Founder's
    // instruction was "2-4 short sentences", and a scenario several times that
    // length is the delay it was meant to remove.
    for (const mission of document.missions) {
      const [situation, objective] = opening(mission);
      const words = `${situation ?? ""} ${objective ?? ""}`.split(/\s+/).length;

      expect(`${mission.stableId} opening words under 90: ${words < 90}`).toBe(
        `${mission.stableId} opening words under 90: true`
      );
    }
  });

  it("reaches something the learner does without a wall of prose first", () => {
    // The first step that is not concept prose — a journey or a machine's own
    // output. Missions 3, 5 and 7 reach displayed output rather than a learner
    // action, which is the ceiling until command execution exists (DEC-062).
    for (const mission of document.missions) {
      let words = 0;
      let reached = false;

      for (const step of mission.steps) {
        if (step.content.type !== "concept") {
          reached = true;
          break;
        }
        words += step.content.paragraphs.join(" ").split(/\s+/).length;
      }

      expect(`${mission.stableId} reaches an activity: ${reached}`).toBe(
        `${mission.stableId} reaches an activity: true`
      );
      expect(`${mission.stableId} words first: ${words < 200}`).toBe(
        `${mission.stableId} words first: true`
      );
    }
  });

  it("never claims the learner has already done something they have not", () => {
    for (const mission of document.missions) {
      const opener = opening(mission).slice(0, 2).join(" ").toLowerCase();

      for (const claim of [
        "you configured",
        "you typed",
        "you ran the command",
        "you fixed",
        "you repaired",
        "you have already configured"
      ]) {
        expect(`${mission.stableId} ${claim}: ${opener.includes(claim)}`).toBe(
          `${mission.stableId} ${claim}: false`
        );
      }
    }
  });
});

describe("a prediction is graded only where the learner can already reason", () => {
  /**
   * The Mission 8 refinement made `correctOption` available on a prediction so
   * a learner is told plainly whether their model was right. It is OPTIONAL,
   * and this is the boundary: a prediction may be graded only where the course
   * has already taught the learner to work the answer out.
   *
   * Everywhere else the prediction is exploratory — the observation IS the
   * answer, and marking that guess would punish the learner for doing exactly
   * what was asked.
   */
  /*
    Widened by an Architect ruling: predictions are standardised toward the
    Mission 8 behaviour, mission by mission, as each is repaired.

    A prediction may be graded where the answer is objectively determinable
    from the authored topology or from what the course has already taught.
    Mission 1's "which device receives the print request first?" is settled by
    PC-A's single link ending on Switch-1 port 1 — the learner can read it off
    the picture, so committing to it and being told plainly is right.

    Missions not on this list are not yet repaired. Their predictions stay
    exploratory, and this test is what stops one acquiring an answer key
    without the ruling that authorises it.
  */
  const GRADED_MISSIONS = new Set([
    "nf-m1-what-a-network-is",
    "nf-m8-when-it-does-not-work"
  ]);

  function predictionsOf(missionStableId: string) {
    const mission = document.missions.find((m) => m.stableId === missionStableId);
    if (mission === undefined) throw new Error(`no mission ${missionStableId}`);

    return mission.steps.flatMap((step) =>
      step.content.type === "interaction"
        ? (step.content.parameters as unknown as {
            stages: readonly {
              stageId: string;
              prediction?: {
                prompt: string;
                options: readonly string[];
                correctOption?: string;
                explanation?: string;
              };
            }[];
          }).stages.flatMap((stage) =>
            stage.prediction === undefined
              ? []
              : [{ stageId: stage.stageId, prediction: stage.prediction }]
          )
        : []
    );
  }

  it("leaves every exploratory prediction ungraded", () => {
    for (const mission of document.missions) {
      if (GRADED_MISSIONS.has(mission.stableId)) continue;

      for (const { stageId, prediction } of predictionsOf(mission.stableId)) {
        expect(
          `${mission.stableId} ${stageId} is graded: ${prediction.correctOption !== undefined}`
        ).toBe(`${mission.stableId} ${stageId} is graded: false`);
      }
    }
  });

  it("grades the predictions the repaired missions authorise", () => {
    for (const stableId of GRADED_MISSIONS) {
      const graded = predictionsOf(stableId).filter(
        (entry) => entry.prediction.correctOption !== undefined
      );

      expect(`${stableId} graded predictions: ${graded.length > 0}`).toBe(
        `${stableId} graded predictions: true`
      );
    }
  });

  it("gives every graded prediction a reason, not only a verdict", () => {
    /*
      A learner told "Not quite" and nothing else is no better off.

      `AWAITING_REASON` is a KNOWN GAP, listed rather than skipped so it stays
      visible. Mission 8's prediction was authored before the explanation field
      existed; supplying its wording is the Architect's, not this repair's, and
      the entry is removed the moment that copy arrives. Listing it here means
      the gap fails loudly if anyone tries to close it by deleting the rule.
    */
    const AWAITING_REASON = new Set(["f1-pc-a-decides"]);

    for (const stableId of GRADED_MISSIONS) {
      for (const { stageId, prediction } of predictionsOf(stableId)) {
        if (prediction.correctOption === undefined) continue;

        const explained = (prediction.explanation ?? "").length > 0;

        if (AWAITING_REASON.has(stageId)) {
          expect(`${stableId} ${stageId} still awaits its reason: ${!explained}`).toBe(
            `${stableId} ${stageId} still awaits its reason: true`
          );
          continue;
        }

        expect(
          `${stableId} ${stageId} explains the answer: ${explained}`
        ).toBe(`${stableId} ${stageId} explains the answer: true`);
      }
    }
  });

  it("names a correct option that is actually on offer", () => {
    for (const mission of document.missions) {
      for (const { stageId, prediction } of predictionsOf(mission.stableId)) {
        if (prediction.correctOption === undefined) continue;

        expect(
          `${mission.stableId} ${stageId} answerable: ${prediction.options.includes(prediction.correctOption)}`
        ).toBe(`${mission.stableId} ${stageId} answerable: true`);
      }
    }
  });
});

describe("what the topology has to make visible on its own", () => {
  /**
   * Founder UAT, wave 8. The lesson reasons about four addresses across two
   * networks, and a learner who has to open the full text account to find any
   * of them is reading a document, not a network.
   */
  function faceOf(missionStableId: string) {
    const mission = document.missions.find((m) => m.stableId === missionStableId);
    if (mission === undefined) throw new Error(`no mission ${missionStableId}`);

    return mission.steps.flatMap((step) =>
      step.content.type === "interaction"
        ? (step.content.parameters as unknown as {
            nodes: readonly {
              label: string;
              interfaces: readonly {
                label: string;
                attributes: readonly {
                  label: string;
                  value: string;
                  prominent?: boolean;
                }[];
              }[];
            }[];
          }).nodes.flatMap((node) =>
            node.interfaces.flatMap((iface) =>
              iface.attributes
                .filter((attribute) => attribute.prominent === true)
                .map((attribute) => ({
                  device: node.label,
                  iface: iface.label,
                  label: attribute.label,
                  value: attribute.value
                }))
            )
          )
        : []
    );
  }

  it("associates PC-A and PC-C with their own addresses in Mission 6", () => {
    const face = faceOf("nf-m6-routers-and-the-journey");

    for (const [device, address] of [
      ["PC-A", "192.168.1.10/24"],
      ["PC-C", "192.168.2.20/24"]
    ]) {
      const shown = face.some(
        (fact) => fact.device === device && fact.value === address
      );

      expect(`${device} shows ${address} on the topology: ${shown}`).toBe(
        `${device} shows ${address} on the topology: true`
      );
    }
  });

  it("shows both of Router-1's sides, each with the network it faces", () => {
    /*
      The wave-8 finding: the topology labelled both networks and left Router-1
      outside both, so which router address faced which network could only be
      recovered from prose. Each interface now carries its own address AND its
      own network, under its own heading on the card.
    */
    for (const mission of [
      "nf-m6-routers-and-the-journey",
      "nf-m8-when-it-does-not-work"
    ]) {
      const router = faceOf(mission).filter((fact) => fact.device === "Router-1");

      for (const [address, network] of [
        ["192.168.1.1/24", "192.168.1.0/24"],
        ["192.168.2.1/24", "192.168.2.0/24"]
      ]) {
        const side = router.find((fact) => fact.value === address);
        expect(`${mission} shows ${address}: ${side !== undefined}`).toBe(
          `${mission} shows ${address}: true`
        );

        const facing = router.find(
          (fact) => fact.iface === side?.iface && fact.value === network
        );
        expect(
          `${mission} says ${address} is on ${network}: ${facing !== undefined}`
        ).toBe(`${mission} says ${address} is on ${network}: true`);
      }

      // Two sides, told apart. One interface carrying both would defeat it.
      const interfaces = new Set(router.map((fact) => fact.iface));
      expect(`${mission} router interfaces on the face: ${interfaces.size}`).toBe(
        `${mission} router interfaces on the face: 2`
      );
    }
  });
});

describe("narration never runs ahead of the motion", () => {
  /**
   * DEC-066, clause 1. Founder UAT: the pane said Switch-1 had forwarded the
   * frame out of port 4 to Router-1 while the marker was still travelling from
   * PC-A to Switch-1. A stage narrates the state its own motion produces; the
   * forwarding belongs to the stage whose motion shows it.
   */
  function journeys() {
    return document.missions.flatMap((mission) =>
      mission.steps.flatMap((step) =>
        step.content.type === "interaction"
          ? [
              {
                mission: mission.stableId,
                journey: step.content.parameters as unknown as {
                  nodes: readonly { nodeId: string; label: string }[];
                  stages: readonly {
                    stageId: string;
                    atNodeId: string;
                    narration: string;
                  }[];
                }
              }
            ]
          : []
      )
    );
  }

  it("does not announce arrival at the node the NEXT stage reaches", () => {
    for (const { mission, journey } of journeys()) {
      const labels = new Map(
        journey.nodes.map((node) => [node.nodeId, node.label])
      );

      journey.stages.forEach((stage, index) => {
        const next = journey.stages[index + 1];
        if (next === undefined) return;
        if (next.atNodeId === stage.atNodeId) return;

        const ahead = labels.get(next.atNodeId) ?? next.atNodeId;

        for (const claim of [
          `arrives at ${ahead}`,
          `it reaches ${ahead}`,
          `arrived at ${ahead}`
        ]) {
          const said = stage.narration.toLowerCase().includes(claim.toLowerCase());

          expect(
            `${mission} ${stage.stageId} claims "${claim}": ${said}`
          ).toBe(`${mission} ${stage.stageId} claims "${claim}": false`);
        }
      });
    }
  });

  it("splits Mission 6's first leg into arrival, then forwarding", () => {
    // The exact defect, pinned as the two states it actually has.
    const sixth = journeys().find(
      (entry) => entry.mission === "nf-m6-routers-and-the-journey"
    );
    if (sixth === undefined) throw new Error("no Mission 6 journey");

    const atSwitch = sixth.journey.stages.find(
      (stage) => stage.atNodeId === "sw-1"
    );
    const atRouter = sixth.journey.stages.find(
      (stage) => stage.atNodeId === "r-1"
    );

    // The stage that ENDS at Switch-1 says the frame got there, and stops.
    expect(`arrival stated: ${atSwitch?.narration.includes("reaches Switch-1")}`)
      .toBe("arrival stated: true");
    expect(`forwarding withheld: ${atSwitch?.narration.includes("port 4")}`)
      .toBe("forwarding withheld: false");

    // The stage whose motion is Switch-1 to Router-1 carries the forwarding.
    expect(`forwarding stated: ${atRouter?.narration.includes("forwards the frame out of port 4")}`)
      .toBe("forwarding stated: true");
  });

  it("names the object at the layer the device is working at", () => {
    // Founder UAT: a switch making a forwarding decision is working on a
    // frame, and the thing that survives the whole trip is the packet.
    const sixth = journeys().find(
      (entry) => entry.mission === "nf-m6-routers-and-the-journey"
    );
    const atSwitch = sixth?.journey.stages.find(
      (stage) => stage.atNodeId === "sw-1"
    );

    expect(`switch works on a frame: ${atSwitch?.narration.includes("frame")}`).toBe(
      "switch works on a frame: true"
    );
    expect(
      `switch reads a MAC address: ${atSwitch?.narration.includes("MAC address")}`
    ).toBe("switch reads a MAC address: true");
  });

  it("stops calling it a message once the course has better words", () => {
    for (const stableId of [
      "nf-m6-routers-and-the-journey",
      "nf-m8-when-it-does-not-work"
    ]) {
      const mission = document.missions.find((m) => m.stableId === stableId);
      const text = JSON.stringify(mission?.steps ?? []);

      for (const vague of ["a message", "the wrapper", "hardware identity"]) {
        expect(`${stableId} still says "${vague}": ${text.includes(vague)}`).toBe(
          `${stableId} still says "${vague}": false`
        );
      }
    }
  });
});

describe("a learner reads a question once", () => {
  /**
   * Founder UAT read a Mission 6 prompt, then read it again immediately below,
   * then answered. The renderer owns that repair (the beat body is empty and
   * the fieldset legend owns the prompt); this owns the authored half — no two
   * adjacent authored surfaces may carry the same sentence.
   */
  function journeysOfEveryMission() {
    return document.missions.flatMap((mission) =>
      mission.steps.flatMap((step) =>
        step.content.type === "interaction"
          ? [
              {
                mission: mission.stableId,
                journey: step.content.parameters as unknown as {
                  stages: readonly {
                    stageId: string;
                    narration: string;
                    decision?: string;
                    prediction?: { prompt: string };
                    knowledgeCheck?: { prompt: string; explanation: string };
                  }[];
                }
              }
            ]
          : []
      )
    );
  }

  const normalise = (text: string): string =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  it("never repeats a prompt in the prose that introduces it", () => {
    for (const { mission, journey } of journeysOfEveryMission()) {
      for (const stage of journey.stages) {
        const prompts = [
          stage.prediction?.prompt,
          stage.knowledgeCheck?.prompt
        ].filter((prompt): prompt is string => prompt !== undefined);

        for (const prompt of prompts) {
          for (const near of [stage.narration, stage.decision ?? ""]) {
            const repeated = normalise(near).includes(normalise(prompt));

            expect(
              `${mission} ${stage.stageId} repeats its prompt: ${repeated}`
            ).toBe(`${mission} ${stage.stageId} repeats its prompt: false`);
          }
        }
      }
    }
  });

  it("never asks two identical questions on one stage", () => {
    for (const { mission, journey } of journeysOfEveryMission()) {
      for (const stage of journey.stages) {
        const prediction = stage.prediction?.prompt;
        const check = stage.knowledgeCheck?.prompt;

        if (prediction !== undefined && check !== undefined) {
          expect(
            `${mission} ${stage.stageId} duplicate question: ${normalise(prediction) === normalise(check)}`
          ).toBe(`${mission} ${stage.stageId} duplicate question: false`);
        }
      }
    }
  });

  it("does not say the same thing twice in adjacent prose", () => {
    // Founder's standard: one concise observation, then one explanation that
    // adds something. Not two paraphrases of the observation.
    for (const { mission, journey } of journeysOfEveryMission()) {
      for (const stage of journey.stages) {
        if (stage.decision === undefined) continue;

        const observation = normalise(stage.narration);
        const why = normalise(stage.decision);

        expect(
          `${mission} ${stage.stageId} decision restates narration: ${why === observation || why.includes(observation)}`
        ).toBe(`${mission} ${stage.stageId} decision restates narration: false`);
      }
    }
  });
});

describe("a /24 is taught as octets", () => {
  const learnerText = (): string =>
    JSON.stringify(document.missions.map((mission) => mission.steps));

  it("never defines the network portion as the first three numbers", () => {
    expect(
      `defines by numbers: ${learnerText().includes("first three numbers")}`
    ).toBe("defines by numbers: false");
  });

  it("defines the octet once, where the prefix is first taught", () => {
    const fourth = document.missions.find(
      (mission) => mission.stableId === "nf-m4-the-prefix-and-the-decision"
    );
    if (fourth === undefined) throw new Error("no Mission 4");

    const text = JSON.stringify(fourth.steps);

    expect(`Mission 4 defines the octet: ${text.includes("is called an octet")}`)
      .toBe("Mission 4 defines the octet: true");
  });

  it("uses the word where the comparison is actually made", () => {
    for (const stableId of [
      "nf-m4-the-prefix-and-the-decision",
      "nf-m6-routers-and-the-journey",
      "nf-m8-when-it-does-not-work"
    ]) {
      const mission = document.missions.find((m) => m.stableId === stableId);
      const text = JSON.stringify(mission?.steps ?? []);

      expect(`${stableId} uses octets: ${text.includes("octet")}`).toBe(
        `${stableId} uses octets: true`
      );
    }
  });
});

describe("the network context a beat assumes is on the screen", () => {
  /**
   * Founder UAT: "PC-A has something for PC-C", "it compares that address
   * against its own" and "the rule Mission 4 taught you" each asked the
   * learner to supply something the screen did not. These pin the repair as
   * invariants rather than as wording.
   */
  interface AuthoredStage {
    readonly stageId: string;
    readonly narration: string;
    readonly decision?: string;
    readonly action?: string;
  }

  interface AuthoredJourney {
    readonly stages: readonly AuthoredStage[];
    readonly fault?: { readonly symptom: string; readonly stopsAtStageId: string };
  }

  function journeysOf(stableId: string): readonly AuthoredJourney[] {
    const mission = document.missions.find((m) => m.stableId === stableId);
    if (mission === undefined) throw new Error(`no mission ${stableId}`);

    return mission.steps.flatMap((step) =>
      step.content.type === "interaction"
        ? [step.content.parameters as unknown as AuthoredJourney]
        : []
    );
  }

  function stageTextOf(stableId: string): string {
    return journeysOf(stableId)
      .flatMap((journey) =>
        journey.stages.flatMap((stage) => [stage.narration, stage.decision ?? ""])
      )
      .join("\n");
  }

  it("names what is being sent, rather than calling it something", () => {
    // "PC-A has something for 192.168.2.20" was rejected by name. By Missions
    // 6 and 8 the learner has been taught "packet", so the course uses it.
    for (const stableId of [
      "nf-m6-routers-and-the-journey",
      "nf-m8-when-it-does-not-work"
    ]) {
      const text = stageTextOf(stableId).toLowerCase();

      expect(`${stableId} vague: ${text.includes("has something for")}`).toBe(
        `${stableId} vague: false`
      );
    }
  });

  it("says what is compared, and what rule decides it", () => {
    // Not "it compares that address against its own" and nothing more: the
    // destination, the host's own address AND prefix, and the conclusion.
    for (const stableId of [
      "nf-m6-routers-and-the-journey",
      "nf-m8-when-it-does-not-work"
    ]) {
      const text = stageTextOf(stableId);

      expect(`${stableId} names the destination: ${text.includes("192.168.2.20")}`).toBe(
        `${stableId} names the destination: true`
      );
      expect(`${stableId} names its own address and prefix: ${text.includes("192.168.1.10/24")}`).toBe(
        `${stableId} names its own address and prefix: true`
      );
      expect(`${stableId} names the network: ${text.includes("192.168.1.0/24")}`).toBe(
        `${stableId} names the network: true`
      );
    }
  });

  it("does not make a previous mission the only explanation", () => {
    // A reference may reinforce. It may not BE the reason — a learner
    // returning after a break cannot reopen Mission 4 to read this one.
    for (const stableId of [
      "nf-m6-routers-and-the-journey",
      "nf-m8-when-it-does-not-work"
    ]) {
      const text = stageTextOf(stableId);

      for (const leaning of [
        "the way Mission 4 taught you",
        "as Mission 4 taught",
        "the rule Mission 4 taught"
      ]) {
        expect(`${stableId} leans on a memory: ${text.includes(leaning)}`).toBe(
          `${stableId} leans on a memory: false`
        );
      }
    }
  });

  it("says where a device is and what it is doing", () => {
    /*
      The heading is built from the authored action. Without one it can only
      say "At PC-A", which was the finding — so this covers EVERY journey the
      course authors, not only the two the Founder is retesting.
    */
    const authored = document.missions
      .filter((mission) =>
        mission.steps.some((step) => step.content.type === "interaction")
      )
      .map((mission) => mission.stableId);

    expect(authored.length).toBeGreaterThan(0);

    for (const stableId of authored) {
      for (const journey of journeysOf(stableId)) {
        for (const stage of journey.stages) {
          expect(`${stableId} ${stage.stageId} names an action: ${stage.action !== undefined}`)
            .toBe(`${stableId} ${stage.stageId} names an action: true`);
        }
      }
    }
  });

  it("states a stop once, not in every surface", () => {
    // "Nothing leaves PC-A" appeared in the narration, again in the fault
    // symptom, and again in the headline. The symptom now says what the stop
    // MEANS rather than repeating what it was.
    const faulted = journeysOf("nf-m8-when-it-does-not-work")[0];
    if (faulted === undefined) throw new Error("Mission 8 authors no journey");

    const stop = faulted.stages.find(
      (stage) => stage.stageId === faulted.fault?.stopsAtStageId
    );

    const symptom = faulted.fault?.symptom ?? "";
    const narration = stop?.narration ?? "";

    expect(symptom).not.toBe(narration);

    // And they do not both recite the same list of devices that saw nothing.
    const bothList = ["Switch-1", "never"].every(
      (token) => symptom.includes(token) && narration.includes(token)
    );

    expect(`both surfaces recite the same list: ${bothList}`).toBe(
      "both surfaces recite the same list: false"
    );
  });

  it("introduces no VLAN vocabulary anywhere in the course", () => {
    // A subnet is not a VLAN. Networking Foundations defers VLANs, trunks and
    // 802.1Q entirely, and a distinct network must never be labelled as one.
    const everything = JSON.stringify(document);

    for (const term of ["VLAN", "trunk", "802.1Q", "dot1q", "access port"]) {
      expect(`${term}: ${everything.toLowerCase().includes(term.toLowerCase())}`).toBe(
        `${term}: false`
      );
    }
  });
});

describe("the topology shows only what the course has already taught", () => {
  /**
   * Founder UAT asked for network identity ON the device cards. A card fact is
   * flagged `prominent` by the author, so "on the card" is an authoring
   * boundary, and the boundary is the mission that TEACHES the idea:
   * IPv4 from Mission 3, the prefix from Mission 4, the gateway from Mission 5.
   *
   * Showing an address before Mission 3 would put the second identity on screen
   * during the mission that argues a device has only the first one.
   */
  const TAUGHT_FROM = { ipv4: 3, prefix: 4, gateway: 5 } as const;

  /*
    Learning order, never array order.

    Mutation testing caught this: `document.missions[5]` is not necessarily
    Mission 6, so removing Mission 6's gateway from the card left the assertion
    passing against a different mission entirely. The document orders missions
    by module position then mission position, which is what this suite's own
    `missionsInLearningOrder` already computes.
  */
  const inOrder = missionsInLearningOrder();

  function faceFacts(missionIndex: number) {
    const mission = inOrder[missionIndex - 1];
    if (mission === undefined) throw new Error(`no mission ${missionIndex}`);

    return mission.steps.flatMap((step) =>
      step.content.type === "interaction"
        ? (step.content.parameters as unknown as {
            nodes: readonly {
              label: string;
              interfaces: readonly {
                attributes: readonly {
                  label: string;
                  value: string;
                  prominent?: boolean;
                }[];
              }[];
            }[];
          }).nodes.flatMap((node) =>
            node.interfaces.flatMap((iface) =>
              iface.attributes
                .filter((attribute) => attribute.prominent === true)
                .map((attribute) => ({
                  device: node.label,
                  label: attribute.label,
                  value: attribute.value
                }))
            )
          )
        : []
    );
  }

  const missionNumbers = inOrder.map((_, index) => index + 1);

  it("puts an address on the card only from the mission that teaches addresses", () => {
    for (const number of missionNumbers) {
      const addresses = faceFacts(number).filter((fact) =>
        /^\d+\.\d+\.\d+\.\d+/.test(fact.value)
      );

      const allowed = number >= TAUGHT_FROM.ipv4 || addresses.length === 0;

      expect(`mission ${number} addresses on cards allowed: ${allowed}`).toBe(
        `mission ${number} addresses on cards allowed: true`
      );
    }
  });

  it("puts a prefix on the card only from the mission that teaches it", () => {
    for (const number of missionNumbers) {
      const prefixed = faceFacts(number).filter((fact) =>
        fact.value.includes("/")
      );

      const allowed = number >= TAUGHT_FROM.prefix || prefixed.length === 0;

      expect(`mission ${number} prefixes on cards allowed: ${allowed}`).toBe(
        `mission ${number} prefixes on cards allowed: true`
      );
    }
  });

  it("puts a gateway on the card only from the mission that teaches it", () => {
    for (const number of missionNumbers) {
      const gateways = faceFacts(number).filter((fact) =>
        fact.label.toLowerCase().includes("hands off to")
      );

      const allowed = number >= TAUGHT_FROM.gateway || gateways.length === 0;

      expect(`mission ${number} gateways on cards allowed: ${allowed}`).toBe(
        `mission ${number} gateways on cards allowed: true`
      );
    }
  });

  it("does show the address and prefix once they are taught", () => {
    // The requirement is not only "not too early". A learner reading about
    // 192.168.1.10/24 in Mission 6 must be able to see it on PC-A.
    for (const number of [4, 6, 8]) {
      const facts = faceFacts(number);
      const withPrefix = facts.filter((fact) => fact.value.includes("/24"));

      expect(`mission ${number} shows an address with its prefix: ${withPrefix.length > 0}`)
        .toBe(`mission ${number} shows an address with its prefix: true`);
    }
  });

  it("shows the gateway on the card of each device that has one", () => {
    /*
      Mission 6 is the first journey after the gateway is taught, so it is the
      first place the value the instruction refers to must be readable without
      opening the full device listing.

      Named per device, not counted. Mutation testing caught the counted form:
      removing PC-A's gateway still left PC-C's, so the assertion passed while
      the very card the instruction talks about had lost the value.
    */
    const sixth = faceFacts(6);

    for (const device of ["PC-A", "PC-C"]) {
      const shown = sixth.some(
        (fact) =>
          fact.device === device &&
          fact.label.toLowerCase().includes("hands off to")
      );

      expect(`mission 6 shows ${device}'s gateway on its card: ${shown}`).toBe(
        `mission 6 shows ${device}'s gateway on its card: true`
      );
    }
  });

  it("keeps the gateway PC-A repairs off its fixed details", () => {
    // Architecture review's required correction, and it outranks the card
    // requirement above: PC-A's gateway is what Mission 8 CHANGES, so it is
    // reported per stage. On the card it could still read 192.168.2.1 after
    // the learner has repaired it.
    const eighth = faceFacts(8).filter((fact) =>
      fact.label.toLowerCase().includes("hands off to")
    );

    for (const fact of eighth) {
      expect(`mission 8 card gateway on ${fact.device}`).not.toBe(
        "mission 8 card gateway on PC-A"
      );
    }
  });
});

describe("beginner wording does not become a false model", () => {
  /**
   * DEC-063: "simplification may reduce vocabulary; it may not create a false
   * mental model that must later be unlearned."
   *
   * The course deliberately says "the print request" and "the file" before it
   * has taught what a frame or a packet is. That is allowed — and only because
   * the course later names the real units and connects them to what the
   * learner watched. This asserts the second half actually happens.
   */
  function proseOf(stableId: string): string {
    const mission = document.missions.find((m) => m.stableId === stableId);
    if (mission === undefined) throw new Error(`no mission ${stableId}`);

    return mission.steps
      .flatMap((step) =>
        step.content.type === "concept"
          ? [step.content.title ?? "", ...step.content.paragraphs]
          : []
      )
      .join("\n");
  }

  it("names the real unit in the mission that shows it", () => {
    // Mission 2 calls it a file while showing it move, then names the frame.
    expect(proseOf("nf-m2-inside-one-network")).toMatch(/\bframe\b/i);
  });

  it("names the second unit once something crosses a boundary", () => {
    expect(proseOf("nf-m6-routers-and-the-journey")).toMatch(/\bpacket\b/i);
  });

  it("connects the plain word to the technical one rather than dropping it", () => {
    // The frame is introduced as a name for what the learner already watched,
    // not as a definition arriving from nowhere.
    const mission2 = proseOf("nf-m2-inside-one-network").toLowerCase();
    expect(mission2).toContain("frame");
    expect(mission2).toMatch(/that unit is called a frame|is called a frame/);
  });

  it("does not name a later unit before the mission that owns it", () => {
    // Teach-before-use, in the direction that matters: Mission 2 may not call
    // anything a packet, because Mission 6 is where a packet becomes visible.
    expect(proseOf("nf-m2-inside-one-network")).not.toMatch(/\bpacket\b/i);
    expect(proseOf("nf-m1-what-a-network-is")).not.toMatch(/\bframe\b|\bpacket\b/i);
  });
});

describe("the learner reads one dialect of English", () => {
  /**
   * Founder UAT, second round: "the Founder identified 'behaviour' as
   * incorrect-looking for an American-English learner."
   *
   * The default learner locale for this product is en-US. There is no i18n
   * architecture in the repository yet and this wave does not build one — what
   * it does is stop the authored course mixing dialects, which is the part a
   * learner actually sees. Future localisation is a separate capability.
   *
   * Stable ids are excluded deliberately: they are identity, never prose, and
   * `m5-s4-why-it-has-to-be-a-neighbour` must not change spelling because a
   * paragraph did. Competency titles and descriptions are excluded for the
   * same reason the concept ledger excludes them — four are reused from
   * Router-on-a-Stick byte-for-byte and cannot be reworded here.
   */
  const BRITISH = [
    "behaviour",
    "behaviours",
    "colour",
    "colours",
    "recognise",
    "recognised",
    "recognises",
    "recognising",
    "organise",
    "organised",
    "realise",
    "realised",
    "analyse",
    "analysed",
    "travelled",
    "travelling",
    "labelled",
    "labelling",
    "neighbour",
    "neighbours",
    "neighbouring",
    "practise",
    "practising",
    "summarise",
    "minimise",
    "maximise",
    "normalise",
    "catalogue",
    "favour",
    "favourite",
    "defence",
    "licence",
    "centre",
    "centred"
  ] as const;

  /** Every string a learner reads, with identifiers and metadata left out. */
  function learnerProse(): string {
    const parts: string[] = [document.course.description];

    for (const module of document.modules) {
      parts.push(module.title, module.description);
    }

    for (const mission of document.missions) {
      parts.push(mission.title, mission.description);

      for (const step of mission.steps) {
        const content = step.content;

        if (content.type === "concept") {
          parts.push(content.title ?? "", ...content.paragraphs);
        } else if (content.type === "command") {
          parts.push(content.caption ?? "");
        } else if (content.type === "interaction") {
          parts.push(content.caption ?? "", content.textEquivalent ?? "");

          // The journey's authored words, without its identifiers.
          const parameters = content.parameters as {
            groups?: readonly { label: string }[];
            nodes: readonly {
              label: string;
              about?: string;
              interfaces: readonly {
                label: string;
                attributes: readonly { label: string; value: string }[];
              }[];
            }[];
            traffic: { label: string; startActionLabel: string };
            stages: readonly {
              narration: string;
              decision?: string;
              prediction?: { prompt: string; options: readonly string[] };
              deviceFacts?: readonly {
                label: string;
                facts: readonly { label: string; value: string }[];
              }[];
            }[];
            fault?: { symptom: string; explanation: string };
            actions: readonly { label: string; observation: string }[];
            confirmation: { narration: string; summary: string };
          };

          for (const group of parameters.groups ?? []) parts.push(group.label);

          for (const node of parameters.nodes) {
            parts.push(node.label, node.about ?? "");
            for (const iface of node.interfaces) {
              parts.push(iface.label);
              for (const attribute of iface.attributes) {
                parts.push(attribute.label, attribute.value);
              }
            }
          }

          parts.push(
            parameters.traffic.label,
            parameters.traffic.startActionLabel
          );

          for (const stage of parameters.stages) {
            parts.push(stage.narration, stage.decision ?? "");
            if (stage.prediction !== undefined) {
              parts.push(stage.prediction.prompt, ...stage.prediction.options);
            }
            for (const shown of stage.deviceFacts ?? []) {
              parts.push(shown.label);
              for (const fact of shown.facts) parts.push(fact.label, fact.value);
            }
          }

          if (parameters.fault !== undefined) {
            parts.push(parameters.fault.symptom, parameters.fault.explanation);
          }

          for (const action of parameters.actions) {
            parts.push(action.label, action.observation);
          }

          parts.push(
            parameters.confirmation.narration,
            parameters.confirmation.summary
          );
        }
      }
    }

    return parts.join("\n");
  }

  it("uses American spellings everywhere a learner reads", () => {
    const prose = learnerProse();

    for (const word of BRITISH) {
      const used = new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`, "i").test(
        prose
      );

      expect(`${word}: ${used}`).toBe(`${word}: false`);
    }
  });

  it("leaves stable identifiers alone", () => {
    // The proof that the rule above is about prose rather than about the file:
    // this id keeps its original spelling, because identity is not language.
    const ids = document.missions.flatMap((mission) =>
      mission.steps.map((step) => step.stableId)
    );

    expect(ids).toContain("m5-s4-why-it-has-to-be-a-neighbour");
  });
});

describe("the concept ledger is a usable audit source", () => {
  const ledger = readTable(LEDGER_PATH);

  it("names only missions that exist, in non-decreasing order", () => {
    const missionIds = new Set(document.missions.map((m) => m.stableId));
    const order = missionsInLearningOrder().map((m) => m.stableId);

    let previousOrder = 0;
    let previousMission = -1;

    for (const [rank, missionStableId] of ledger) {
      expect(missionIds.has(missionStableId!), `unknown mission ${missionStableId}`)
        .toBe(true);

      const rankValue = Number(rank);
      expect(rankValue).toBeGreaterThan(previousOrder);
      previousOrder = rankValue;

      const missionIndex = order.indexOf(missionStableId!);
      expect(missionIndex).toBeGreaterThanOrEqual(previousMission);
      previousMission = missionIndex;
    }
  });

  it("covers every mission", () => {
    // A mission absent from the ledger teaches concepts nothing is auditing.
    const covered = new Set(ledger.map(([, missionStableId]) => missionStableId));

    for (const mission of document.missions) {
      expect(covered.has(mission.stableId), `${mission.stableId} has no concepts`)
        .toBe(true);
    }
  });

  it("introduces no term before the mission that owns it", () => {
    // TEACH-BEFORE-USE, mechanically. The ledger says the earliest mission at
    // which a concept may be used; this asserts no earlier mission uses its
    // word. Whole-word and case-insensitive, so "report" does not match "port".
    //
    // Most rows pass trivially today because J1 authors no steps. That is the
    // point: the guard is placed before the writing starts, so a forward
    // reference in J3 onward fails here instead of reaching a beginner.
    const order = missionsInLearningOrder();

    for (const [, missionStableId, concept, term] of ledger) {
      if (term === "-") continue;

      const introducedAt = order.findIndex(
        (mission) => mission.stableId === missionStableId
      );
      const pattern = new RegExp(`\\b${term}\\b`, "i");

      for (const earlier of order.slice(0, introducedAt)) {
        const text = `${earlier.title}\n${earlier.description}`;

        expect(
          pattern.test(text),
          `"${concept}" is used in ${earlier.stableId}, before ${missionStableId} introduces it`
        ).toBe(false);
      }
    }
  });

  it("keeps every ledger term out of the course and module framing", () => {
    // Course and module descriptions are read BEFORE any mission, so a ledger
    // term appearing in them is a forward reference by definition. They are
    // orientation text and must carry no vocabulary the learner has not met.
    const framing = [
      `${document.course.title}\n${document.course.description}`,
      ...document.modules.map(
        (module) => `${module.title}\n${module.description}`
      )
    ];

    for (const [, , concept, term] of ledger) {
      if (term === "-") continue;
      const pattern = new RegExp(`\\b${term}\\b`, "i");

      for (const text of framing) {
        expect(
          pattern.test(text),
          `"${concept}" appears in course or module framing, before any mission teaches it`
        ).toBe(false);
      }
    }
  });

  it("records the concepts the beginner-complete standard requires", () => {
    const concepts = ledger.map(([, , concept]) => concept);

    for (const required of [
      "network purpose",
      "host",
      "switch",
      "router",
      "interface",
      "port",
      "topology",
      "local delivery",
      "frame",
      "MAC address",
      "unknown-destination flooding",
      "broadcast",
      "IPv4",
      "prefix length",
      "ARP",
      "default gateway",
      "routing",
      "Layer 2 and Layer 3"
    ]) {
      expect(concepts, `${required} is not in the ledger`).toContain(required);
    }
  });
});
