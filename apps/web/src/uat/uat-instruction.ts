import {
  assembleLearnerInstruction,
  parseCurriculumDocument,
  type CurriculumAssetReference,
  type CurriculumDocument,
  type CurriculumDocumentAsset,
  type CurriculumDocumentMission,
  type InteractionSupportLevel,
  type LearnerMissionInstruction,
  type MissionStep
} from "@tlp/shared-types";

/**
 * WP-I — turning the architecture fixture into exactly what a learner would
 * receive, so a human can look at it in a browser.
 *
 * ## The one thing this module exists to guarantee
 *
 * **Everything a UAT reviewer sees came through the real contracts.** The
 * document is read by `parseCurriculumDocument`, the same strict parser the
 * publication command uses. The learner view is produced by
 * `assembleLearnerInstruction`, the same assembly `getLearnerMissionInstruction`
 * calls on the server, which applies authored order, asset resolution and the
 * support-level withholding in `projectMissionStepContent`.
 *
 * Nothing here re-implements any of that. If this module built learner objects
 * by hand, UAT would be reviewing a mock and reporting findings about it —
 * which is worse than not running UAT, because the findings would look real.
 *
 * ## What this module is NOT
 *
 * Not a second curriculum source: it authors no content and contains no
 * scenario, no topology, no prose and no interaction payload. It takes a parsed
 * value in and hands a learner instruction out.
 *
 * Not a validator: `parseCurriculumDocument` decides what is valid, and its
 * errors are surfaced rather than repaired.
 *
 * Not a renderer, not a network model, and not a data-access boundary. There is
 * no Supabase client, no API client, no credential and no persistence anywhere
 * in the WP-I surface.
 *
 * ## The one UAT-specific behaviour, and why it is legitimate
 *
 * `withSupportLevel` substitutes the support level on interaction steps before
 * projection. That is a UAT CONTROL selecting among values the shared contract
 * already defines — `InteractionSupportLevel` is imported, never redefined, and
 * no UAT-only level exists. The substitution changes the INPUT to the real
 * projection; it does not change, bypass or reimplement the projection.
 *
 * It also means the harness demonstrates what each level PRESENTS. It does not
 * demonstrate that the server withholds: that is enforced in
 * `mission-instruction.ts` and proven by its own tests. The runbook says so, so
 * a green UAT is never mistaken for a security proof.
 */

/* ------------------------------------------------------------------ *
 * Loading the document
 * ------------------------------------------------------------------ */

export type UatDocumentOutcome =
  | { readonly state: "ready"; readonly document: CurriculumDocument }
  | { readonly state: "invalid"; readonly errors: readonly string[] };

/**
 * Parse the fixture with the real parser.
 *
 * A parse failure is surfaced, never worked around. If the architecture fixture
 * ever stops satisfying the curriculum contract, the UAT surface must say so
 * loudly rather than render something assembled from the parts that happened to
 * survive — the same refusal `resolveMissionStepsForRead` makes.
 */
export function loadUatDocument(value: unknown): UatDocumentOutcome {
  const result = parseCurriculumDocument(value);

  return result.valid
    ? { state: "ready", document: result.document }
    : { state: "invalid", errors: result.errors };
}

/* ------------------------------------------------------------------ *
 * Selecting what to look at
 * ------------------------------------------------------------------ */

export interface UatMissionChoice {
  readonly stableId: string;
  readonly title: string;
  readonly stepCount: number;
  /** Whether this mission carries an interaction worth walking. */
  readonly hasInteraction: boolean;
  /**
   * Whether this mission carries a `prediction` STEP.
   *
   * ## Why the harness cares
   *
   * A prediction step is read-only by design (CURR-010; WP-F renders it with no
   * input, no selection and no reveal, because DEC-059 places the reveal after a
   * commitment and no commitment contract exists on either side of the wire).
   * On screen it is a prompt followed by a list of options — which looks exactly
   * like a question that has stopped working.
   *
   * Founder UAT reported it as one. That was a reasonable reading of what was
   * shown, and the cost is real: a reviewer who thinks a control is broken stops
   * trusting the rest of the surface.
   *
   * So the harness says so, in the harness. This is a REVIEWER aid and nothing
   * more: no learner-facing behaviour changes, the step architecture is
   * untouched, and how predictions are authored inside a coherent lesson remains
   * WP-J's decision.
   */
  readonly hasPassivePrediction: boolean;
}

/**
 * The missions a reviewer may open, in authored order.
 *
 * Derived from the parsed document rather than listed here, so adding a mission
 * to the fixture makes it selectable without touching this file.
 */
export function listUatMissions(
  document: CurriculumDocument
): readonly UatMissionChoice[] {
  return [...document.missions]
    .sort((left, right) => left.position - right.position)
    .map((mission) => ({
      stableId: mission.stableId,
      title: mission.title,
      stepCount: mission.steps.length,
      hasInteraction: mission.steps.some(
        (step) => step.content.type === "interaction"
      ),
      hasPassivePrediction: mission.steps.some(
        (step) => step.content.type === "prediction"
      )
    }));
}

export function findUatMission(
  document: CurriculumDocument,
  missionStableId: string
): CurriculumDocumentMission | undefined {
  return document.missions.find(
    (mission) => mission.stableId === missionStableId
  );
}

/* ------------------------------------------------------------------ *
 * Building the learner view
 * ------------------------------------------------------------------ */

/**
 * Apply the reviewer's chosen support level to every interaction step.
 *
 * Non-interaction steps are returned untouched — the level is an interaction
 * concept, and rewriting anything else would make the reviewer's selection mean
 * something the contract does not.
 */
function withSupportLevel(
  steps: readonly MissionStep[],
  supportLevel: InteractionSupportLevel
): MissionStep[] {
  return steps.map((step) =>
    step.content.type === "interaction"
      ? { ...step, content: { ...step.content, supportLevel } }
      : step
  );
}

/**
 * Adapt an authored document asset to the reference shape the projection reads.
 *
 * `id` and `missionId` are database row identities an author cannot know; the
 * server importer supplies the real ones at write time, and the projection
 * deliberately drops both before a learner sees anything. Placeholders are used
 * here for the same reason `parseAsset` passes `missionId: "document"` when it
 * reuses the WP-D validator: the fields are required by the type and are not
 * part of what is being reviewed.
 *
 * `assetType` is cast exactly as the server importer casts it. The parser has
 * already refused any type outside the authorable vocabulary, so the cast
 * cannot widen anything.
 */
function asAssetReference(
  asset: CurriculumDocumentAsset
): CurriculumAssetReference {
  return {
    id: `uat-${asset.stableId}`,
    missionId: "uat-fixture",
    stableId: asset.stableId,
    assetType: asset.assetType as CurriculumAssetReference["assetType"],
    title: asset.title,
    uri: asset.uri,
    position: asset.position,
    required: asset.required ?? false,
    ...(asset.altText === undefined ? {} : { altText: asset.altText })
  };
}

/**
 * What a learner would receive for one fixture mission at one support level.
 *
 * The whole point is the last line: `assembleLearnerInstruction` is the real
 * assembly, so ordering, asset resolution, the referenced-only rule, protected
 * field withholding and the `content_error` failure mode are all exactly what
 * the server would produce.
 */
export function buildUatInstruction(
  document: CurriculumDocument,
  missionStableId: string,
  supportLevel: InteractionSupportLevel
): LearnerMissionInstruction {
  const mission = findUatMission(document, missionStableId);

  // A mission that is not in the document cannot be rendered, and inventing an
  // empty one would present a mission that does not exist.
  if (mission === undefined) return { state: "content_error" };

  return assembleLearnerInstruction(
    withSupportLevel(mission.steps, supportLevel),
    mission.assets.map(asAssetReference)
  );
}
