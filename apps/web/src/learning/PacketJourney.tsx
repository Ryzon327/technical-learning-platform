import { useRef, useState, type KeyboardEvent } from "react";
import type { LearnerPacketJourneyParameters } from "@tlp/shared-types";
import {
  INITIAL_PACKET_JOURNEY_VIEW_STATE,
  advance,
  applyAction,
  buildPacketJourneyView,
  commitPrediction,
  describeObservationLabel,
  describePredictionLabel,
  describeUnobservedCommitment,
  describeWorkspaceCloseLabel,
  describeWorkspaceOpenLabel,
  resetJourney,
  resolveSequencing,
  startJourney,
  type PacketJourneyViewState
} from "./packet-journey-presentation";
import { TopologyView } from "./TopologyView";
import { connectionsForDevice, describeConnectionFrom } from "./topology-layout";

/**
 * WP-H, corrected by WP-I — the Packet Journey interaction.
 *
 * ## One semantic tree, not two presentations
 *
 * CURR-011 section 14.6 forbids a second simulation, and section 14.1 requires
 * a learner who cannot use the visual representation to inspect the same state,
 * take the same action, receive the same consequence and carry on
 * troubleshooting.
 *
 * The way that is guaranteed here is structural: **the semantic tree IS the
 * interaction.** State, journey, controls and consequence are ordinary
 * headings, lists, description lists and buttons. The topology adds a picture
 * whose only non-semantic parts — the wires, the packet and its pulse — are
 * `aria-hidden` and carry nothing that is not also written down. The devices in
 * it are real buttons, so the picture adds a control surface rather than
 * replacing one.
 *
 * ## Why the two columns are what they are
 *
 * Founder UAT found the learner deciding and acting in the right-hand rail
 * while the packet, the wire and the device changed on the left. It was
 * possible to click through the entire journey without once looking at the
 * network, which defeats the method: the observation IS the teaching.
 *
 * So the columns are split by ROLE, not by kind of content:
 *
 *   `.packet-journey-network`   do it, and watch it.
 *   `.packet-journey-rail`      look it up. Inspection, connections, the full
 *                               device listing, the text account.
 *
 * ## The instructional workspace, and the UAT finding that produced it
 *
 * Founder UAT, second round: at a normal viewport the Founder "did not know
 * what to do". The first learner action was below the fold, discoverable only
 * by scrolling and comfortable only after zooming the browser out. And once the
 * topology was pinned, scrolling could leave the picture on screen while the
 * control that advances it disappeared — a persistent visualisation with no
 * visible way forward.
 *
 * Both failures had one cause: the picture and the task the picture is about
 * were separate regions of the page, and only the picture was pinned.
 *
 * `.packet-journey-visual` is now the whole workspace, in this order:
 *
 *   ORIENT     two short lines — what this is, and what to do
 *   WATCH      the topology
 *   OBSERVE    what just happened, and the live region
 *   ACT        the current task: the prediction, or the one control that
 *              moves the journey on, or the remediation
 *
 * That block is what is pinned, so the current task cannot be separated from
 * the picture it belongs to (UAT-INTERACTION-CONTINUITY-1). Everything the
 * learner has already read — the journey history, the diagnosis, the
 * conclusion — sits below it and may grow as long as it likes, because it can
 * no longer push the next action off the screen.
 *
 * The workspace EVOLVES rather than accumulates. It always holds exactly one
 * current task; predicting, sending, continuing and repairing replace each
 * other rather than piling up. Which one is current is `view.currentTask`, a
 * derived fact from the presentation module — not something inferred here from
 * which controls happen to be rendered.
 *
 * There is still exactly ONE progression control, and it is now inside the
 * pinned workspace, which is a stronger form of the earlier correction rather
 * than a reversal of it: the learner never has to scroll to reach it at all.
 *
 * ## Why nothing scrolls the learner
 *
 * An earlier revision nudged the topology into view on every event. There is no
 * programmatic scrolling here at all, and the gate asserts there is none — with
 * the task pinned beside the picture, there is nothing left to scroll to.
 *
 * ## One instance, one state, two scales
 *
 * The embedded lesson view and the expanded workspace are the SAME component
 * instance rendering the SAME `PacketJourneyViewState` with a different class.
 * There is no second mount, no context, no store and no synchronisation,
 * because divergence is not representable: there is exactly one `useState` and
 * exactly one `buildPacketJourneyView` call. Opening or closing the workspace
 * therefore cannot lose a prediction, a revealed stage, a remediation or a
 * selected device — it changes only how the same tree is laid out.
 *
 * ## No disabled controls
 *
 * A control is rendered when it can be used and absent when it cannot. A
 * disabled button reads as a broken feature and gives a keyboard user something
 * to land on that does nothing.
 *
 * ## No networking, and no state that is not authored
 *
 * Every fact rendered below comes from `buildPacketJourneyView`, which reads the
 * shared `ObservationModel`. Nothing in this file decides where traffic goes,
 * whether it arrives, or whether the learner was right. The three `useState`
 * hooks hold where the learner is in the AUTHORED sequence, which device they
 * are looking at, and whether the workspace is open — none of which can change
 * an outcome, because every outcome was authored before the learner arrived.
 *
 * ## Motion
 *
 * Motion is CSS only, and the stylesheet disables it under
 * `prefers-reduced-motion`. No branch in this file depends on motion, so a
 * reduced-motion learner receives the identical markup, the identical
 * information and the identical controls.
 */

/** Focusable descendants, for the workspace's tab cycle. */
const FOCUSABLE =
  'button, summary, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function PacketJourney({
  parameters,
  instanceId,
  supportLevel
}: {
  parameters: LearnerPacketJourneyParameters;
  /** Namespaces radio-group names so two interactions cannot collide. */
  instanceId: string;
  /**
   * The level the SERVER authorised this interaction at.
   *
   * Used for sequencing only — how much the learner is asked to do before the
   * next authored observation. It enforces nothing: at a protected level the
   * answer-bearing fields are already absent from `parameters`, so there is
   * nothing here to reveal, and `resolveSequencing` names only the levels that
   * withhold nothing, defaulting everything else to the strictest arm.
   */
  supportLevel: string;
}) {
  const [state, setState] = useState<PacketJourneyViewState>(
    INITIAL_PACKET_JOURNEY_VIEW_STATE
  );
  const [choice, setChoice] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const sequencing = resolveSequencing(supportLevel);
  const view = buildPacketJourneyView(parameters, state, sequencing);
  const prediction = view.pendingPrediction;
  const event = view.currentEvent;

  // The step the learner has just observed. The instructor pane shows the
  // reason for THIS one and no other; everything earlier is in the history.
  const latestObservation = view.stages[view.stages.length - 1];

  const inspectorId = `${instanceId}-inspector`;
  const topology = view.topology;

  const selectedDevice =
    topology.state === "available"
      ? topology.devices.find((device) => device.nodeId === selectedNodeId)
      : undefined;

  const selectedNode = view.nodes.find(
    (node) => node.nodeId === selectedDevice?.nodeId
  );

  /**
   * Keep Tab inside the workspace while it claims to be modal, and let Escape
   * close it.
   *
   * Written by hand rather than pulled from a package: a dependency is a
   * Founder gate, and this is twenty lines. `aria-modal` is only honest if the
   * cycle is actually contained, so the two ship together or neither does.
   */
  function handleWorkspaceKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (!expanded) return;

    if (event.key === "Escape") {
      setExpanded(false);
      return;
    }

    if (event.key !== "Tab") return;

    const root = containerRef.current;
    if (root === null) return;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE)
    ).filter((element) => element.offsetParent !== null);

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (first === undefined || last === undefined) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      ref={containerRef}
      className={
        expanded ? "packet-journey packet-journey--workspace" : "packet-journey"
      }
      onKeyDown={handleWorkspaceKeys}
      {...(expanded
        ? { role: "dialog", "aria-modal": true, "aria-label": "Network workspace" }
        : {})}
    >
      {/*
        One control in two states, so focus never has to be moved or restored:
        it opens the workspace, and it is then the first control inside it.
      */}
      <button
        type="button"
        className="packet-journey-workspace-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? describeWorkspaceCloseLabel() : describeWorkspaceOpenLabel()}
      </button>

      {/* ---------------------------------------------------------------- *
          Column one: do it, and watch it.
       * ---------------------------------------------------------------- */}
      <div className="packet-journey-network">
        {/* ------------------------------------------------------------ *
            The instructional workspace.

            Founder UAT found the first learner action below the fold, and
            found that scrolling could leave the pinned topology on screen
            while the control that advances it disappeared elsewhere. Both
            failures came from the same cause: the picture and the task the
            picture is about were two separate regions of the page.

            They are now ONE region — orientation, topology, what just
            happened, and what to do next — and that region is what is pinned.
            UAT-INTERACTION-CONTINUITY-1: whatever else scrolls away, the
            current task cannot leave the picture it belongs to.

            Everything the learner has already read moves below it.
         * ------------------------------------------------------------ */}
        <div className="packet-journey-visual">
          {/*
            Orientation. Two short lines: what this is, and what to do. The
            summary is built from the AUTHORED start label, so the course's own
            words say what the interaction is about, and it deliberately does
            not name the destination the learner is about to predict.
          */}
          <div className="packet-journey-orientation">
            <h5 className="packet-journey-orientation-title">
              {view.orientation.title}
            </h5>
            <p className="packet-journey-orientation-summary">
              {view.orientation.summary}
            </p>
            {/*
              DEC-058 requires teaching mode to be identified ON SCREEN. It is
              quiet and it is permanent — never behind a disclosure.
            */}
            <p className="packet-journey-source">{view.sourceNotice}</p>
          </div>

          {/* ------------------------------------------------------------ *
              The interactive environment.

              Deliberately NOT called a lab. Today it hosts an instructional
              simulation; the same pane is where a real lab surface would go
              later, and naming the region after one of its future tenants
              would make that change a rename of half the stylesheet.
           * ------------------------------------------------------------ */}
          <div className="packet-journey-environment">
            <TopologyView
              layout={topology}
              selectedNodeId={selectedNodeId}
              inspectorId={inspectorId}
              eventToken={event.token}
              onSelect={(nodeId) =>
                setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId)
              }
            />
          </div>

          {/* ------------------------------------------------------------ *
              What to do now.

              This block EVOLVES rather than accumulates: it holds the latest
              observation and the one control that moves the journey on, and
              nothing else. Every earlier observation is in the history below,
              which is where reading belongs and where it can grow without
              pushing the next action off the screen.
           * ------------------------------------------------------------ */}
          <div className="packet-journey-next">
            <p className="packet-journey-task-label">
              {view.currentTask.label}
            </p>

            {/*
              What just happened, directly under the picture it happened in.
              The headline is the glanceable half; the live region below it
              carries the authored narration and is the one thing assistive
              technology is told about on every change.
            */}
            <section
              className={`packet-journey-event is-${event.kind}`}
              aria-label="Current event"
            >
              {/*
                Keyed so its settle animation replays on every event. The live
                region below is deliberately not keyed — remounting one risks a
                missed or duplicated announcement.
              */}
              {view.startAction === null && (
                <p key={event.token} className="packet-journey-event-headline">
                  {event.headline}
                </p>
              )}

              {/*
                The connection crossed, in words. The wire that lights up is
                decorative and hidden, so without this sentence that fact would
                exist only in the picture.
              */}
              {event.via !== null && (
                <p className="packet-journey-event-via">Across {event.via}</p>
              )}

              {/*
                Never unmounted, at any point in the journey — including before
                the learner starts. A live region that appears and disappears
                risks a missed or duplicated announcement.
              */}
              <p
                role="status"
                aria-live="polite"
                className="packet-journey-announcement"
              >
                {view.announcement}
              </p>
            </section>

            {/* ---------------------------------------------------------- *
                Before you begin.

                Founder UAT asked for an obvious Start, and this is it: one
                sentence and one visually dominant control, with nothing else
                competing for the learner's attention.

                It reveals nothing. No prediction is offered yet, no stage is
                revealed and no answer is named — the sentence says only that
                a prediction will be asked for first.

                Pressing it records ENGAGEMENT and nothing else. It produces no
                competency, no evidence, no progress and no lab state.
             * ---------------------------------------------------------- */}
            {view.startAction !== null && (
              <div className="packet-journey-start">
                <p className="packet-journey-start-instruction">
                  {view.startAction.instruction}
                </p>
                <button
                  type="button"
                  className="packet-journey-start-action"
                  onClick={() => setState(startJourney(state))}
                >
                  {view.startAction.label}
                </button>
              </div>
            )}

            {view.symptom !== null && (
              <p className="packet-journey-symptom">{view.symptom}</p>
            )}

            {/* ---------------------------------------------------------- *
                Why it happened — for the step the learner is on, and no
                other.

                Founder UAT: "I did not even notice the bottom information
                expanding during the exercise." The authored reason used to
                live only in the history below the workspace, which meant the
                one explanation the learner needed at that moment was the one
                thing they were least likely to read.

                It is the LATEST observation only. Earlier reasons stay in the
                history, where they belong: the pane evolves rather than
                accumulating a transcript above the next action.
             * ---------------------------------------------------------- */}
            {latestObservation?.decision !== undefined &&
              (view.decisionDisclosed ? (
                <details className="packet-journey-why-disclosure">
                  <summary>Why this happened</summary>
                  <p className="packet-journey-why">
                    {latestObservation.decision}
                  </p>
                </details>
              ) : (
                <p className="packet-journey-why">
                  {latestObservation.decision}
                </p>
              ))}

            {view.inspectionPrompt !== null && (
              <p className="instruction-note">{view.inspectionPrompt}</p>
            )}

            {/*
              A commitment the learner has made but not yet observed.

              It appears the instant the prediction is committed and stays until
              the stage it is about is revealed, so committing can never look
              like the interaction discarded the answer and started over.
            */}
            {view.pendingCommitment !== null && (
              <div className="packet-journey-commitment">
                <p className="packet-journey-commitment-label">
                  {describePredictionLabel()}
                </p>
                <p className="packet-journey-commitment-option">
                  {view.pendingCommitment.option}
                </p>
                <p className="packet-journey-commitment-note">
                  {describeUnobservedCommitment()}
                </p>
              </div>
            )}

            {/* Predict before observing. */}
            {prediction !== null && (
              /*
                The question, then the choices — never the question ACROSS the
                choices.

                Founder UAT: "the question is overlapping the box." That is
                what a `<legend>` does by default: it is painted on the
                fieldset's top border, and a prompt long enough to wrap sits
                across it.

                The fix is structural rather than cosmetic. The fieldset keeps
                its semantics and its legend — the strongest available grouping
                for a set of radios — and simply carries NO BORDER, so there is
                nothing for the legend to overlap. The border moves inward onto
                the choices, which is also the hierarchy the pane wants:
                question first, answers in their own quiet box beneath it.

                No negative margins, no absolute positioning, no pixel offsets
                and nothing hidden behind the text. Native radio semantics and
                arrow-key behaviour are untouched.
              */
              <fieldset className="packet-journey-prediction">
                <legend className="packet-journey-prediction-question">
                  {prediction.prompt}
                </legend>

                <div className="packet-journey-options">
                  {prediction.options.map((option) => (
                    <label key={option} className="packet-journey-option">
                      <input
                        type="radio"
                        name={`${instanceId}-${prediction.stageId}`}
                        value={option}
                        checked={choice === option}
                        onChange={() => setChoice(option)}
                      />
                      {option}
                    </label>
                  ))}
                </div>

                {choice !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setState(
                        commitPrediction(state, prediction.stageId, choice)
                      );
                      setChoice(null);
                    }}
                  >
                    Commit this prediction
                  </button>
                )}
              </fieldset>
            )}

            {/* Reveal the next authored observation. The one progression control. */}
            {view.canAdvance && (
              <button
                type="button"
                className="packet-journey-advance"
                onClick={() => setState(advance(state, parameters, sequencing))}
              >
                {view.advanceLabel}
              </button>
            )}

            {/* Remediation, offered only once the failure has been observed. */}
            {view.actions.some((action) => action.available) && (
              <div className="packet-journey-actions">
                <h5>What will you change?</h5>
                {view.actions.map((action) => (
                  <button
                    key={action.actionId}
                    type="button"
                    onClick={() => setState(applyAction(state, action.actionId))}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/*
              The journey stopped and this support level sent no remediation.
              Saying so is better than a dead end, and it reveals nothing: the
              component never received the authored fixes.
            */}
            {view.remediationWithheld !== null && (
              <p className="instruction-note">{view.remediationWithheld}</p>
            )}

            {/*
              The diagnosis, at the moment the learner meets the failure. Like
              the reason above, it belongs where the learner is looking rather
              than beneath the workspace.
            */}
            {view.explanation !== null && (
              <p className="packet-journey-explanation">{view.explanation}</p>
            )}

            {/* The conclusion, where the activity ends. */}
            {view.confirmation !== null && (
              <p className="packet-journey-confirmation">{view.confirmation}</p>
            )}

            {/* ---------------------------------------------------------- *
                Contextual inspection.

                Appears only when the learner deliberately selects a device,
                and disappears when they deselect it — so it is available at
                the moment it is wanted and never permanently buries the
                current task. Selecting a device is the learner asking a
                question; this is the answer, next to where they asked it.
             * ---------------------------------------------------------- */}
            <section
              id={inspectorId}
              className="packet-journey-inspector"
              aria-label="Device inspector"
            >
              {selectedNode === undefined || selectedDevice === undefined ? (
                <p className="instruction-note">
                  Select a device in the network to read what it is and what it
                  connects to.
                </p>
              ) : (
                <>
                  {/*
                    UNDERSTAND. Identity, then the category sentence, then the
                    authored scenario prose. The name and the category appear
                    once, in one heading — repeating them as a subtitle and
                    again as a badge is what made the earlier panel read as a
                    dashboard.
                  */}
                  <h5 className="packet-journey-inspector-name">
                    {selectedNode.label}{" "}
                    <span className="packet-journey-inspector-role">
                      {selectedNode.roleLabel}
                    </span>
                  </h5>

                  {selectedNode.purpose !== undefined && (
                    <p className="packet-journey-inspector-purpose">
                      {selectedNode.purpose}
                    </p>
                  )}

                  {selectedNode.about !== undefined && (
                    <p className="packet-journey-inspector-about">
                      {selectedNode.about}
                    </p>
                  )}

                  {/*
                    The device's relationship to THIS journey, said in words
                    and never only by the colour of the card behind it.

                    The wording comes from `resolveNodeJourneyStatus`, which
                    reads revealed stages and the authored end of the journey,
                    and nothing else. This component does not know which
                    devices are on the path and has no way to work it out.
                  */}
                  <p
                    className={`packet-journey-inspector-status is-${selectedNode.journeyStatus.kind}`}
                  >
                    <span className="packet-journey-inspector-status-label">
                      Journey status
                    </span>
                    {selectedNode.journeyStatus.label}
                  </p>

                  {/*
                    INSPECT, behind one deliberate disclosure.

                    Nothing is deleted from the model to simplify the default
                    view — every port, every connection and every reported
                    attribute is still here, one interaction away. That is the
                    seam the later inspector grows into: what belongs in front
                    of a beginner and what belongs behind a disclosure is a
                    presentation decision, and the data underneath it does not
                    change shape when the answer does.

                    One level, closed by default. A `<details>` is a native
                    disclosure: focusable, operable with Enter and Space, and
                    announced with its expanded state, none of which needs
                    JavaScript or ARIA here.
                  */}
                  <details className="packet-journey-inspector-details">
                    <summary>View technical details</summary>

                    {topology.state === "available" && (
                      <ul className="packet-journey-inspector-links">
                        {connectionsForDevice(
                          topology.links,
                          selectedDevice.nodeId
                        ).map((link) => (
                          <li key={link.linkId}>
                            {describeConnectionFrom(link, selectedDevice.nodeId)}
                          </li>
                        ))}
                      </ul>
                    )}

                    <ul className="packet-journey-inspector-interfaces">
                      {selectedNode.interfaces.map((iface) => (
                        <li key={iface.interfaceId}>
                          <p className="packet-journey-inspector-interface">
                            {iface.label}
                          </p>
                          <dl>
                            {iface.attributes.map((attribute) => (
                              <div key={attribute.label}>
                                <dt>{attribute.label}</dt>
                                <dd>{attribute.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              )}
            </section>
          </div>
        </div>

        {/* ------------------------------------------------------------ *
            What has happened so far — behind a disclosure, and closed.

            Founder UAT: "I did not even notice the bottom information
            expanding during the exercise." An account that grows under the
            workspace while the learner works above it is a second lesson
            competing with the first, and this one was losing.

            Everything the learner needs for the CURRENT step is now in the
            instructor pane. This is the complete record for a learner who
            wants to look back, and it opens only when they ask.
         * ------------------------------------------------------------ */}
        {view.stages.length > 0 && (
          <details className="packet-journey-history">
            <summary>Every step so far, in full</summary>
            <ol className="packet-journey-stages">
              {view.stages.map((stage) => (
                <li
                  key={stage.stageId}
                  className={
                    stage.stopped
                      ? "packet-journey-stage is-stopped"
                      : "packet-journey-stage"
                  }
                >
                  <p className="packet-journey-stage-node">{stage.nodeLabel}</p>

                  {/*
                    Prediction beside observation. The learner compares the two
                    and draws the conclusion; nothing here grades them, and
                    nothing can — the authored content carries no answer key,
                    and the observation IS the reveal.
                  */}
                  {stage.committedPrediction !== undefined && (
                    <div className="packet-journey-compare">
                      <p className="packet-journey-compare-label">
                        {describePredictionLabel()}
                      </p>
                      <p className="packet-journey-compare-value">
                        {stage.committedPrediction}
                      </p>
                      <p className="packet-journey-compare-label">
                        {describeObservationLabel()}
                      </p>
                      <p className="packet-journey-compare-value">
                        {stage.narration}
                      </p>
                    </div>
                  )}

                  {stage.committedPrediction === undefined && (
                    <p>{stage.narration}</p>
                  )}

                  {stage.decision !== undefined &&
                    (view.decisionDisclosed ? (
                      <details className="packet-journey-why-disclosure">
                        <summary>Why this happened</summary>
                        <p className="packet-journey-why">{stage.decision}</p>
                      </details>
                    ) : (
                      <p className="packet-journey-why">{stage.decision}</p>
                    ))}

                  {/* The outcome in words, never by colour alone. */}
                  <p className="packet-journey-outcome">{stage.outcomeLabel}</p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>

      {/* ---------------------------------------------------------------- *
          Column two: look it up.

          Reference, deliberately subordinate. Founder UAT found the connection
          list competing with the topology for attention; everything here is
          either selected into view or collapsed behind a disclosure, so nothing
          is lost and nothing shouts.
       * ---------------------------------------------------------------- */}
      <div className="packet-journey-rail">
        {/*
          DEEP REFERENCE, and labelled as such.

          Founder UAT found this material competing with the current task for
          attention. Nothing has been removed — every connection, every device
          and interface, and the full text account are all still here and still
          keyboard-operable — but they are secondary, they are quieter, and the
          column now says what it is before a learner opens anything in it.
        */}
        <p className="packet-journey-reference-title">Reference</p>


        {/*
          Every connection, both ends named. Collapsed because it was competing
          with the topology, kept because it is the complete textual account of
          what is plugged into what and must stay reachable.
        */}
        <details className="packet-journey-connections">
          <summary>Every connection, in full</summary>
          <ul className="packet-journey-links">
            {view.links.map((link) => (
              <li
                key={link.linkId}
                className={
                  link.current
                    ? "packet-journey-link is-current"
                    : link.traversed
                      ? "packet-journey-link is-traversed"
                      : "packet-journey-link"
                }
              >
                <span className="packet-journey-link-endpoints">
                  {link.endpointSummary ?? link.label}
                </span>
                {link.current && (
                  <span className="packet-journey-link-state">
                    The traffic crossed this link
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>

        {/*
          The complete device and interface listing. It stays, because it is the
          full inspectable state and nothing may be reachable only by selecting
          a device in a picture.
        */}
        <details className="packet-journey-devices">
          <summary>Every device and interface, in full</summary>
          <ul className="packet-journey-nodes">
            {view.nodes.map((node) => (
              <li
                key={node.nodeId}
                className={
                  node.current
                    ? "packet-journey-node is-current"
                    : "packet-journey-node"
                }
              >
                <p className="packet-journey-node-name">
                  {node.label} — {node.roleLabel}
                  {node.current ? " — the journey is here" : ""}
                </p>
                <ul>
                  {node.interfaces.map((iface) => (
                    <li key={iface.interfaceId}>
                      {iface.label}
                      <dl>
                        {iface.attributes.map((attribute) => (
                          <div key={attribute.label}>
                            <dt>{attribute.label}</dt>
                            <dd>{attribute.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>

        {/*
          The ordered plain-language account. Required by CURR-011 s14.3 as
          narration and observation history, and never withheld.
        */}
        <details className="packet-journey-trace">
          <summary>Full text account</summary>
          <ol>
            {view.textTrace.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>
        </details>

        {/*
          Secondary on purpose. Starting over is a legitimate thing to want and
          a terrible thing to reach for by accident.
        */}
        {state.started && (
          <button
            type="button"
            className="packet-journey-restart"
            onClick={() => {
              setState(resetJourney());
              setSelectedNodeId(null);
            }}
          >
            Start over
          </button>
        )}
      </div>
    </div>
  );
}
