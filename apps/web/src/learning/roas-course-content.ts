import {
  ROAS_COMPETENCIES,
  ROAS_COURSE,
  ROAS_KNOWLEDGE_CHECKS,
  ROAS_LAB_DEFINITION,
  ROAS_LEARNING_PATH_STABLE_ID,
  ROAS_MISSIONS,
  ROAS_MODULES,
  resolveRoasPracticePlacements,
  type AssessmentDefinition,
  type MissionCompetencyRelationship,
  type RoasPracticeScope
} from "@tlp/shared-types";

/**
 * ROAS-3 — the learner-shaped projection of the ROAS-2 authored curriculum.
 *
 * ## Why this module exists, and what it is forbidden to do
 *
 * ROAS-2 authored the Router-on-a-Stick course as typed, versioned content in
 * `shared-types`. That content is the **single** authored source. This module
 * reshapes it for a reader — nesting missions under their module, ordering by
 * the authored `position`, splitting a brief into renderable blocks, and
 * resolving a competency id to the title and description ROAS-2 wrote for it.
 *
 * It therefore contains **no course text of its own**. Every title, brief,
 * description and question below is read from the authored constants; nothing
 * is re-typed here and nothing is invented. If a mission is renamed or the
 * progression is reordered in ROAS-2, this module follows automatically, and
 * `scripts/verify-roas3.sh` fails if a literal from the course ever appears in
 * the web sources.
 *
 * It is also deliberately inert: it imports one module, performs no I/O, and
 * knows nothing about progress, publication or the learner. Those are server
 * facts, and `roas-course-presentation.ts` is where they are joined — never
 * substituted.
 */

/** A competency as a learner should meet it: words, not an identifier. */
export interface LearnerCompetency {
  /**
   * Retained for React keys and `aria-controls` targets only.
   *
   * `net.ip-addressing` is an architectural identity, not learner-facing
   * language. The view renders `title` and `description`; the gate fails if a
   * raw competency id is placed in visible text.
   */
  stableId: string;
  title: string;
  description: string;
  /** Required versus supporting within the mission. Orthogonal to relationship. */
  required: boolean;
  /**
   * WP-B / DEC-055. What the mission does with this competency.
   *
   * The learner surface groups by THIS, not by `required`. Before WP-B the
   * heading "What this mission develops" sat above the required list, which
   * quietly asserted that required meant developed. Two authored links break
   * that: Mission 4 requires the default-gateway competency while only
   * reinforcing it, and Mission 6 does the same with connectivity
   * verification. Both would have been announced as newly taught.
   */
  relationship: MissionCompetencyRelationship;
}

/**
 * One renderable piece of an authored brief.
 *
 * The briefs are authored as text with blank-line separated blocks, one of
 * which (Mission 7) is a list of delivery conditions. Rendering that block as a
 * real `<ul>` rather than a paragraph of dashes is a presentation decision, so
 * it is made here where it is testable.
 */
export type BriefBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

export interface LearnerMission {
  stableId: string;
  moduleStableId: string;
  /** 1-based position across the whole course, for "Mission 3 of 7". */
  ordinal: number;
  title: string;
  brief: BriefBlock[];
  estimatedMinutes: number;
  /** Competencies this mission teaches. Grouped by relationship, not required. */
  developsCompetencies: LearnerCompetency[];
  /** Competencies developed earlier that this mission puts to use again. */
  reinforcesCompetencies: LearnerCompetency[];
  /**
   * True for the mission the authored lab definition points at.
   *
   * Derived from `ROAS_LAB_DEFINITION.missionStableId` rather than hardcoded,
   * so the view cannot claim the wrong mission is the practical demonstration.
   */
  isDemonstration: boolean;
}

export interface LearnerModule {
  stableId: string;
  /** 1-based position within the course. */
  ordinal: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  missions: LearnerMission[];
}

/** A course outcome, phrased from the authored competency the course develops. */
export interface LearnerOutcome {
  stableId: string;
  title: string;
  description: string;
}

export interface LearnerCourse {
  stableId: string;
  learningPathStableId: string;
  title: string;
  description: string;
  estimatedMinutes: number;
  modules: LearnerModule[];
  /** Every mission in learning order, flattened. */
  missions: LearnerMission[];
  outcomes: LearnerOutcome[];
  practice: readonly LearnerPracticeCheck[];
}

/**
 * A practice check together with where it belongs and when it is answerable.
 *
 * PRACTICE-ARCH-1. `practice` used to be the bare authored list, and the view
 * rendered all of it beneath whichever mission was open — implying that every
 * check belonged to that mission, and exposing questions about concepts the
 * learner had not reached. The placement travels with the definition so no
 * consumer has to guess.
 *
 * Both extra fields are projected from the authored source; nothing here
 * decides them.
 */
export interface LearnerPracticeCheck {
  definition: AssessmentDefinition;
  scope: RoasPracticeScope;
  /** Null only if authoring is broken; validateRoasCurriculum rejects that. */
  availableFromMissionStableId: string | null;
  /** Position in learning order, or -1 when unavailable. */
  availableFromIndex: number;
}

/**
 * Split an authored brief into renderable blocks.
 *
 * Blocks are separated by a blank line. A block whose every line begins with a
 * list marker becomes a list; anything else becomes a paragraph with its line
 * breaks collapsed, so the reader gets prose rather than hard-wrapped text.
 */
export function parseMissionBrief(brief: string): BriefBlock[] {
  return brief
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "");

      const isList =
        lines.length > 0 && lines.every((line) => line.startsWith("- "));

      if (isList) {
        return {
          kind: "list" as const,
          items: lines.map((line) => line.slice("- ".length).trim())
        };
      }

      return { kind: "paragraph" as const, text: lines.join(" ") };
    });
}

/** Resolve an authored competency id to the words ROAS-2 wrote for it. */
export function describeCompetency(
  competencyStableId: string,
  required: boolean,
  relationship: MissionCompetencyRelationship
): LearnerCompetency | null {
  const authored = ROAS_COMPETENCIES.find(
    (competency) => competency.stableId === competencyStableId
  );

  // A mission referencing a competency that no longer exists is a content
  // defect. It is dropped rather than rendered as a bare identifier, and
  // `validateRoasCurriculum` is what actually rejects that state.
  if (!authored) return null;

  return {
    stableId: authored.stableId,
    title: authored.title,
    description: authored.description,
    required,
    relationship
  };
}

function buildMission(
  authored: (typeof ROAS_MISSIONS)[number],
  ordinal: number
): LearnerMission {
  const resolved = authored.competencies
    .map((link) =>
      describeCompetency(link.competencyStableId, link.required, link.relationship)
    )
    .filter((competency): competency is LearnerCompetency =>
      competency !== null
    );

  return {
    stableId: authored.stableId,
    moduleStableId: authored.moduleStableId,
    ordinal,
    title: authored.title,
    brief: parseMissionBrief(authored.brief),
    estimatedMinutes: authored.estimatedMinutes,
    developsCompetencies: resolved.filter(
      (competency) => competency.relationship === "develops"
    ),
    reinforcesCompetencies: resolved.filter(
      (competency) => competency.relationship === "reinforces"
    ),
    isDemonstration:
      authored.stableId === ROAS_LAB_DEFINITION.missionStableId
  };
}

/**
 * Assemble the learner-facing course from the authored ROAS-2 content.
 *
 * Ordering comes from the authored `position` fields, and missions are nested
 * by `moduleStableId`. Nothing is sorted by title, id or array order, so the
 * approved progression survives a reordering of the source arrays.
 */
export function buildRoasLearnerCourse(): LearnerCourse {
  const orderedModules = [...ROAS_MODULES].sort(
    (left, right) => left.position - right.position
  );

  let ordinal = 0;
  const modules: LearnerModule[] = orderedModules.map(
    (authoredModule, moduleIndex) => {
      const missions = [...ROAS_MISSIONS]
        .filter(
          (mission) => mission.moduleStableId === authoredModule.stableId
        )
        .sort((left, right) => left.position - right.position)
        .map((mission) => {
          ordinal += 1;
          return buildMission(mission, ordinal);
        });

      return {
        stableId: authoredModule.stableId,
        ordinal: moduleIndex + 1,
        title: authoredModule.title,
        description: authoredModule.description,
        estimatedMinutes: authoredModule.estimatedMinutes,
        missions
      };
    }
  );

  return {
    stableId: ROAS_COURSE.stableId,
    learningPathStableId: ROAS_LEARNING_PATH_STABLE_ID,
    title: ROAS_COURSE.title,
    description: ROAS_COURSE.description,
    estimatedMinutes: ROAS_COURSE.estimatedMinutes,
    modules,
    missions: modules.flatMap((module) => module.missions),
    outcomes: ROAS_COMPETENCIES.map((competency) => ({
      stableId: competency.stableId,
      title: competency.title,
      description: competency.description
    })),
    practice: buildLearnerPractice()
  };
}

/**
 * Join each authored check to its resolved placement.
 *
 * A check without a placement would be unplaceable on the learner surface;
 * `validateRoasCurriculum` already rejects that, so this drops nothing silently
 * — the array lengths are pinned equal by test.
 */
function buildLearnerPractice(): LearnerPracticeCheck[] {
  const placements = new Map(
    resolveRoasPracticePlacements().map((placement) => [
      placement.assessmentStableId,
      placement
    ])
  );

  return ROAS_KNOWLEDGE_CHECKS.flatMap((definition) => {
    const placement = placements.get(definition.stableId);
    if (!placement) return [];

    return [
      {
        definition,
        scope: placement.scope,
        availableFromMissionStableId: placement.availableFromMissionStableId,
        availableFromIndex: placement.availableFromIndex
      }
    ];
  });
}

/** Human phrasing for an authored duration. Never a countdown or a deadline. */
export function describeEstimatedTime(minutes: number): string {
  if (minutes < 60) return `About ${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourText = hours === 1 ? "1 hour" : `${hours} hours`;

  return remainder === 0
    ? `About ${hourText}`
    : `About ${hourText} ${remainder} minutes`;
}
