import type { PublishedLearningPathTree } from "@tlp/shared-types";
import {
  parseMissionBrief,
  type LearnerCourse,
  type LearnerMission,
  type LearnerModule
} from "./roas-course-content";

/**
 * WP-J / J1.5 — the published curriculum tree, as the learner course model.
 *
 * ## What this exists to stop
 *
 * `GET /curriculum/paths/{stableId}` has always returned the authoritative
 * published hierarchy — path, courses, modules, missions, with titles,
 * descriptions, positions and estimated effort. `LearningView` has always
 * fetched it. And it then reduced the whole tree to a flat list of published
 * mission stable ids, while the structure a learner actually reads came from
 * compiled-in Router-on-a-Stick constants.
 *
 * That was correct while one course existed and its competency links, lab and
 * practice checks had nowhere else to come from. It stops being correct the
 * moment a second course exists, because the only way to add one would be to
 * compile a second tree into the browser — a second source of curriculum truth,
 * which is precisely what the Curriculum Engine owns.
 *
 * So this module does one thing: it projects the tree that was already fetched
 * into the presentation model the interface already renders. No new endpoint, no
 * new schema, no new contract.
 *
 * ## What this module must never become
 *
 * **It decides nothing about the learner.** No progress, no availability, no
 * resume point, no next action, no evidence, no competency state. Those belong
 * to the Learning Engine and arrive over their own contracts, and
 * `roas-course-presentation.ts` already joins them to a course by stable id.
 * A single learner fact computed here would be a second answer to a question
 * the server owns.
 *
 * **It infers nothing.** Structure comes from nesting and from authored
 * `position`, never from a stable id's shape. Competencies, practice and
 * demonstration status are absent from the tree today, so they are projected
 * EMPTY rather than guessed at, derived from prose, or read from a bundle.
 *
 * **It knows no course.** There is no Router-on-a-Stick identifier here, no
 * Networking Foundations identifier, and no authored string from either. A
 * course this module has never heard of projects exactly as well as one it has.
 *
 * ## Three states that are not the same thing
 *
 * Worth stating because they are easy to blur, and because a learner is
 * affected differently by each:
 *
 *   source curriculum        a document in `content/curriculum/`
 *   published curriculum     rows the Curriculum Engine returns as published
 *   learner-visible course   what this module projects from those rows
 *
 * A course can exist in the repository and be invisible here — that is not a
 * defect, it is publication working. This module never bridges that gap.
 */

/**
 * The learner path this product currently serves.
 *
 * One named constant, deliberately, and deliberately NOT read from the
 * Router-on-a-Stick bundle — taking the path identity from a course is what made
 * the surface course-shaped in the first place.
 *
 * It is not fetched either. `GET /curriculum/paths` exists and lists published
 * paths, but requesting a list to discover the only entry there is would be a
 * round trip that answers a question nobody is asking yet. When a second path
 * exists, discovery becomes a real decision; until then this is the honest
 * shape of a single-path product.
 */
export const LEARNER_PATH_STABLE_ID = "connected-learning-mvp";

/**
 * Why a course could not be projected.
 *
 *   course_not_published   no published course in the tree carries that id
 *   no_published_missions  the course is published, but nothing inside it is
 *
 * Two reasons rather than one boolean because they are different facts about
 * the world, and because the second is the case that must never be allowed to
 * render as a working but empty course.
 */
export type LearnerCourseUnavailableReason =
  | "course_not_published"
  | "no_published_missions";

export type LearnerCourseProjection =
  | { readonly kind: "available"; readonly course: LearnerCourse }
  | {
      readonly kind: "unavailable";
      readonly reason: LearnerCourseUnavailableReason;
    };

/** Ascending authored position. Ties keep their relative order. */
function byPosition<T extends { readonly position: number }>(
  left: T,
  right: T
): number {
  return left.position - right.position;
}

/**
 * The first course a learner meets in this path, by authored position.
 *
 * Position is the curriculum's own statement of order, so this needs no
 * knowledge of which course is which. Returns null for a path with no published
 * courses, which is a real state and not an error.
 */
export function firstPublishedCourseStableId(
  tree: PublishedLearningPathTree
): string | null {
  const [first] = [...tree.courses].sort(byPosition);
  return first?.stableId ?? null;
}

/**
 * Project one published course into the learner presentation model.
 *
 * Deterministic: the same tree and id always produce the same course, because
 * every ordering decision reads an authored `position` and nothing consults a
 * clock, a random source or learner state.
 */
export function projectLearnerCourseFromPublishedTree(
  tree: PublishedLearningPathTree,
  courseStableId: string
): LearnerCourseProjection {
  const published = tree.courses.find(
    (candidate) => candidate.stableId === courseStableId
  );

  if (published === undefined) {
    return { kind: "unavailable", reason: "course_not_published" };
  }

  const orderedModules = [...published.modules].sort(byPosition);

  // Mission ordinals run across the whole course — "Mission 3 of 8" — so they
  // are counted here rather than per module.
  let ordinal = 0;
  const missions: LearnerMission[] = [];

  const modules: LearnerModule[] = orderedModules.map(
    (module, moduleIndex) => {
      const moduleMissions: LearnerMission[] = [...module.missions]
        .sort(byPosition)
        .map((mission) => {
          ordinal += 1;

          return {
            stableId: mission.stableId,
            // Membership comes from the tree's NESTING, never from parsing an
            // id. The server nested this mission under this module; that is the
            // fact, and a naming convention is not.
            moduleStableId: module.stableId,
            ordinal,
            title: mission.title,
            // An unauthored description yields no blocks. A learner sees a
            // mission with no brief, which is true, rather than placeholder
            // prose, which would not be.
            brief:
              mission.description === undefined
                ? []
                : parseMissionBrief(mission.description),
            estimatedMinutes: mission.estimatedMinutes ?? 0,
            // Absent from the published tree today. Projected empty rather than
            // inferred: `mission_competencies` is readable, but exposing it is a
            // read-model change gated on the relationship migration, and
            // guessing from prose would be curriculum invented by the browser.
            developsCompetencies: [],
            reinforcesCompetencies: [],
            // The lab definition is not in the tree either. Claiming a mission
            // is the practical demonstration when nothing authoritative says so
            // would tell a learner they are about to prove a competency.
            isDemonstration: false
          };
        });

      missions.push(...moduleMissions);

      return {
        stableId: module.stableId,
        ordinal: moduleIndex + 1,
        title: module.title,
        description: module.description ?? "",
        // A parent with no authored estimate sums its children rather than
        // asserting zero. Zero survives only when nothing anywhere was authored.
        estimatedMinutes:
          module.estimatedMinutes ??
          moduleMissions.reduce(
            (total, mission) => total + mission.estimatedMinutes,
            0
          ),
        missions: moduleMissions
      };
    }
  );

  // A published course whose missions are all still drafts is not a course a
  // learner can work through. Returning it with an empty outline would render
  // as a finished-looking page with nothing in it, and the learner would have
  // no way to tell that from a course they had completed.
  if (missions.length === 0) {
    return { kind: "unavailable", reason: "no_published_missions" };
  }

  return {
    kind: "available",
    course: {
      stableId: published.stableId,
      learningPathStableId: tree.learningPath.stableId,
      title: published.title,
      description: published.description ?? "",
      estimatedMinutes:
        published.estimatedMinutes ??
        modules.reduce((total, module) => total + module.estimatedMinutes, 0),
      modules,
      missions,
      // Course outcomes are phrased from the competencies the course develops,
      // which the tree does not carry. Empty, for the same reason as above.
      outcomes: [],
      practice: []
    }
  };
}

/**
 * Which course the learner surface should render.
 *
 * ## Why Router-on-a-Stick still comes from its bundle
 *
 * Transitional, and recorded as such. Its bundle supplies three things the
 * published tree does not: competency links, the lab demonstration marker, and
 * practice placement. Projecting it from the tree today would silently drop all
 * three, so its behaviour is left exactly as it was and it migrates when the
 * tree can carry them.
 *
 * ## Why there is no fallback to it
 *
 * When the tree names a different course first and that course cannot be
 * projected, this returns null. Substituting Router-on-a-Stick would show a
 * learner a course they did not ask for and describe it as theirs — the
 * comfortable default this codebase refuses everywhere else. The caller renders
 * an honest unavailable state instead.
 *
 * A null tree is different, and is NOT a failure to substitute for: the request
 * has not answered yet, or it failed, and the compiled-in course remains
 * readable exactly as it was before this module existed.
 */
export function selectLearnerCourse(input: {
  readonly tree: PublishedLearningPathTree | null;
  readonly bundledCourse: LearnerCourse;
}): LearnerCourse | null {
  const { tree, bundledCourse } = input;

  if (tree === null) return bundledCourse;

  const firstCourse = firstPublishedCourseStableId(tree);

  // A path with no published courses leaves the compiled-in course readable,
  // which is what happens today. Availability already reports it honestly as
  // not published, so nothing here needs to say it twice.
  if (firstCourse === null) return bundledCourse;

  if (firstCourse === bundledCourse.stableId) return bundledCourse;

  const projection = projectLearnerCourseFromPublishedTree(tree, firstCourse);

  return projection.kind === "available" ? projection.course : null;
}
