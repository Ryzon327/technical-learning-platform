import { useState } from "react";
import type { LearnerPacketJourneyParameters } from "@tlp/shared-types";
import {
  INITIAL_PACKET_JOURNEY_VIEW_STATE,
  advance,
  applyAction,
  buildPacketJourneyView,
  commitPrediction,
  resetJourney,
  type PacketJourneyViewState
} from "./packet-journey-presentation";

/**
 * WP-H — the Packet Journey interaction.
 *
 * ## One semantic tree, not two presentations
 *
 * CURR-011 section 14.6 forbids a second simulation, and section 14.1 requires
 * a learner who cannot use the visual representation to inspect the same
 * state, take the same action, receive the same consequence and carry on
 * troubleshooting.
 *
 * The way that is guaranteed here is structural: **the semantic tree IS the
 * interaction.** Topology, state, journey, controls and consequence are all
 * ordinary headings, lists, description lists and buttons. The only visual
 * addition is a decorative strip marked `aria-hidden`, which carries no
 * information of its own and can be deleted without the interaction losing
 * anything.
 *
 * There is therefore no accessible "alternative" to drift from the real one,
 * because there is only one.
 *
 * ## No disabled controls
 *
 * A control is rendered when it can be used and absent when it cannot. A
 * disabled button reads as a broken feature and gives a keyboard user
 * something to land on that does nothing.
 *
 * ## No networking, and no state that is not authored
 *
 * Every fact rendered below comes from `buildPacketJourneyView`, which reads
 * the shared `ObservationModel`. Nothing in this file decides where traffic
 * goes, whether it arrives, or whether the learner was right. `useState` here
 * holds only where the learner is in the AUTHORED sequence — it cannot change
 * an outcome, because every outcome was authored before the learner arrived.
 *
 * ## Motion
 *
 * Motion is CSS only, and the stylesheet disables it under
 * `prefers-reduced-motion`. No branch in this file depends on motion, so a
 * reduced-motion learner receives the identical markup, the identical
 * information and the identical controls.
 */
export function PacketJourney({
  parameters,
  instanceId
}: {
  parameters: LearnerPacketJourneyParameters;
  /** Namespaces radio-group names so two interactions cannot collide. */
  instanceId: string;
}) {
  const [state, setState] = useState<PacketJourneyViewState>(
    INITIAL_PACKET_JOURNEY_VIEW_STATE
  );
  const [choice, setChoice] = useState<string | null>(null);

  const view = buildPacketJourneyView(parameters, state);
  const prediction = view.pendingPrediction;

  return (
    <div className="packet-journey">
      <p className="packet-journey-source">{view.sourceNotice}</p>
      <p className="packet-journey-traffic">{view.trafficSummary}</p>

      {/* The network, as inspectable state. Primary content. */}
      <h5>The network</h5>
      <ul className="packet-journey-nodes">
        {view.nodes.map((node) => (
          <li
            key={node.nodeId}
            className={
              node.current ? "packet-journey-node is-current" : "packet-journey-node"
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

      <h5>Connections</h5>
      <ul className="packet-journey-links">
        {view.links.map((link) => (
          <li key={link.linkId}>{link.label}</li>
        ))}
      </ul>

      {/*
        Decorative only. Every fact it shows is already above and below in
        text, so removing it costs a learner nothing.
      */}
      <div className="packet-journey-map" aria-hidden="true">
        {view.nodes.map((node) => (
          <span
            key={node.nodeId}
            className={node.current ? "map-node is-current" : "map-node"}
          >
            {node.label}
          </span>
        ))}
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
                {stage.committedPrediction !== undefined && (
                  <p className="packet-journey-committed">
                    You predicted: {stage.committedPrediction}
                  </p>
                )}
                <p>{stage.narration}</p>
                {stage.decision !== undefined && (
                  <p className="packet-journey-why">{stage.decision}</p>
                )}
                {/* The outcome in words, never by colour alone. */}
                <p className="packet-journey-outcome">{stage.outcomeLabel}</p>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Announced to assistive technology whenever the journey changes. */}
      <p role="status" aria-live="polite" className="packet-journey-announcement">
        {view.announcement}
      </p>

      {view.symptom !== null && (
        <p className="packet-journey-symptom">{view.symptom}</p>
      )}

      {view.explanation !== null && (
        <p className="packet-journey-explanation">{view.explanation}</p>
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
                setState(commitPrediction(state, prediction.stageId, choice));
                setChoice(null);
              }}
            >
              Commit this prediction
            </button>
          )}
        </fieldset>
      )}

      {/* Reveal the next authored observation. */}
      {view.canAdvance && (
        <button type="button" onClick={() => setState(advance(state, parameters))}>
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
        The journey stopped and this support level sent no remediation. Saying
        so is better than a dead end, and it reveals nothing: the component
        never received the authored fixes.
      */}
      {view.remediationWithheld !== null && (
        <p className="instruction-note">{view.remediationWithheld}</p>
      )}

      {view.confirmation !== null && (
        <p className="packet-journey-confirmation">{view.confirmation}</p>
      )}

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

      {state.progress.revealedStageCount > 0 && (
        <button type="button" onClick={() => setState(resetJourney())}>
          Start over
        </button>
      )}
    </div>
  );
}
