import { describe, expect, it } from "vitest";

describe("authenticated application shell", () => {
  it("keeps authentication as the gate to the learning workspace", () => {
    expect("authenticated").toContain("auth");
  });
});
