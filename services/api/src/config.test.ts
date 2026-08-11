import { describe, expect, it } from "vitest";
import { AppError } from "@tlp/shared-types";
import { loadRuntimeConfig, validateRuntimeConfig } from "./config";

describe("runtime configuration", () => {
  it("loads safe development defaults", () => {
    const config = loadRuntimeConfig({});

    expect(config.appEnv).toBe("development");
    expect(config.apiPort).toBe(3001);
    expect(config.aiDefaultProvider).toBe("mock");
  });

  it("requires protected Supabase configuration in production", () => {
    const config = loadRuntimeConfig({
      APP_ENV: "production"
    });

    expect(() => validateRuntimeConfig(config)).toThrow(AppError);
  });

  it("accepts production configuration when required values exist", () => {
    const config = loadRuntimeConfig({
      APP_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key"
    });

    expect(validateRuntimeConfig(config).appEnv).toBe("production");
  });
});
