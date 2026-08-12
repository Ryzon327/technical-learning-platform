import { describe, expect, it } from "vitest";
import { canRetryLabOperation, nextLabOperationDelaySeconds } from "@tlp/shared-types";

describe("lab operation recovery policy", () => {
  it("has bounded retries", () => {
    expect(canRetryLabOperation(4)).toBe(true);
    expect(canRetryLabOperation(5)).toBe(false);
  });

  it("uses deterministic retry timing", () => {
    expect(nextLabOperationDelaySeconds(1)).toBe(30);
    expect(nextLabOperationDelaySeconds(3)).toBe(120);
  });
});
