import { describe, expect, it } from "vitest";
import { getBrowserSupabaseClient } from "./supabase";

describe("browser Supabase boundary", () => {
  it("does not silently operate without public browser configuration", () => {
    expect(() => getBrowserSupabaseClient()).toThrow(
      /Browser Supabase configuration is missing/
    );
  });
});
