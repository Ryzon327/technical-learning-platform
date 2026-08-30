// WP-D. `CurriculumAssetType` and `CurriculumAssetReference` moved to
// `curriculum-assets.ts`, which now owns the asset contract: the vocabulary,
// the narrower authorable subset, accessibility rules, validation and the
// persistence boundary. Both are still exported from `@tlp/shared-types`
// through `index.ts`, so no consumer import changed.
//
// They lived here because the quality report was their only reader. It still
// reads assets, but it is a consumer of the contract rather than its owner.

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
