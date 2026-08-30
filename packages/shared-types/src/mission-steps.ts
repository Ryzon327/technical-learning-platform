/**
 * CURR-010 / DEC-054 — ordered instructional content beneath a Mission.
 *
 * ## What a mission step is
 *
 * The unit of "teach a little, then apply it". A Mission is composed of an
 * authored sequence of steps, each with a declared type that determines how it
 * renders, what accessibility alternative it requires, and what a future AI
 * Instructor may receive.
 *
 * ## What a mission step is NOT
 *
 * Not a curriculum node, not a prerequisite node, not a competency, not a
 * competency award, not a mission, not a lesson entity, not a lab session, not
 * an evidence claim, and not an independent navigation destination.
 *
 * The consequences are structural, not merely documented:
 *
 *   - there is no publication state here — a step is readable when its owning
 *     Mission is published, and by no other rule;
 *   - there is no version here — a step belongs to a Mission at a version;
 *   - there is no competency field, no evidence field and no progress field, so
 *     no step can contribute to a competency claim;
 *   - there is no `required` flag, so a step cannot become a prerequisite.
 *
 * Mission remains the authoritative unit for learner progress, resume and
 * navigation, prerequisite evaluation, competency relationship, lab association
 * and completion. Steps sit BELOW the progress grain.
 *
 * ## Why this is a discriminated union rather than `{ type, payload }`
 *
 * `payload: Record<string, unknown>` would make every invalid type/payload
 * combination representable, push all meaning into runtime checks, and become
 * the undocumented escape hatch DEC-054 closes. Discriminating on `type` means
 * the compiler rejects a diagram without a text alternative, or a practice step
 * carrying question text, before any validator runs.
 *
 * ## The security boundary is inertness, never pattern matching
 *
 * Authored content is inert data. No field requests or causes markup
 * interpretation, there is no raw-HTML rendering mode, and executable payloads
 * are prohibited.
 *
 * **Code-looking text is valid instructional content.** The platform has to be
 * able to teach HTML, JavaScript, shell syntax, configuration syntax and
 * security examples. A validator that rejected `<script>` in prose would make
 * the platform unable to teach its own subject matter, so no validator here
 * pattern-matches against markup-like or script-like strings. Safety comes from
 * the model carrying no executable position and from the renderer escaping what
 * it is given.
 */

/* ------------------------------------------------------------------ *
 * The closed vocabulary
 * ------------------------------------------------------------------ */

/**
 * Exactly seven types (DEC-054). The set is closed.
 *
 * Deliberately absent, each for a recorded reason:
 *
 *   example      is `concept` content; a separate type would change no
 *                rendering, accessibility, validation or projection behaviour
 *   output       is half of `command`; they are one instructional unit
 *   checkpoint   is a Learning Engine trigger (LEARN-008), not curriculum
 *                content, and representing it here would put a Learning Engine
 *                concept inside a Curriculum Engine structure
 *   text, lesson, quiz, simulation, video, lab, exercise, explanation
 *                are aliases of the above or of an approved payload
 */
export const MISSION_STEP_TYPES = [
  "concept",
  "diagram",
  "command",
  "prediction",
  "interaction",
  "practice",
  "reference"
] as const;

export type MissionStepType = (typeof MISSION_STEP_TYPES)[number];

export function isMissionStepType(value: unknown): value is MissionStepType {
  return (
    typeof value === "string" &&
    (MISSION_STEP_TYPES as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ *
 * Identity and ordering
 * ------------------------------------------------------------------ */

/**
 * The same stable-id grammar the curriculum nodes use, so an author writes one
 * kind of identifier everywhere. `curriculum-admin.ts` enforces the identical
 * pattern for paths, courses, modules, missions and competencies.
 *
 * A step id is **mission-scoped**, not global: it is referenceable for
 * deep-linking, AI context addressing, review reporting and content migration,
 * and it must never appear in publication events, version lineage, prerequisite
 * rules or learner progress.
 */
export const MISSION_STEP_STABLE_ID = /^[a-z0-9][a-z0-9._-]{2,119}$/;

/** Ceiling on one authored step's prose. See `MissionStepConceptContent`. */
export const MISSION_STEP_TEXT_LIMIT = 20_000;

/* ------------------------------------------------------------------ *
 * Per-type content
 * ------------------------------------------------------------------ */

/**
 * `concept` — one idea, stated plainly. The unit of "teach a little".
 *
 * Paragraphs are an explicit array rather than one blob split on blank lines.
 * The existing mission brief is a blob, and the learner surface has to
 * reconstruct its structure by parsing — a convention, not a contract. Authored
 * structure removes the parser and with it the class of defect where a
 * formatting accident silently changes what renders.
 *
 * Plain text only. There is no markup field and no way to request one.
 */
export interface MissionStepConceptContent {
  readonly type: "concept";
  readonly title?: string;
  readonly paragraphs: readonly string[];
}

/**
 * `diagram` — a picture that carries instructional meaning.
 *
 * `assetStableId` is a **seam**, deliberately not resolved here. WP-D owns
 * curriculum asset completion; inventing a second asset system in WP-C is
 * exactly what that boundary exists to prevent. This records which asset the
 * step means, and WP-D makes the reference resolvable.
 *
 * `textAlternative` is REQUIRED by the type, so a diagram without one cannot be
 * constructed. CURR-010 section 11 makes it publication-blocking, and it must
 * describe **what the diagram teaches**, not what it looks like. It is authored
 * and must never depend on AI: accessibility has to work with the AI Gateway
 * switched off, which it currently is.
 */
export interface MissionStepDiagramContent {
  readonly type: "diagram";
  readonly assetStableId: string;
  readonly caption?: string;
  readonly textAlternative: string;
}

/**
 * `command` — authentic device or shell interaction.
 *
 * What is typed and what comes back are ONE instructional unit, not two steps:
 * splitting them across rows means two positions that must stay adjacent with
 * nothing enforcing it. Either half may be omitted, so authentic output can be
 * shown without a command.
 *
 * **This is a display artefact.** It carries no execution semantics, nothing
 * renders it executable, and no surface may offer to run it. `language` is a
 * syntax-highlighting hint and is never an interpreter selector.
 */
export interface MissionStepCommandContent {
  readonly type: "command";
  readonly command?: string;
  readonly output?: string;
  readonly language?: string;
  readonly caption?: string;
}

/**
 * `prediction` — the learner commits to an expected outcome before observing.
 *
 * Instructional interaction, **not assessment and not evidence**. There is no
 * score, no pass mark, no attempt record and no competency mapping, and a
 * learner's answer is deliberately not modelled here at all: this type
 * describes what is asked, never what was answered.
 *
 * `expectedOutcome` is a separate optional field precisely so it can be
 * withheld independently of the prompt — AIGW-011 drops it while the prediction
 * is open, which would be impossible if it were embedded in the prompt text.
 */
export interface MissionStepPredictionContent {
  readonly type: "prediction";
  readonly prompt: string;
  readonly options?: readonly string[];
  readonly expectedOutcome?: string;
}

/**
 * `interaction` — manipulate a system and observe the consequence.
 *
 * **The minimum seam, and deliberately no more.** CURR-011 and WP-H own the
 * shared interaction contract, its parameter schemas, the registry and the
 * `ObservationModel`. This records only WHICH interaction a step means and the
 * accessible equivalent that interaction owes the learner.
 *
 * There is intentionally **no `parameters` field in WP-C**. Adding an untyped
 * one would create exactly the arbitrary-JSON escape hatch DEC-054 closes, and
 * a guessed shape would be rework the moment WP-H defines the real one. Adding
 * a typed field later is additive; removing a wrong one is not.
 *
 * `textEquivalent` is REQUIRED by the type. CURR-011 section 14 goes further —
 * an accessible path must preserve the learner's ability to perform the task,
 * not merely read a description of it — and building that path is WP-H's work.
 * What WP-C guarantees is that the authored information it needs cannot be
 * omitted.
 */
export interface MissionStepInteractionContent {
  readonly type: "interaction";
  readonly interactionStableId: string;
  readonly textEquivalent: string;
  readonly caption?: string;
}

/**
 * `practice` — place an existing assessment where it becomes fair to ask.
 *
 * A **reference only**. The step names an assessment by its existing stable id
 * and carries no question text, no options, no answer key and no scoring.
 * Duplicating any of that here would create a second copy of assessment truth
 * and would route around `assessment_questions`, which deliberately has no
 * authenticated SELECT policy.
 *
 * Practice remains non-evidence. Whether an assessment produces evidence is
 * decided by its own `purpose` and competency mappings; placing it in a step
 * confers nothing.
 */
export interface MissionStepPracticeContent {
  readonly type: "practice";
  readonly assessmentStableId: string;
  readonly framing?: string;
}

/**
 * `reference` — concise optional material the learner may open when needed.
 *
 * **Optional enrichment, structurally.** There is no `required` field on any
 * step, so a reference has no mechanism by which to become a prerequisite, and
 * prerequisites remain owned solely by `learning_prerequisite_rules`.
 *
 * BEGINNER-COMPLETE-1 depends on this staying true: required prerequisite
 * instruction belongs in the instructional path, not hidden behind an optional
 * link. If a learner must read it to proceed, it is a `concept`.
 *
 * Exactly one target: an internal asset seam, or an external absolute http(s)
 * link. Never both, never neither.
 */
export interface MissionStepReferenceContent {
  readonly type: "reference";
  readonly label: string;
  readonly assetStableId?: string;
  readonly uri?: string;
  readonly note?: string;
}

/** The discriminated union. `type` determines the whole shape. */
export type MissionStepContent =
  | MissionStepConceptContent
  | MissionStepDiagramContent
  | MissionStepCommandContent
  | MissionStepPredictionContent
  | MissionStepInteractionContent
  | MissionStepPracticeContent
  | MissionStepReferenceContent;

/* ------------------------------------------------------------------ *
 * The authored step
 * ------------------------------------------------------------------ */

/**
 * One ordered instructional step within one mission.
 *
 * Note what is absent, and stays absent: publication state, version,
 * competency, evidence, progress, `required`. Each omission is the architecture,
 * not an oversight.
 */
export interface MissionStep {
  readonly stableId: string;
  readonly position: number;
  readonly content: MissionStepContent;
}

/** A step as it exists in the database, with its mission association. */
export interface PersistedMissionStep extends MissionStep {
  readonly id: string;
  readonly missionId: string;
}

/* ------------------------------------------------------------------ *
 * Validation
 *
 * Pure functions. No I/O, no clock, no randomness, no AI. Every message names
 * the offending step so an authoring failure is actionable.
 * ------------------------------------------------------------------ */

export interface MissionStepValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function isPlainText(value: unknown): value is string {
  return typeof value === "string";
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function withinLimit(value: string): boolean {
  return value.length <= MISSION_STEP_TEXT_LIMIT;
}

/**
 * An external reference target.
 *
 * Absolute http(s) only, matching the rule `curriculum-quality.ts` already
 * applies to asset URIs. Deliberately not widened: a relative or opaque scheme
 * would be a way to point a learner somewhere the platform cannot vouch for.
 */
export function isAllowedReferenceUri(value: unknown): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate one step's content against its declared type.
 *
 * Returns messages rather than throwing, so an authoring surface can report
 * every problem at once instead of one per attempt.
 */
export function validateMissionStepContent(
  content: MissionStepContent,
  label: string
): string[] {
  const errors: string[] = [];
  const at = (message: string) => errors.push(`${label}: ${message}`);

  if (!isMissionStepType((content as { type?: unknown })?.type)) {
    at(
      `unapproved step type "${String((content as { type?: unknown })?.type)}"; the vocabulary is closed at ${MISSION_STEP_TYPES.join(", ")}`
    );
    return errors;
  }

  switch (content.type) {
    case "concept": {
      if (!Array.isArray(content.paragraphs) || content.paragraphs.length === 0) {
        at("a concept step must carry at least one paragraph");
        break;
      }
      content.paragraphs.forEach((paragraph, index) => {
        if (!nonEmpty(paragraph)) {
          at(`paragraph ${index} is empty`);
        } else if (!withinLimit(paragraph)) {
          at(`paragraph ${index} exceeds ${MISSION_STEP_TEXT_LIMIT} characters`);
        }
      });
      if (content.title !== undefined && !nonEmpty(content.title)) {
        at("title is present but empty");
      }
      break;
    }

    case "diagram": {
      if (!nonEmpty(content.assetStableId)) {
        at("a diagram step must name the asset it means");
      } else if (!MISSION_STEP_STABLE_ID.test(content.assetStableId)) {
        at(`asset reference is not a valid stable id: ${content.assetStableId}`);
      }
      // Publication-blocking, per CURR-010 section 11. A diagram with no text
      // alternative is instruction a learner cannot reach.
      if (!nonEmpty(content.textAlternative)) {
        at("a diagram step requires an authored text alternative");
      } else if (!withinLimit(content.textAlternative)) {
        at(`text alternative exceeds ${MISSION_STEP_TEXT_LIMIT} characters`);
      }
      break;
    }

    case "command": {
      const hasCommand = nonEmpty(content.command);
      const hasOutput = nonEmpty(content.output);
      if (!hasCommand && !hasOutput) {
        at("a command step must carry a command, an output, or both");
      }
      for (const [field, value] of [
        ["command", content.command],
        ["output", content.output]
      ] as const) {
        if (value !== undefined) {
          if (!isPlainText(value)) at(`${field} must be text`);
          else if (!withinLimit(value)) {
            at(`${field} exceeds ${MISSION_STEP_TEXT_LIMIT} characters`);
          }
        }
      }
      if (content.language !== undefined && !nonEmpty(content.language)) {
        at("language is present but empty");
      }
      break;
    }

    case "prediction": {
      if (!nonEmpty(content.prompt)) {
        at("a prediction step must ask something");
      } else if (!withinLimit(content.prompt)) {
        at(`prompt exceeds ${MISSION_STEP_TEXT_LIMIT} characters`);
      }
      if (content.options !== undefined) {
        if (!Array.isArray(content.options) || content.options.length === 0) {
          at("options is present but carries no choice");
        } else {
          content.options.forEach((option, index) => {
            if (!nonEmpty(option)) at(`option ${index} is empty`);
          });
        }
      }
      break;
    }

    case "interaction": {
      if (!nonEmpty(content.interactionStableId)) {
        at("an interaction step must name the interaction it means");
      } else if (!MISSION_STEP_STABLE_ID.test(content.interactionStableId)) {
        at(
          `interaction reference is not a valid stable id: ${content.interactionStableId}`
        );
      }
      // Publication-blocking, per CURR-010 section 11.
      if (!nonEmpty(content.textEquivalent)) {
        at("an interaction step requires an authored text equivalent");
      } else if (!withinLimit(content.textEquivalent)) {
        at(`text equivalent exceeds ${MISSION_STEP_TEXT_LIMIT} characters`);
      }
      break;
    }

    case "practice": {
      if (!nonEmpty(content.assessmentStableId)) {
        at("a practice step must name the assessment it places");
      } else if (!MISSION_STEP_STABLE_ID.test(content.assessmentStableId)) {
        at(
          `assessment reference is not a valid stable id: ${content.assessmentStableId}`
        );
      }
      break;
    }

    case "reference": {
      if (!nonEmpty(content.label)) {
        at("a reference step must be labelled");
      }
      const hasAsset = content.assetStableId !== undefined;
      const hasUri = content.uri !== undefined;
      if (hasAsset === hasUri) {
        at(
          "a reference step must name exactly one target: an asset or an external link"
        );
        break;
      }
      if (hasAsset && !MISSION_STEP_STABLE_ID.test(String(content.assetStableId))) {
        at(`asset reference is not a valid stable id: ${content.assetStableId}`);
      }
      if (hasUri && !isAllowedReferenceUri(content.uri)) {
        at("external reference must be an absolute http or https URL");
      }
      break;
    }
  }

  return errors;
}

/**
 * Validate one step, identity and ordering included.
 */
export function validateMissionStep(step: MissionStep): string[] {
  const label = nonEmpty(step?.stableId) ? step.stableId : "<unidentified step>";
  const errors: string[] = [];

  if (!nonEmpty(step?.stableId)) {
    errors.push("a step must carry a stable id");
  } else if (!MISSION_STEP_STABLE_ID.test(step.stableId)) {
    errors.push(
      `${label}: stable id must be 3-120 lowercase characters using letters, numbers, dot, underscore or hyphen`
    );
  }

  if (!Number.isInteger(step?.position) || step.position < 0) {
    errors.push(`${label}: position must be a non-negative integer`);
  }

  if (step?.content === undefined || step.content === null) {
    errors.push(`${label}: a step must carry content`);
    return errors;
  }

  errors.push(...validateMissionStepContent(step.content, label));
  return errors;
}

/**
 * Validate one mission's authored steps as a whole.
 *
 * **The Mission is the integrity boundary.** An invalid step invalidates the
 * mission's instructional content rather than being dropped from it: a partial
 * mission looks complete and is not, which would leave a learner with a
 * structurally incomplete lesson and violate BEGINNER-COMPLETE-1.
 *
 * **Zero steps is VALID.** CURR-010 section 13.4 permits a mission with no
 * authored steps to keep rendering from `mission.description` during the
 * transition. That is a supported legacy shape, and it is deliberately
 * different from a mission that HAS steps and contains an invalid one.
 */
export function validateMissionSteps(
  steps: readonly MissionStep[]
): MissionStepValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(steps)) {
    return { valid: false, errors: ["mission steps must be a list"] };
  }

  // The legacy fallback. Nothing further to check.
  if (steps.length === 0) return { valid: true, errors: [] };

  for (const step of steps) {
    errors.push(...validateMissionStep(step));
  }

  const stableIds = steps.map((step) => step?.stableId);
  const duplicateIds = stableIds.filter(
    (stableId, index) => stableIds.indexOf(stableId) !== index
  );
  for (const duplicate of new Set(duplicateIds)) {
    errors.push(`duplicate step stable id within the mission: ${duplicate}`);
  }

  const positions = steps.map((step) => step?.position);
  const duplicatePositions = positions.filter(
    (position, index) => positions.indexOf(position) !== index
  );
  for (const duplicate of new Set(duplicatePositions)) {
    errors.push(`duplicate step position within the mission: ${duplicate}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * The authored order.
 *
 * Ascending `position`, and nothing else. Never insertion order, never a
 * timestamp, never uuid order, never a client guess. `validateMissionSteps`
 * rejects duplicate positions, so this ordering is total and deterministic for
 * any valid mission.
 */
export function missionStepsInAuthoredOrder<T extends MissionStep>(
  steps: readonly T[]
): T[] {
  return [...steps].sort((left, right) => left.position - right.position);
}

/**
 * What a reader may do with one mission's instructional content.
 *
 * CURR-010 section 13.2: if published content contains a structurally invalid
 * step, the mission's instructional-content read FAILS rather than returning
 * the valid remainder. `steps` is only present on the `available` outcome, so a
 * caller cannot render a partial mission without the type checker objecting.
 */
export type MissionStepReadOutcome =
  | { readonly state: "available"; readonly steps: readonly MissionStep[] }
  | { readonly state: "legacy_brief" }
  | { readonly state: "content_error"; readonly errors: readonly string[] };

/**
 * Resolve authored steps into a read outcome.
 *
 * Three outcomes, and no fourth:
 *
 *   legacy_brief   the mission has no steps; render `mission.description`
 *   available      every step is valid; render them in authored order
 *   content_error  at least one step is invalid; render NO instructional
 *                  content and surface the defect
 *
 * There is deliberately no "render what parsed" outcome.
 */
export function resolveMissionStepsForRead(
  steps: readonly MissionStep[]
): MissionStepReadOutcome {
  if (!Array.isArray(steps) || steps.length === 0) {
    return { state: "legacy_brief" };
  }

  const validation = validateMissionSteps(steps);
  if (!validation.valid) {
    return { state: "content_error", errors: validation.errors };
  }

  return { state: "available", steps: missionStepsInAuthoredOrder(steps) };
}

/* ------------------------------------------------------------------ *
 * The persistence boundary
 * ------------------------------------------------------------------ */

/**
 * One `mission_steps` row as it comes back from the database.
 *
 * `stepType` and `payload` are deliberately typed as `string` and `unknown`:
 * they are what storage returned, not what the application asserts. Typing them
 * as the approved union here would assume the very thing the boundary exists to
 * check.
 */
export interface PersistedMissionStepRow {
  readonly stableId: unknown;
  readonly position: unknown;
  readonly stepType: unknown;
  readonly payload: unknown;
}

/**
 * Resolve persisted rows into a read outcome, checking storage integrity first.
 *
 * A mission step is stored with its discriminator in TWO places: the
 * `step_type` column, which the database constrains to the closed vocabulary,
 * and `payload.type`, which the application's discriminated union reads. That
 * duplication is deliberate — the column is what lets the database enforce the
 * vocabulary and index by type — but two representations of one fact can
 * disagree, and a disagreement must never be resolved silently.
 *
 * So this checks, per row, before any content validation:
 *
 *   1. `stepType` is one of the approved seven;
 *   2. `payload` is an object suitable for validation;
 *   3. `payload.type` EQUALS `stepType`.
 *
 * **Neither discriminator is normalized to match the other.** Rewriting one
 * would silently pick a winner and change what the learner is taught — a
 * `diagram` row whose payload says `concept` is not a concept step and is not a
 * diagram step; it is a defect, and the only honest response is to say so.
 *
 * A failure at any row makes the MISSION's instructional content unavailable.
 * The valid remainder is not returned: a partial mission looks complete and is
 * not, which would leave a learner with a structurally incomplete lesson and
 * violate BEGINNER-COMPLETE-1.
 *
 * Zero rows remains the legacy fallback and is not an error.
 */
export function resolvePersistedMissionSteps(
  rows: readonly PersistedMissionStepRow[]
): MissionStepReadOutcome {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { state: "legacy_brief" };
  }

  const errors: string[] = [];
  const steps: MissionStep[] = [];

  rows.forEach((row, index) => {
    const label = nonEmpty(row?.stableId)
      ? String(row.stableId)
      : `<step at row ${index}>`;

    // 1. The persisted type must be approved. The database CHECK normally
    //    prevents anything else, but the application read boundary stays
    //    defensive: a constraint added later than some rows, a restored dump or
    //    a direct write must not be trusted on the strength of a constraint
    //    this code cannot see.
    if (!isMissionStepType(row?.stepType)) {
      errors.push(
        `${label}: persisted step type is not approved: ${String(row?.stepType)}`
      );
      return;
    }

    // 2. The payload must be an object before it can be validated as one.
    const payload = row?.payload;
    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      errors.push(`${label}: persisted payload is not an instructional object`);
      return;
    }

    // 3. The two discriminators must agree. Neither is rewritten to match.
    const payloadType = (payload as { type?: unknown }).type;
    if (payloadType !== row.stepType) {
      errors.push(
        `${label}: persisted step type "${String(row.stepType)}" disagrees with payload type "${String(payloadType)}"`
      );
      return;
    }

    steps.push({
      stableId: String(row.stableId),
      position: Number(row.position),
      content: payload as MissionStepContent
    });
  });

  if (errors.length > 0) {
    return { state: "content_error", errors };
  }

  // Integrity holds; now the content itself must be valid, and the mission is
  // still the boundary.
  return resolveMissionStepsForRead(steps);
}
