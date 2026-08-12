import { describe, expect, it } from "vitest";
import { assertLabSessionTransition, labSessionStateLabel } from "@tlp/shared-types";
describe("lab session service boundary",()=> {
  it("rejects unsafe state jumps",()=>expect(()=>assertLabSessionTransition("requested","active")).toThrow());
  it("uses understandable labels",()=>expect(labSessionStateLabel("provisioning")).toBe("Preparing lab"));
});
