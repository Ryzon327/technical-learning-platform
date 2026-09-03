import { useState } from "react";
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
  resolveReferenceHref
} from "./mission-instruction-presentation";
import { InteractionSurface } from "./InteractionSurface";

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
 * There is exactly one `useState`, added by the WP-I correction, and it holds
 * whether the browser failed to load a figure. That is a fact about the
 * browser, not about curriculum: it is set by the `img` element's own error
 * event, it cannot be reached from outside the step it belongs to, and it
 * changes only whether an honest "figure unavailable" state is shown in place
 * of a broken image. No content decision depends on it.
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
  instanceId
}: {
  content: Extract<LearnerMissionStepContent, { type: "interaction" }>;
  instanceId: string;
}) {
  return (
    <>
      {content.caption !== undefined && (
        <p className="instruction-command-caption">{content.caption}</p>
      )}

      <InteractionSurface content={content} instanceId={instanceId} />

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
  headingId: string
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
      return <InteractionStep content={content} instanceId={headingId} />;
    case "practice":
      return <PracticeStep content={content} headingId={headingId} />;
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
  missionStableId
}: {
  steps: readonly LearnerMissionStep[];
  assets: readonly LearnerCurriculumAsset[];
  /** Namespaces heading ids so two open missions could never collide. */
  missionStableId: string;
}) {
  const index = buildAssetIndex(assets);

  return (
    <div className="mission-instruction">
      {steps.map((step) => {
        const headingId = `${missionStableId}-${step.stableId}-title`;
        const titled =
          (step.content.type === "concept" &&
            step.content.title !== undefined) ||
          step.content.type === "practice";

        return (
          <section
            key={step.stableId}
            className="instruction-step"
            {...(titled ? { "aria-labelledby": headingId } : {})}
          >
            {renderStepContent(step, index, headingId)}
          </section>
        );
      })}
    </div>
  );
}
