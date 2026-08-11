import { describe, expect, it } from "vitest";
import { AppError } from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";

describe("server Supabase boundary", () => {
  it("fails safely when server credentials are unavailable", () => {
    const priorUrl = process.env.SUPABASE_URL;
    const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      expect(() => createServerSupabaseClient()).toThrow(AppError);
    } finally {
      if (priorUrl) process.env.SUPABASE_URL = priorUrl;
      if (priorKey) process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
    }
  });
});
