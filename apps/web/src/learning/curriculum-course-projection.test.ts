import { describe, expect, it } from "vitest";
import type {
  Course,
  LearningModule,
  Mission,
  PublishedLearningPathTree
} from "@tlp/shared-types";
import {
  LEARNER_PATH_STABLE_ID,
  firstPublishedCourseStableId,
  projectLearnerCourseFromPublishedTree,
  selectLearnerCourse
} from "./curriculum-course-projection";
import { buildRoasLearnerCourse } from "./roas-course-content";

/**
 * WP-J / J1.5 — the published tree as the learner course model.
 *
 * The fixtures below are DELIBERATELY not Networking Foundations and not
 * Router-on-a-Stick. The projection must know neither, so proving it against
 * either would prove less: an invented course with invented ids is the only
 * fixture that can demonstrate the module is generic.
 *
 * Positions are also deliberately shuffled and non-contiguous. Authored position
 * is the ordering authority, and a fixture already in array order could not tell
 * the difference between reading it and ignoring it.
 */

let nextRowId = 0;

/** A published node's identity fields. Row ids are unique and never meaningful. */
function identity(stableId: string) {
  nextRowId += 1;
  return { id: `row-${nextRowId}`, stableId, version: 1 };
}

function mission(
  stableId: string,
  position: number,
  overrides: Partial<Mission> = {}
): Mission {
  return {
    ...identity(stableId),
    moduleId: "unused-row-id",
    title: `Mission ${stableId}`,
    description: `First paragraph for ${stableId}.\n\nSecond paragraph.`,
    position,
    publicationState: "published",
    estimatedMinutes: 30,
    ...overrides
  };
}

function module(
  stableId: string,
  position: number,
  missions: Mission[],
  overrides: Partial<LearningModule> = {}
): LearningModule & { missions: Mission[] } {
  return {
    ...identity(stableId),
    courseId: "unused-row-id",
    title: `Module ${stableId}`,
    description: `Description for ${stableId}.`,
    position,
    publicationState: "published",
    estimatedMinutes: 60,
    ...overrides,
    missions
  };
}

function course(
  stableId: string,
  position: number,
  modules: Array<LearningModule & { missions: Mission[] }>,
  overrides: Partial<Course> = {}
): Course & { modules: Array<LearningModule & { missions: Mission[] }> } {
  return {
    ...identity(stableId),
    learningPathId: "unused-row-id",
    title: `Course ${stableId}`,
    description: `Description for ${stableId}.`,
    position,
    publicationState: "published",
    estimatedMinutes: 120,
    ...overrides,
    modules
  };
}

function tree(
  courses: Array<Course & { modules: Array<LearningModule & { missions: Mission[] }> }>
): PublishedLearningPathTree {
  return {
    learningPath: {
      ...identity(LEARNER_PATH_STABLE_ID),
      title: "Connected Learning",
      description: "A path.",
      publicationState: "published"
    },
    courses
  };
}

/** Two modules, four missions, every position out of array order. */
function sampleTree(): PublishedLearningPathTree {
  return tree([
    course("beta-course", 1, [module("beta-mod", 0, [mission("beta-m1", 0)])]),
    course("alpha-course", 0, [
      module("alpha-mod-second", 5, [
        mission("alpha-m4", 9, { estimatedMinutes: 15 }),
        mission("alpha-m3", 2)
      ]),
      module("alpha-mod-first", 1, [
        mission("alpha-m2", 7),
        mission("alpha-m1", 3)
      ])
    ])
  ]);
}

function projectOrThrow(stableId: string, source = sampleTree()) {
  const projection = projectLearnerCourseFromPublishedTree(source, stableId);
  if (projection.kind !== "available") {
    throw new Error(`expected a projected course, got ${projection.reason}`);
  }
  return projection.course;
}

/* ------------------------------------------------------------------ *
 * Structure comes from the tree
 * ------------------------------------------------------------------ */

describe("the requested course is projected from authoritative structure", () => {
  it("projects the course named by stable id, not the first one", () => {
    const projected = projectOrThrow("beta-course");

    expect(projected.stableId).toBe("beta-course");
    expect(projected.title).toBe("Course beta-course");
    expect(projected.description).toBe("Description for beta-course.");
    expect(projected.learningPathStableId).toBe(LEARNER_PATH_STABLE_ID);
  });

  it("orders modules by authored position, not array order", () => {
    const projected = projectOrThrow("alpha-course");

    expect(projected.modules.map((entry) => entry.stableId)).toEqual([
      "alpha-mod-first",
      "alpha-mod-second"
    ]);
    expect(projected.modules.map((entry) => entry.ordinal)).toEqual([1, 2]);
  });

  it("orders missions within a module by authored position", () => {
    const projected = projectOrThrow("alpha-course");

    expect(projected.modules[0]?.missions.map((entry) => entry.stableId)).toEqual(
      ["alpha-m1", "alpha-m2"]
    );
    expect(projected.modules[1]?.missions.map((entry) => entry.stableId)).toEqual(
      ["alpha-m3", "alpha-m4"]
    );
  });

  it("numbers missions continuously across modules in learning order", () => {
    const projected = projectOrThrow("alpha-course");

    expect(projected.missions.map((entry) => entry.stableId)).toEqual([
      "alpha-m1",
      "alpha-m2",
      "alpha-m3",
      "alpha-m4"
    ]);
    expect(projected.missions.map((entry) => entry.ordinal)).toEqual([1, 2, 3, 4]);
  });

  it("takes module membership from nesting, never from the stable id", () => {
    const nested = tree([
      course("c", 0, [
        // A mission whose id suggests one module, nested under another. The
        // nesting is the fact; the naming is not.
        module("module-two", 0, [mission("module-one-mission", 0)])
      ])
    ]);

    const projection = projectLearnerCourseFromPublishedTree(nested, "c");
    if (projection.kind !== "available") throw new Error("expected a course");

    expect(projection.course.missions[0]?.moduleStableId).toBe("module-two");
  });

  it("uses stable ids as identity and never a database row id", () => {
    const serialised = JSON.stringify(projectOrThrow("alpha-course"));

    expect(serialised).not.toContain("row-");
    expect(serialised).not.toContain("unused-row-id");
  });
});

/* ------------------------------------------------------------------ *
 * Effort and briefs
 * ------------------------------------------------------------------ */

describe("authored effort and briefs are carried, never invented", () => {
  it("carries authored estimated minutes at every level", () => {
    const projected = projectOrThrow("alpha-course");

    expect(projected.estimatedMinutes).toBe(120);
    expect(projected.modules[0]?.estimatedMinutes).toBe(60);
    expect(projected.missions[3]?.estimatedMinutes).toBe(15);
  });

  it("sums children when a parent authored no estimate", () => {
    const partial = tree([
      course(
        "c",
        0,
        [
          module("m", 0, [mission("m1", 0), mission("m2", 1)], {
            estimatedMinutes: undefined
          })
        ],
        { estimatedMinutes: undefined }
      )
    ]);

    const projection = projectLearnerCourseFromPublishedTree(partial, "c");
    if (projection.kind !== "available") throw new Error("expected a course");

    expect(projection.course.modules[0]?.estimatedMinutes).toBe(60);
    expect(projection.course.estimatedMinutes).toBe(60);
  });

  it("reports zero rather than a guess when nothing anywhere is authored", () => {
    const unauthored = tree([
      course(
        "c",
        0,
        [
          module("m", 0, [mission("m1", 0, { estimatedMinutes: undefined })], {
            estimatedMinutes: undefined
          })
        ],
        { estimatedMinutes: undefined }
      )
    ]);

    const projection = projectLearnerCourseFromPublishedTree(unauthored, "c");
    if (projection.kind !== "available") throw new Error("expected a course");

    expect(projection.course.missions[0]?.estimatedMinutes).toBe(0);
    expect(projection.course.estimatedMinutes).toBe(0);
  });

  it("parses the authored description with the existing brief parser", () => {
    const projected = projectOrThrow("beta-course");

    expect(projected.missions[0]?.brief).toEqual([
      { kind: "paragraph", text: "First paragraph for beta-m1." },
      { kind: "paragraph", text: "Second paragraph." }
    ]);
  });

  it("produces no brief at all when a mission authored no description", () => {
    const silent = tree([
      course("c", 0, [
        module("m", 0, [mission("m1", 0, { description: undefined })])
      ])
    ]);

    const projection = projectLearnerCourseFromPublishedTree(silent, "c");
    if (projection.kind !== "available") throw new Error("expected a course");

    // Empty, not placeholder prose. A mission with nothing written is a fact.
    expect(projection.course.missions[0]?.brief).toEqual([]);
  });

  it("leaves an absent module or course description empty", () => {
    const silent = tree([
      course(
        "c",
        0,
        [
          module("m", 0, [mission("m1", 0)], { description: undefined })
        ],
        { description: undefined }
      )
    ]);

    const projection = projectLearnerCourseFromPublishedTree(silent, "c");
    if (projection.kind !== "available") throw new Error("expected a course");

    expect(projection.course.description).toBe("");
    expect(projection.course.modules[0]?.description).toBe("");
  });
});

/* ------------------------------------------------------------------ *
 * What the tree cannot say, the projection does not say either
 * ------------------------------------------------------------------ */

describe("absent facts are projected empty, never inferred", () => {
  const projected = projectOrThrow("alpha-course");

  it("infers no competency relationships", () => {
    for (const entry of projected.missions) {
      expect(entry.developsCompetencies).toEqual([]);
      expect(entry.reinforcesCompetencies).toEqual([]);
    }
    expect(projected.outcomes).toEqual([]);
  });

  it("infers no practice", () => {
    expect(projected.practice).toEqual([]);
  });

  it("claims no mission is the practical demonstration", () => {
    // Saying so would tell a learner they are about to prove a competency,
    // which only an authoritative lab definition may claim.
    expect(projected.missions.every((entry) => !entry.isDemonstration)).toBe(true);
  });

  it("carries no learner state of any kind", () => {
    const serialised = JSON.stringify(projected);

    for (const learnerFact of [
      "not_started",
      "in_progress",
      "completed",
      "competency_demonstrated",
      "progress",
      "resume",
      "nextAction",
      "available",
      "evidence"
    ]) {
      expect(serialised).not.toContain(learnerFact);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Fail-closed
 * ------------------------------------------------------------------ */

describe("a course that cannot be projected says so", () => {
  it("reports an unknown course as not published", () => {
    const projection = projectLearnerCourseFromPublishedTree(
      sampleTree(),
      "no-such-course"
    );

    expect(projection).toEqual({
      kind: "unavailable",
      reason: "course_not_published"
    });
  });

  it("refuses a published course whose missions are all still drafts", () => {
    // The Curriculum Engine filters unpublished nodes server-side, so a course
    // mid-publication arrives with modules and no missions. Returning it would
    // render a finished-looking outline with nothing in it, indistinguishable
    // from a course the learner had completed.
    const draft = tree([course("c", 0, [module("m", 0, [])])]);

    expect(projectLearnerCourseFromPublishedTree(draft, "c")).toEqual({
      kind: "unavailable",
      reason: "no_published_missions"
    });
  });

  it("refuses a published course with no modules at all", () => {
    const empty = tree([course("c", 0, [])]);

    expect(projectLearnerCourseFromPublishedTree(empty, "c")).toEqual({
      kind: "unavailable",
      reason: "no_published_missions"
    });
  });

  it("keeps a published but empty module rather than hiding it", () => {
    // The module is published; that is authoritative. It renders with no
    // missions, which is true, as long as the course has missions elsewhere.
    const partial = tree([
      course("c", 0, [
        module("full", 0, [mission("m1", 0)]),
        module("empty", 1, [])
      ])
    ]);

    const projection = projectLearnerCourseFromPublishedTree(partial, "c");
    if (projection.kind !== "available") throw new Error("expected a course");

    expect(projection.course.modules).toHaveLength(2);
    expect(projection.course.modules[1]?.missions).toEqual([]);
    expect(projection.course.missions).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ *
 * Source selection
 * ------------------------------------------------------------------ */

describe("which course the learner surface renders", () => {
  const bundled = buildRoasLearnerCourse();

  it("names the first published course by authored position", () => {
    expect(firstPublishedCourseStableId(sampleTree())).toBe("alpha-course");
  });

  it("names nothing for a path with no published courses", () => {
    expect(firstPublishedCourseStableId(tree([]))).toBeNull();
  });

  it("keeps the compiled-in course while the tree has not answered", () => {
    // Not a substitution: the request has not returned, or it failed, and the
    // compiled-in course is exactly as readable as it was before this module.
    expect(selectLearnerCourse({ tree: null, bundledCourse: bundled })).toBe(
      bundled
    );
  });

  it("keeps the compiled-in course when the path publishes none", () => {
    expect(
      selectLearnerCourse({ tree: tree([]), bundledCourse: bundled })
    ).toBe(bundled);
  });

  it("keeps the compiled-in course when it is the first published course", () => {
    // Transitional. Its bundle still supplies competency links, the lab marker
    // and practice placement, none of which the tree carries.
    const withBundled = tree([
      course(bundled.stableId, 0, [module("m", 0, [mission("m1", 0)])])
    ]);

    expect(
      selectLearnerCourse({ tree: withBundled, bundledCourse: bundled })
    ).toBe(bundled);
  });

  it("projects a different first course from the tree", () => {
    const selected = selectLearnerCourse({
      tree: sampleTree(),
      bundledCourse: bundled
    });

    expect(selected?.stableId).toBe("alpha-course");
    expect(selected).not.toBe(bundled);
  });

  it("returns nothing rather than substituting another course", () => {
    // The load-bearing refusal. Showing the compiled-in course here would tell
    // a learner that a course they did not ask for is theirs.
    const unusable = tree([course("alpha-course", 0, [module("m", 0, [])])]);

    expect(
      selectLearnerCourse({ tree: unusable, bundledCourse: bundled })
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * The projection knows no course
 * ------------------------------------------------------------------ */

describe("the projection is generic", () => {
  it("names no course, in identity or in content", () => {
    // Router-on-a-Stick and Networking Foundations identities and authored
    // strings must both be absent: one would make this a second bundle, the
    // other a second curriculum source.
    const projected = projectOrThrow("alpha-course");
    const serialised = JSON.stringify(projected);

    for (const identifier of [
      "router-on-a-stick",
      "ros-m",
      "ros-mod",
      "networking-foundations",
      "nf-m",
      "nf-mod",
      "net.",
      "VLAN",
      "IPv4"
    ]) {
      expect(serialised).not.toContain(identifier);
    }
  });

  it("projects a course it has never heard of exactly as well", () => {
    const unknown = tree([
      course("some-future-course", 0, [
        module("some-future-module", 0, [mission("some-future-mission", 0)])
      ])
    ]);

    const projection = projectLearnerCourseFromPublishedTree(
      unknown,
      "some-future-course"
    );

    expect(projection.kind).toBe("available");
    if (projection.kind !== "available") return;
    expect(projection.course.missions[0]?.ordinal).toBe(1);
  });

  it("is deterministic for the same input", () => {
    expect(projectOrThrow("alpha-course")).toEqual(
      projectOrThrow("alpha-course")
    );
  });
});
