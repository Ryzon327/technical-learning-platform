import { describe, expect, it } from "vitest";
import { getApiHealth, getApiHealthDetails } from "./health";

describe("API health", () => {
  it("returns a healthy foundation state", () => {
    expect(getApiHealth().state).toBe("healthy");
  });

  it("exposes non-secret runtime health metadata", () => {
    const details = getApiHealthDetails();

    expect(details.environment).toBeTruthy();
    expect(details).not.toHaveProperty("supabaseServiceRoleKey");
  });
});
