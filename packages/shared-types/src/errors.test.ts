import { describe, expect, it } from "vitest";
import { AppError } from "./errors";

describe("AppError", () => {
  it("serializes a normalized platform error", () => {
    const error = new AppError({
      code: "CONFIGURATION_ERROR",
      message: "Missing required configuration",
      retryable: false,
      correlationId: "test-correlation"
    });

    expect(error.toJSON()).toEqual({
      code: "CONFIGURATION_ERROR",
      message: "Missing required configuration",
      retryable: false,
      correlationId: "test-correlation"
    });
  });
});
