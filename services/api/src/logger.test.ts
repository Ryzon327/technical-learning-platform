import { describe, expect, it } from "vitest";
import { createLogRecord } from "./logger";

describe("structured logger", () => {
  it("redacts likely secret fields", () => {
    const record = createLogRecord("info", "test", {
      metadata: {
        username: "student",
        apiKey: "should-not-appear",
        nested: {
          password: "should-not-appear"
        }
      }
    });

    expect(record.metadata?.username).toBe("student");
    expect(record.metadata?.apiKey).toBe("[REDACTED]");
    expect(
      (record.metadata?.nested as Record<string, unknown>).password
    ).toBe("[REDACTED]");
  });
});
