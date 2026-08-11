import { describe, expect, it } from "vitest";
import type { CurriculumPublicationState } from "@tlp/shared-types";

describe("curriculum service contract", () => {
  it("uses published as the student-readable state", () => {
    const state: CurriculumPublicationState = "published";
    expect(state).toBe("published");
  });
});
