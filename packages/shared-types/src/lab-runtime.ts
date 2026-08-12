import type { LabAccessMethod } from "./labs";

export interface LabAccessDelivery {
  sessionId: string;
  method: LabAccessMethod;
  endpoint: string;
  username?: string;
  expiresAt?: string;
  instructions: string[];
}

export type LabValidationRunState = "passed" | "incomplete" | "technical_error";

export interface LabValidationCheckResult {
  checkStableId: string;
  title: string;
  required: boolean;
  passed?: boolean;
  state: "passed" | "failed" | "technical_error";
  explanation: string;
}

export interface LabValidationRunResult {
  id: string;
  sessionId: string;
  state: LabValidationRunState;
  checkedAt: string;
  results: LabValidationCheckResult[];
}

export interface LabResetResult {
  sessionId: string;
  state: "ready";
  resetAt: string;
  resetCount: number;
}

export function deriveLabValidationState(results: LabValidationCheckResult[]): LabValidationRunState {
  if (results.some((result) => result.state === "technical_error")) return "technical_error";
  return results.filter((result) => result.required).every((result) => result.state === "passed")
    ? "passed"
    : "incomplete";
}
