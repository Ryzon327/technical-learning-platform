import { describe, expect, it } from "vitest";
import { deriveLabValidationState } from "./lab-runtime";

describe("lab runtime contracts", () => {
  it("ignores advisory failure for overall pass", () => {
    expect(deriveLabValidationState([
      { checkStableId:"required", title:"Required", required:true, passed:true, state:"passed", explanation:"ok" },
      { checkStableId:"advisory", title:"Advisory", required:false, passed:false, state:"failed", explanation:"review" }
    ])).toBe("passed");
  });

  it("separates validator outage from student failure", () => {
    expect(deriveLabValidationState([
      { checkStableId:"required", title:"Required", required:true, state:"technical_error", explanation:"unavailable" }
    ])).toBe("technical_error");
  });
});
