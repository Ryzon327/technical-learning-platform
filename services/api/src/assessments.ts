import { AppError, type AssessmentPurpose } from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";

export interface StudentAssessmentSummary {
  stableId: string;
  version: number;
  title: string;
  purpose: AssessmentPurpose;
  passingPercent: number;
  maxAttempts?: number;
}

function isPurpose(value: unknown): value is AssessmentPurpose {
  return value === "practice" || value === "diagnostic" || value === "evidence_producing";
}

export async function listPublishedAssessments(accessToken: string): Promise<StudentAssessmentSummary[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("assessment_definitions")
    .select("stable_id,version,title,purpose,passing_percent,max_attempts")
    .eq("publication_state", "published")
    .order("title");

  if (error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Unable to load assessments", retryable: true });

  return (data ?? []).map((row) => {
    if (!isPurpose(row.purpose)) throw new AppError({ code: "INTERNAL_ERROR", message: "Invalid assessment purpose returned", retryable: false });
    return {
      stableId: String(row.stable_id), version: Number(row.version), title: String(row.title), purpose: row.purpose,
      passingPercent: Number(row.passing_percent), maxAttempts: row.max_attempts == null ? undefined : Number(row.max_attempts)
    };
  });
}
