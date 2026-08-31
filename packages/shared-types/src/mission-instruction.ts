import {
  collectMissionStepAssetReferences,
  missionStepsInAuthoredOrder,
  type MissionStep,
  type MissionStepContent
} from "./mission-steps";
import type {
  CurriculumAssetReference,
  CurriculumAssetType
} from "./curriculum-assets";

/**
 * WP-E — what an authenticated learner is allowed to receive for one published
 * mission's instructional content.
 *
 * ## What this is
 *
 * A **projection**, not a re-export. `MissionStep` is the authored truth; this
 * is the subset of it a learner may see. The two are deliberately different
 * types, because the difference is the whole point.
 *
 * ## What this is NOT
 *
 * Not a renderer (WP-F), not an AI projection (AIGW-011), not a second
 * curriculum model, not a second validator. Every structural decision — what a
 * valid step is, what a valid asset is, whether a mission's content is
 * coherent — was already made by WP-C and WP-D. This module reuses those
 * answers and decides only one further question: *what crosses the wire.*
 *
 * ## Why the protected fields are ABSENT rather than filtered
 *
 * `prediction.expectedOutcome` is the answer to a step whose instructional
 * purpose is committing before observing. Sending it and hiding it in the
 * interface would not hide it: a learner reads the network response.
 *
 * So it is not filtered at runtime, not set to `null`, not renamed and not
 * moved into metadata. The learner-facing type **has no such property**, and
 * `LearnerPredictionStep` cannot express one. A future change that tried to
 * pass it through would not compile.
 *
 * There is no prediction-commitment state in the platform today, so there is no
 * moment at which revealing it would be correct. Withholding always is the only
 * currently honest rule. A reveal mechanism is deliberately not WP-E.
 *
 * ## Practice stays a reference
 *
 * A `practice` step names an assessment. It does not resolve it. Resolving it
 * would route around `assessment_questions`, which has no `authenticated`
 * SELECT policy and no grant precisely so that question text, options and
 * answer keys cannot reach a learner this way.
 *
 * The reference is passed through **without asserting the assessment exists**.
 * Claiming existence we have not checked would be a different kind of lie from
 * leaking content, and no less a lie.
 *
 * ## Accessibility survives
 *
 * `diagram.textAlternative`, `interaction.textEquivalent` and an asset's
 * `altText` are authored, required by WP-C/WP-D, and carried through unchanged.
 * Nothing here generates them, and nothing here may drop them: they are
 * non-optional on the learner types, so a projection that lost one would not
 * compile.
 */

/* ------------------------------------------------------------------ *
 * Learner-safe steps
 * ------------------------------------------------------------------ */

export interface LearnerConceptStep {
  readonly type: "concept";
  readonly title?: string;
  readonly paragraphs: readonly string[];
}

export interface LearnerDiagramStep {
  readonly type: "diagram";
  readonly assetStableId: string;
  readonly caption?: string;
  /** Required, so the projection cannot silently drop it. */
  readonly textAlternative: string;
}

/**
 * Displayed command and/or output.
 *
 * A display artefact. Nothing here carries execution semantics, and `language`
 * is a highlighting hint rather than an interpreter selector.
 */
export interface LearnerCommandStep {
  readonly type: "command";
  readonly command?: string;
  readonly output?: string;
  readonly language?: string;
  readonly caption?: string;
}

/**
 * The prompt, and what the learner may choose between.
 *
 * **There is no `expectedOutcome` here and there must never be one.** See the
 * module comment: absence is the mechanism, not a runtime filter.
 */
export interface LearnerPredictionStep {
  readonly type: "prediction";
  readonly prompt: string;
  readonly options?: readonly string[];
}

export interface LearnerInteractionStep {
  readonly type: "interaction";
  readonly interactionStableId: string;
  /** Required, so the projection cannot silently drop it. */
  readonly textEquivalent: string;
  readonly caption?: string;
}

/**
 * A reference to an assessment, and nothing else.
 *
 * No questions, no options, no answer key, no scoring, and no claim that the
 * assessment resolves.
 */
export interface LearnerPracticeStep {
  readonly type: "practice";
  readonly assessmentStableId: string;
  readonly framing?: string;
}

export interface LearnerReferenceStep {
  readonly type: "reference";
  readonly label: string;
  readonly assetStableId?: string;
  readonly uri?: string;
  readonly note?: string;
}

export type LearnerMissionStepContent =
  | LearnerConceptStep
  | LearnerDiagramStep
  | LearnerCommandStep
  | LearnerPredictionStep
  | LearnerInteractionStep
  | LearnerPracticeStep
  | LearnerReferenceStep;

/**
 * One learner-facing step.
 *
 * `stableId` is the authored, mission-scoped identity — useful for keys and
 * deep-linking. The database row id is deliberately absent: a learner has no
 * use for it and it is internal.
 *
 * `position` is carried so a consumer can verify the order it was given rather
 * than trusting array order.
 */
export interface LearnerMissionStep {
  readonly stableId: string;
  readonly position: number;
  readonly content: LearnerMissionStepContent;
}

/* ------------------------------------------------------------------ *
 * Learner-safe assets
 * ------------------------------------------------------------------ */

/**
 * An asset as a learner needs it.
 *
 * Deliberately absent: the row `id` and `missionId` (internal identity), and
 * `position` and `required` (authoring inventory metadata that says nothing to
 * someone reading a diagram).
 */
export interface LearnerCurriculumAsset {
  readonly stableId: string;
  /**
   * The WP-D storage vocabulary, reused rather than widened. A learner-facing
   * `string` here would let a value WP-D refuses to store cross the boundary
   * unnoticed, which is exactly what the closed union prevents.
   */
  readonly assetType: CurriculumAssetType;
  readonly title: string;
  readonly uri: string;
  /** Present for visual assets, which WP-D refuses to store without it. */
  readonly altText?: string;
}

/* ------------------------------------------------------------------ *
 * The mission instruction response
 * ------------------------------------------------------------------ */

/** Published mission identity. Version is carried; the row id is not. */
export interface LearnerMissionSummary {
  readonly stableId: string;
  readonly version: number;
  readonly title: string;
  readonly estimatedMinutes?: number;
}

/**
 * What a learner may receive as this mission's instruction.
 *
 * Three states, and no fourth:
 *
 *   available      structured instruction, in authored order, with exactly the
 *                  assets its steps reference
 *   legacy_brief   the mission has no authored steps; the approved
 *                  `missions.description` fallback applies
 *   content_error  the authored content is structurally invalid, or a
 *                  referenced asset does not resolve
 *
 * `steps` and `assets` exist only on `available`, and `description` only on
 * `legacy_brief`. A caller therefore cannot render a partial mission, and
 * cannot show the legacy brief alongside structured steps — the two are
 * mutually exclusive by type, not by convention.
 *
 * `content_error` deliberately carries **no diagnostic detail**. Which field
 * was malformed, what value it held and which validator objected are authoring
 * and operational facts; a learner gets an honest state and nothing that
 * describes the platform's internals.
 */
export type LearnerMissionInstruction =
  | {
      readonly state: "available";
      readonly steps: readonly LearnerMissionStep[];
      readonly assets: readonly LearnerCurriculumAsset[];
    }
  | { readonly state: "legacy_brief"; readonly description: string }
  | { readonly state: "content_error" };

export interface LearnerMissionInstructionResponse {
  readonly mission: LearnerMissionSummary;
  readonly instruction: LearnerMissionInstruction;
}

/* ------------------------------------------------------------------ *
 * The projection
 * ------------------------------------------------------------------ */

/**
 * Project one validated authored step's content into its learner-safe form.
 *
 * Exhaustive over the seven approved types. The `switch` returns a distinct
 * object per branch rather than spreading the authored content, which is what
 * makes withholding structural: a field that is not written here cannot appear,
 * and a new authored field is not silently forwarded.
 *
 * Input must already be VALID. `resolvePersistedMissionSteps` and
 * `validateMissionSteps` own that; re-validating here would be a second
 * definition of what a valid step is.
 */
export function projectMissionStepContent(
  content: MissionStepContent
): LearnerMissionStepContent {
  switch (content.type) {
    case "concept":
      return {
        type: "concept",
        ...(content.title !== undefined ? { title: content.title } : {}),
        paragraphs: content.paragraphs
      };

    case "diagram":
      return {
        type: "diagram",
        assetStableId: content.assetStableId,
        ...(content.caption !== undefined ? { caption: content.caption } : {}),
        textAlternative: content.textAlternative
      };

    case "command":
      return {
        type: "command",
        ...(content.command !== undefined ? { command: content.command } : {}),
        ...(content.output !== undefined ? { output: content.output } : {}),
        ...(content.language !== undefined ? { language: content.language } : {}),
        ...(content.caption !== undefined ? { caption: content.caption } : {})
      };

    case "prediction":
      // `expectedOutcome` is NOT read. Not filtered, not nulled, not renamed —
      // never touched. `LearnerPredictionStep` has no property to put it in.
      return {
        type: "prediction",
        prompt: content.prompt,
        ...(content.options !== undefined ? { options: content.options } : {})
      };

    case "interaction":
      return {
        type: "interaction",
        interactionStableId: content.interactionStableId,
        textEquivalent: content.textEquivalent,
        ...(content.caption !== undefined ? { caption: content.caption } : {})
      };

    case "practice":
      // A reference. Nothing is resolved, and nothing asserts the assessment
      // exists.
      return {
        type: "practice",
        assessmentStableId: content.assessmentStableId,
        ...(content.framing !== undefined ? { framing: content.framing } : {})
      };

    case "reference":
      return {
        type: "reference",
        label: content.label,
        ...(content.assetStableId !== undefined
          ? { assetStableId: content.assetStableId }
          : {}),
        ...(content.uri !== undefined ? { uri: content.uri } : {}),
        ...(content.note !== undefined ? { note: content.note } : {})
      };
  }
}

/** Project one validated step, preserving authored identity and order. */
export function projectMissionStep(step: MissionStep): LearnerMissionStep {
  return {
    stableId: step.stableId,
    position: step.position,
    content: projectMissionStepContent(step.content)
  };
}

/**
 * Project one validated asset into its learner-safe form.
 *
 * Returns `undefined` for a legacy asset carrying no `stableId`. Such a row
 * predates WP-D and has no identity a step could have named, so it can never be
 * something a step asked for. Substituting an empty string would invent an
 * identity and let an unrelated asset satisfy a reference; the caller treats
 * `undefined` as unresolved, which is what it is.
 *
 * `altText` is carried when present. It is required by WP-D for visual assets
 * and enforced by a database CHECK, so a visual asset reaching here without one
 * is a defect the persistence boundary has already refused.
 */
export function projectCurriculumAsset(
  asset: CurriculumAssetReference
): LearnerCurriculumAsset | undefined {
  if (asset.stableId === undefined) return undefined;

  return {
    stableId: asset.stableId,
    assetType: asset.assetType,
    title: asset.title,
    uri: asset.uri,
    ...(asset.altText !== undefined ? { altText: asset.altText } : {})
  };
}

/**
 * Assemble the instruction for a mission whose steps are already valid.
 *
 * The ordering is deliberate and is the reason this is one function rather than
 * three call sites:
 *
 *   1. steps are put in AUTHORED ORDER — never insertion or array order;
 *   2. asset references are collected from the VALIDATED step model using
 *      WP-C's own helper, not by re-reading payloads here;
 *   3. every reference must resolve against the mission's assets;
 *   4. only the REFERENCED assets are returned.
 *
 * Step 3 fails the whole mission. A diagram whose asset is missing is
 * instruction the learner cannot receive, and returning the remaining steps
 * would present a mission that looks complete and is not — the partial-content
 * failure CURR-010 section 13.2 rejects. Publication should already have
 * blocked this state; the read refuses it a second time rather than trusting
 * that it did.
 *
 * Step 4 keeps authoring inventory out of the learner response: an asset no
 * step references is not this learner's content.
 */
export function assembleLearnerInstruction(
  steps: readonly MissionStep[],
  missionAssets: readonly CurriculumAssetReference[]
): LearnerMissionInstruction {
  const ordered = missionStepsInAuthoredOrder(steps);
  const referenced = collectMissionStepAssetReferences(ordered);

  const byStableId = new Map(
    missionAssets.flatMap((asset) =>
      asset.stableId === undefined ? [] : [[asset.stableId, asset] as const]
    )
  );

  const resolved: LearnerCurriculumAsset[] = [];

  for (const stableId of referenced) {
    const asset = byStableId.get(stableId);
    if (asset === undefined) return { state: "content_error" };

    const projected = projectCurriculumAsset(asset);
    // Fails closed. No substitution, no omission, no partial instruction.
    if (projected === undefined) return { state: "content_error" };

    resolved.push(projected);
  }

  return {
    state: "available",
    steps: ordered.map(projectMissionStep),
    assets: resolved
  };
}
