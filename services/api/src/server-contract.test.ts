import { describe, expect, it } from "vitest";
import { sendJson } from "./http-utils";

describe("API runtime contract", () => {
  it("exports the JSON response helper", () => {
    expect(typeof sendJson).toBe("function");
  });
});
