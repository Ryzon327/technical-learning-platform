/**
 * AI Tutor foundation — lesson-context integration, accessibility and pedagogy.
 *
 * The leaf module of the Tutor foundation. It owns the vocabulary that
 * describes WHERE the Tutor lives, WHAT lesson position it is talking about,
 * HOW an answer may be presented, and the rendering contract a learner-facing
 * surface must satisfy.
 *
 * ## What this owns
 *
 * Lesson identity and position by stable id, the lesson-workspace session
 * contract, the approved presentation preference vocabulary, the pedagogy
 * prohibitions, and the accessible rendering contract.
 *
 * ## What this does NOT own
 *
 * It does not own curriculum truth, the step vocabulary (`CURR-010` owns
 * `MISSION_STEP_TYPES`), the interaction contract or support-level projection
 * (`CURR-011` owns those), progress, competency or evidence.
 *
 * It renders nothing. There is no component here, no markup, no styling and no
 * DOM. The accepted Lovable lesson workspace remains the canonical
 * learner-facing presentation surface, and this module deliberately describes a
 * CONTRACT that surface can satisfy rather than recreating it.
 *
 * ## Accessibility is not AI
 *
 * `AIGW-011` section 14 and DEC-059 require that accessibility and narration
 * are a separate capability, a separate authority path and separate code from
 * tutoring, and that accessibility functions with the AI Gateway unavailable.
 * Nothing here is on the accessible reading path for authored content. What is
 * here is the accessibility contract for the OPTIONAL Tutor panel itself, which
 * must be usable when it is present and must be absent — never broken — when
 * the Tutor is unavailable.
 *
 * Pure module: no I/O, no clock, no randomness, no provider, no AI.
 */

export const AI_TUTOR_LESSON_CONTEXT_MODEL_VERSION =
  "ai-tutor-lesson-context-v1";

/* ------------------------------------------------------------------ *
 * Lesson identity and position
 * ------------------------------------------------------------------ */

/**
 * Where a Tutor question was asked, by STABLE identity and version only.
 *
 * Internal database identifiers are deliberately absent, as is every learner
 * identity field: `AI_TUTOR_LESSON_FORBIDDEN_FIELDS` records that prohibition
 * as data so a test can assert it rather than restate it.
 *
 * `missionVersion` is required because a mission is only meaningful at a
 * version — an answer grounded in version 3 must never be attributed to
 * version 4.
 */
export interface TutorLessonIdentity {
  courseStableId: string;
  moduleStableId?: string;
  missionStableId: string;
  missionVersion: number;
}

/**
 * The learner's current position inside the open lesson.
 *
 * Every field is optional because the Tutor must remain askable from a lesson
 * that has not reached a step yet. `stepStableId` is the mission-scoped step id
 * `CURR-010` already defines for "AI context addressing"; `sceneId` is the
 * presentation-local scene the workspace is showing.
 *
 * `stepType` is carried as a plain string rather than importing
 * `MissionStepType`. That is deliberate: this module must not become a second
 * copy of the closed `CURR-010` vocabulary, and an unapproved value is rejected
 * by the grounding context-kind check rather than by a duplicated union here.
 */
export interface TutorLessonPosition {
  stepStableId?: string;
  sceneId?: string;
  stepType?: string;
}

/**
 * Fields lesson identity and position must never carry.
 *
 * Held as data so tests and the verifier assert the prohibition directly.
 */
export const AI_TUTOR_LESSON_FORBIDDEN_FIELDS: readonly string[] = [
  "id",
  "userId",
  "user_id",
  "ownerId",
  "studentId",
  "learnerId",
  "email",
  "displayName",
  "internalId",
  "uuid",
  "accessToken",
  "supportLevelOverride",
  "disclosureState"
];

/* ------------------------------------------------------------------ *
 * Presentation preference — accessibility and pedagogy
 * ------------------------------------------------------------------ */

/**
 * How much explanation the learner asked for.
 *
 * `concise` is the DEFAULT, so a Tutor answer is short unless the learner asks
 * for more. `deeper` exists so "explain that further" is a learner-initiated
 * action rather than a longer default nobody requested.
 */
export const TUTOR_EXPLANATION_DEPTHS = [
  "concise",
  "standard",
  "deeper"
] as const;

export type TutorExplanationDepth = (typeof TUTOR_EXPLANATION_DEPTHS)[number];

export function isTutorExplanationDepth(
  value: unknown
): value is TutorExplanationDepth {
  return (
    typeof value === "string" &&
    (TUTOR_EXPLANATION_DEPTHS as readonly string[]).includes(value)
  );
}

/**
 * The language register an explanation is requested in.
 *
 * Two approved values, not a free-text reading level. A numeric grade level or
 * an open string would be an unbounded pedagogical input, and curriculum
 * doctrine is not this module's to author: `docs/Learning-OS/Learning-OS.md`
 * §30.2 reserves pedagogy and reading-level policy to the Founder/architect.
 * Widening this vocabulary is therefore a specification change, not an
 * implementation choice.
 */
export const TUTOR_LANGUAGE_REGISTERS = ["default", "plain_language"] as const;

export type TutorLanguageRegister = (typeof TUTOR_LANGUAGE_REGISTERS)[number];

export function isTutorLanguageRegister(
  value: unknown
): value is TutorLanguageRegister {
  return (
    typeof value === "string" &&
    (TUTOR_LANGUAGE_REGISTERS as readonly string[]).includes(value)
  );
}

export interface TutorPresentationPreference {
  explanationDepth: TutorExplanationDepth;
  languageRegister: TutorLanguageRegister;
}

/** Concise, default register. The answer a learner gets without asking. */
export const TUTOR_DEFAULT_PRESENTATION: TutorPresentationPreference = {
  explanationDepth: "concise",
  languageRegister: "default"
};

/**
 * Narrows an approved preference, falling back to the concise default.
 *
 * Fail-closed in the pedagogical direction: an unrecognised value yields the
 * conservative default rather than the most expansive option.
 */
export function resolveTutorPresentation(
  value: unknown
): TutorPresentationPreference {
  const candidate = (value ?? {}) as Partial<TutorPresentationPreference>;

  return {
    explanationDepth: isTutorExplanationDepth(candidate.explanationDepth)
      ? candidate.explanationDepth
      : TUTOR_DEFAULT_PRESENTATION.explanationDepth,
    languageRegister: isTutorLanguageRegister(candidate.languageRegister)
      ? candidate.languageRegister
      : TUTOR_DEFAULT_PRESENTATION.languageRegister
  };
}

/**
 * Mechanics the Tutor must never introduce.
 *
 * Held as data so the prohibition is testable. The Tutor exists to help a
 * learner understand; a streak, a countdown or a leaderboard converts help into
 * pressure, and none of them are approved learning mechanics in this platform.
 */
export const TUTOR_FORBIDDEN_PEDAGOGY_MECHANICS: readonly string[] = [
  "streak",
  "streakCount",
  "timer",
  "timeRemaining",
  "countdown",
  "deadline",
  "leaderboard",
  "rank",
  "ranking",
  "points",
  "xp",
  "badge",
  "urgency",
  "pressure"
];

/* ------------------------------------------------------------------ *
 * The lesson-workspace session contract
 * ------------------------------------------------------------------ */

/**
 * The only approved placement.
 *
 * A single literal rather than a union, so "the Tutor is a separate page the
 * learner navigates away to" is not expressible. The accepted interaction is
 * that the Tutor opens INSIDE the lesson workspace and the learner can ask
 * without leaving.
 */
export const TUTOR_PANEL_PLACEMENT = "in_lesson_workspace" as const;

export type TutorPanelPlacement = typeof TUTOR_PANEL_PLACEMENT;

/**
 * One Tutor session, as the lesson workspace sees it.
 *
 * `learnerStatePreserved` and `navigationRequired` are LITERAL types, not
 * booleans. A session that discards lesson state, or that requires navigating
 * away, cannot be constructed — the compiler rejects it before any test runs.
 */
export interface TutorLessonSession {
  modelVersion: string;
  placement: TutorPanelPlacement;
  lesson: TutorLessonIdentity;
  position: TutorLessonPosition;
  /** Opening, using or closing the Tutor never disturbs lesson state. */
  learnerStatePreserved: true;
  /** The learner never leaves the lesson to ask a question. */
  navigationRequired: false;
  /** Whether the workspace supplied the current lesson position itself. */
  contextSuppliedAutomatically: boolean;
  presentation: TutorPresentationPreference;
}

export function buildTutorLessonSession(input: {
  lesson: TutorLessonIdentity;
  position?: TutorLessonPosition;
  contextSuppliedAutomatically: boolean;
  presentation?: unknown;
}): TutorLessonSession {
  return {
    modelVersion: AI_TUTOR_LESSON_CONTEXT_MODEL_VERSION,
    placement: TUTOR_PANEL_PLACEMENT,
    lesson: {
      courseStableId: input.lesson.courseStableId,
      ...(input.lesson.moduleStableId
        ? { moduleStableId: input.lesson.moduleStableId }
        : {}),
      missionStableId: input.lesson.missionStableId,
      missionVersion: input.lesson.missionVersion
    },
    position: { ...(input.position ?? {}) },
    learnerStatePreserved: true,
    navigationRequired: false,
    contextSuppliedAutomatically: input.contextSuppliedAutomatically,
    presentation: resolveTutorPresentation(input.presentation)
  };
}

/**
 * The Tutor is optional, and its absence is a normal state.
 *
 * Recorded as data because it is an invariant other engines depend on: a lesson
 * must remain completable, readable and accessible with the Tutor switched off.
 */
export const TUTOR_OPTIONALITY_CONTRACT: readonly string[] = [
  "The Tutor is optional; no lesson, step, practice or lab requires it.",
  "A lesson remains readable and completable with the Tutor unavailable.",
  "Accessibility and narration of authored content never depend on the Tutor.",
  "Closing the Tutor never changes lesson, practice or lab state.",
  "An unavailable Tutor is reported as unavailable, never as an answer."
];

/* ------------------------------------------------------------------ *
 * Accessible rendering contract
 * ------------------------------------------------------------------ */

/**
 * The structural roles a Tutor answer may be rendered as.
 *
 * A closed vocabulary of SEMANTIC roles rather than visual ones. The surface
 * chooses the element; the contract guarantees the structure exists, so a
 * screen-reader user receives headings and lists rather than one undivided
 * paragraph.
 */
export const TUTOR_RENDERING_ROLES = [
  "heading",
  "paragraph",
  "list",
  "code",
  "reference",
  "status"
] as const;

export type TutorRenderingRole = (typeof TUTOR_RENDERING_ROLES)[number];

export interface TutorRenderingBlock {
  role: TutorRenderingRole;
  /** Inert text. No markup, no HTML, no executable payload. */
  text: string;
}

/**
 * The accessible rendering contract for one Tutor answer.
 *
 * `keyboardReachable` and `colorIsNotTheOnlySignal` are LITERAL `true`, so a
 * contract that admits a mouse-only or colour-only presentation cannot be
 * constructed.
 */
export interface TutorRenderingContract {
  modelVersion: string;
  blocks: readonly TutorRenderingBlock[];
  /** Every Tutor control is reachable and operable from the keyboard. */
  keyboardReachable: true;
  /** No state is conveyed by colour alone. */
  colorIsNotTheOnlySignal: true;
  /** A single, complete sentence a screen reader can announce on arrival. */
  screenReaderAnnouncement: string;
}

/**
 * Rules the learner-facing Tutor surface must satisfy.
 *
 * Held as data so review and tests can read them. This module cannot enforce
 * rendered behaviour — a rendered surface is inspected by a human, never by a
 * type — so it states the requirement rather than claiming compliance.
 */
export const TUTOR_RENDERING_RULES: readonly string[] = [
  "Every Tutor control is reachable and operable from the keyboard alone.",
  "Opening the Tutor moves focus into it; closing it returns focus to origin.",
  "Answer text is inert; no Tutor output is interpreted as markup.",
  "Loading, answered, unavailable and blocked states are announced as text.",
  "No state is conveyed by colour alone.",
  "An unavailable answer is announced as unavailable, never left silent.",
  "No streak, timer, countdown, score or ranking appears in the Tutor."
];

/**
 * Builds the rendering contract for one answer.
 *
 * Takes primitives rather than a response object, so this module stays a leaf
 * and the response contract composes it in one direction only.
 *
 * Blocks are assembled by explicit assignment, and an empty field contributes
 * no block at all — a heading with nothing under it is worse for a screen
 * reader than its absence.
 */
export function buildTutorRendering(input: {
  answer: string;
  explanation?: string;
  stepGuidance?: readonly string[];
  references?: readonly string[];
  statusStatement?: string;
}): TutorRenderingContract {
  const blocks: TutorRenderingBlock[] = [];

  if (input.statusStatement && input.statusStatement.trim()) {
    blocks.push({ role: "status", text: input.statusStatement.trim() });
  }

  if (input.answer.trim()) {
    blocks.push({ role: "paragraph", text: input.answer.trim() });
  }

  if (input.explanation && input.explanation.trim()) {
    blocks.push({ role: "heading", text: "Explanation" });
    blocks.push({ role: "paragraph", text: input.explanation.trim() });
  }

  const guidance = (input.stepGuidance ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (guidance.length > 0) {
    blocks.push({ role: "heading", text: "What to try next" });
    for (const entry of guidance) {
      blocks.push({ role: "list", text: entry });
    }
  }

  const references = (input.references ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (references.length > 0) {
    blocks.push({ role: "heading", text: "From this lesson" });
    for (const entry of references) {
      blocks.push({ role: "reference", text: entry });
    }
  }

  return {
    modelVersion: AI_TUTOR_LESSON_CONTEXT_MODEL_VERSION,
    blocks,
    keyboardReachable: true,
    colorIsNotTheOnlySignal: true,
    screenReaderAnnouncement:
      input.statusStatement && input.statusStatement.trim()
        ? input.statusStatement.trim()
        : `Tutor answer. ${input.answer.trim()}`
  };
}
