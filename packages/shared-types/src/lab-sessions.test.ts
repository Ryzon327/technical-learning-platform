import { describe, expect, it } from "vitest";
import { assertLabSessionTransition, isLabSessionTransitionAllowed, labSessionStateLabel } from "./lab-sessions";

describe("lab session lifecycle", () => {
  it("allows the normal lifecycle", () => {
    expect(isLabSessionTransitionAllowed("requested","provisioning")).toBe(true);
    expect(isLabSessionTransitionAllowed("provisioning","ready")).toBe(true);
    expect(isLabSessionTransitionAllowed("ready","active")).toBe(true);
    expect(isLabSessionTransitionAllowed("active","cleaning")).toBe(true);
    expect(isLabSessionTransitionAllowed("cleaning","terminated")).toBe(true);
  });

  it("rejects unsafe jumps", () => {
    expect(() => assertLabSessionTransition("requested","ready")).toThrow();
    expect(() => assertLabSessionTransition("terminated","active")).toThrow();
    expect(() => assertLabSessionTransition("cleaning","active")).toThrow();
  });

  it("has plain-language labels", () => {
    expect(labSessionStateLabel("queued")).toBe("Waiting for capacity");
  });
});
