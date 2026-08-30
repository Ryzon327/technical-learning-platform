import type {
  CurriculumPublicationState,
  CurriculumNodeType
} from "./curriculum";

export interface CurriculumValidationIssue {
  code:
    | "MISSING_TITLE"
    | "INVALID_POSITION"
    | "EMPTY_LEARNING_PATH"
    | "EMPTY_COURSE"
    | "EMPTY_MODULE"
    | "MISSING_COMPETENCY"
    | "UNPUBLISHED_CHILD"
    | "INVALID_STATE_TRANSITION" | "INVALID_MISSION_STEPS" | "INVALID_CURRICULUM_ASSET" | "UNRESOLVED_ASSET_REFERENCE";
  message: string;
  nodeType: CurriculumNodeType;
  nodeId?: string;
  stableId?: string;
}

export interface CurriculumValidationResult {
  valid: boolean;
  issues: CurriculumValidationIssue[];
}

export interface PublicationTransitionRequest {
  nodeType: CurriculumNodeType;
  nodeId: string;
  from: CurriculumPublicationState;
  to: CurriculumPublicationState;
}

export interface CreateCourseInput {
  learningPathId: string;
  stableId: string;
  title: string;
  description?: string;
  position: number;
  estimatedMinutes?: number;
}

export interface CreateModuleInput {
  courseId: string;
  stableId: string;
  title: string;
  description?: string;
  position: number;
  estimatedMinutes?: number;
}

export interface CreateMissionInput {
  moduleId: string;
  stableId: string;
  title: string;
  description?: string;
  position: number;
  estimatedMinutes?: number;
}

export interface CreateCompetencyInput {
  stableId: string;
  title: string;
  description?: string;
}
