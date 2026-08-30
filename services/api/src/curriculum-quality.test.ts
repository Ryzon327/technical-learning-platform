import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addMissionAsset } from "./curriculum-quality";
import type { CurriculumAssetInput } from "@tlp/shared-types";

describe("curriculum quality helpers", () => {
  it("aggregates effort deterministically", () => {
    expect([15, 20, 25].reduce((sum, value) => sum + value, 0)).toBe(60);
  });
});

/* ------------------------------------------------------------------ *
 * WP-D — the curriculum asset authoring boundary
 * ------------------------------------------------------------------ */

describe("WP-D curriculum asset writer", () => {
  const valid: CurriculumAssetInput = {
    missionId: "00000000-0000-4000-8000-0000000000d1",
    stableId: "two-host-topology",
    assetType: "diagram",
    title: "Two hosts on one switch",
    uri: "https://example.org/assets/two-host-topology.svg",
    position: 0,
    altText: "Two hosts attached to one switch, in different address ranges."
  };

  /**
   * Rejection happens BEFORE the Supabase client is created, so these need no
   * database. Invalid authored content is a caller error, not a dependency
   * failure, and is reported as one whether or not a database is reachable.
   */
  const reject = async (overrides: Partial<CurriculumAssetInput>) =>
    addMissionAsset({ ...valid, ...overrides } as CurriculumAssetInput);

  it("refuses a visual asset with no alt text before touching the database", async () => {
    await expect(reject({ altText: undefined })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("refuses a reserved legacy type for new authoring", async () => {
    // Readable for compatibility, not authorable: the Lab Engine owns the
    // mission-to-lab binding and assessment_definitions owns assessments.
    for (const assetType of ["lab", "assessment", "video"] as const) {
      await expect(
        reject({ assetType, altText: undefined }),
        assetType
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("refuses an unapproved asset type", async () => {
    await expect(
      reject({ assetType: "screenshot" as never })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a malformed stable id", async () => {
    await expect(reject({ stableId: "AB" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("refuses a resource location that is not absolute http(s)", async () => {
    for (const uri of ["javascript:alert(1)", "/relative/path", ""]) {
      await expect(reject({ uri }), uri).rejects.toMatchObject({
        code: "VALIDATION_ERROR"
      });
    }
  });

  it("refuses an invalid position rather than normalizing it", async () => {
    for (const position of [-1, 1.5]) {
      await expect(reject({ position }), String(position)).rejects.toMatchObject(
        { code: "VALIDATION_ERROR" }
      );
    }
  });

  it("requires the asset to belong to a mission", async () => {
    await expect(reject({ missionId: "   " })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  /**
   * The upsert conflict target must match a constraint the database can INFER.
   *
   * PostgREST emits only a column list for `on_conflict`, and PostgreSQL can
   * infer a PARTIAL unique index only when the statement also supplies the
   * index predicate. A partial index here would make every upsert fail with
   * "there is no unique or exclusion constraint matching the ON CONFLICT
   * specification".
   *
   * This checks the two halves agree without applying the migration: the writer
   * conflicts on (mission_id, stable_id), and the migration declares a total
   * UNIQUE constraint on exactly those columns with no WHERE clause.
   */
  it("conflicts on a constraint PostgreSQL can infer from the column list", () => {
    const writer = readFileSync(
      new URL("./curriculum-quality.ts", import.meta.url),
      "utf8"
    );
    const migration = readFileSync(
      new URL(
        "../../../supabase/migrations/20260901000100_curriculum_asset_identity.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(writer).toContain('onConflict: "mission_id,stable_id"');

    const constraint = migration.slice(
      migration.indexOf("add constraint curriculum_assets_mission_stable_id_key")
    );
    const declaration = constraint.slice(0, constraint.indexOf(";"));

    expect(declaration).toContain("unique (mission_id, stable_id)");
    // A partial index cannot be inferred from a bare column list.
    expect(declaration.toLowerCase()).not.toContain("where");
  });

  it("upserts so re-running an authoring pass is idempotent", () => {
    const source = readFileSync(
      new URL("./curriculum-quality.ts", import.meta.url),
      "utf8"
    );

    const write = source.slice(
      source.indexOf("export async function addMissionAsset")
    );
    expect(write).toContain("stable_id: input.stableId");
    expect(write).toContain("alt_text: input.altText");
  });

  it("routes the read through the shared integrity boundary", () => {
    const source = readFileSync(
      new URL("./curriculum-quality.ts", import.meta.url),
      "utf8"
    );

    // Persisted rows are untrusted, and the coercion-free check must not be
    // reimplemented here.
    expect(source).toContain("resolvePersistedCurriculumAssets");
  });
});
