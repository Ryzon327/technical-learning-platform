import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isValidPublicationTransition, linkMissionCompetency } from "./curriculum-admin";

describe("curriculum publication transitions", () => {
  it("allows draft to review", () => {
    expect(isValidPublicationTransition("draft", "review")).toBe(true);
  });

  it("allows review to published", () => {
    expect(isValidPublicationTransition("review", "published")).toBe(true);
  });

  it("blocks draft directly to published", () => {
    expect(isValidPublicationTransition("draft", "published")).toBe(false);
  });

  it("blocks published back to review", () => {
    expect(isValidPublicationTransition("published", "review")).toBe(false);
  });

  it("allows retired curriculum to return to draft", () => {
    expect(isValidPublicationTransition("retired", "draft")).toBe(true);
  });

  it("treats same-state transitions as idempotent", () => {
    expect(isValidPublicationTransition("review", "review")).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * WP-B / DEC-055 — the only writer of mission_competencies
 * ------------------------------------------------------------------ */

describe("WP-B mission competency relationship writer", () => {
  const context = { actorUserId: "00000000-0000-4000-8000-000000000001" };
  const missionId = "00000000-0000-4000-8000-0000000000a1";
  const competencyId = "00000000-0000-4000-8000-0000000000b1";

  /**
   * Rejection happens BEFORE any database call, so these assertions need no
   * Supabase client. A value that reached the upsert would be caught by the
   * migration's CHECK constraint as well; this is the first of the two layers,
   * not the only one.
   */
  const reject = async (relationship: unknown) =>
    linkMissionCompetency(
      context,
      missionId,
      competencyId,
      true,
      relationship as never
    );

  it("rejects requires, which belongs to learning_prerequisite_rules", async () => {
    await expect(reject("requires")).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("rejects an arbitrary relationship string", async () => {
    for (const value of ["", "teaches", "reuses", "DEVELOPS", "prerequisite"]) {
      await expect(reject(value)).rejects.toMatchObject({
        code: "VALIDATION_ERROR"
      });
    }
  });

  it("rejects a missing relationship rather than defaulting one", async () => {
    // A default would silently classify links, which is what the column exists
    // to prevent.
    for (const value of [undefined, null]) {
      await expect(reject(value)).rejects.toMatchObject({
        code: "VALIDATION_ERROR"
      });
    }
  });

  it("takes relationship as an explicit parameter with no default", () => {
    const source = readFileSync(
      new URL("./curriculum-admin.ts", import.meta.url),
      "utf8"
    );

    // `required` lost its `= true` default in WP-B and `relationship` never had
    // one: both are now decisions the caller has to make.
    expect(source).toContain("required: boolean,");
    expect(source).toContain("relationship: MissionCompetencyRelationship");
    expect(source).not.toContain("relationship: MissionCompetencyRelationship =");
    expect(source).not.toContain("required = true");
  });

  it("writes relationship alongside required, not instead of it", () => {
    const source = readFileSync(
      new URL("./curriculum-admin.ts", import.meta.url),
      "utf8"
    );

    // The two axes are independent; the upsert must persist both.
    const upsert = source.slice(
      source.indexOf('.from("mission_competencies")')
    );
    expect(upsert).toContain("required,");
    expect(upsert).toContain("relationship");
  });
});
