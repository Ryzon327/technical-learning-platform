import {
  MISSION_COMPETENCY_RELATIONSHIPS,
  type MissionCompetencyRelationship
} from "./curriculum";
import {
  MISSION_STEP_STABLE_ID,
  validateMissionStep,
  type MissionStep
} from "./mission-steps";
import {
  isAuthorableCurriculumAssetType,
  validateCurriculumAsset,
  type CurriculumAssetInput
} from "./curriculum-assets";
import type { PrerequisiteRequirementType } from "./learning-navigation";

/**
 * WP-G / DEC-056 — the repository-authored curriculum document.
 *
 * ## What this is
 *
 * The contract for a course authored as JSON under `content/`, and the strict
 * parser that turns untrusted file text into it. DEC-056 settled the format;
 * this is its shape and its gate.
 *
 * The database remains the authoritative RUNTIME store. This is the
 * authoritative AUTHORING representation: what a reviewer reads in a pull
 * request, and the only input the publication command accepts. Nothing reads
 * these documents at runtime, and nothing should.
 *
 * ## Why parsing is strict to the point of rudeness
 *
 * Every function below refuses rather than repairs. No trimming into validity,
 * no defaulting a missing field, no coercing `"3"` to `3`, and — the rule that
 * catches the most — **no tolerance for an unknown key**.
 *
 * Unknown-field tolerance is the failure mode that matters for authored
 * content. A typo in an optional field name (`altTxt`, `postion`,
 * `textAlternate`) silently produces a document missing that field, which then
 * publishes, and the defect surfaces to a learner as a missing diagram or an
 * unlabelled image. Rejecting the key turns a silent content defect into a
 * loud authoring error, at review time, with the key name in the message.
 *
 * DEC-056 records the same reasoning for choosing JSON over YAML: silent
 * misparse is the wrong failure mode for content. Accepting unknown keys would
 * reintroduce exactly that, having paid for the format that avoids it.
 *
 * ## Why the validators are reused rather than reimplemented
 *
 * `validateMissionStep` and `validateCurriculumAsset` already define what valid
 * instructional content is, and `services/api` runs them at publication. A
 * second definition here would drift, and the drift would be discovered by a
 * document that passed CI and then failed publication — the worst place to find
 * it. This module owns document SHAPE and cross-reference integrity; it owns no
 * step or asset rule of its own.
 *
 * ## What this module deliberately does not do
 *
 * No I/O: it parses a value, never a path. No judgement of instructional
 * quality — DEC-057 places that with Human UAT, and a validator that scored
 * teaching would be inventing schema to encode an opinion. No coupling to any
 * particular course.
 */

/* ------------------------------------------------------------------ *
 * Identity and vocabulary
 * ------------------------------------------------------------------ */

/**
 * The stable-id grammar, shared by every identity in a document.
 *
 * Deliberately the same expression `curriculum-admin.ts` enforces for paths,
 * courses, modules, missions and competencies, and the same one
 * `MISSION_STEP_STABLE_ID` applies to steps — so an author writes one kind of
 * identifier everywhere and a document that validates here cannot be rejected
 * by the admin layer for a grammar reason.
 *
 * The equality is asserted by test rather than assumed, and
 * `scripts/verify-wpg.sh` pins it against the admin source, because three
 * copies of a regex is exactly the kind of thing that drifts quietly.
 */
export const CURRICULUM_DOCUMENT_STABLE_ID = /^[a-z0-9][a-z0-9._-]{2,119}$/;

/**
 * What a document is for.
 *
 * This is a safety discriminator, not metadata. `architecture_fixture` marks a
 * document that exercises the contract and must never enter the learner
 * catalog; the publication command refuses it outright, independently of where
 * the file sits. Path checks and this field are two mechanisms for one rule, so
 * neither a misplaced file nor a mis-scoped path check is sufficient on its own
 * to publish a fixture.
 */
export const CURRICULUM_DOCUMENT_KINDS = [
  "production",
  "architecture_fixture"
] as const;

export type CurriculumDocumentKind = (typeof CURRICULUM_DOCUMENT_KINDS)[number];

/** Node types a prerequisite rule may target. Mirrors the table's CHECK. */
export const PREREQUISITE_TARGET_NODE_TYPES = [
  "course",
  "module",
  "mission"
] as const;

export type PrerequisiteTargetNodeType =
  (typeof PREREQUISITE_TARGET_NODE_TYPES)[number];

/**
 * Requirement kinds a prerequisite rule may express, as runtime values.
 *
 * The TYPE is not redeclared here. `PrerequisiteRequirementType` already exists
 * in `learning-navigation.ts`, which is the module that evaluates these rules
 * for a learner, and it is imported above rather than restated. DEC-055 keeps
 * one prerequisite authority; a second copy of its vocabulary would be the
 * first step towards a second system.
 *
 * The list exists because a union cannot be iterated at runtime and a validator
 * needs to check an authored string against it. A test asserts the two agree,
 * so adding a kind in one place and not the other fails.
 */
export const CURRICULUM_PREREQUISITE_REQUIREMENT_TYPES: readonly PrerequisiteRequirementType[] =
  [
    "content_completion",
    "competency",
    "readiness_assessment",
    "equivalent_competency"
  ];

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

export interface CurriculumDocumentLearningPath {
  readonly stableId: string;
  readonly title: string;
  readonly description: string;
  readonly estimatedMinutes?: number;
}

export interface CurriculumDocumentCourse {
  readonly stableId: string;
  readonly title: string;
  readonly description: string;
  readonly position: number;
  readonly estimatedMinutes?: number;
}

export interface CurriculumDocumentModule {
  readonly stableId: string;
  readonly title: string;
  readonly description: string;
  readonly position: number;
  readonly estimatedMinutes?: number;
}

export interface CurriculumDocumentMissionCompetency {
  readonly competencyStableId: string;
  /** Required versus supporting within the mission. Orthogonal to relationship. */
  readonly required: boolean;
  /** DEC-055: what this mission DOES with the competency. */
  readonly relationship: MissionCompetencyRelationship;
}

/**
 * An asset as an author writes it.
 *
 * `missionId` is absent by design: it is a database row id the author cannot
 * know and must never guess. Ownership comes from the mission the asset is
 * nested under, and the importer supplies the id at write time.
 */
export interface CurriculumDocumentAsset {
  readonly stableId: string;
  readonly assetType: string;
  readonly title: string;
  readonly uri: string;
  readonly position: number;
  readonly required?: boolean;
  readonly altText?: string;
}

export interface CurriculumDocumentMission {
  readonly stableId: string;
  readonly moduleStableId: string;
  readonly title: string;
  /**
   * The mission's prose description, stored in `missions.description`.
   *
   * Retained alongside `steps` rather than replaced by them: CURR-010 section
   * 13.4 keeps it as the legacy read path for a mission with no authored steps,
   * and the Search Engine projects it. A mission may have both; WP-E decides
   * which one a learner receives, and WP-F renders exactly one.
   */
  readonly description: string;
  readonly position: number;
  readonly estimatedMinutes?: number;
  readonly competencies: readonly CurriculumDocumentMissionCompetency[];
  /** Ordered instructional content. May be empty; CURR-010 section 13.4. */
  readonly steps: readonly MissionStep[];
  /** Supporting assets the steps reference. May be empty. */
  readonly assets: readonly CurriculumDocumentAsset[];
}

export interface CurriculumDocumentCompetency {
  readonly stableId: string;
  readonly title: string;
  readonly description: string;
}

export interface CurriculumDocumentCompetencyPrerequisite {
  readonly competencyStableId: string;
  readonly prerequisiteCompetencyStableId: string;
}

/**
 * One explicit learning prerequisite rule.
 *
 * DEC-055 keeps this separate from `mission_competencies` and the separation is
 * load-bearing. `mission_competencies` answers "what does this mission do with
 * this competency"; this answers "what must already be true before the learner
 * enters this node". Collapsing them would make every reinforced competency an
 * entry barrier.
 *
 * `explanation` is required by the table and required here. BEGINNER-COMPLETE-1
 * permits an explicitly declared prerequisite as one of the three ways required
 * knowledge may be established — "explicitly declared" means the learner is
 * told, in words, what they need and why.
 */
export interface CurriculumDocumentPrerequisiteRule {
  readonly targetNodeType: PrerequisiteTargetNodeType;
  readonly targetStableId: string;
  readonly requirementType: PrerequisiteRequirementType;
  readonly requirementStableId: string;
  readonly explanation: string;
}

export interface CurriculumDocument {
  readonly documentKind: CurriculumDocumentKind;
  readonly learningPath: CurriculumDocumentLearningPath;
  readonly course: CurriculumDocumentCourse;
  readonly modules: readonly CurriculumDocumentModule[];
  readonly missions: readonly CurriculumDocumentMission[];
  readonly competencies: readonly CurriculumDocumentCompetency[];
  readonly competencyPrerequisites: readonly CurriculumDocumentCompetencyPrerequisite[];
  readonly prerequisiteRules: readonly CurriculumDocumentPrerequisiteRule[];
}

export type CurriculumDocumentParseResult =
  | { readonly valid: true; readonly document: CurriculumDocument }
  | { readonly valid: false; readonly errors: readonly string[] };

/* ------------------------------------------------------------------ *
 * Allowed keys
 *
 * Held as data so unknown-field rejection has one auditable source, and so a
 * contract addition has to be made here deliberately rather than arriving by
 * accident through a spread.
 * ------------------------------------------------------------------ */

const DOCUMENT_KEYS = [
  "documentKind",
  "learningPath",
  "course",
  "modules",
  "missions",
  "competencies",
  "competencyPrerequisites",
  "prerequisiteRules"
] as const;

const LEARNING_PATH_KEYS = [
  "stableId",
  "title",
  "description",
  "estimatedMinutes"
] as const;

const COURSE_KEYS = [
  "stableId",
  "title",
  "description",
  "position",
  "estimatedMinutes"
] as const;

const MODULE_KEYS = COURSE_KEYS;

const MISSION_KEYS = [
  "stableId",
  "moduleStableId",
  "title",
  "description",
  "position",
  "estimatedMinutes",
  "competencies",
  "steps",
  "assets"
] as const;

const MISSION_COMPETENCY_KEYS = [
  "competencyStableId",
  "required",
  "relationship"
] as const;

const ASSET_KEYS = [
  "stableId",
  "assetType",
  "title",
  "uri",
  "position",
  "required",
  "altText"
] as const;

const COMPETENCY_KEYS = ["stableId", "title", "description"] as const;

const COMPETENCY_PREREQUISITE_KEYS = [
  "competencyStableId",
  "prerequisiteCompetencyStableId"
] as const;

const PREREQUISITE_RULE_KEYS = [
  "targetNodeType",
  "targetStableId",
  "requirementType",
  "requirementStableId",
  "explanation"
] as const;

const STEP_KEYS = ["stableId", "position", "content"] as const;

/**
 * The fields each step type may carry, mirroring `mission-steps.ts`.
 *
 * A second listing of another module's shape is a drift risk and is only
 * accepted here because unknown-key rejection cannot be expressed any other
 * way: TypeScript interfaces do not exist at runtime, so there is nothing to
 * reflect on.
 *
 * Two mechanisms hold it in step with the contract it mirrors. A test builds a
 * step carrying every key listed here and asserts `validateMissionStep`
 * accepts it, which catches a key removed there. `scripts/verify-wpg.sh`
 * compares these lists against the interface bodies in `mission-steps.ts`,
 * which catches a key added there.
 */
const STEP_CONTENT_KEYS: Readonly<Record<string, readonly string[]>> = {
  concept: ["type", "title", "paragraphs"],
  diagram: ["type", "assetStableId", "caption", "textAlternative"],
  command: ["type", "command", "output", "language", "caption"],
  prediction: ["type", "prompt", "options", "expectedOutcome"],
  interaction: ["type", "interactionStableId", "textEquivalent", "caption"],
  practice: ["type", "assessmentStableId", "framing"],
  reference: ["type", "label", "assetStableId", "uri", "note"]
};

/* ------------------------------------------------------------------ *
 * Strict readers
 *
 * Each reports through a collector rather than throwing, so one pass reports
 * every problem in a document instead of the first. An author fixing a course
 * should see the whole list.
 * ------------------------------------------------------------------ */

type Collect = (message: string) => void;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

/**
 * Reject any key the contract does not name, and report every missing one.
 *
 * Returns false when the value is not an object at all, so a caller can stop
 * rather than report a cascade of missing fields on a string.
 */
function checkShape(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
  at: Collect
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    at(`${label} must be an object`);
    return false;
  }

  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      at(`${label} carries an unknown field "${key}"`);
    }
  }

  for (const key of required) {
    if (value[key] === undefined) {
      at(`${label} is missing "${key}"`);
    }
  }

  return true;
}

function readString(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): string {
  const value = source[key];

  if (typeof value !== "string") {
    if (value !== undefined) at(`${label}.${key} must be a string`);
    return "";
  }

  if (value.trim() === "") {
    at(`${label}.${key} must not be empty`);
  }

  return value;
}

function readOptionalString(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): string | undefined {
  if (source[key] === undefined) return undefined;
  return readString(source, key, label, at);
}

function readStableId(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): string {
  const value = readString(source, key, label, at);

  if (value !== "" && !CURRICULUM_DOCUMENT_STABLE_ID.test(value)) {
    at(
      `${label}.${key} is not a valid stable id: "${value}" — 3-120 characters, lowercase letters, numbers, dot, underscore or hyphen, starting with a letter or number`
    );
  }

  return value;
}

function readPosition(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): number {
  const value = source[key];

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    if (value !== undefined) {
      at(`${label}.${key} must be a non-negative integer`);
    }
    return -1;
  }

  return value;
}

function readOptionalMinutes(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): number | undefined {
  const value = source[key];
  if (value === undefined) return undefined;

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    at(`${label}.${key} must be a non-negative integer when present`);
    return undefined;
  }

  return value;
}

function readBoolean(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): boolean {
  const value = source[key];

  if (typeof value !== "boolean") {
    if (value !== undefined) at(`${label}.${key} must be true or false`);
    return false;
  }

  return value;
}

function readArray(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): unknown[] {
  const value = source[key];

  if (!Array.isArray(value)) {
    if (value !== undefined) at(`${label}.${key} must be an array`);
    return [];
  }

  return value;
}

/** Report any identity that appears more than once in a list. */
function reportDuplicates(
  ids: readonly string[],
  label: string,
  at: Collect
): void {
  const seen = new Set<string>();

  for (const id of ids) {
    if (id === "") continue;
    if (seen.has(id)) at(`${label} declares a duplicate stable id: ${id}`);
    seen.add(id);
  }
}

/** Report any position that appears more than once within one parent. */
function reportDuplicatePositions(
  positions: readonly number[],
  label: string,
  at: Collect
): void {
  const seen = new Set<number>();

  for (const position of positions) {
    if (position < 0) continue;
    if (seen.has(position)) {
      at(`${label} declares a duplicate position: ${position}`);
    }
    seen.add(position);
  }
}

/* ------------------------------------------------------------------ *
 * Section parsers
 * ------------------------------------------------------------------ */

function parseAsset(
  value: unknown,
  index: number,
  missionStableId: string,
  at: Collect
): CurriculumDocumentAsset | null {
  const label = `mission "${missionStableId}" asset ${index}`;

  if (!checkShape(value, ASSET_KEYS, ["stableId", "assetType", "title", "uri", "position"], label, at)) {
    return null;
  }

  const stableId = readStableId(value, "stableId", label, at);
  const assetType = readString(value, "assetType", label, at);
  const title = readString(value, "title", label, at);
  const uri = readString(value, "uri", label, at);
  const position = readPosition(value, "position", label, at);
  const altText = readOptionalString(value, "altText", label, at);
  const required =
    value.required === undefined
      ? undefined
      : readBoolean(value, "required", label, at);

  // The AUTHORABLE vocabulary, not the storage vocabulary. WP-D deliberately
  // keeps `lab`, `assessment` and `video` readable but unauthorable: the Lab
  // Engine owns the mission-to-lab binding, `assessment_definitions` owns
  // assessments, and video delivery is outside approved scope.
  if (assetType !== "" && !isAuthorableCurriculumAssetType(assetType)) {
    at(
      `${label}.assetType "${assetType}" is not authorable; authorable types are article, reference, download, image, diagram`
    );
  }

  const asset: CurriculumDocumentAsset = {
    stableId,
    assetType,
    title,
    uri,
    position,
    ...(required === undefined ? {} : { required }),
    ...(altText === undefined ? {} : { altText })
  };

  // WP-D owns what a valid asset is. A placeholder mission id is supplied
  // because the author cannot know the real one; every other field is judged by
  // the same validator the server runs at publication, so a document that
  // passes here cannot be rejected there for an asset reason.
  const assetErrors = validateCurriculumAsset({
    ...asset,
    missionId: "document",
    assetType: asset.assetType
  } as CurriculumAssetInput);

  for (const error of assetErrors) at(`${label}: ${error}`);

  return asset;
}

function parseStep(
  value: unknown,
  index: number,
  missionStableId: string,
  at: Collect
): MissionStep | null {
  const label = `mission "${missionStableId}" step ${index}`;

  if (!checkShape(value, STEP_KEYS, ["stableId", "position", "content"], label, at)) {
    return null;
  }

  const stableId = readStableId(value, "stableId", label, at);
  const position = readPosition(value, "position", label, at);
  const content = value.content;

  if (!isPlainObject(content)) {
    at(`${label}.content must be an object`);
    return null;
  }

  const type = content.type;

  if (typeof type !== "string") {
    at(`${label}.content.type must be a string`);
    return null;
  }

  const allowedContentKeys = STEP_CONTENT_KEYS[type];

  if (!allowedContentKeys) {
    at(
      `${label}.content.type "${type}" is not an approved step type; the vocabulary is closed at concept, diagram, command, prediction, interaction, practice, reference`
    );
    return null;
  }

  for (const key of Object.keys(content)) {
    if (!allowedContentKeys.includes(key)) {
      at(`${label}.content carries an unknown field "${key}" for type "${type}"`);
    }
  }

  const step = { stableId, position, content } as unknown as MissionStep;

  // WP-C owns what a valid step is, including every per-type payload rule and
  // the text limits. Re-stating any of it here would be a second definition.
  for (const error of validateMissionStep(step)) at(`${label}: ${error}`);

  return step;
}

function parseMission(
  value: unknown,
  index: number,
  at: Collect
): CurriculumDocumentMission | null {
  const label = `mission ${index}`;

  if (
    !checkShape(
      value,
      MISSION_KEYS,
      [
        "stableId",
        "moduleStableId",
        "title",
        "description",
        "position",
        "competencies",
        "steps",
        "assets"
      ],
      label,
      at
    )
  ) {
    return null;
  }

  const stableId = readStableId(value, "stableId", label, at);
  const named = stableId === "" ? label : `mission "${stableId}"`;
  const moduleStableId = readStableId(value, "moduleStableId", named, at);
  const title = readString(value, "title", named, at);
  const description = readString(value, "description", named, at);
  const position = readPosition(value, "position", named, at);
  const estimatedMinutes = readOptionalMinutes(
    value,
    "estimatedMinutes",
    named,
    at
  );

  const competencies = readArray(value, "competencies", named, at).flatMap(
    (entry, entryIndex) => {
      const linkLabel = `${named} competency ${entryIndex}`;

      if (
        !checkShape(
          entry,
          MISSION_COMPETENCY_KEYS,
          ["competencyStableId", "required", "relationship"],
          linkLabel,
          at
        )
      ) {
        return [];
      }

      const competencyStableId = readStableId(
        entry,
        "competencyStableId",
        linkLabel,
        at
      );
      const required = readBoolean(entry, "required", linkLabel, at);
      const relationship = readString(entry, "relationship", linkLabel, at);

      if (
        relationship !== "" &&
        !(MISSION_COMPETENCY_RELATIONSHIPS as readonly string[]).includes(
          relationship
        )
      ) {
        at(
          `${linkLabel}.relationship must be develops or reinforces, not "${relationship}"`
        );
        return [];
      }

      return [
        {
          competencyStableId,
          required,
          relationship: relationship as MissionCompetencyRelationship
        }
      ];
    }
  );

  reportDuplicates(
    competencies.map((link) => link.competencyStableId),
    `${named} competencies`,
    at
  );

  const steps = readArray(value, "steps", named, at).flatMap(
    (entry, entryIndex) => {
      const step = parseStep(entry, entryIndex, stableId || String(index), at);
      return step ? [step] : [];
    }
  );

  reportDuplicates(steps.map((step) => step.stableId), `${named} steps`, at);
  reportDuplicatePositions(
    steps.map((step) => step.position),
    `${named} steps`,
    at
  );

  const assets = readArray(value, "assets", named, at).flatMap(
    (entry, entryIndex) => {
      const asset = parseAsset(entry, entryIndex, stableId || String(index), at);
      return asset ? [asset] : [];
    }
  );

  reportDuplicates(assets.map((asset) => asset.stableId), `${named} assets`, at);
  reportDuplicatePositions(
    assets.map((asset) => asset.position),
    `${named} assets`,
    at
  );

  return {
    stableId,
    moduleStableId,
    title,
    description,
    position,
    ...(estimatedMinutes === undefined ? {} : { estimatedMinutes }),
    competencies,
    steps,
    assets
  };
}

/* ------------------------------------------------------------------ *
 * The parser
 * ------------------------------------------------------------------ */

/**
 * Parse and validate an authored curriculum document.
 *
 * Takes an already-`JSON.parse`d value rather than text, so the caller owns
 * file reading and this stays free of I/O and testable without a filesystem.
 *
 * Reports every problem it finds rather than the first, because an author
 * fixing a course wants the list. Returns a discriminated result rather than
 * throwing: an invalid document is an expected outcome of validation, not an
 * exception.
 */
export function parseCurriculumDocument(
  value: unknown
): CurriculumDocumentParseResult {
  const errors: string[] = [];
  const at: Collect = (message) => errors.push(message);

  if (
    !checkShape(
      value,
      DOCUMENT_KEYS,
      [
        "documentKind",
        "learningPath",
        "course",
        "modules",
        "missions",
        "competencies",
        "competencyPrerequisites",
        "prerequisiteRules"
      ],
      "document",
      at
    )
  ) {
    return { valid: false, errors };
  }

  const documentKind = readString(value, "documentKind", "document", at);

  if (
    documentKind !== "" &&
    !(CURRICULUM_DOCUMENT_KINDS as readonly string[]).includes(documentKind)
  ) {
    at(
      `document.documentKind must be production or architecture_fixture, not "${documentKind}"`
    );
  }

  // --- learning path ---------------------------------------------------
  const pathValue = value.learningPath;
  let learningPath: CurriculumDocumentLearningPath = {
    stableId: "",
    title: "",
    description: ""
  };

  if (
    checkShape(
      pathValue,
      LEARNING_PATH_KEYS,
      ["stableId", "title", "description"],
      "learningPath",
      at
    )
  ) {
    const estimatedMinutes = readOptionalMinutes(
      pathValue,
      "estimatedMinutes",
      "learningPath",
      at
    );
    learningPath = {
      stableId: readStableId(pathValue, "stableId", "learningPath", at),
      title: readString(pathValue, "title", "learningPath", at),
      description: readString(pathValue, "description", "learningPath", at),
      ...(estimatedMinutes === undefined ? {} : { estimatedMinutes })
    };
  }

  // --- course ----------------------------------------------------------
  const courseValue = value.course;
  let course: CurriculumDocumentCourse = {
    stableId: "",
    title: "",
    description: "",
    position: -1
  };

  if (
    checkShape(
      courseValue,
      COURSE_KEYS,
      ["stableId", "title", "description", "position"],
      "course",
      at
    )
  ) {
    const estimatedMinutes = readOptionalMinutes(
      courseValue,
      "estimatedMinutes",
      "course",
      at
    );
    course = {
      stableId: readStableId(courseValue, "stableId", "course", at),
      title: readString(courseValue, "title", "course", at),
      description: readString(courseValue, "description", "course", at),
      position: readPosition(courseValue, "position", "course", at),
      ...(estimatedMinutes === undefined ? {} : { estimatedMinutes })
    };
  }

  // --- modules ---------------------------------------------------------
  const modules = readArray(value, "modules", "document", at).flatMap(
    (entry, index) => {
      const label = `module ${index}`;

      if (
        !checkShape(
          entry,
          MODULE_KEYS,
          ["stableId", "title", "description", "position"],
          label,
          at
        )
      ) {
        return [];
      }

      const stableId = readStableId(entry, "stableId", label, at);
      const named = stableId === "" ? label : `module "${stableId}"`;
      const estimatedMinutes = readOptionalMinutes(
        entry,
        "estimatedMinutes",
        named,
        at
      );

      return [
        {
          stableId,
          title: readString(entry, "title", named, at),
          description: readString(entry, "description", named, at),
          position: readPosition(entry, "position", named, at),
          ...(estimatedMinutes === undefined ? {} : { estimatedMinutes })
        }
      ];
    }
  );

  // --- missions --------------------------------------------------------
  const missions = readArray(value, "missions", "document", at).flatMap(
    (entry, index) => {
      const mission = parseMission(entry, index, at);
      return mission ? [mission] : [];
    }
  );

  // --- competencies ----------------------------------------------------
  const competencies = readArray(value, "competencies", "document", at).flatMap(
    (entry, index) => {
      const label = `competency ${index}`;

      if (
        !checkShape(
          entry,
          COMPETENCY_KEYS,
          ["stableId", "title", "description"],
          label,
          at
        )
      ) {
        return [];
      }

      const stableId = readStableId(entry, "stableId", label, at);
      const named = stableId === "" ? label : `competency "${stableId}"`;

      return [
        {
          stableId,
          title: readString(entry, "title", named, at),
          description: readString(entry, "description", named, at)
        }
      ];
    }
  );

  // --- competency prerequisites ----------------------------------------
  const competencyPrerequisites = readArray(
    value,
    "competencyPrerequisites",
    "document",
    at
  ).flatMap((entry, index) => {
    const label = `competencyPrerequisites ${index}`;

    if (
      !checkShape(
        entry,
        COMPETENCY_PREREQUISITE_KEYS,
        ["competencyStableId", "prerequisiteCompetencyStableId"],
        label,
        at
      )
    ) {
      return [];
    }

    return [
      {
        competencyStableId: readStableId(
          entry,
          "competencyStableId",
          label,
          at
        ),
        prerequisiteCompetencyStableId: readStableId(
          entry,
          "prerequisiteCompetencyStableId",
          label,
          at
        )
      }
    ];
  });

  // --- explicit prerequisite rules --------------------------------------
  const prerequisiteRules = readArray(
    value,
    "prerequisiteRules",
    "document",
    at
  ).flatMap((entry, index) => {
    const label = `prerequisiteRules ${index}`;

    if (
      !checkShape(
        entry,
        PREREQUISITE_RULE_KEYS,
        [
          "targetNodeType",
          "targetStableId",
          "requirementType",
          "requirementStableId",
          "explanation"
        ],
        label,
        at
      )
    ) {
      return [];
    }

    const targetNodeType = readString(entry, "targetNodeType", label, at);
    const requirementType = readString(entry, "requirementType", label, at);

    if (
      targetNodeType !== "" &&
      !(PREREQUISITE_TARGET_NODE_TYPES as readonly string[]).includes(
        targetNodeType
      )
    ) {
      at(
        `${label}.targetNodeType must be course, module or mission, not "${targetNodeType}"`
      );
      return [];
    }

    if (
      requirementType !== "" &&
      !(CURRICULUM_PREREQUISITE_REQUIREMENT_TYPES as readonly string[]).includes(
        requirementType
      )
    ) {
      at(
        `${label}.requirementType must be content_completion, competency, readiness_assessment or equivalent_competency, not "${requirementType}"`
      );
      return [];
    }

    return [
      {
        targetNodeType: targetNodeType as PrerequisiteTargetNodeType,
        targetStableId: readStableId(entry, "targetStableId", label, at),
        requirementType: requirementType as PrerequisiteRequirementType,
        requirementStableId: readStableId(
          entry,
          "requirementStableId",
          label,
          at
        ),
        explanation: readString(entry, "explanation", label, at)
      }
    ];
  });

  const document: CurriculumDocument = {
    documentKind: documentKind as CurriculumDocumentKind,
    learningPath,
    course,
    modules,
    missions,
    competencies,
    competencyPrerequisites,
    prerequisiteRules
  };

  // Cross-reference integrity runs only once the shapes are known. Resolving
  // references against half-parsed nodes produces errors about the parser
  // rather than about the document.
  validateDocumentIntegrity(document, at);

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, document };
}

/* ------------------------------------------------------------------ *
 * Cross-reference integrity
 * ------------------------------------------------------------------ */

/**
 * The invariants that span nodes.
 *
 * Generalised from `validateRoasCurriculum`, which established this set against
 * one course. The rules are the same; only the input changed from module-level
 * constants to a parsed document, which is what makes them reusable for every
 * future course instead of one.
 *
 * Exported so a caller holding an already-parsed document can re-check it
 * without re-parsing, and so each rule is directly testable.
 */
export function validateDocumentIntegrity(
  document: CurriculumDocument,
  at: Collect
): void {
  const moduleIds = new Set(document.modules.map((entry) => entry.stableId));
  const missionIds = new Set(document.missions.map((entry) => entry.stableId));
  const competencyIds = new Set(
    document.competencies.map((entry) => entry.stableId)
  );

  reportDuplicates(document.modules.map((m) => m.stableId), "modules", at);
  reportDuplicates(document.missions.map((m) => m.stableId), "missions", at);
  reportDuplicates(
    document.competencies.map((c) => c.stableId),
    "competencies",
    at
  );
  reportDuplicatePositions(
    document.modules.map((m) => m.position),
    "modules",
    at
  );

  // An identity may not be reused across node kinds within one document.
  // Publication keys each table by stable id independently, so a collision is
  // legal in storage and confusing everywhere else.
  const allNodeIds = [
    document.learningPath.stableId,
    document.course.stableId,
    ...document.modules.map((m) => m.stableId),
    ...document.missions.map((m) => m.stableId)
  ].filter((id) => id !== "");

  reportDuplicates(allNodeIds, "document node identities", at);

  if (document.modules.length === 0) {
    at("the course must contain at least one module");
  }

  for (const module of document.modules) {
    const missionsInModule = document.missions.filter(
      (mission) => mission.moduleStableId === module.stableId
    );

    if (missionsInModule.length === 0) {
      at(`module "${module.stableId}" contains no mission`);
    }

    reportDuplicatePositions(
      missionsInModule.map((mission) => mission.position),
      `module "${module.stableId}" missions`,
      at
    );
  }

  for (const mission of document.missions) {
    if (mission.moduleStableId !== "" && !moduleIds.has(mission.moduleStableId)) {
      at(
        `mission "${mission.stableId}" references an unknown module: ${mission.moduleStableId}`
      );
    }

    for (const link of mission.competencies) {
      if (
        link.competencyStableId !== "" &&
        !competencyIds.has(link.competencyStableId)
      ) {
        at(
          `mission "${mission.stableId}" references an unknown competency: ${link.competencyStableId}`
        );
      }
    }

    // Publication requires it, so a document without it would validate here and
    // fail at the server — the least useful place to discover it.
    if (!mission.competencies.some((link) => link.required)) {
      at(
        `mission "${mission.stableId}" must map to at least one required competency`
      );
    }

    // Every asset a step names must be authored on the SAME mission. WP-D
    // scopes asset identity per mission, and WP-E fails the whole mission at
    // read time when a reference does not resolve, so this is the last place it
    // can be caught cheaply.
    const assetIds = new Set(mission.assets.map((asset) => asset.stableId));

    for (const step of mission.steps) {
      const content = step.content;
      const referenced =
        content.type === "diagram"
          ? content.assetStableId
          : content.type === "reference"
            ? content.assetStableId
            : undefined;

      if (referenced !== undefined && !assetIds.has(referenced)) {
        at(
          `mission "${mission.stableId}" step "${step.stableId}" references an asset that is not authored on this mission: ${referenced}`
        );
      }

      // WP-G does not make assessments publishable (Architect Decision 4), so a
      // practice step's reference is checked for SHAPE and deliberately not
      // resolved. Asserting the assessment exists would be a claim this package
      // has no way to honour.
      if (
        content.type === "practice" &&
        !CURRICULUM_DOCUMENT_STABLE_ID.test(content.assessmentStableId)
      ) {
        at(
          `mission "${mission.stableId}" step "${step.stableId}" names an assessment with an invalid stable id: ${content.assessmentStableId}`
        );
      }
    }
  }

  for (const competency of document.competencies) {
    const mapped = document.missions.some((mission) =>
      mission.competencies.some(
        (link) => link.competencyStableId === competency.stableId
      )
    );

    if (!mapped) {
      at(`competency is never mapped to a mission: ${competency.stableId}`);
    }
  }

  for (const edge of document.competencyPrerequisites) {
    if (!competencyIds.has(edge.competencyStableId)) {
      at(
        `competency prerequisite references an unknown competency: ${edge.competencyStableId}`
      );
    }

    if (!competencyIds.has(edge.prerequisiteCompetencyStableId)) {
      at(
        `competency prerequisite references an unknown prerequisite competency: ${edge.prerequisiteCompetencyStableId}`
      );
    }

    if (edge.competencyStableId === edge.prerequisiteCompetencyStableId) {
      at(`a competency cannot require itself: ${edge.competencyStableId}`);
    }
  }

  if (hasDocumentCompetencyPrerequisiteCycle(document)) {
    at("the competency prerequisite graph contains a cycle");
  }

  for (const rule of document.prerequisiteRules) {
    const targets =
      rule.targetNodeType === "course"
        ? new Set([document.course.stableId])
        : rule.targetNodeType === "module"
          ? moduleIds
          : missionIds;

    if (rule.targetStableId !== "" && !targets.has(rule.targetStableId)) {
      at(
        `prerequisite rule targets a ${rule.targetNodeType} that is not in this document: ${rule.targetStableId}`
      );
    }

    if (
      (rule.requirementType === "competency" ||
        rule.requirementType === "equivalent_competency") &&
      rule.requirementStableId !== "" &&
      !competencyIds.has(rule.requirementStableId)
    ) {
      at(
        `prerequisite rule requires a competency that is not in this document: ${rule.requirementStableId}`
      );
    }

    if (rule.requirementType === "content_completion") {
      const known =
        rule.requirementStableId === document.course.stableId ||
        moduleIds.has(rule.requirementStableId) ||
        missionIds.has(rule.requirementStableId);

      if (rule.requirementStableId !== "" && !known) {
        at(
          `prerequisite rule requires completion of a node that is not in this document: ${rule.requirementStableId}`
        );
      }
    }

    // `readiness_assessment` is deliberately NOT resolved. Assessment authoring
    // is deferred (Architect Decision 4), so no document can declare the
    // assessment it names, and requiring resolution would make a legitimate
    // rule unauthorable. Grammar is checked; existence is not claimed.
  }
}

/**
 * Whether the document's competency prerequisite graph contains a cycle.
 *
 * Iterative depth-first search with an explicit stack rather than recursion: a
 * deep authored chain must report a cycle, not overflow the stack trying.
 *
 * Exported because a cycle is the one integrity failure whose absence is worth
 * asserting directly in a test.
 */
export function hasDocumentCompetencyPrerequisiteCycle(
  document: CurriculumDocument
): boolean {
  const edges = new Map<string, string[]>();

  for (const edge of document.competencyPrerequisites) {
    const existing = edges.get(edge.competencyStableId) ?? [];
    existing.push(edge.prerequisiteCompetencyStableId);
    edges.set(edge.competencyStableId, existing);
  }

  const settled = new Set<string>();
  const onPath = new Set<string>();

  for (const start of edges.keys()) {
    if (settled.has(start)) continue;

    const stack: Array<{ node: string; entered: boolean }> = [
      { node: start, entered: false }
    ];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) break;

      if (frame.entered) {
        onPath.delete(frame.node);
        settled.add(frame.node);
        continue;
      }

      if (onPath.has(frame.node)) return true;
      if (settled.has(frame.node)) continue;

      onPath.add(frame.node);
      stack.push({ node: frame.node, entered: true });

      for (const next of edges.get(frame.node) ?? []) {
        if (onPath.has(next)) return true;
        if (!settled.has(next)) stack.push({ node: next, entered: false });
      }
    }
  }

  return false;
}

/**
 * Whether this document may be published to the learner catalog.
 *
 * One of the three independent mechanisms keeping an architecture fixture out
 * of production. The other two are path-based and live in the publication
 * command; this one travels inside the document, so a fixture stays a fixture
 * even if it is copied somewhere the path checks would allow.
 */
export function isPublishableDocumentKind(
  documentKind: CurriculumDocumentKind
): boolean {
  return documentKind === "production";
}
