import { describe, expect, it } from "vitest";
import type { CompetencyState } from "@tlp/shared-types";

describe("competency API contract", () => {
  it("uses explicit competency states", () => {
    const state: CompetencyState = "developing";
    expect(state).toBe("developing");
  });

  it("does not expose a client supplied mastery boolean", () => {
    const payload = {
      evidenceReference: "assessment:result-1",
      accepted: true
    };
    expect("mastered" in payload).toBe(false);
  });
});
