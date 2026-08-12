import { describe, expect, it } from "vitest";
import {
  canSubmitAttempt,
  isTerminalAttemptState
} from "./assessment-attempt";

describe("assessment attempt state", () => {
  it("allows submission only while in progress", () => {
    expect(canSubmitAttempt("in_progress")).toBe(true);
    expect(canSubmitAttempt("interrupted")).toBe(false);
    expect(canSubmitAttempt("failed")).toBe(false);
  });

  it("does not treat interruption as failure", () => {
    expect(isTerminalAttemptState("interrupted")).toBe(false);
    expect(isTerminalAttemptState("failed")).toBe(true);
  });
});
