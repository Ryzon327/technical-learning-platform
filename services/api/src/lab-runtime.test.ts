import { describe, expect, it } from "vitest";
import { deriveLabValidationState } from "@tlp/shared-types";

describe("lab runtime deterministic validation boundary", () => {
  it("does not let advisory failure fail the lab", () => {
    expect(deriveLabValidationState([
      {checkStableId:"required",title:"Required",required:true,passed:true,state:"passed",explanation:"ok"},
      {checkStableId:"advisory",title:"Advisory",required:false,passed:false,state:"failed",explanation:"review"}
    ])).toBe("passed");
  });
  it("separates validator failure", () => {
    expect(deriveLabValidationState([{checkStableId:"required",title:"Required",required:true,state:"technical_error",explanation:"unavailable"}])).toBe("technical_error");
  });
});
