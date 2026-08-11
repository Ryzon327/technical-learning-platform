import { AppError, type AppEnvironment } from "@tlp/shared-types";

export interface RuntimeConfig {
  appEnv: AppEnvironment;
  appName: string;
  apiPort: number;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  aiDefaultProvider: string;
}

function readInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: "API_PORT must be a valid TCP port",
      retryable: false
    });
  }

  return parsed;
}

function readEnvironment(value: string | undefined): AppEnvironment {
  const resolved = value ?? "development";

  if (!["development", "test", "production"].includes(resolved)) {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: "APP_ENV must be development, test, or production",
      retryable: false
    });
  }

  return resolved as AppEnvironment;
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  return {
    appEnv: readEnvironment(env.APP_ENV),
    appName: env.APP_NAME?.trim() || "Technical Learning Platform",
    apiPort: readInteger(env.API_PORT, 3001),
    supabaseUrl: env.SUPABASE_URL?.trim() || undefined,
    supabaseAnonKey: env.SUPABASE_ANON_KEY?.trim() || undefined,
    supabaseServiceRoleKey:
      env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    aiDefaultProvider: env.AI_DEFAULT_PROVIDER?.trim() || "mock"
  };
}

export function validateRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  if (config.appEnv === "production") {
    const missing: string[] = [];

    if (!config.supabaseUrl) missing.push("SUPABASE_URL");
    if (!config.supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
    if (!config.supabaseServiceRoleKey) {
      missing.push("SUPABASE_SERVICE_ROLE_KEY");
    }

    if (missing.length > 0) {
      throw new AppError({
        code: "CONFIGURATION_ERROR",
        message: `Missing production configuration: ${missing.join(", ")}`,
        retryable: false
      });
    }
  }

  return config;
}
