import { describe, expect, it } from "vitest";
import {
  ROAS_COMPETENCIES,
  ROAS_COURSE,
  ROAS_KNOWLEDGE_CHECKS,
  roasMissionsInLearningOrder,
  ROAS_LAB_DEFINITION,
  ROAS_MISSIONS,
  ROAS_MODULES
} from "@tlp/shared-types";
import {
  buildRoasLearnerCourse,
  describeCompetency,
  describeEstimatedTime,
  parseMissionBrief
} from "./roas-course-content";

/**
 * ROAS-3 — the learner course is a projection, never a second copy.
 *
 * These tests deliberately assert against the authored ROAS-2 constants rather
 * than against literals. A test that hardcoded "Mission 1 — Understand the
 * Network" would pass while the UI drifted away from the reviewed curriculum,
 * which is the exact failure this package must not have.
 */
describe("ROAS-3 learner course projection", () => {
  const course = buildRoasLearnerCourse();

  it("presents the approved structure the curriculum actually authored", () => {
    expect(course.modules).toHaveLength(ROAS_MODULES.length);
    expect(course.missions).toHaveLength(ROAS_MISSIONS.length);

    // The approved counts, stated once so a silent change is visible here too.
    expect(course.modules).toHaveLength(4);
    expect(course.missions).toHaveLength(7);
  });

  it("takes course identity from the authored source", () => {
    expect(course.stableId).toBe(ROAS_COURSE.stableId);
    expect(course.title).toBe(ROAS_COURSE.title);
    expect(course.description).toBe(ROAS_COURSE.description);
    expect(course.learningPathStableId).toBe(ROAS_COURSE.learningPathStableId);
  });

  it("nests every mission under the module that authored it", () => {
    for (const module of course.modules) {
      for (const mission of module.missions) {
        expect(mission.moduleStableId).toBe(module.stableId);
      }
    }

    const projected = course.missions.map((mission) => mission.stableId).sort();
    const authored = ROAS_MISSIONS.map((mission) => mission.stableId).sort();
    expect(projected).toEqual(authored);
  });

  it("orders by the authored position, not by array or alphabetical order", () => {
    const expectedOrder = [...ROAS_MODULES]
      .sort((left, right) => left.position - right.position)
      .flatMap((module) =>
        [...ROAS_MISSIONS]
          .filter((mission) => mission.moduleStableId === module.stableId)
          .sort((left, right) => left.position - right.position)
          .map((mission) => mission.stableId)
      );

    expect(course.missions.map((mission) => mission.stableId)).toEqual(
      expectedOrder
    );
  });

  it("numbers missions continuously across modules", () => {
    expect(course.missions.map((mission) => mission.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7
    ]);
  });

  it("renders every authored brief and invents no text", () => {
    for (const mission of course.missions) {
      const authored = ROAS_MISSIONS.find(
        (entry) => entry.stableId === mission.stableId
      );

      expect(authored).toBeDefined();
      expect(mission.title).toBe(authored!.title);
      expect(mission.brief.length).toBeGreaterThan(0);

      // Every rendered run of text must appear verbatim in the authored brief
      // once whitespace is normalised. Nothing may be added, reworded or
      // summarised on the way to the screen.
      const authoredFlat = authored!.brief.replace(/\s+/g, " ");
      for (const block of mission.brief) {
        const rendered =
          block.kind === "paragraph" ? [block.text] : block.items;
        for (const text of rendered) {
          expect(authoredFlat).toContain(text);
        }
      }
    }
  });

  it("describes competencies with authored words rather than identifiers", () => {
    for (const mission of course.missions) {
      const all = [
        ...mission.requiredCompetencies,
        ...mission.supportingCompetencies
      ];

      for (const competency of all) {
        const authored = ROAS_COMPETENCIES.find(
          (entry) => entry.stableId === competency.stableId
        );
        expect(authored).toBeDefined();
        expect(competency.title).toBe(authored!.title);
        expect(competency.description).toBe(authored!.description);
        // The learner-facing words must never be the identifier itself.
        expect(competency.title).not.toContain("net.");
        expect(competency.description).not.toContain("net.");
      }
    }
  });

  it("keeps every mission's required competencies required", () => {
    for (const authored of ROAS_MISSIONS) {
      const mission = course.missions.find(
        (entry) => entry.stableId === authored.stableId
      )!;

      const expectedRequired = authored.competencies
        .filter((link) => link.required)
        .map((link) => link.competencyStableId)
        .sort();

      expect(
        mission.requiredCompetencies.map((c) => c.stableId).sort()
      ).toEqual(expectedRequired);
      expect(mission.requiredCompetencies.length).toBeGreaterThan(0);
    }
  });

  it("marks the demonstration mission from the lab definition, not a guess", () => {
    const demonstrations = course.missions.filter(
      (mission) => mission.isDemonstration
    );

    expect(demonstrations).toHaveLength(1);
    expect(demonstrations[0]!.stableId).toBe(
      ROAS_LAB_DEFINITION.missionStableId
    );
  });

  it("surfaces the authored practice checks unchanged", () => {
    // PRACTICE-ARCH-1 wrapped each check with its placement. The DEFINITION
    // must still be the authored one, byte for byte — the projection places
    // practice, it does not edit it.
    expect(course.practice.map((check) => check.definition)).toEqual(
      ROAS_KNOWLEDGE_CHECKS
    );
    expect(course.practice).toHaveLength(ROAS_KNOWLEDGE_CHECKS.length);

    for (const check of course.practice) {
      expect(check.definition.purpose).toBe("practice");
      expect(check.definition.competencyMappings).toEqual([]);
    }
  });

  it("carries a placement for every authored check, losing none", () => {
    // buildLearnerPractice drops a check with no placement. Nothing may vanish
    // silently, so the count is pinned to the authored source.
    expect(course.practice).toHaveLength(ROAS_KNOWLEDGE_CHECKS.length);

    for (const check of course.practice) {
      expect(["mission", "course_review"]).toContain(check.scope);
      expect(check.availableFromMissionStableId).not.toBeNull();
      expect(check.availableFromIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("orders missions the same way the authored source does", () => {
    // The one ordering. If the projection and the authored helper ever
    // disagreed, practice eligibility and the course outline would be indexed
    // against different sequences — a second curriculum ordering by accident.
    expect(course.missions.map((mission) => mission.stableId)).toEqual(
      roasMissionsInLearningOrder().map((mission) => mission.stableId)
    );
  });

  it("states outcomes from the authored competencies", () => {
    expect(course.outcomes).toHaveLength(ROAS_COMPETENCIES.length);
    expect(course.outcomes).toHaveLength(9);
    expect(course.outcomes.map((outcome) => outcome.title)).toEqual(
      ROAS_COMPETENCIES.map((competency) => competency.title)
    );
  });
});

describe("ROAS-3 brief parsing", () => {
  it("splits blank-line separated blocks into paragraphs", () => {
    expect(parseMissionBrief("First idea.\n\nSecond idea.")).toEqual([
      { kind: "paragraph", text: "First idea." },
      { kind: "paragraph", text: "Second idea." }
    ]);
  });

  it("renders an authored dash block as a real list", () => {
    expect(
      parseMissionBrief("Deliver a network in which:\n\n- VLAN 10 exists\n- VLAN 20 exists")
    ).toEqual([
      { kind: "paragraph", text: "Deliver a network in which:" },
      { kind: "list", items: ["VLAN 10 exists", "VLAN 20 exists"] }
    ]);
  });

  it("does not treat a block containing prose as a list", () => {
    const blocks = parseMissionBrief("- one item\nbut then prose");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("paragraph");
  });

  it("collapses hard-wrapped lines into readable prose", () => {
    expect(parseMissionBrief("one line\nsecond line")).toEqual([
      { kind: "paragraph", text: "one line second line" }
    ]);
  });

  it("produces at least one list block across the authored curriculum", () => {
    const hasList = buildRoasLearnerCourse().missions.some((mission) =>
      mission.brief.some((block) => block.kind === "list")
    );
    expect(hasList).toBe(true);
  });

  it("never emits an empty block", () => {
    for (const mission of buildRoasLearnerCourse().missions) {
      for (const block of mission.brief) {
        if (block.kind === "paragraph") expect(block.text).not.toBe("");
        else expect(block.items.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("ROAS-3 competency description", () => {
  it("resolves an authored competency", () => {
    const resolved = describeCompetency("net.ip-addressing", true);
    expect(resolved?.title).toBe(
      ROAS_COMPETENCIES.find((c) => c.stableId === "net.ip-addressing")!.title
    );
    expect(resolved?.required).toBe(true);
  });

  it("drops an unknown competency rather than showing a bare identifier", () => {
    expect(describeCompetency("net.does-not-exist", true)).toBeNull();
  });
});

describe("ROAS-3 time phrasing", () => {
  it("stays in minutes below an hour", () => {
    expect(describeEstimatedTime(45)).toBe("About 45 minutes");
  });

  it("uses whole hours when they are whole", () => {
    expect(describeEstimatedTime(60)).toBe("About 1 hour");
    expect(describeEstimatedTime(120)).toBe("About 2 hours");
  });

  it("adds the remainder when there is one", () => {
    expect(describeEstimatedTime(90)).toBe("About 1 hour 30 minutes");
    expect(describeEstimatedTime(300)).toBe("About 5 hours");
  });

  it("never implies a deadline", () => {
    for (const minutes of [15, 45, 90, 300]) {
      const text = describeEstimatedTime(minutes);
      expect(text).toContain("About");
      expect(text).not.toMatch(/left|remaining|deadline|due|expires/i);
    }
  });
});
