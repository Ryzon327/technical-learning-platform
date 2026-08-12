import { describe, expect, it } from "vitest";
import { decideCompetencyTransition } from "./competency";

describe("competency advancement", () => {
  it("advances to demonstrated only with accepted evidence", () => {
    const decision = decideCompetencyTransition("developing", 1);
    expect(decision.to).toBe("demonstrated");
  });

  it("does not demote demonstrated competency without review criteria", () => {
    const decision = decideCompetencyTransition("demonstrated", 0);
    expect(decision.to).toBe("demonstrated");
  });

  it("can move a demonstrated competency to needs review", () => {
    const decision = decideCompetencyTransition(
      "demonstrated",
      1,
      true
    );
    expect(decision.to).toBe("needs_review");
  });

  it("moves initial activity into developing", () => {
    const decision = decideCompetencyTransition("not_started", 0);
    expect(decision.to).toBe("developing");
  });
});
