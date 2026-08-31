import type {
  LearnerCurriculumAsset,
  LearnerMissionInstructionResponse,
  LearnerMissionStep
} from "@tlp/shared-types";
import { parseMissionBrief, type BriefBlock } from "./roas-course-content";

/**
 * WP-F — which single instructional source a mission shows, and in what words.
 *
 * ## Why this module exists at all
 *
 * Every decision here could have been written as a chain of conditionals inside
 * `MissionDetail`. It is not, for one reason: this repository has no rendered-DOM
 * test harness — no jsdom, no happy-dom, no testing-library — and WP-F may not
 * add one, because a dependency change fails `verify-roas3.sh`.
 *
 * So the rules that matter are pulled out of JSX and into total functions over
 * plain values, and `MissionInstruction.tsx` is left thin enough that what
 * remains is markup, which the structural verifier can check. Logic that cannot
 * be tested is logic that will be wrong later.
 *
 * ## The one rule this module exists to enforce
 *
 * **A mission shows exactly one instructional source.** Not steps beside a
 * brief, not a brief beneath steps, not a partial mission with a note about the
 * rest. `selectInstructionSource` returns one tagged variant carrying one
 * source's payload, so the caller has nothing to combine and no branch in which
 * to combine it. The prohibition is structural rather than remembered.
 *
 * ## What this module is NOT
 *
 * Not a validator. WP-E already decided what is valid, what is withheld and what
 * resolves; re-checking any of it here would be a second answer to a question
 * the server has already answered authoritatively. Nothing below inspects step
 * payload validity, re-resolves an asset reference WP-E failed, or reconstructs
 * anything WP-E declined to send.
 *
 * Not a parser for structured content either. Steps arrive structured. The only
 * parsing here is `parseMissionBrief`, reused unchanged for the legacy string,
 * because a server `legacy_brief` and the bundled course brief are the same
 * authored text in the same format.
 */

/* ------------------------------------------------------------------ *
 * The four sources
 * ------------------------------------------------------------------ */

/**
 * Which source is showing.
 *
 *   structured   WP-E returned authored steps. The mission's real instruction.
 *   legacy       WP-E returned the mission's own description, per CURR-010
 *                section 13.4 — a published mission with no authored steps.
 *   bundled      The endpoint could not answer, so the course's own authored
 *                brief stands in. Transitional; see below.
 *   unavailable  No instruction may be shown at all.
 */
export type InstructionSourceKind =
  | "structured"
  | "legacy"
  | "bundled"
  | "unavailable";

export type InstructionSource =
  | {
      readonly kind: "structured";
      readonly steps: readonly LearnerMissionStep[];
      readonly assets: readonly LearnerCurriculumAsset[];
    }
  | { readonly kind: "legacy"; readonly blocks: readonly BriefBlock[] }
  | { readonly kind: "bundled" }
  | { readonly kind: "unavailable"; readonly message: string };

/**
 * Error codes for which the bundled course brief may stand in.
 *
 * Deliberately a closed list, and deliberately short.
 *
 * The reason this fallback exists is a real, current, temporary condition:
 * `mission_steps` is authored as a migration that has not been applied to the
 * development database, so WP-E's step query fails and the read raises
 * `DEPENDENCY_UNAVAILABLE`. Without a fallback, shipping WP-F would make every
 * existing course mission unreadable — a regression caused entirely by adding a
 * feature.
 *
 * `NOT_FOUND` and `NETWORK_UNAVAILABLE` join it because in both the platform has
 * no instruction to offer, while the authored brief is already in the browser
 * and is correct for this mission. Showing it is not a guess.
 *
 * Everything else — `INTERNAL_ERROR`, `UNAUTHORIZED`, or a code not recognised
 * here — is not eligible. An unexplained failure must not be dressed up as
 * working curriculum: that would turn every future server defect into content
 * the learner silently trusts, and would hide the defect from the people who
 * could fix it. Those resolve to `unavailable`.
 */
const FALLBACK_ELIGIBLE_ERROR_CODES: readonly string[] = [
  "DEPENDENCY_UNAVAILABLE",
  "NOT_FOUND",
  "NETWORK_UNAVAILABLE"
];

/** Whether this failure may be covered by the bundled brief. */
export function isBundledFallbackEligible(errorCode: string | null): boolean {
  if (errorCode === null) return false;
  return FALLBACK_ELIGIBLE_ERROR_CODES.includes(errorCode);
}

/* ------------------------------------------------------------------ *
 * The request, and which mission it belongs to
 * ------------------------------------------------------------------ */

/**
 * One mission's instruction request, carrying the mission it is about.
 *
 * ## Why the mission identity is part of the state
 *
 * The identity is not decoration and not a debugging aid. It is the whole
 * mechanism, and it replaces an earlier model that held three loose values —
 * response, error code, loading — cleared in an effect keyed by the selected
 * mission.
 *
 * That model had a race, and clearing harder would not have fixed it. An effect
 * runs AFTER the render that scheduled it. On the render where the selection
 * changes from mission A to mission B, the old state is still present and still
 * consumable, so B's panel could render A's structured instruction for one
 * frame before the effect cleared anything. An `AbortController` does not help:
 * it stops a late RESPONSE from arriving, and this was a stale READ of state
 * that had already arrived.
 *
 * Tagging the state removes the window rather than narrowing it. There is no
 * instant at which a value belonging to A can be read as B's, because the
 * consumer is handed both the state and the mission it is being asked about and
 * compares them before looking at anything else.
 *
 * ## Why the tag rather than the response's own mission field
 *
 * A loaded response does carry `response.mission.stableId`. The `loading` and
 * `error` states carry no response at all, and those are exactly the states a
 * stale render is most likely to catch. One mechanism covering all four states
 * is better than one covering two.
 *
 * ## Why the variants omit fields instead of nulling them
 *
 * A `loading` state has no response and no error code, so it carries neither
 * member rather than carrying both as `null`. An unrepresentable combination
 * cannot be misread, and it matches how WP-E's own outcome union is built.
 */
export type MissionInstructionRequest =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly missionStableId: string }
  | {
      readonly status: "loaded";
      readonly missionStableId: string;
      readonly response: LearnerMissionInstructionResponse;
    }
  | {
      readonly status: "error";
      readonly missionStableId: string;
      readonly errorCode: string;
    };

/**
 * What a learner is told when no instruction can be shown.
 *
 * One wording covers both causes — a structurally invalid authored step, and a
 * failure this module refuses to paper over — and that is deliberate. The
 * outcome is the same either way, and which internal condition produced it is
 * an operational fact about the platform rather than something a learner needs
 * or should be able to infer.
 *
 * It names no cause: not authored content, not an internal failure, not
 * database, migration or deployment state. It says the two things that change
 * what a learner does next — that this is temporary, and that their progress is
 * intact.
 */
export function describeInstructionUnavailable(): string {
  return (
    "This mission's instruction is temporarily unavailable. " +
    "Your progress is saved."
  );
}

/**
 * Choose the one source to render for one named mission.
 *
 * The mission identity is a required argument rather than something the caller
 * is trusted to have checked. There is no way to ask this function what to show
 * without saying which mission is being asked about, so the scoping below cannot
 * be skipped, forgotten, or left to the order effects happen to run in.
 *
 * Ordering, once the state is known to belong to this mission:
 *
 *   1. a successful response is authoritative — including when it says the
 *      content is broken;
 *   2. only then is a failure classified;
 *   3. loading, idle and another mission's state all fall back to the bundled
 *      brief.
 *
 * `content_error` is checked before any fallback and can never reach one. That
 * ordering is the whole of CURR-010 section 13.2 in the client: a mission whose
 * authored content is structurally invalid must not quietly render different
 * content that happens to be available, because the result looks complete, reads
 * as correct, and hides a defect nobody is then told about.
 *
 * Loading resolves to `bundled` rather than to a spinner state. The brief is
 * already in memory and is authored truth for this mission, so showing it costs
 * nothing and avoids a blank panel between opening a mission and the network
 * answering. Nothing is asserted that later turns out false: the worst case is
 * that authored steps replace an authored brief covering the same material.
 */
export function selectInstructionSource(
  request: MissionInstructionRequest,
  missionStableId: string
): InstructionSource {
  // Scope before anything else is read.
  //
  // A request belonging to a different mission is not weaker evidence about
  // this one — it is no evidence at all, and is treated exactly like never
  // having asked. That includes a `content_error`: another mission's broken
  // content says nothing about this mission and must not blank its panel.
  if (
    request.status === "idle" ||
    request.missionStableId !== missionStableId
  ) {
    return { kind: "bundled" };
  }

  if (request.status === "loading") return { kind: "bundled" };

  if (request.status === "error") {
    return isBundledFallbackEligible(request.errorCode)
      ? { kind: "bundled" }
      : { kind: "unavailable", message: describeInstructionUnavailable() };
  }

  const instruction = request.response.instruction;

  if (instruction.state === "available") {
    return {
      kind: "structured",
      steps: instruction.steps,
      assets: instruction.assets
    };
  }

  if (instruction.state === "legacy_brief") {
    return {
      kind: "legacy",
      blocks: parseMissionBrief(instruction.description)
    };
  }

  // content_error. No fallback, no steps, no brief, no diagnostics.
  return { kind: "unavailable", message: describeInstructionUnavailable() };
}

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

/**
 * Index the assets WP-E sent, by the identity a step names them with.
 *
 * A convenience, not a resolution rule. WP-E already refused the whole mission
 * if any referenced asset failed to resolve, so a lookup that misses here means
 * the response was assembled by something other than WP-E. The renderer
 * degrades quietly rather than throwing, because one incomplete figure is a
 * better outcome for a learner than a blank page.
 */
export function buildAssetIndex(
  assets: readonly LearnerCurriculumAsset[]
): ReadonlyMap<string, LearnerCurriculumAsset> {
  return new Map(assets.map((asset) => [asset.stableId, asset]));
}

export function resolveAsset(
  index: ReadonlyMap<string, LearnerCurriculumAsset>,
  stableId: string | undefined
): LearnerCurriculumAsset | undefined {
  if (stableId === undefined) return undefined;
  return index.get(stableId);
}

/**
 * Where a `reference` step points, if anywhere.
 *
 * An authored `uri` wins; otherwise the named asset's own `uri` is used. When
 * neither resolves, the step still renders — as its label and note, unlinked.
 *
 * The `assetStableId` itself is never the answer. It is an internal identity,
 * and putting it on screen — as text, as a link target, or as link text — would
 * show a learner a storage key and call it a reference.
 */
export function resolveReferenceHref(
  index: ReadonlyMap<string, LearnerCurriculumAsset>,
  content: { readonly uri?: string; readonly assetStableId?: string }
): string | undefined {
  if (content.uri !== undefined) return content.uri;
  return resolveAsset(index, content.assetStableId)?.uri;
}

/* ------------------------------------------------------------------ *
 * Learner-facing wording
 *
 * Kept here, not in JSX, so every string is reachable from a test that runs
 * without a DOM — the same reason `roas-course-presentation.ts` holds the
 * course's wording.
 * ------------------------------------------------------------------ */

/**
 * Labels the two halves of a `command` step.
 *
 * A command and its result are visually obvious and, without these, identical to
 * a screen reader: two preformatted blocks in a row with nothing to tell them
 * apart. CURR-010 section 11 requires an accessible text path for every step,
 * and "distinguishable" has to mean distinguishable in words.
 */
export function describeCommandLabel(): string {
  return "Command";
}

export function describeCommandOutputLabel(): string {
  return "Result";
}

/**
 * The label for a `practice` step.
 *
 * A practice step names an assessment; it does not carry one, and WP-F does not
 * go and get one. So the treatment is a signpost, not a control: no button that
 * does nothing, no disabled input, nothing that reads as a feature left
 * unfinished.
 */
export function describePracticeCheckpointLabel(): string {
  return "Practice checkpoint";
}

/**
 * What a practice checkpoint guarantees.
 *
 * This restates an established product guarantee rather than introducing one:
 * `describeMissionPracticeAuthority` has made the same promise on the course
 * surface since ROAS-3, and `verify-roas3.sh` pins the "not recorded" wording
 * there. Practice that quietly counted towards competency would break the
 * deterministic validation boundary, so saying so plainly is part of the
 * product, not reassurance.
 */
export function describePracticeCheckpoint(): string {
  return (
    "It is not recorded, it does not count towards any competency, and it " +
    "does not complete the mission."
  );
}
