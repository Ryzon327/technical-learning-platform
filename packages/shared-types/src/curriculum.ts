export type CurriculumPublicationState =
  | "draft"
  | "review"
  | "published"
  | "retired";

export type CurriculumNodeType =
  | "learning_path"
  | "course"
  | "module"
  | "mission"
  | "competency";

export interface CurriculumIdentity {
  id: string;
  stableId: string;
  version: number;
}

export interface LearningPath extends CurriculumIdentity {
  title: string;
  description?: string;
  publicationState: CurriculumPublicationState;
  estimatedMinutes?: number;
}

export interface Course extends CurriculumIdentity {
  learningPathId: string;
  title: string;
  description?: string;
  position: number;
  publicationState: CurriculumPublicationState;
  estimatedMinutes?: number;
}

export interface LearningModule extends CurriculumIdentity {
  courseId: string;
  title: string;
  description?: string;
  position: number;
  publicationState: CurriculumPublicationState;
  estimatedMinutes?: number;
}

export interface Mission extends CurriculumIdentity {
  moduleId: string;
  title: string;
  description?: string;
  position: number;
  publicationState: CurriculumPublicationState;
  estimatedMinutes?: number;
}

export interface Competency extends CurriculumIdentity {
  title: string;
  description?: string;
  publicationState: CurriculumPublicationState;
}

export interface CompetencyPrerequisite {
  competencyId: string;
  prerequisiteCompetencyId: string;
}

/**
 * DEC-055 — what a mission DOES with a competency.
 *
 * `develops`   the mission is accountable for teaching and developing it.
 * `reinforces` it was developed elsewhere; this mission applies it again.
 *
 * Deliberately two values. A `requires` value would be a second, weaker
 * prerequisite mechanism — `learning_prerequisite_rules` remains the sole
 * authority for what must be true before a mission.
 */
export const MISSION_COMPETENCY_RELATIONSHIPS = [
  "develops",
  "reinforces"
] as const;

export type MissionCompetencyRelationship =
  (typeof MISSION_COMPETENCY_RELATIONSHIPS)[number];

export function isMissionCompetencyRelationship(
  value: unknown
): value is MissionCompetencyRelationship {
  return (
    typeof value === "string" &&
    (MISSION_COMPETENCY_RELATIONSHIPS as readonly string[]).includes(value)
  );
}

export interface MissionCompetencyLink {
  missionId: string;
  competencyId: string;
  /**
   * Required versus supporting WITHIN the mission.
   *
   * Orthogonal to `relationship`: a mission can require a competency it merely
   * reinforces, and can support one it develops. Neither is derivable from the
   * other, and neither may be used as a proxy for the other.
   */
  required: boolean;
  relationship: MissionCompetencyRelationship;
}

export interface PublishedLearningPathTree {
  learningPath: LearningPath;
  courses: Array<
    Course & {
      modules: Array<
        LearningModule & {
          missions: Mission[];
        }
      >;
    }
  >;
}
