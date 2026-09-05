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
