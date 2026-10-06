/**
 * AI Tutor foundation — the versioned Tutor request contract.
 *
 * `AIGW-001` for one task family. A normalized, versioned request that fails
 * closed, carries minimum-necessary context, and separates what a CLIENT may
 * supply from what the SERVER resolves.
 *
 * ## Two types, and the whole security model
 *
 * `TutorRequestInput` is what arrives from the lesson workspace.
 * `TutorRequest` is what the platform assembles. They are deliberately
 * different shapes, because three things must be impossible for a client to
 * assert:
 *
 *   - LESSON CONTENT. The input carries REFERENCES only. Authored text is
 *     resolved server-side through the grounding seam, so a client cannot
 *     invent curriculum and have it explained back as though it were the
 *     course. `AIGW-011` section 8: a projection is computed from the authored
 *     source and never assembled from client-supplied content.
 *   - LAB STATE. The input has no lab-state field at all. Lab state reaches a
 *     request only through `classifyTutorLabState`, which admits exactly one
 *     deterministic source and fails closed to `unavailable` for everything
 *     else.
 *   - IDENTITY AND AUTHORITY. The input carries no learner id, no provider or
 *     model override, no disclosure claim and no support-level override.
 *     `AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS` records that as data, and
 *     assembly refuses any input carrying one.
 *
 * Note excerpts are the single exception to "no client-supplied text", and only
 * under three simultaneous conditions: the learner explicitly included the
 * excerpt, the excerpt's note is attested as belonging to the caller by the
 * owning engine, and the text passes secret screening. A missing condition is a
 * refusal, not a redaction.
 *
 * ## Fail closed, and say which rule
 *
 * Every refusal is one member of `TUTOR_REQUEST_REJECTIONS` with a plain
 * learner-facing description. Nothing is silently dropped, nothing is
 * best-effort repaired, and no provider is reached by a request that failed any
 * check.
 *
 * Pure module: no I/O, no clock, no randomness, no provider, no AI.
 */

import {
  classifyTutorLabState,
  tutorLabStateUnavailable,
  type TutorLabStateContext,
  type TutorLabUnavailableReason
} from "./ai-tutor-boundaries";
import {
  normalizeTutorGroundingRefs,
  type TutorGroundingRef
} from "./ai-tutor-grounding";
import {
  resolveTutorPresentation,
  type TutorLessonIdentity,
  type TutorLessonPosition,
  type TutorPresentationPreference
} from "./ai-tutor-lesson-context";
import {
  screenTutorTextForSecrets,
  screenTutorTextsForSecrets,
  type TutorSecretScreening
} from "./ai-tutor-privacy";

export const AI_TUTOR_REQUEST_CONTRACT_VERSION = "ai-tutor-request-v1";

/** An opaque correlation token: 1-128 identifier characters, nothing else. */
export const TUTOR_CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * The task family this contract serves.
 *
 * A closed subset of the `AIGW-001` section 4 task list: the Tutor/Coach
 * family, plus the two explanation tasks a lesson workspace actually needs.
 * Curriculum drafting, founder operations and note organization are other
 * features' tasks and are deliberately not nameable here.
 */
export const AI_TUTOR_TASK_TYPES = [
  "explain_concept",
  "explain_step",
  "explain_practice_prompt",
  "explain_lab_failure",
  "general_question"
] as const;

export type TutorTaskType = (typeof AI_TUTOR_TASK_TYPES)[number];

export function isTutorTaskType(value: unknown): value is TutorTaskType {
  return (
    typeof value === "string" &&
    (AI_TUTOR_TASK_TYPES as readonly string[]).includes(value)
  );
}

/**
 * `AIGW-003` privacy classes, narrowed to the two a Tutor request can be.
 *
 * `learner_private_content` applies the moment a learner-selected note excerpt
 * is included, and is derived rather than declared: a client cannot downgrade
 * the classification of its own request.
 */
export const AI_TUTOR_PRIVACY_CLASSES = [
  "lesson_context",
  "learner_private_content"
] as const;

export type TutorPrivacyClass = (typeof AI_TUTOR_PRIVACY_CLASSES)[number];

/** The only engine authorized to originate a Tutor request. */
export const AI_TUTOR_CALLING_ENGINE = "learning" as const;

export const TUTOR_QUESTION_MAX_LENGTH = 1_000;
export const TUTOR_NOTE_EXCERPT_MAX_LENGTH = 1_200;
export const TUTOR_MAX_NOTE_EXCERPTS = 3;

/* ------------------------------------------------------------------ *
 * Note excerpts
 * ------------------------------------------------------------------ */

/**
 * A learner-selected excerpt from the learner's OWN note.
 *
 * `includedByLearnerAction` is a literal `true`: an excerpt the learner did not
 * explicitly include cannot be constructed, so "the Tutor quietly read my
 * notes" is not a representable state.
 */
export interface TutorNoteExcerptSelection {
  noteId: string;
  excerpt: string;
  includedByLearnerAction: true;
}

/**
 * The owning engine's answer to "does this note belong to the caller?".
 *
 * A three-state union, never a boolean. `unavailable` must not collapse into
 * either answer: a note-ownership read that failed is not permission, and it is
 * not proof of someone else's note either. Only `owned` admits an excerpt.
 */
export type TutorNoteOwnership = "owned" | "not_owned" | "unavailable";

export interface TutorNoteOwnershipDecision {
  noteId: string;
  ownership: TutorNoteOwnership;
}

/**
 * The single inclusion gate for learner-private content.
 *
 * Returns true for exactly one outcome, so a future ownership state defaults to
 * excluded rather than included.
 */
export function mayIncludeInTutorContext(
  decision: TutorNoteOwnershipDecision | undefined
): boolean {
  return decision?.ownership === "owned";
}

/** An excerpt that passed every check, as it appears in the request. */
export interface TutorNoteExcerpt {
  noteId: string;
  excerpt: string;
  includedByLearnerAction: true;
}

/* ------------------------------------------------------------------ *
 * The contracts
 * ------------------------------------------------------------------ */

/**
 * What the lesson workspace may send.
 *
 * Note the absences, each of which is load-bearing: no learner identity, no
 * lesson text, no lab state, no provider or model selection, no privacy-class
 * declaration, no support level and no disclosure claim.
 */
export interface TutorRequestInput {
  contractVersion: string;
  taskType: unknown;
  question: unknown;
  lesson: {
    courseStableId: unknown;
    moduleStableId?: unknown;
    missionStableId: unknown;
    missionVersion: unknown;
  };
  position?: TutorLessonPosition;
  /** References to approved content, never the content itself. */
  groundingRefs?: readonly unknown[];
  noteExcerpts?: readonly unknown[];
  correlationId: unknown;
  /** A preference request; unapproved values fall back to the default. */
  presentation?: unknown;
}

/**
 * The normalized, versioned Tutor request.
 *
 * Every field is either validated client input or server-resolved state. There
 * is no `extra`, no `metadata` and no `Record<string, unknown>`: an untyped
 * escape hatch would become the route by which an unreviewed field reaches a
 * provider.
 */
export interface TutorRequest {
  contractVersion: string;
  requestId: string;
  correlationId: string;
  callingEngine: typeof AI_TUTOR_CALLING_ENGINE;
  taskType: TutorTaskType;
  privacyClass: TutorPrivacyClass;
  question: string;
  lesson: TutorLessonIdentity;
  position: TutorLessonPosition;
  groundingRefs: readonly TutorGroundingRef[];
  noteExcerpts: readonly TutorNoteExcerpt[];
  labState: TutorLabStateContext;
  presentation: TutorPresentationPreference;
  issuedAt: string;
}

/**
 * Input fields a client may never send.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 * Assembly refuses an input carrying any of these rather than ignoring it —
 * ignoring a field that was sent leaves the caller believing it took effect.
 */
export const AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS: readonly string[] = [
  "userId",
  "user_id",
  "ownerId",
  "studentId",
  "learnerId",
  "email",
  "accessToken",
  "authorization",
  "apiKey",
  "providerApiKey",
  "provider",
  "providerId",
  "model",
  "modelId",
  "privacyClass",
  "labState",
  "labValidationResult",
  "labPassed",
  "labCorrect",
  "masteryGranted",
  "competencyAwarded",
  "score",
  "disclosureState",
  "supportLevel",
  "supportLevelOverride",
  "instructionalModeOverride",
  "systemPrompt",
  "lessonText",
  "transcript",
  "groundingSegments",
  "callingEngine"
];

/* ------------------------------------------------------------------ *
 * Rejections
 * ------------------------------------------------------------------ */

/**
 * Every way a Tutor request can be refused.
 *
 * One closed vocabulary shared by the request contract, the privacy screen and
 * the service, so a refusal reason cannot be invented at a call site and cannot
 * drift between two lists.
 */
export const TUTOR_REQUEST_REJECTIONS = [
  "contract_version_unsupported",
  "task_type_unsupported",
  "question_missing",
  "question_too_long",
  "lesson_identity_missing",
  "lesson_version_invalid",
  "correlation_id_missing",
  "correlation_id_invalid",
  "request_id_missing",
  "forbidden_input_field",
  "context_type_unsupported",
  "note_excerpt_limit_exceeded",
  "note_excerpt_missing_learner_action",
  "note_excerpt_too_long",
  "cross_learner_reference",
  "note_ownership_unavailable",
  "secret_detected"
] as const;

export type TutorRequestRejection = (typeof TUTOR_REQUEST_REJECTIONS)[number];

export interface TutorRequestRefusal {
  rejection: TutorRequestRejection;
  /** Plain-language, learner-safe. Never echoes a secret or another learner. */
  learnerMessage: string;
  /** Kinds of credential recognised, when the refusal was a secret screen. */
  secretLabels?: readonly string[];
}

export type TutorRequestAssembly =
  | { ok: true; request: TutorRequest }
  | { ok: false; refusal: TutorRequestRefusal };

/**
 * The learner-facing sentence for each refusal.
 *
 * Deliberately uniform about other learners: a cross-learner reference and an
 * unavailable ownership read both say the excerpt could not be used, and
 * neither confirms that another learner's note exists. Revealing WHICH refusal
 * happened would itself disclose something about another learner's data.
 */
export function describeTutorRequestRejection(
  rejection: TutorRequestRejection
): string {
  switch (rejection) {
    case "contract_version_unsupported":
      return "This version of the lesson workspace cannot ask the Tutor. Reload the lesson and try again.";
    case "task_type_unsupported":
      return "That kind of request is not something the Tutor handles.";
    case "question_missing":
      return "Type a question for the Tutor.";
    case "question_too_long":
      return `Shorten your question to ${TUTOR_QUESTION_MAX_LENGTH} characters or fewer.`;
    case "lesson_identity_missing":
    case "lesson_version_invalid":
      return "The Tutor could not tell which lesson you are in. Reload the lesson and try again.";
    case "correlation_id_missing":
    case "correlation_id_invalid":
    case "request_id_missing":
    case "forbidden_input_field":
      return "The Tutor could not accept that request. Nothing was sent and nothing changed.";
    case "context_type_unsupported":
      return "The Tutor cannot use that kind of lesson content.";
    case "note_excerpt_limit_exceeded":
      return `Include at most ${TUTOR_MAX_NOTE_EXCERPTS} note excerpts.`;
    case "note_excerpt_missing_learner_action":
      return "A note excerpt can only be included when you choose to include it.";
    case "note_excerpt_too_long":
      return `Shorten the selected note text to ${TUTOR_NOTE_EXCERPT_MAX_LENGTH} characters or fewer.`;
    case "cross_learner_reference":
    case "note_ownership_unavailable":
      return "That note excerpt could not be used, so nothing was sent. You can ask your question without it.";
    default:
      return "Your question was not sent, because it looks like it contains a credential.";
  }
}

function refuse(rejection: TutorRequestRejection): TutorRequestAssembly {
  return {
    ok: false,
    refusal: {
      rejection,
      learnerMessage: describeTutorRequestRejection(rejection)
    }
  };
}

function refuseSecret(screening: TutorSecretScreening): TutorRequestAssembly {
  return {
    ok: false,
    refusal: {
      rejection: "secret_detected",
      learnerMessage: describeTutorRequestRejection("secret_detected"),
      secretLabels: screening.labels
    }
  };
}

/**
 * Whether an input object carries a prohibited field at any depth.
 *
 * Recursive, because a forbidden field nested under `position` or `lesson` is
 * the same assertion as one at the top level.
 */
export function containsForbiddenTutorInputField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsForbiddenTutorInputField(entry));
  }

  if (!value || typeof value !== "object") return false;

  const forbidden = new Set(
    AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS.map((field) => field.toLowerCase())
  );

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key.toLowerCase())) return true;
    if (containsForbiddenTutorInputField(nested)) return true;
  }

  return false;
}

/**
 * Server-resolved state the client cannot influence.
 *
 * `labStateClaim` is typed `unknown` on purpose: it is whatever the Lab Engine
 * handed over, it is classified rather than trusted, and the type makes it
 * impossible to pass it through unchecked.
 */
export interface TutorRequestAssemblyContext {
  requestId: string;
  issuedAt: string;
  /** Ownership decisions from the Knowledge and Notes Engine. */
  noteOwnership: readonly TutorNoteOwnershipDecision[];
  /** A deterministic lab attestation, or nothing. Never a client claim. */
  labStateClaim?: unknown;
  /** Reason to report when no attestation exists. Defaults conservatively. */
  labUnavailableReason?: TutorLabUnavailableReason;
}

/**
 * Assembles a normalized request, or refuses.
 *
 * The order of the checks is the policy, and it is deliberate:
 *
 *   1. Shape and version, so an unknown contract never reaches further logic.
 *   2. The forbidden-field refusal, BEFORE any field is read, so a hostile
 *      input cannot have a side effect on the way to being rejected.
 *   3. Identity and question validity.
 *   4. Context kinds, so an unapproved kind never reaches a grounding source.
 *   5. Note excerpts: learner action, ownership, length.
 *   6. Secret screening LAST among content checks and before anything is
 *      assembled, over the question and every included excerpt together.
 *
 * Nothing in this function reaches a provider, a database or a clock.
 */
export function assembleTutorRequest(
  input: TutorRequestInput,
  context: TutorRequestAssemblyContext
): TutorRequestAssembly {
  if (!input || typeof input !== "object") {
    return refuse("contract_version_unsupported");
  }

  if (input.contractVersion !== AI_TUTOR_REQUEST_CONTRACT_VERSION) {
    return refuse("contract_version_unsupported");
  }

  if (containsForbiddenTutorInputField(input)) {
    return refuse("forbidden_input_field");
  }

  const requestId = String(context.requestId ?? "").trim();
  if (!requestId) return refuse("request_id_missing");

  const correlationId = String(input.correlationId ?? "").trim();
  if (!correlationId) return refuse("correlation_id_missing");
  // Client-supplied and written to routine logs as a top-level field, so it
  // must be an opaque bounded token that cannot carry prose or a credential.
  if (
    !TUTOR_CORRELATION_ID_PATTERN.test(correlationId) ||
    screenTutorTextForSecrets(correlationId).detected
  ) {
    return refuse("correlation_id_invalid");
  }

  if (!isTutorTaskType(input.taskType)) return refuse("task_type_unsupported");

  const question = String(input.question ?? "").replace(/\s+/g, " ").trim();
  if (!question) return refuse("question_missing");
  if (question.length > TUTOR_QUESTION_MAX_LENGTH) {
    return refuse("question_too_long");
  }

  const lesson = input.lesson ?? ({} as TutorRequestInput["lesson"]);
  const courseStableId = String(lesson.courseStableId ?? "").trim();
  const missionStableId = String(lesson.missionStableId ?? "").trim();
  if (!courseStableId || !missionStableId) {
    return refuse("lesson_identity_missing");
  }

  const missionVersion = Number(lesson.missionVersion);
  if (!Number.isInteger(missionVersion) || missionVersion < 1) {
    return refuse("lesson_version_invalid");
  }

  const groundingRefs = normalizeTutorGroundingRefs(input.groundingRefs ?? []);
  if (groundingRefs === null) return refuse("context_type_unsupported");

  const excerptCandidates = input.noteExcerpts ?? [];
  if (excerptCandidates.length > TUTOR_MAX_NOTE_EXCERPTS) {
    return refuse("note_excerpt_limit_exceeded");
  }

  const ownershipByNote = new Map<string, TutorNoteOwnershipDecision>();
  for (const decision of context.noteOwnership) {
    ownershipByNote.set(decision.noteId, decision);
  }

  const noteExcerpts: TutorNoteExcerpt[] = [];

  for (const candidate of excerptCandidates) {
    if (!candidate || typeof candidate !== "object") {
      return refuse("note_excerpt_missing_learner_action");
    }

    const selection = candidate as Record<string, unknown>;

    if (selection.includedByLearnerAction !== true) {
      return refuse("note_excerpt_missing_learner_action");
    }

    const noteId = String(selection.noteId ?? "").trim();
    if (!noteId) return refuse("note_excerpt_missing_learner_action");

    const excerpt = String(selection.excerpt ?? "").replace(/\s+/g, " ").trim();
    if (!excerpt) return refuse("note_excerpt_missing_learner_action");
    if (excerpt.length > TUTOR_NOTE_EXCERPT_MAX_LENGTH) {
      return refuse("note_excerpt_too_long");
    }

    const decision = ownershipByNote.get(noteId);

    // An absent decision is treated exactly like an unavailable one. A caller
    // that forgot to resolve ownership must not thereby bypass it.
    if (!decision || decision.ownership === "unavailable") {
      return refuse("note_ownership_unavailable");
    }

    if (!mayIncludeInTutorContext(decision)) {
      return refuse("cross_learner_reference");
    }

    noteExcerpts.push({
      noteId,
      excerpt,
      includedByLearnerAction: true
    });
  }

  const screening = screenTutorTextsForSecrets([
    question,
    ...noteExcerpts.map((entry) => entry.excerpt)
  ]);
  if (screening.detected) return refuseSecret(screening);

  // The lab state is classified, never accepted. A caller with no attestation
  // gets an explicit unavailable reason rather than a missing field.
  const labState: TutorLabStateContext =
    context.labStateClaim === undefined
      ? tutorLabStateUnavailable(context.labUnavailableReason ?? "unknown")
      : classifyTutorLabState(context.labStateClaim);

  return {
    ok: true,
    request: {
      contractVersion: AI_TUTOR_REQUEST_CONTRACT_VERSION,
      requestId,
      correlationId,
      callingEngine: AI_TUTOR_CALLING_ENGINE,
      taskType: input.taskType,
      // Derived, never declared. Including private content raises the class.
      privacyClass:
        noteExcerpts.length > 0 ? "learner_private_content" : "lesson_context",
      question,
      lesson: {
        courseStableId,
        ...(lesson.moduleStableId
          ? { moduleStableId: String(lesson.moduleStableId).trim() }
          : {}),
        missionStableId,
        missionVersion
      },
      position: {
        ...(input.position?.stepStableId
          ? { stepStableId: input.position.stepStableId }
          : {}),
        ...(input.position?.sceneId ? { sceneId: input.position.sceneId } : {}),
        ...(input.position?.stepType
          ? { stepType: input.position.stepType }
          : {})
      },
      groundingRefs,
      noteExcerpts,
      labState,
      presentation: resolveTutorPresentation(input.presentation),
      issuedAt: String(context.issuedAt ?? "")
    }
  };
}

/**
 * Screens one question before a request is even built.
 *
 * Exposed so a surface can warn as the learner types, without having to
 * assemble a request first. It is a convenience, never the boundary: assembly
 * screens again regardless of whether this was called.
 */
export function screenTutorQuestion(question: unknown): TutorSecretScreening {
  return screenTutorTextForSecrets(question);
}
