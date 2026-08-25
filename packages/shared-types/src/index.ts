export type AppEnvironment = "development" | "test" | "production";

export type HealthState =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "recovering"
  | "maintenance"
  | "unknown";

export interface AppHealth {
  service: string;
  state: HealthState;
  checkedAt: string;
  version: string;
}

export * from "./audit";
export * from "./auth";
export * from "./curriculum";
export * from "./curriculum-admin";
export * from "./curriculum-quality";
export * from "./learning";
export * from "./learning-navigation";
export * from "./competency";
export * from "./learning-guidance";
export * from "./assessment-attempt";
export * from "./readiness";
export * from "./assessment-recovery";
export * from "./assessment";
export * from "./evidence";
export * from "./evidence-competency";
export * from "./evidence-correction";
export * from "./evidence-portfolio";
export * from "./evidence-export";
export * from "./evidence-routing";
export * from "./certificate-definition";
export * from "./certificate-eligibility";
export * from "./certificate-issuance";
export * from "./certificate-lifecycle";
export * from "./certificate-verification";
export * from "./certificate-portfolio";
export * from "./certificate-export";
export * from "./certificate-correction";
export * from "./certificate-presentation";
export * from "./search-document";
export * from "./curriculum-search";
export * from "./curriculum-search-filters";
export * from "./search-terms";
export * from "./search-typo";
export * from "./search-freshness";
export * from "./search-permission";
export * from "./assessment-evidence";
export * from "./lab-evidence";
export * from "./notes";
export * from "./note-blocks";
export * from "./note-retrieval";
export * from "./note-export";
export * from "./errors";
export * from "./version";
export * from "./labs";
export * from "./lab-sessions";
export * from "./lab-runtime";
export * from "./lab-operations";
export * from "./lab-automation";
export * from "./lab-rollout";
