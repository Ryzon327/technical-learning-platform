import type { PlatformRole, PublicProfile } from "@tlp/shared-types";
import { getBrowserSupabaseClient } from "../lib/supabase";

function isPlatformRole(value: unknown): value is PlatformRole {
  return value === "student" || value === "founder_admin";
}

export async function loadCurrentProfile(
  userId: string
): Promise<PublicProfile> {
  const supabase = getBrowserSupabaseClient();

  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id,display_name,role,created_at,updated_at")
    .eq("user_id", userId)
    .single();

  if (error || !data || !isPlatformRole(data.role)) {
    throw new Error("Unable to load your profile.");
  }

  return {
    userId: data.user_id,
    displayName: data.display_name ?? undefined,
    role: data.role,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}
