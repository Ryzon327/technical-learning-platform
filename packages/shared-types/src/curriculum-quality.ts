export type CurriculumAssetType =
  | "article"
  | "video"
  | "lab"
  | "assessment"
  | "reference"
  | "download";

export interface CurriculumAssetReference {
  id: string;
  missionId: string;
  assetType: CurriculumAssetType;
  title: string;
  uri: string;
  position: number;
  required: boolean;
}

export interface CurriculumEffortSummary {
  learningPathMinutes: number;
  courseMinutes: Record<string, number>;
  moduleMinutes: Record<string, number>;
  missionMinutes: Record<string, number>;
}

export interface CurriculumQualityChecklist {
  hasCourses: boolean;
  coursesHaveModules: boolean;
  modulesHaveMissions: boolean;
  missionsHaveCompetencies: boolean;
  prerequisiteGraphAcyclic: boolean;
  stableOrderingValid: boolean;
  effortMetadataValid: boolean;
  contentAssetsValid: boolean;
}

export interface CurriculumQualityReport {
  valid: boolean;
  checklist: CurriculumQualityChecklist;
  issues: string[];
  effort: CurriculumEffortSummary;
}
