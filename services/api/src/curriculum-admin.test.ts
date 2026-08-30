import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isValidPublicationTransition,
  linkMissionCompetency,
  upsertMissionStep
} from "./curriculum-admin";
import type { MissionStep } from "@tlp/shared-types";

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

/* ------------------------------------------------------------------ *
 * WP-C / CURR-010 — the mission step authoring boundary
 * ------------------------------------------------------------------ */

describe("WP-C mission step writer", () => {
  const context = { actorUserId: "00000000-0000-4000-8000-000000000001" };
  const missionId = "00000000-0000-4000-8000-0000000000c1";

  const valid: MissionStep = {
    stableId: "s01-what-a-network-is",
    position: 0,
    content: {
      type: "concept",
      paragraphs: ["A network is a set of devices that can reach each other."]
    }
  };

  /**
   * Rejection happens BEFORE the Supabase client is created, so these need no
   * database. Invalid instructional content is a caller error, not a dependency
   * failure, and is reported as one whether or not a database is reachable.
   */
  const reject = async (step: unknown) =>
    upsertMissionStep(context, missionId, step as MissionStep);

  it("rejects an unapproved step type before touching the database", async () => {
    await expect(
      reject({ ...valid, content: { type: "lesson", paragraphs: ["x"] } })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a payload that does not match its declared type", async () => {
    // A diagram with no text alternative is instruction a learner cannot reach.
    await expect(
      reject({
        ...valid,
        content: { type: "diagram", assetStableId: "a.b" }
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an invalid position rather than normalizing it", async () => {
    for (const position of [-1, 1.5]) {
      await expect(reject({ ...valid, position })).rejects.toMatchObject({
        code: "VALIDATION_ERROR"
      });
    }
  });

  it("rejects an invalid stable id", async () => {
    await expect(reject({ ...valid, stableId: "AB" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("requires the step to belong to a mission", async () => {
    await expect(
      upsertMissionStep(context, "   ", valid)
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("writes both discriminators from the same value", () => {
    const source = readFileSync(
      new URL("./curriculum-admin.ts", import.meta.url),
      "utf8"
    );

    const upsert = source.slice(source.indexOf('.from("mission_steps")'));

    // `step_type` is the database's closed vocabulary and `payload` carries the
    // application discriminator. Writing both from `step.content` is what makes
    // them agree on the write path; the read path re-checks rather than
    // assuming this was the only writer that ever ran.
    expect(upsert).toContain("step_type: step.content.type");
    expect(upsert).toContain("payload: step.content");
  });

  it("routes the read through the shared integrity boundary", () => {
    const source = readFileSync(
      new URL("./curriculum-admin.ts", import.meta.url),
      "utf8"
    );

    // The step_type/payload.type comparison must not be reimplemented here.
    expect(source).toContain("resolvePersistedMissionSteps");
  });

  it("blocks publication on invalid mission steps", () => {
    const source = readFileSync(
      new URL("./curriculum-admin.ts", import.meta.url),
      "utf8"
    );

    // CURR-010 section 13.1: publication is the primary defence. A mission with
    // NO steps is not this issue — that is the legacy fallback.
    expect(source).toContain("INVALID_MISSION_STEPS");
    expect(source).toContain('stepOutcome.state === "content_error"');
  });
});
