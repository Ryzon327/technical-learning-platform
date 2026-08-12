import { describe, expect, it } from "vitest";
import { canRetryLabOperation, nextLabOperationDelaySeconds } from "./lab-operations";

describe("lab operational controls", () => {
  it("uses bounded exponential retry delays", () => {
    expect(nextLabOperationDelaySeconds(1)).toBe(30);
    expect(nextLabOperationDelaySeconds(3)).toBe(120);
    expect(nextLabOperationDelaySeconds(5)).toBe(480);
  });

  it("stops automated retries after five attempts", () => {
    expect(canRetryLabOperation(4)).toBe(true);
    expect(canRetryLabOperation(5)).toBe(false);
  });
});
