/**
 * AI Tutor foundation — the deterministic lesson-grounding selection seam.
 *
 * Grounding is the answer to "what approved content may this answer be built
 * from?". It is deterministic, bounded, ordered by an approved precedence, and
 * it is NEVER assembled from client-supplied text.
 *
 * ## The seam, and why it is a seam
 *
 * `TutorGroundingSource` is an interface with one method. The Curriculum Engine
 * can implement it directly today; the Search Engine could implement it later;
 * a future retrieval service could implement it instead. Nothing in the Tutor
 * foundation knows which. The issue's rule — "Search may later provide
 * retrieval; do not tightly couple Tutor to one Search implementation" — is
 * satisfied structurally, because there is no Search type anywhere in this
 * module and no import from any Search model.
 *
 * ## The client requests a projection; it never supplies one
 *
 * A caller passes REFERENCES — "the lesson text of step `x`", "the objective of
 * this mission". The source resolves them from the authored record. A resolved
 * segment whose id was not requested is DISCARDED, so a source cannot widen the
 * context it was asked for. This is `AIGW-011` section 8 applied at the only
 * place it can be enforced: before anything is selected.
 *
 * ## Citations are derived, never claimed
 *
 * `buildTutorCitations` can only produce citations for segments that were
 * actually selected, and `verifyTutorCitations` drops anything a provider
 * invented. Fabricating a citation is therefore not a behaviour that has to be
 * prevented by instruction — it is one that cannot survive normalization.
 *
 * ## What this does NOT do
 *
 * No scoring, no relevance, no embeddings, no semantic similarity, no ranking
 * model and no randomness. Selection is precedence, requested order, then
 * stable id. Two identical inputs always produce the identical selection.
 *
 * Pure module: no I/O, no clock, no randomness, no provider, no AI.
 */

export const AI_TUTOR_GROUNDING_MODEL_VERSION = "ai-tutor-grounding-v1";

/**
 * The approved context kinds a Tutor request may ask for.
 *
 * A CLOSED vocabulary. An unapproved kind is the `unsupported_context_type`
 * failure the issue requires to fail closed, and it is rejected before any
 * source is consulted.
 *
 * Deliberately absent: anything derived from an assessment. `AIGW-011`
 * section 12 excludes assessment question text, option text and answer keys
 * from every projection at every mode and every disclosure state, and the only
 * way to honour that without relying on a filter is to leave it unnameable.
 */
export const TUTOR_GROUNDING_KINDS = [
  "lesson_text",
  "transcript",
  "objective",
  "concept",
  "glossary",
  "reference",
  "practice_framing"
] as const;

export type TutorGroundingKind = (typeof TUTOR_GROUNDING_KINDS)[number];

export function isTutorGroundingKind(
  value: unknown
): value is TutorGroundingKind {
  return (
    typeof value === "string" &&
    (TUTOR_GROUNDING_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Kinds that must never be requested or projected, held as data.
 *
 * `TUTOR_GROUNDING_KINDS` already excludes them by omission. This list exists so
 * the exclusion is an assertion a test can make, rather than an absence a
 * reader has to notice.
 */
export const TUTOR_GROUNDING_EXCLUDED_KINDS: readonly string[] = [
  "assessment_question",
  "assessment_option",
  "answer_key",
  "expected_outcome",
  "expected_path",
  "authored_fault",
  "solution",
  "another_learner_note",
  "other_learner_context"
];

/**
 * Approved precedence. Lower index is preferred.
 *
 * "Prefer approved course/lesson content first": the lesson the learner is
 * actually reading comes before the objective, which comes before the glossary,
 * which comes before an external reference. Practice framing sits last because
 * it is the narrowest context and never the substance of an explanation.
 */
export const TUTOR_GROUNDING_PRECEDENCE: readonly TutorGroundingKind[] = [
  "lesson_text",
  "transcript",
  "objective",
  "concept",
  "glossary",
  "reference",
  "practice_framing"
];

/** A request for one piece of approved content, by stable identity. */
export interface TutorGroundingRef {
  kind: TutorGroundingKind;
  segmentStableId: string;
}

/**
 * One resolved piece of approved content.
 *
 * `text` comes from the authored source and from nowhere else.
 * `sourceReference` is the stable path a learner can follow back to it, which
 * is what makes a citation verifiable rather than decorative.
 */
export interface TutorGroundingSegment {
  kind: TutorGroundingKind;
  segmentStableId: string;
  title: string;
  text: string;
  sourceReference: string;
}

/**
 * What a grounding source returns.
 *
 * A discriminated union, so "the source failed" can never be read as "the
 * lesson has no content". That distinction is the whole difference between an
 * honest unavailable answer and a confidently ungrounded one.
 */
export type TutorGroundingResolution =
  | {
      availability: "available";
      segments: readonly TutorGroundingSegment[];
    }
  | { availability: "unavailable"; internalReason?: string };

/**
 * The seam. One method, no transport, no identity, no provider.
 *
 * An implementation receives only references and returns only approved content.
 * It is given no learner id and no access token here on purpose: the caller
 * holds the session and is responsible for constructing a source that reads as
 * that caller.
 */
export interface TutorGroundingSource {
  readonly sourceId: string;
  resolve(
    refs: readonly TutorGroundingRef[]
  ): Promise<TutorGroundingResolution>;
}

/* ------------------------------------------------------------------ *
 * Bounds
 * ------------------------------------------------------------------ */

/** Minimum-necessary context: a few segments, never a course. */
export const TUTOR_MAX_GROUNDING_REFS = 12;
export const TUTOR_MAX_GROUNDING_SEGMENTS = 8;
export const TUTOR_GROUNDING_TEXT_BUDGET = 6_000;
export const TUTOR_GROUNDING_SEGMENT_TEXT_LIMIT = 2_000;

/**
 * How a Tutor answer is grounded.
 *
 * Three states, matching the three the issue requires to be distinguishable:
 * a lesson-grounded explanation, a general explanation, and context that is
 * unavailable or not connected.
 */
export const TUTOR_GROUNDING_MODES = [
  "lesson_grounded",
  "general",
  "context_unavailable"
] as const;

export type TutorGroundingMode = (typeof TUTOR_GROUNDING_MODES)[number];

/** A citation, derivable only from a selected segment. */
export interface TutorCitation {
  segmentStableId: string;
  title: string;
  sourceReference: string;
}

export interface TutorGroundingSelection {
  modelVersion: string;
  mode: TutorGroundingMode;
  segments: readonly TutorGroundingSegment[];
  citations: readonly TutorCitation[];
  /** Segments dropped by the bound, so truncation is never silent. */
  droppedSegmentCount: number;
}

/**
 * Normalizes one segment's text: whitespace collapsed, length bounded.
 *
 * Deliberately not case-folded and not punctuation-stripped. Technical content
 * such as `Get-ADUser`, `kubectl` or `index=botsv3` must survive intact, for the
 * same reason `SEARCH-005` protects them.
 */
export function normalizeTutorGroundingText(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > TUTOR_GROUNDING_SEGMENT_TEXT_LIMIT
    ? text.slice(0, TUTOR_GROUNDING_SEGMENT_TEXT_LIMIT)
    : text;
}

/**
 * Validates and bounds a requested reference set.
 *
 * Returns null when any reference is unapproved or malformed. The caller turns
 * that into the request-level `unsupported_context_type` refusal — this module
 * never decides how a failure is reported, only that an unapproved kind can
 * never reach a source.
 */
export function normalizeTutorGroundingRefs(
  refs: readonly unknown[]
): TutorGroundingRef[] | null {
  if (refs.length > TUTOR_MAX_GROUNDING_REFS) return null;

  const seen = new Set<string>();
  const normalized: TutorGroundingRef[] = [];

  for (const candidate of refs) {
    if (!candidate || typeof candidate !== "object") return null;

    const ref = candidate as Record<string, unknown>;
    if (!isTutorGroundingKind(ref.kind)) return null;

    const segmentStableId =
      typeof ref.segmentStableId === "string" ? ref.segmentStableId.trim() : "";
    if (!segmentStableId) return null;

    // A reference may not carry authored text. Accepting one would make the
    // client a curriculum author, which is the defect this seam exists to
    // prevent.
    if ("text" in ref || "title" in ref) return null;

    const key = `${ref.kind}:${segmentStableId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    normalized.push({ kind: ref.kind, segmentStableId });
  }

  return normalized;
}

/**
 * Deterministically selects the grounding for one request.
 *
 * Order of operations, and each step matters:
 *
 *   1. An unavailable resolution yields `context_unavailable` with no segments.
 *      Nothing is guessed and no partial context is assembled.
 *   2. A resolved segment whose `(kind, id)` was not requested is DISCARDED, so
 *      a source cannot widen context.
 *   3. Remaining segments are ordered by approved precedence, then by the order
 *      the caller requested them, then by stable id. No scoring, no relevance.
 *   4. The segment count and total text are bounded, and the number dropped is
 *      reported rather than hidden.
 *   5. The mode is `lesson_grounded` only when at least one segment survived.
 *      A request that asked for nothing is `general`; a request that asked for
 *      something and received nothing usable is `context_unavailable`.
 */
export function selectTutorGrounding(input: {
  refs: readonly TutorGroundingRef[];
  resolution: TutorGroundingResolution;
}): TutorGroundingSelection {
  const { refs, resolution } = input;

  if (resolution.availability === "unavailable") {
    return {
      modelVersion: AI_TUTOR_GROUNDING_MODEL_VERSION,
      mode: "context_unavailable",
      segments: [],
      citations: [],
      droppedSegmentCount: 0
    };
  }

  if (refs.length === 0) {
    return {
      modelVersion: AI_TUTOR_GROUNDING_MODEL_VERSION,
      mode: "general",
      segments: [],
      citations: [],
      droppedSegmentCount: 0
    };
  }

  const requestedOrder = new Map<string, number>();
  refs.forEach((ref, index) => {
    requestedOrder.set(`${ref.kind}:${ref.segmentStableId}`, index);
  });

  const requested = resolution.segments.filter((segment) =>
    requestedOrder.has(`${segment.kind}:${segment.segmentStableId}`)
  );

  const ordered = [...requested].sort((a, b) => {
    const precedence =
      TUTOR_GROUNDING_PRECEDENCE.indexOf(a.kind) -
      TUTOR_GROUNDING_PRECEDENCE.indexOf(b.kind);
    if (precedence !== 0) return precedence;

    const requestedDelta =
      (requestedOrder.get(`${a.kind}:${a.segmentStableId}`) ?? 0) -
      (requestedOrder.get(`${b.kind}:${b.segmentStableId}`) ?? 0);
    if (requestedDelta !== 0) return requestedDelta;

    return a.segmentStableId.localeCompare(b.segmentStableId);
  });

  const selected: TutorGroundingSegment[] = [];
  let budget = TUTOR_GROUNDING_TEXT_BUDGET;

  for (const segment of ordered) {
    if (selected.length >= TUTOR_MAX_GROUNDING_SEGMENTS) break;

    const text = normalizeTutorGroundingText(segment.text);
    if (!text) continue;
    if (text.length > budget) break;

    budget -= text.length;
    selected.push({
      kind: segment.kind,
      segmentStableId: segment.segmentStableId,
      title: String(segment.title ?? "").trim(),
      text,
      sourceReference: String(segment.sourceReference ?? "").trim()
    });
  }

  return {
    modelVersion: AI_TUTOR_GROUNDING_MODEL_VERSION,
    mode: selected.length > 0 ? "lesson_grounded" : "context_unavailable",
    segments: selected,
    citations: buildTutorCitations(selected),
    droppedSegmentCount: ordered.length - selected.length
  };
}

/**
 * Citations, derived from selected segments and from nothing else.
 *
 * A segment with no source reference contributes no citation: an unfollowable
 * citation is worse than none, because it looks like evidence.
 */
export function buildTutorCitations(
  segments: readonly TutorGroundingSegment[]
): TutorCitation[] {
  return segments
    .filter((segment) => segment.sourceReference.length > 0)
    .map((segment) => ({
      segmentStableId: segment.segmentStableId,
      title: segment.title,
      sourceReference: segment.sourceReference
    }));
}

/**
 * Keeps only the citations that correspond to a selected segment.
 *
 * Provider output is untrusted: a model may name a section that does not exist,
 * or cite a real section it was never given. Both are fabrication, and both are
 * dropped here. The `fabricated` count is returned so the outcome can be
 * recorded operationally rather than silently discarded.
 */
export function verifyTutorCitations(input: {
  claimed: readonly unknown[];
  selected: readonly TutorGroundingSegment[];
}): { verified: TutorCitation[]; fabricatedCount: number } {
  const allowed = new Map<string, TutorCitation>();
  for (const citation of buildTutorCitations(input.selected)) {
    allowed.set(citation.segmentStableId, citation);
  }

  const verified: TutorCitation[] = [];
  let fabricatedCount = 0;

  for (const candidate of input.claimed) {
    const segmentStableId =
      candidate && typeof candidate === "object"
        ? String(
            (candidate as Record<string, unknown>).segmentStableId ?? ""
          ).trim()
        : String(candidate ?? "").trim();

    const match = segmentStableId ? allowed.get(segmentStableId) : undefined;

    if (!match) {
      fabricatedCount += 1;
      continue;
    }

    if (!verified.some((entry) => entry.segmentStableId === segmentStableId)) {
      verified.push(match);
    }
  }

  return { verified, fabricatedCount };
}

/** The honest learner-facing sentence for each grounding mode. */
export function describeTutorGroundingMode(mode: TutorGroundingMode): string {
  switch (mode) {
    case "lesson_grounded":
      return "This explanation comes from this lesson.";
    case "general":
      return "This is a general explanation. It is not drawn from this lesson's content.";
    default:
      return "I could not read this lesson's content, so I will not describe what it says.";
  }
}
