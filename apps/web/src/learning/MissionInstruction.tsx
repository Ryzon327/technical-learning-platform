import { useEffect, useRef, useState } from "react";
import { NearTransferStep } from "./NearTransferStep";
import type {
  LearnerCurriculumAsset,
  LearnerMissionStep,
  LearnerMissionStepContent
} from "@tlp/shared-types";
import {
  buildAssetIndex,
  describeCommandLabel,
  describeCommandOutputLabel,
  describeFigureUnavailable,
  describePracticeCheckpoint,
  describePracticeCheckpointLabel,
  resolveAsset,
  resolveReferenceHref,
  resolveRequiredInstruction,
  type RequiredInstructionState
} from "./mission-instruction-presentation";
import { InteractionSurface } from "./InteractionSurface";
import {
  INITIAL_NEAR_TRANSFER_STATE,
  describeWithheldStepsNotice,
  hasUnattemptedInstruction,
  nextInstructionStepId,
  revealedByNearTransfer,
  requiredInteraction,
  requiredNearTransfer,
  visibleInstructionSteps,
  type MissionInteractionSettlement,
  type MissionNearTransferState,
  type NearTransferState
} from "./near-transfer-presentation";

/**
 * WP-F — the learner's view of one mission's authored instruction.
 *
 * ## What this component is
 *
 * A renderer for the seven approved step types, and nothing else. It receives an
 * already-authorized, already-projected result from WP-E through
 * `MissionDetail`, and turns it into markup.
 *
 * ## What it deliberately cannot do
 *
 * It holds no token, calls no service, imports no API client and reaches no
 * database. There is no `useEffect` and no fetching: every fact it renders
 * arrives as props. `LearningView` remains the one fetch and state owner in
 * this package, which is both the repository convention and what keeps this
 * file testable by reading it.
 *
 * There are three `useState` hooks, and not one of them holds curriculum or
 * decides content. The first, from the WP-I correction, holds whether the
 * browser failed to load a figure — a fact about the browser, set by the `img`
 * element's own error event, changing only whether an honest "figure
 * unavailable" state is shown in place of a broken image. The second and third
 * hold how far the learner has got through this mission's required inline
 * activities: which near-transfer questions they have answered, and which
 * required interactions they have finished. Both are facts about this browsing
 * session, both are read by the steps that WAIT on those activities, and
 * neither is persisted or sent anywhere — reload the page and the activities
 * start again, which is correct for something that produces no evidence.
 *
 * It also performs no validation. WP-E already decided what is structurally
 * valid, which fields are withheld, and whether every referenced asset
 * resolves. A second opinion here would be a second answer.
 *
 * ## Withholding is structural, not defensive
 *
 * `prediction.expectedOutcome` is not filtered out below — it is absent from
 * `LearnerPredictionStep`, so there is no property to read and a line trying to
 * render it would not compile. The same is true of assessment questions: a
 * `practice` step carries an identifier and nothing else.
 *
 * ## No arbitrary markup
 *
 * Every authored string is rendered as a JSX text child, so React escapes it.
 * There is no `dangerouslySetInnerHTML`, no markdown renderer and no HTML
 * parsing anywhere in this file. That is the entire safety mechanism, and it is
 * why code-looking instructional text — shell, HTML, configuration — is safe to
 * teach without any of it being pattern-matched or rejected.
 *
 * ## Presentation intent
 *
 * Steps are separated by rhythm and a hairline rule, not by boxes. `MissionDetail`
 * is already a bordered panel; wrapping each step in another one would produce a
 * stack of nested cards. Only the two step types that genuinely are a different
 * kind of object — a command block and a figure — get their own ground.
 */

/* ------------------------------------------------------------------ *
 * Step renderers
 *
 * Module-local by design. Six of the seven render a handful of fields with no
 * state and no behaviour; promoting each to its own file would add an import,
 * a test file and a hop for four lines of JSX, and would not help WP-H, which
 * needs one seam rather than six siblings.
 * ------------------------------------------------------------------ */

/**
 * Prose. The paragraph is the unit the author wrote, so each becomes its own
 * paragraph rather than being joined or split further.
 */
function ConceptStep({
  content,
  headingId
}: {
  content: Extract<LearnerMissionStepContent, { type: "concept" }>;
  headingId: string;
}) {
  return (
    <>
      {content.title !== undefined && <h4 id={headingId}>{content.title}</h4>}
      {content.paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </>
  );
}

/**
 * A figure, and what it teaches.
 *
 * The two accessibility fields answer different questions and are never
 * interchanged:
 *
 *   asset.altText          what the visual DEPICTS. Belongs in `alt`, where it
 *                          stands in for the image itself.
 *   step.textAlternative   what this diagram TEACHES in this mission. Rendered
 *                          as visible prose, because it is instruction and every
 *                          learner should read it — not only those who cannot
 *                          see the image.
 *
 * Putting the text alternative into `alt` would hand a screen-reader user a
 * paragraph of teaching where a short description belongs, and would withhold
 * that teaching from everyone else.
 *
 * A missing asset renders the teaching without the image rather than throwing.
 * WP-E already fails the entire mission when a reference does not resolve, so
 * this path means the response did not come from WP-E.
 *
 * ## Why a resolved reference is not the same as a loaded image
 *
 * WP-E guarantees the reference RESOLVES. It cannot guarantee the URL LOADS —
 * the host may be unreachable, the object may have been removed, the network
 * may be down. Before the WP-I correction that case rendered as nothing at all:
 * the browser substituted the alt text, which then read as a stray sentence
 * floating above the caption, with no indication that a figure was meant to be
 * there. Founder UAT reported it, correctly, as a meaningless visual.
 *
 * So a failed load is now an explicit, honest state. It says the figure could
 * not be loaded, and it keeps BOTH accessibility fields on screen — the alt
 * text, which describes what the figure depicts, and the text alternative,
 * which is the teaching. Nothing is fabricated: no placeholder diagram, no
 * generated image, no guess at what the figure would have shown.
 *
 * This is the one piece of local state in the renderer, and it holds a fact
 * about the browser rather than about curriculum. It fetches nothing, decides
 * nothing about content, and cannot change what a learner is authorised to see.
 */
function DiagramStep({
  content,
  asset
}: {
  content: Extract<LearnerMissionStepContent, { type: "diagram" }>;
  asset: LearnerCurriculumAsset | undefined;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <figure className="instruction-figure">
      {asset && !failed && (
        <img
          src={asset.uri}
          alt={asset.altText ?? asset.title}
          onError={() => setFailed(true)}
        />
      )}

      {asset && failed && (
        <div className="instruction-figure-missing" role="note">
          <p className="instruction-figure-missing-label">
            {describeFigureUnavailable()}
          </p>
          <p>{asset.altText ?? asset.title}</p>
        </div>
      )}

      {content.caption !== undefined && (
        <figcaption>{content.caption}</figcaption>
      )}
      <p>{content.textAlternative}</p>
    </figure>
  );
}

/**
 * A displayed command and its result.
 *
 * A display artefact only. Nothing renders it executable and no control offers
 * to run it, per CURR-010 section 10.3.
 *
 * The two blocks are labelled in words because they are otherwise
 * indistinguishable to a screen reader. `language` becomes a class name and
 * nothing more — a classification hint a later package could attach highlighting
 * to without changing this markup. It selects no interpreter and is never
 * evaluated.
 */
function CommandStep({
  content
}: {
  content: Extract<LearnerMissionStepContent, { type: "command" }>;
}) {
  return (
    <div className="instruction-command">
      {content.caption !== undefined && (
        <p className="instruction-command-caption">{content.caption}</p>
      )}

      {content.command !== undefined && (
        <>
          <p className="instruction-command-label">{describeCommandLabel()}</p>
          <pre>
            <code
              className={
                content.language !== undefined
                  ? `language-${content.language}`
                  : undefined
              }
            >
              {content.command}
            </code>
          </pre>
        </>
      )}

      {content.output !== undefined && (
        <>
          <p className="instruction-command-label">
            {describeCommandOutputLabel()}
          </p>
          <pre>
            <code>{content.output}</code>
          </pre>
        </>
      )}
    </div>
  );
}

/**
 * A prompt, and the outcomes worth weighing.
 *
 * Read-only in WP-F. No inputs, no selection, no commitment and no reveal.
 *
 * That is not caution, it is the only honest option available: DEC-059 places
 * the reveal of an expected result *after* the learner commits, and no
 * commitment contract exists on either side of the wire. A client-side reveal
 * would have nothing to gate it — and nothing to reveal, since
 * `expectedOutcome` is absent from the learner type and never crosses the
 * network.
 */
function PredictionStep({
  content
}: {
  content: Extract<LearnerMissionStepContent, { type: "prediction" }>;
}) {
  return (
    <>
      <p className="instruction-prompt">{content.prompt}</p>
      {content.options !== undefined && (
        <ul className="instruction-options">
          {content.options.map((option, index) => (
            <li key={index}>{option}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * An interactive element, and the authored account of what it teaches.
 *
 * ## WP-H filled the seam WP-F cut here
 *
 * The mapping from a validated interaction type to a component lives in
 * `InteractionSurface`, not in this file. CURR-011 section 7 makes that mapping
 * the application's responsibility and explicitly not a second registry: the
 * vocabulary, parameters and observation model stay in
 * `packages/shared-types`, and the application only chooses a component for an
 * already-validated type.
 *
 * ## The text equivalent stays, and stays first
 *
 * It is rendered above the interaction at every support level, including when
 * the interaction itself is withheld. CURR-011 section 14.3 keeps it required
 * as narration and observation history — and section 14.3 equally states it is
 * NOT a substitute for learner agency, which is why the operable interaction
 * sits beneath it rather than instead of it.
 */
function InteractionStep({
  content,
  instanceId,
  settlement
}: {
  content: Extract<LearnerMissionStepContent, { type: "interaction" }>;
  instanceId: string;
  /**
   * Present only where the author marked this activity required, in which case
   * the steps after it are waiting on it. `null` everywhere else, and the
   * interaction then offers no settlement control at all.
   */
  settlement: { readonly settled: boolean; readonly onSettle: () => void } | null;
}) {
  return (
    <>
      {content.caption !== undefined && (
        <p className="instruction-command-caption">{content.caption}</p>
      )}

      {/*
        The lesson's wait, handed to the activity that satisfies it.

        `InteractionSurface` forwards the pair and interprets neither: it maps
        an already-validated interaction TYPE to a component (CURR-011 s7), and
        that is still all it does.

        `settlement` is null for every activity nothing is waiting on, which is
        every interaction authored before `requiredForProgression` existed. The
        two props are then absent and the interaction renders exactly as today.
      */}
      <InteractionSurface
        content={content}
        instanceId={instanceId}
        {...(settlement === null
          ? {}
          : { settled: settlement.settled, onSettle: settlement.onSettle })}
      />

      {/*
        The authored text equivalent, behind a disclosure and BELOW the
        interaction it describes.

        It used to lead: a paragraph of several hundred words above the
        activity, describing the whole network and then narrating the outcome
        the learner is about to be asked to predict. Founder UAT found the
        wall; it also gave away the answer.

        It is not removed and it is not hidden from assistive technology —
        `<details>` content stays in the accessibility tree, and CURR-011
        s14.3 requires the equivalent to be PRESENT rather than to lead. What
        changed is that it no longer competes with the interaction for the
        learner's first read, and no longer pre-empts the prediction.

        Everything it describes is also carried by the interaction itself: the
        drawing has its own accessible arrangement description, the semantic
        tree carries the state, the actions and the consequence, and the full
        ordered account is one disclosure below.
      */}
      <details className="instruction-text-equivalent">
        <summary>Full description of this activity</summary>
        <p>{content.textEquivalent}</p>
      </details>
    </>
  );
}

/**
 * A practice checkpoint.
 *
 * A signpost, not a control. The step names an assessment; it does not carry
 * one, and nothing here fetches, resolves or scores it — no question, no option,
 * no answer key reaches this component, because WP-E sends none.
 *
 * `assessmentStableId` is never rendered. It is an internal identity, and
 * showing it would put a storage key in front of a learner.
 *
 * There is deliberately no button. An action that cannot do anything yet reads
 * as a broken feature, which is worse than an honest description.
 */
function PracticeStep({
  content,
  headingId
}: {
  content: Extract<LearnerMissionStepContent, { type: "practice" }>;
  headingId: string;
}) {
  return (
    <>
      <h4 id={headingId}>{describePracticeCheckpointLabel()}</h4>
      {content.framing !== undefined && <p>{content.framing}</p>}
      <p className="mission-note">{describePracticeCheckpoint()}</p>
    </>
  );
}

/**
 * A pointer to something outside this mission.
 *
 * The authored `label` is always the link text — never the URL, and never the
 * asset identity. When neither an authored URI nor a named asset resolves to a
 * destination, the label and note still render as plain text, so the authored
 * material is not lost to a broken reference.
 *
 * External destinations carry `rel="noreferrer noopener"`: `noopener` denies the
 * opened document a handle back to this window, and `noreferrer` withholds the
 * referrer. Neither depends on where the link points, so both are applied
 * unconditionally rather than guessed at per URL.
 */
function ReferenceStep({
  content,
  href
}: {
  content: Extract<LearnerMissionStepContent, { type: "reference" }>;
  href: string | undefined;
}) {
  return (
    <>
      <p>
        {href !== undefined ? (
          <a href={href} rel="noreferrer noopener">
            {content.label}
          </a>
        ) : (
          content.label
        )}
      </p>
      {content.note !== undefined && (
        <p className="instruction-note">{content.note}</p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The dispatcher
 * ------------------------------------------------------------------ */

/**
 * Map one projected step to its renderer.
 *
 * Exhaustive over the seven approved types. The vocabulary is closed by DEC-054
 * and owned by `packages/shared-types`; there is no default arm, so adding an
 * eighth type to the shared contract without adding a renderer here is a
 * compile error rather than a step that silently vanishes from a lesson.
 */
function renderStepContent(
  step: LearnerMissionStep,
  assets: ReadonlyMap<string, LearnerCurriculumAsset>,
  headingId: string,
  nearTransfer: {
    readonly state: NearTransferState;
    readonly onChange: (
      next: (current: NearTransferState) => NearTransferState
    ) => void;
  },
  /** Null unless this step is a required interaction the lesson waits on. */
  settlement: { readonly settled: boolean; readonly onSettle: () => void } | null
) {
  const content = step.content;

  switch (content.type) {
    case "concept":
      return <ConceptStep content={content} headingId={headingId} />;
    case "diagram":
      return (
        <DiagramStep
          content={content}
          asset={resolveAsset(assets, content.assetStableId)}
        />
      );
    case "command":
      return <CommandStep content={content} />;
    case "prediction":
      return <PredictionStep content={content} />;
    case "interaction":
      return (
        <InteractionStep
          content={content}
          instanceId={headingId}
          settlement={settlement}
        />
      );
    case "practice":
      return <PracticeStep content={content} headingId={headingId} />;
    case "near_transfer":
      return (
        <NearTransferStep
          content={content}
          headingId={headingId}
          instanceId={headingId}
          state={nearTransfer.state}
          onChange={nearTransfer.onChange}
        />
      );
    case "reference":
      return (
        <ReferenceStep
          content={content}
          href={resolveReferenceHref(assets, content)}
        />
      );
  }
}

/**
 * One mission's authored instruction, in authored order.
 *
 * Order comes from WP-E, which sorted by the authored `position` before
 * projecting. Nothing is re-sorted here.
 *
 * Each step is a `<section>`. A step that has its own heading is named by it;
 * one that does not is left unnamed rather than given a fabricated label, since
 * an invented heading would appear in a screen reader's outline as if an author
 * had written it.
 */
export function MissionInstruction({
  steps,
  assets,
  missionStableId,
  instructionGeneration,
  onRequiredInstructionChange
}: {
  steps: readonly LearnerMissionStep[];
  assets: readonly LearnerCurriculumAsset[];
  /** Namespaces heading ids so two open missions could never collide. */
  missionStableId: string;
  /**
   * Which rendering of this mission's lesson this is.
   *
   * Minted by the view and echoed back untouched. A lesson cannot vouch for
   * its own freshness — the whole point of the number is that the party which
   * owns mounting and tearing down decides which report still counts.
   */
  instructionGeneration: number;
  /**
   * Reports whether required inline instruction is still outstanding, so the
   * surrounding mission surface can decide what to offer.
   *
   * WP-NF-NT1B. The lesson knows which of its own activities are required and
   * whether the learner has done them; the completion control does not, and
   * must not — it is told a state, never a step type, a question or a mission.
   */
  onRequiredInstructionChange?: (
    missionStableId: string,
    generation: number,
    state: RequiredInstructionState
  ) => void;
}) {
  const index = buildAssetIndex(assets);

  /*
   * WP-NF-NT1 added this, the second `useState` in this file. Like the first, it
   * holds no curriculum and decides no content: it records which near-transfer
   * questions the learner has answered, which is a fact about this browsing
   * session and is never sent anywhere. It lives here rather than inside
   * `NearTransferStep` because the steps that FOLLOW a near-transfer check
   * wait on it, and a component cannot wait on state its sibling owns
   * privately. Nothing is persisted and nothing is recorded: reload the page
   * and the activity starts again, which is correct for something that
   * produces no evidence.
   */
  const [nearTransfer, setNearTransfer] = useState<MissionNearTransferState>(
    {}
  );

  /*
   * The third `useState`, and it holds one boolean per required interaction:
   * has the learner said they finished it.
   *
   * It lives here for the same reason the near-transfer state does — the steps
   * that FOLLOW a required activity wait on it, and a component cannot wait on
   * state its sibling owns privately. It holds no curriculum, decides no
   * content and records nothing: reload the page and the activity starts again,
   * which is correct for something that produces no evidence.
   *
   * ## Why it only ever goes true
   *
   * Settlement is the learner saying they read the end of the activity. That
   * remains true afterwards, so the interaction's own Start over — which resets
   * the journey, not the reading — cannot un-finish it and re-hide steps the
   * learner has already moved past. The setter below writes `true` and nothing
   * else, which is where the latch lives.
   */
  const [settled, setSettled] = useState<MissionInteractionSettlement>({});

  /*
    THE HANDOFF AFTER A REQUIRED ACTIVITY IS FINISHED.

    Pressing Finish unmounts the button that was pressed — its own render
    condition goes false — and until this existed nothing caught the focus it
    was holding, so it fell to `document.body`. A keyboard learner was
    returned to the top of the document, and a screen-reader learner was told
    nothing at all about the steps the press had just revealed. Worse inside
    the expanded workspace, where losing focus also drops out of the pane's
    Tab cycle.

    So the reveal announces itself. `MissionInstruction` owns the reveal —
    `PacketJourney` only reports that the learner finished reading — which is
    why the handoff lives here and not next to the button.

    The target is the FIRST NEWLY REVEALED step, not the activity's own
    heading: the learner pressed Finish to move on, and moving them to what
    appeared is the answer to what they asked for.
  */
  const stepRefs = useRef(new Map<string, HTMLElement>());
  const [revealTarget, setRevealTarget] = useState<string | null>(null);

  const visible = visibleInstructionSteps(steps, nearTransfer, settled);

  useEffect(() => {
    if (revealTarget === null) return;

    // Absent when the settled step was the last authored one, or when the
    // next step is itself withheld behind a further required activity. Both
    // are ordinary, and neither is a reason to move focus somewhere else.
    stepRefs.current.get(revealTarget)?.focus();
    setRevealTarget(null);
    // `visible` is a dependency because the element only exists once the
    // reveal has been committed; this effect runs on that commit, never on
    // the one that scheduled it.
  }, [revealTarget, visible]);

  /*
    The notice below is about questions the learner has NOT ANSWERED — not
    about steps that happen to be hidden.

    Those were the same flag until Founder video UAT: `visible.length <
    steps.length` is true both while questions remain and while the last
    answer's feedback is still on screen. In the second case the learner read
    a verdict, an explanation and a Finish button, and underneath them a
    sentence telling them to answer the questions they had just answered.
  */
  const withheld = hasUnattemptedInstruction(steps, nearTransfer, settled);

  /*
    What the lesson reports upward.

    The SAME predicate that hides the steps above, by Architect ruling.

    These briefly differed: eligibility moved when the last answer was
    committed, while the closing steps waited for Finish. That let a learner
    mark the mission complete while the final verdict and explanation were
    still on screen. Reading the feedback is part of the instruction, so both
    now wait for the learner to finish the activity.

      visibility   `isSettled` — answered AND the feedback read past.
      eligibility  `isSettled` — the same.

    What still rides ATTEMPTED is the notice above, and only that: a learner
    who has answered everything is not told to answer anything.

    Correctness is not a gate anywhere in this. `isSettled` counts feedback
    dismissed, never answers right, so a learner who was wrong every time
    finishes exactly as one who was right every time does.

    ## Two kinds of required activity, one answer

    A required interaction is the same kind of obligation, so it is asked about
    the same way. `resolveRequiredInstruction` reports OUTSTANDING while ANY
    required activity is unsettled, of either kind — one unfinished walkthrough
    is enough, exactly as one unfinished question set is. `null` from both
    predicates means the step is not a required activity at all, which is every
    step in every mission authored before either field existed.
  */
  const requiredInstruction = resolveRequiredInstruction(steps, (step) => {
    const nearTransferState = requiredNearTransfer(step, nearTransfer);
    if (nearTransferState !== null) return nearTransferState;

    return requiredInteraction(step, settled);
  });

  useEffect(() => {
    // Reported WITH the mission it describes. The holder of this value
    // outlives this component, so an untagged word would be indistinguishable
    // from the previous lesson's — see `resolveReportedRequiredInstruction`.
    onRequiredInstructionChange?.(
      missionStableId,
      instructionGeneration,
      requiredInstruction
    );
  }, [
    instructionGeneration,
    missionStableId,
    onRequiredInstructionChange,
    requiredInstruction
  ]);

  return (
    <div className="mission-instruction">
      {visible.map((step) => {
        const headingId = `${missionStableId}-${step.stableId}-title`;
        const titled =
          (step.content.type === "concept" &&
            step.content.title !== undefined) ||
          step.content.type === "practice";

        return (
          <section
            key={step.stableId}
            className="instruction-step"
            /*
              Focusable only programmatically. -1 keeps every one of these out
              of the Tab order, so the reveal handoff above can reach a step
              without adding a stop to the sequence a learner tabs through.

              The section, rather than its heading, because a step is not
              required to have one — a command, a diagram or an untitled
              concept has no heading to move to, and this is the target that
              exists for every step type.
            */
            tabIndex={-1}
            ref={(element) => {
              if (element === null) stepRefs.current.delete(step.stableId);
              else stepRefs.current.set(step.stableId, element);
            }}
            {...(titled ? { "aria-labelledby": headingId } : {})}
          >
            {renderStepContent(
              step,
              index,
              headingId,
              {
                state:
                  nearTransfer[step.stableId] ?? INITIAL_NEAR_TRANSFER_STATE,
                onChange: (next) => {
                  const before =
                    nearTransfer[step.stableId] ?? INITIAL_NEAR_TRANSFER_STATE;
                  const after = next(before);

                  setNearTransfer((current) => ({
                    ...current,
                    [step.stableId]: after
                  }));

                  /*
                    The near-transfer's half of the reveal handoff.

                    Its Finish control has no `onSettle` — it settles by
                    acknowledging the last question's feedback, through this
                    same `onChange` — so the interaction's handoff below could
                    never fire for it. Mission 2 has both controls, and until
                    this existed only one of them carried the learner to what
                    their press revealed; the other dropped focus to the
                    document body.

                    A TRANSITION, not a state: asking "is it settled" would be
                    true of every later change too, and would keep pulling
                    focus back to the same section.
                  */
                  if (revealedByNearTransfer(step, before, after)) {
                    setRevealTarget(nextInstructionStepId(steps, step.stableId));
                  }
                }
              },
              /*
                A settlement binding only where something is waiting.

                `requiredInteraction` returns null for a step that is not a
                required interaction, and the activity then offers no Finish
                control — which is the correct behaviour for a demonstration
                placed beside prose, and for every mission authored before the
                field existed.

                The setter writes `true` and nothing else. That is the latch:
                the interaction's own Start over resets the journey, never the
                fact that the learner finished reading it.
              */
              requiredInteraction(step, settled) === null
                ? null
                : {
                    settled: settled[step.stableId] === true,
                    onSettle: () => {
                      setSettled((current) => ({
                        ...current,
                        [step.stableId]: true
                      }));
                      // Authored order decides what comes next, exactly as it
                      // decides what was withheld.
                      setRevealTarget(
                        nextInstructionStepId(steps, step.stableId)
                      );
                    }
                  }
            )}
          </section>
        );
      })}

      {/*
        Said out loud rather than left to a blank space. A lesson that simply
        ends after the questions looks finished; this names what the learner
        still has to do to see the rest.
      */}
      {withheld && (
        <p className="instruction-withheld">{describeWithheldStepsNotice()}</p>
      )}
    </div>
  );
}
