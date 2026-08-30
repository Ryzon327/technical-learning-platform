/**
 * WP-D / CURR-007 — curriculum assets.
 *
 * ## What a curriculum asset is
 *
 * Supporting instructional content that a mission's authored content refers
 * to: a topology diagram, an annotated screenshot, an article, a downloadable
 * file. WP-C's `diagram` and `reference` steps name one by stable id.
 *
 * ## What a curriculum asset is NOT
 *
 * Not a curriculum node, not a mission, not a lesson, not a competency, not
 * evidence, not learner progress, not a prerequisite, not an assessment, not
 * an interaction, not a lab, not an ObservationModel.
 *
 * An asset does not publish independently and awards nothing. It becomes
 * reachable exactly when its owning mission is published, through the RLS
 * policy the table has carried since Wave 2 — there is no second publication
 * hierarchy and no independent lifecycle.
 *
 * ## Identity is MISSION-SCOPED, because the schema already says so
 *
 * `curriculum_assets` has carried `mission_id not null … on delete cascade`,
 * `unique (mission_id, position)` and a mission-gated RLS policy since Wave 2.
 * That is an explicit scoping decision, and WP-D does not invent a different
 * one: a stable id is unique **within its mission**, exactly as a mission step
 * id is.
 *
 * The consequence is recorded rather than papered over: an image used by two
 * missions is authored twice today. Cross-mission reuse would need a shared
 * library table with its own publication semantics and RLS model — a second
 * curriculum hierarchy, which WP-D is told not to create. If reuse becomes a
 * real requirement it deserves its own decision.
 *
 * ## Accessibility is authored, never AI-generated
 *
 * A visual asset carries `altText`, and both the database and this contract
 * refuse a visual asset without it. That is a different question from WP-C's
 * step-level `textAlternative`. See `CURRICULUM_ASSET_ACCESSIBILITY_NOTE`.
 *
 * Neither may depend on AI. Accessibility has to work with the AI Gateway
 * switched off, which it currently is.
 *
 * ## Safety is inertness, not keyword matching
 *
 * An asset is a typed reference to a resource plus authored description. It
 * carries no markup, no component source, no renderer instruction and no
 * executable position. Titles and alt text are plain text, and **code-looking
 * text in them is legitimate** — the platform teaches HTML, shell and security
 * material. No validator here pattern-matches against markup-like strings.
 */

/* ------------------------------------------------------------------ *
 * Vocabulary — storage compatibility and authoring are NOT the same set
 * ------------------------------------------------------------------ */

/**
 * Every value the `curriculum_assets.asset_type` column may hold.
 *
 * The first six are the Wave 2 **storage** vocabulary. They are preserved
 * because narrowing a live column is a destructive migration, and WP-D performs
 * none. WP-D adds the two CURR-007 section 8 types the instructional model
 * actually needs — `image` and `diagram` — because WP-C's `diagram` step has
 * nothing to point at without them.
 *
 * This is the READ vocabulary. It is deliberately wider than what may be
 * authored; see `CURRICULUM_AUTHORABLE_ASSET_TYPES`.
 */
export const CURRICULUM_ASSET_TYPES = [
  "article",
  "video",
  "lab",
  "assessment",
  "reference",
  "download",
  "image",
  "diagram"
] as const;

export type CurriculumAssetType = (typeof CURRICULUM_ASSET_TYPES)[number];

export function isCurriculumAssetType(
  value: unknown
): value is CurriculumAssetType {
  return (
    typeof value === "string" &&
    (CURRICULUM_ASSET_TYPES as readonly string[]).includes(value)
  );
}

/**
 * What NEW instructional content may be authored as.
 *
 * Narrower than the storage vocabulary on purpose. Three legacy values are
 * readable but not authorable, each because another architecture already owns
 * the concept:
 *
 *   lab         `lab_definitions.mission_stable_id` is the authoritative
 *               mission-to-lab binding (Wave 6). An asset row typed `lab` would
 *               be a second, weaker association path for something the Lab
 *               Engine owns, and would quietly establish that a Lab is merely a
 *               curriculum asset. It is not.
 *
 *   assessment  `assessment_definitions` owns assessments, and WP-C's
 *               `practice` step is how one is placed in instruction. Same
 *               objection: a second association path for an owned concept.
 *
 *   video       Excluded by the WP-D scope fence, which prohibits building
 *               video delivery architecture. No audio or video content is
 *               planned for the courses in scope. This is a scope decision, not
 *               an architectural objection — admitting it later needs no
 *               redesign, only a decision.
 *
 * Nothing is removed from storage and no existing row becomes invalid. A row
 * carrying one of these types still reads; it simply cannot be newly authored.
 */
export const CURRICULUM_AUTHORABLE_ASSET_TYPES = [
  "article",
  "reference",
  "download",
  "image",
  "diagram"
] as const;

export type CurriculumAuthorableAssetType =
  (typeof CURRICULUM_AUTHORABLE_ASSET_TYPES)[number];

export function isAuthorableCurriculumAssetType(
  value: unknown
): value is CurriculumAuthorableAssetType {
  return (
    typeof value === "string" &&
    (CURRICULUM_AUTHORABLE_ASSET_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Storage-compatible but no longer authorable, with the reason.
 *
 * Held as data so the distinction is inspectable and a validator can explain
 * itself, rather than rejecting with an unhelpful "invalid type".
 */
export const CURRICULUM_LEGACY_ASSET_TYPE_OWNERS: Readonly<
  Record<string, string>
> = {
  lab: "the Lab Engine owns the mission-to-lab binding through lab_definitions.mission_stable_id",
  assessment:
    "assessment_definitions owns assessments, and a mission step of type practice is how one is placed",
  video: "video delivery architecture is outside the approved scope"
};

/**
 * The types that convey instruction visually.
 *
 * These, and only these, require authored alt text. The distinction is what
 * lets the database refuse an inaccessible visual while leaving an `article` or
 * `download` — whose title and target already describe them — unaffected.
 */
export const CURRICULUM_VISUAL_ASSET_TYPES = ["image", "diagram"] as const;

export function isVisualCurriculumAsset(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (CURRICULUM_VISUAL_ASSET_TYPES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ *
 * Identity and limits
 * ------------------------------------------------------------------ */

/**
 * The repository stable-id grammar, unchanged from curriculum nodes and mission
 * steps. One kind of identifier everywhere an author writes one.
 *
 * Scoped to the owning mission. It is a content reference, never a curriculum
 * node identity, and must not appear in publication events, version lineage,
 * prerequisite rules or learner progress.
 */
export const CURRICULUM_ASSET_STABLE_ID = /^[a-z0-9][a-z0-9._-]{2,119}$/;

export const CURRICULUM_ASSET_TITLE_LIMIT = 200;
export const CURRICULUM_ASSET_ALT_TEXT_LIMIT = 2_000;

/* ------------------------------------------------------------------ *
 * The asset
 * ------------------------------------------------------------------ */

/**
 * One curriculum asset belonging to one mission.
 *
 * Note what is absent and stays absent: publication state, version, competency,
 * evidence, progress, prerequisite. Each omission is the architecture.
 */
export interface CurriculumAssetReference {
  id: string;
  missionId: string;
  /**
   * Mission-scoped authored identity. Absent only on legacy rows created before
   * WP-D — nothing has ever written one, but the column is nullable so a
   * restored older database still reads. New authoring requires it.
   */
  stableId?: string;
  assetType: CurriculumAssetType;
  title: string;
  uri: string;
  position: number;
  required: boolean;
  /** Required for a visual asset. Describes what the visual DEPICTS. */
  altText?: string;
}

/** What an author supplies. Identity and accessibility are not optional here. */
export interface CurriculumAssetInput {
  missionId: string;
  stableId: string;
  assetType: CurriculumAssetType;
  title: string;
  uri: string;
  position: number;
  required?: boolean;
  altText?: string;
}

/**
 * The two accessibility fields, and why both exist.
 *
 * Exported as a constant rather than only as a comment so the distinction
 * travels with the contract and can be asserted.
 */
export const CURRICULUM_ASSET_ACCESSIBILITY_NOTE =
  "Asset altText describes what the visual depicts and belongs to the asset. " +
  "Mission-step textAlternative describes what the visual teaches in that " +
  "mission and belongs to the step. They answer different questions, so a step " +
  "may not silently inherit the asset's description as its instructional " +
  "meaning. Both are authored; neither may be produced by AI.";

/* ------------------------------------------------------------------ *
 * Resource location
 * ------------------------------------------------------------------ */

/**
 * An asset resource location.
 *
 * Absolute http(s) only — the rule `curriculum-quality.ts` has applied since
 * Wave 2, preserved rather than widened. A relative path or an opaque scheme
 * would point a learner somewhere the platform cannot describe or govern.
 *
 * **Deferred, and recorded rather than assumed away.** The platform has no
 * first-party asset storage, so a required visual currently resolves to an
 * external URL that can move or disappear. BEGINNER-COMPLETE-1 says required
 * instruction must not depend on leaving the platform, so platform-controlled
 * storage is a genuine open question — but introducing a storage vendor,
 * dependency or media service is explicitly outside WP-D. The `uri` column is
 * the seam, and a future provider-neutral location can be added without
 * changing this contract's shape.
 */
export function isAllowedCurriculumAssetUri(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Strict field predicates
 *
 * Used by BOTH the authoring validator and the persistence boundary. They
 * test types; they never convert them. A value that is the wrong type is
 * wrong, not something to be repaired.
 * ------------------------------------------------------------------ */

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/* ------------------------------------------------------------------ *
 * Authoring validation
 * ------------------------------------------------------------------ */

/**
 * Validate one authored asset.
 *
 * Returns messages rather than throwing, so an authoring surface can report
 * every problem at once. Nothing is normalized into validity.
 */
export function validateCurriculumAsset(input: CurriculumAssetInput): string[] {
  const label = isNonEmptyString(input?.stableId)
    ? input.stableId
    : "<unidentified asset>";
  const errors: string[] = [];
  const at = (message: string) => errors.push(`${label}: ${message}`);

  if (!isNonEmptyString(input?.missionId)) {
    at("an asset must belong to a mission");
  }

  if (!isNonEmptyString(input?.stableId)) {
    at("an asset must carry a stable id");
  } else if (!CURRICULUM_ASSET_STABLE_ID.test(input.stableId)) {
    at(
      "stable id must be 3-120 lowercase characters using letters, numbers, dot, underscore or hyphen"
    );
  }

  // The authoring vocabulary is narrower than storage. A legacy type is refused
  // with the reason, because "invalid type" would send an author looking for a
  // typo rather than telling them another architecture owns the concept.
  if (!isAuthorableCurriculumAssetType(input?.assetType)) {
    const owner =
      typeof input?.assetType === "string"
        ? CURRICULUM_LEGACY_ASSET_TYPE_OWNERS[input.assetType]
        : undefined;

    at(
      owner
        ? `asset type "${input.assetType}" is readable for compatibility but cannot be newly authored: ${owner}`
        : `unapproved asset type "${String(input?.assetType)}"; new assets may be ${CURRICULUM_AUTHORABLE_ASSET_TYPES.join(", ")}`
    );
  }

  if (!isNonEmptyString(input?.title)) {
    at("an asset must be titled");
  } else if (input.title.length > CURRICULUM_ASSET_TITLE_LIMIT) {
    at(`title exceeds ${CURRICULUM_ASSET_TITLE_LIMIT} characters`);
  }

  if (!isAllowedCurriculumAssetUri(input?.uri)) {
    at("resource location must be an absolute http or https URL");
  }

  if (!isNonNegativeInteger(input?.position)) {
    at("position must be a non-negative integer");
  }

  if (input?.required !== undefined && !isBoolean(input.required)) {
    at("required must be a boolean when supplied");
  }

  // The accessibility guarantee. A visual asset with no authored description is
  // instruction a learner cannot reach, so it is refused rather than published
  // and patched later.
  if (isVisualCurriculumAsset(input?.assetType)) {
    if (!isNonEmptyString(input?.altText)) {
      at("a visual asset requires authored alt text describing what it depicts");
    } else if (input.altText.length > CURRICULUM_ASSET_ALT_TEXT_LIMIT) {
      at(`alt text exceeds ${CURRICULUM_ASSET_ALT_TEXT_LIMIT} characters`);
    }
  } else if (input?.altText !== undefined && !isNonEmptyString(input.altText)) {
    at("alt text is present but empty");
  }

  return errors;
}

/* ------------------------------------------------------------------ *
 * The persistence boundary
 * ------------------------------------------------------------------ */

/** One `curriculum_assets` row as storage returned it. Every field untrusted. */
export interface PersistedCurriculumAssetRow {
  readonly id: unknown;
  readonly missionId: unknown;
  readonly stableId: unknown;
  readonly assetType: unknown;
  readonly title: unknown;
  readonly uri: unknown;
  readonly position: unknown;
  readonly required: unknown;
  readonly altText: unknown;
}

export type CurriculumAssetReadOutcome =
  | {
      readonly state: "available";
      readonly assets: readonly CurriculumAssetReference[];
    }
  | { readonly state: "content_error"; readonly errors: readonly string[] };

/**
 * Resolve persisted rows, checking every field before trusting any of them.
 *
 * The posture WP-C established for mission steps, applied here: a writer
 * validating on the way in is not a reason to trust what comes back. A restored
 * dump, a direct write, or a constraint added after some rows exist are all
 * states this code cannot see.
 *
 * **Nothing is coerced.** There is no `String(...)`, no `Number(...)`, no
 * `Boolean(...)`, no trimming and no defaulting in this function. `position`
 * must already be a non-negative integer; `"1"` is not one. `required` must
 * already be a boolean; `0` and `"false"` are not. A malformed value is a
 * defect to report, never a value to repair — repairing it would turn corrupt
 * storage into content that looks authored.
 *
 * An invalid row fails the whole read rather than being dropped from it.
 * Silently omitting a broken asset would leave a mission that looks complete
 * and is missing a diagram its instruction depends on — the partial-content
 * failure mode CURR-010 section 13.2 rejects.
 *
 * A legacy row with no stable id is a supported shape, not an error: nothing
 * has ever written one, no mission step can reference it, and the quality
 * report has always read such rows. It is returned with `stableId` absent.
 */
export function resolvePersistedCurriculumAssets(
  rows: readonly PersistedCurriculumAssetRow[]
): CurriculumAssetReadOutcome {
  if (!Array.isArray(rows)) {
    return { state: "content_error", errors: ["asset rows must be a list"] };
  }
  if (rows.length === 0) return { state: "available", assets: [] };

  const errors: string[] = [];
  const assets: CurriculumAssetReference[] = [];

  rows.forEach((row, index) => {
    const label = isNonEmptyString(row?.stableId)
      ? row.stableId
      : `<asset at row ${index}>`;
    const before = errors.length;
    const at = (message: string) => errors.push(`${label}: ${message}`);

    if (!isNonEmptyString(row?.id)) {
      at("persisted asset has no identity");
    }

    if (!isNonEmptyString(row?.missionId)) {
      at("persisted asset is not associated with a mission");
    }

    // Absent is the legacy shape and is allowed. PRESENT but malformed is not:
    // a reference could otherwise resolve to something unaddressable.
    const hasStableId = row?.stableId !== undefined && row?.stableId !== null;
    if (hasStableId) {
      if (!isNonEmptyString(row.stableId)) {
        at("persisted stable id is present but empty");
      } else if (!CURRICULUM_ASSET_STABLE_ID.test(row.stableId)) {
        at(`persisted stable id is not a valid identifier: ${row.stableId}`);
      }
    }

    // The READ vocabulary, deliberately: a legacy `lab` or `video` row still
    // reads. Only new authoring is narrowed.
    if (!isCurriculumAssetType(row?.assetType)) {
      at(`persisted asset type is not approved: ${String(row?.assetType)}`);
    }

    if (!isNonEmptyString(row?.title)) {
      at("persisted asset has no title");
    }

    if (!isAllowedCurriculumAssetUri(row?.uri)) {
      at("persisted resource location is not an absolute http or https URL");
    }

    if (!isNonNegativeInteger(row?.position)) {
      at(`persisted position is not a non-negative integer: ${String(row?.position)}`);
    }

    if (!isBoolean(row?.required)) {
      at(`persisted required flag is not a boolean: ${String(row?.required)}`);
    }

    // The accessibility guarantee, re-checked here. The database CHECK normally
    // prevents this; a row that reached storage another way must not be
    // returned as though it were accessible.
    if (isVisualCurriculumAsset(row?.assetType)) {
      if (!isNonEmptyString(row?.altText)) {
        at("persisted visual asset carries no alt text");
      }
    } else if (
      row?.altText !== undefined &&
      row?.altText !== null &&
      !isNonEmptyString(row.altText)
    ) {
      at("persisted alt text is present but empty");
    }

    if (errors.length !== before) return;

    // Every field above is now known to hold the right type. The trusted object
    // is built from those values directly — no conversion, because none is
    // needed once nothing malformed can reach this point.
    assets.push({
      id: row.id as string,
      missionId: row.missionId as string,
      ...(hasStableId ? { stableId: row.stableId as string } : {}),
      assetType: row.assetType as CurriculumAssetType,
      title: row.title as string,
      uri: row.uri as string,
      position: row.position as number,
      required: row.required as boolean,
      ...(isNonEmptyString(row.altText) ? { altText: row.altText } : {})
    });
  });

  if (errors.length > 0) return { state: "content_error", errors };

  return { state: "available", assets };
}

/* ------------------------------------------------------------------ *
 * Referential integrity with mission steps
 * ------------------------------------------------------------------ */

/**
 * Resolve the asset references a mission's steps declare.
 *
 * WP-C validated that `diagram.assetStableId` and `reference.assetStableId`
 * LOOK like stable ids; it could not check that they resolve, because nothing
 * they could resolve against existed. WP-D closes that: given the ids a
 * mission's steps reference and the ids its assets actually carry, this reports
 * what is missing.
 *
 * Returns the unresolved ids, sorted, so publication can name them. An empty
 * result means every reference resolves.
 *
 * Deliberately pure: it takes ids, not a database. The caller reads; this
 * decides. That keeps the rule testable without a database and identical
 * wherever it is applied.
 */
export function findUnresolvedAssetReferences(
  referencedStableIds: readonly string[],
  availableStableIds: readonly string[]
): string[] {
  const available = new Set(availableStableIds);

  return [...new Set(referencedStableIds)]
    .filter((stableId) => !available.has(stableId))
    .sort();
}
