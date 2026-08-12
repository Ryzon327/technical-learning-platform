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
export * from "./notes";
export * from "./note-blocks";
export * from "./note-retrieval";
export * from "./note-export";
export * from "./errors";
export * from "./version";
export * from "./labs";
export * from "./lab-sessions";
