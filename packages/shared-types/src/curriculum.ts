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

export interface MissionCompetencyLink {
  missionId: string;
  competencyId: string;
  required: boolean;
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
