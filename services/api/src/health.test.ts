import { describe, expect, it } from "vitest";
import { getApiHealth } from "./health";

describe("getApiHealth", () => {
  it("returns a healthy foundation state", () => {
    expect(getApiHealth().state).toBe("healthy");
  });
});
