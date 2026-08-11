import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@tlp/shared-types";
import { loadRuntimeConfig } from "./config";

export function createServerSupabaseClient(): SupabaseClient {
  const config = loadRuntimeConfig();

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: "Server Supabase configuration is not available",
      retryable: false
    });
  }

  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
