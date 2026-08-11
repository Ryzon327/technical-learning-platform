import { describe, expect, it } from "vitest";
import { createRequestContext } from "./request-context";

describe("request context", () => {
  it("preserves an incoming correlation ID", () => {
    const context = createRequestContext("corr-123");

    expect(context.correlationId).toBe("corr-123");
    expect(context.requestId).toBeTruthy();
  });

  it("generates a correlation ID when one is absent", () => {
    const context = createRequestContext();

    expect(context.correlationId).toBeTruthy();
    expect(context.requestId).toBeTruthy();
  });
});
