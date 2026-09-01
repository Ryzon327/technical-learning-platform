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
 *   `.packet-journey-network`   do it, and watch it. The topology, the current
 *                               event, the journey account, and then the
 *                               decision and the controls — the whole
 *                               DECIDE -> ACT -> OBSERVE loop, in one place.
 *   `.packet-journey-rail`      look it up. Inspection, connections, the full
 *                               device listing, the text account.
 *
 * The learner now acts within a screen-height of the thing their action
 * changes, and the reference material cannot compete with it for attention.
 *
 * ## Why the controls sit BELOW the journey account
 *
 * They did not, at first, and Founder UAT found what that cost. The history
 * grows downward, so a learner who had read as far as Router-1 had to scroll UP
 * to the control, click, scroll back DOWN to read what happened, and scroll up
 * again — once for every remaining authored stage.
 *
 * The next action belongs where the learner's reading has got to. So the order
 * in this column is: the picture, what just happened, the history, and then —
 * immediately after the newest entry — what to do next.
 *
 * There is exactly ONE progression control. A second one pinned near the
 * topology would have solved the scrolling and created a worse problem: two
 * buttons that do the same thing, one of which is always the wrong one to look
 * at. What keeps the picture perceivable instead is `.packet-journey-visual`,
 * which is sticky from the tablet breakpoint upwards — it is a view, not a
 * control, so pinning it duplicates nothing.
 *
 * ## Why nothing scrolls the learner
 *
 * An earlier revision nudged the topology into view on every event. With the
 * control now at the bottom, that would have dragged the learner back up to the
 * picture every time they pressed it — the exact shuttle this structure exists
 * to remove. There is no programmatic scrolling here at all, and the gate
 * asserts there is none.
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
        <p className="packet-journey-source">{view.sourceNotice}</p>
        <p className="packet-journey-traffic">{view.trafficSummary}</p>

        {/*
          The picture and the statement of what just happened, as one unit.

          In the expanded workspace this block is sticky, so it stays on screen
          while the learner works through the controls beneath it. That is the
          other half of the synchronisation fix: the topology cannot scroll away
          while the learner is pressing the control that changes it.
        */}
        <div className="packet-journey-visual">
          <TopologyView
            layout={topology}
            selectedNodeId={selectedNodeId}
            inspectorId={inspectorId}
            eventToken={event.token}
            onSelect={(nodeId) =>
              setSelectedNodeId(nodeId === selectedNodeId ? null : nodeId)
            }
          />

          {/*
            What just happened, directly under the picture it happened in. The
            headline is the glanceable half; the live region below it carries
            the authored narration and is the one thing assistive technology is
            told about on every change.
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
            <p key={event.token} className="packet-journey-event-headline">
              {event.headline}
            </p>

            {/*
              The connection crossed, in words. The wire that lights up is
              decorative and hidden, so without this sentence that fact would
              exist only in the picture.
            */}
            {event.via !== null && (
              <p className="packet-journey-event-via">Across {event.via}</p>
            )}

            <p
              role="status"
              aria-live="polite"
              className="packet-journey-announcement"
            >
              {view.announcement}
            </p>
          </section>
        </div>

        {/* What has happened so far. */}
        {view.stages.length > 0 && (
          <>
            <h5>What happened</h5>
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
          </>
        )}

        {/* ------------------------------------------------------------ *
            What to do next.

            Everything the learner acts on, immediately after the last thing
            they read. This block used to sit ABOVE the journey history, and
            Founder UAT found the consequence: once the history had grown to
            Router-1, continuing meant scrolling up to the control, clicking,
            scrolling back down to read the result, and scrolling up again —
            once per remaining stage.

            The next action now belongs to the latest event, because it is
            directly beneath it. The learner reads and acts in one direction.

            There is exactly ONE progression control, here. The topology stays
            perceivable while they work through this because the visual block
            above is sticky, not because a second button was added.
         * ------------------------------------------------------------ */}
        <div className="packet-journey-next">
          {view.symptom !== null && (
            <p className="packet-journey-symptom">{view.symptom}</p>
          )}

          {view.explanation !== null && (
            <p className="packet-journey-explanation">{view.explanation}</p>
          )}

          {view.inspectionPrompt !== null && (
            <p className="instruction-note">{view.inspectionPrompt}</p>
          )}

          {/*
            A commitment the learner has made but not yet observed.

            It appears the instant the prediction is committed and stays until
            the stage it is about is revealed, so committing can never look like
            the interaction discarded the answer and started over.
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
            <fieldset className="packet-journey-prediction">
              <legend>{prediction.prompt}</legend>
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

          {/* The end of the road, where the learner finishes reading. */}
          {view.confirmation !== null && (
            <p className="packet-journey-confirmation">{view.confirmation}</p>
          )}
        </div>
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
          The inspector. Always present, because the device buttons name it
          through `aria-controls`, and a reference to an element that sometimes
          does not exist is a broken reference.
        */}
        <section
          id={inspectorId}
          className="packet-journey-inspector"
          aria-label="Device inspector"
        >
          {selectedNode === undefined || selectedDevice === undefined ? (
            <p className="instruction-note">
              Select a device above to inspect its interfaces and connections.
            </p>
          ) : (
            <>
              <h5>
                {selectedNode.label} — {selectedNode.roleLabel}
              </h5>
              <p className="packet-journey-inspector-state">
                {selectedDevice.stateLabel}
              </p>

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
            </>
          )}
        </section>

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
        {state.progress.revealedStageCount > 0 && (
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
