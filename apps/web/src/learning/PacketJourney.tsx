import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import type { LearnerPacketJourneyParameters } from "@tlp/shared-types";
import {
  INITIAL_PACKET_JOURNEY_VIEW_STATE,
  activeJourneyBeat,
  advance,
  answerKnowledgeCheck,
  applyAction,
  buildPacketJourneyView,
  commitPrediction,
  describeObservationLabel,
  describePredictionLabel,
  describeUnobservedCommitment,
  describeWorkspaceCollapseLabel,
  describeWorkspaceExpandLabel,
  resetJourney,
  resolveJourneyBeats,
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
 * exactly one `buildPacketJourneyView` call. Expanding or collapsing the workspace
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
 * are looking at, and whether the workspace is expanded — none of which can change
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
  const [checkChoice, setCheckChoice] = useState<string | null>(null);

  /* ------------------------------------------------------------------ *
     How far the learner has read at this journey state.

     The ONLY state the beat model adds. Which beats exist is derived from the
     view by `resolveJourneyBeats`, so this cannot drift from the journey — and
     it is reset by `currentEvent.token`, which the journey already moves on
     every observable change. A reveal, a commitment, a remediation: each puts
     the learner back at the first beat of the new state, which is the one
     describing what just happened.
   * ------------------------------------------------------------------ */
  const [beatIndex, setBeatIndex] = useState(0);
  const [beatToken, setBeatToken] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------ *
     Where the learner looks after they answer.

     Founder UAT, second round: "after answering a question, the interface
     moves them back upward and they end up re-reading their answer, other
     material, then eventually the actual next lesson content."

     There was no programmatic focus at all, which is why. Committing a
     prediction re-rendered the pane, the browser kept focus on a control that
     had just been replaced, and the learner was left at whatever the page
     happened to scroll to — above the result, every time.

     So every control that produces a NEW OBSERVATION moves focus to the
     "What happened" heading. That heading is `tabIndex={-1}`: reachable
     programmatically, never a tab stop of its own, and announced by a screen
     reader when focus lands on it — so the same fix serves sighted and
     non-sighted learners with one mechanism rather than two.

     `block: "nearest"` scrolls the minimum needed rather than yanking the
     heading to the top of the viewport, and `preventScroll` is not used
     because the scroll is the point. Movement is skipped entirely when the
     element is already in view, which `scrollIntoView` handles itself.
   * ------------------------------------------------------------------ */
  const resultRef = useRef<HTMLHeadingElement>(null);

  const moveToBeat = useCallback(() => {
    // After React has committed the new observation, never before it.
    requestAnimationFrame(() => {
      const heading = resultRef.current;
      if (heading === null) return;

      heading.focus();
      heading.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, []);

  const sequencing = resolveSequencing(supportLevel);
  const view = buildPacketJourneyView(parameters, state, sequencing);
  const prediction = view.pendingPrediction;
  const event = view.currentEvent;


  /*
    The beats available at this journey state, and the one the learner is on.

    Derived on every render, so the list can never describe a state the journey
    has left. The index is reset here rather than in an effect: an effect would
    render one frame showing the previous beat for the new state, which is the
    flicker the single-focus pane exists to avoid.
  */
  const beats = resolveJourneyBeats(view);

  if (beatToken !== event.token) {
    setBeatToken(event.token);
    setBeatIndex(0);
  }

  const beat = activeJourneyBeat(beats, beatIndex);

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
        it expands the workspace, and it is then the first control inside it.

        EXPAND and COLLAPSE, not open and close. Founder video UAT read "Open
        the network workspace" while the workspace was already on screen.
        Nothing is hidden behind this control — the same tree is re-laid out at
        a different size — so "open" promised to reveal something already
        visible.

        It carries no `aria-expanded`. Every other disclosure control in this
        package pairs that attribute with `aria-controls` naming the region it
        governs, and there is no such region here: this button is INSIDE the
        dialog it expands, so it would have to point at its own ancestor. The
        state is announced instead by the thing that actually changes — the
        container becomes `role="dialog"` with `aria-modal` — and by the label,
        which names the action that will happen next.
      */}
      <button
        type="button"
        className="packet-journey-workspace-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? describeWorkspaceCollapseLabel()
          : describeWorkspaceExpandLabel()}
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
          {/* ------------------------------------------------------------ *
              THE WORKSPACE — the learner's network, and it stays put.

              Persistent by design (DEC-065). The topology is never remounted
              between beats, so a learner keeps their mental map while the
              instruction beside it advances. Inspection lives here too,
              because inspecting a device is a question about the network
              rather than a step in the lesson.
           * ------------------------------------------------------------ */}
          <div className="packet-journey-workspace">
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
                    EXPLORE — the same authored state the Instructor pane is
                    already showing, for a learner who came looking at this
                    device specifically.

                    Supplemental by design. The instruction lives in the
                    Instructor pane; this is the copy you find if you click.
                    Both read `shownFacts` from one resolution, so the two
                    surfaces cannot drift apart or disagree.
                  */}
                  {selectedNode.shownFacts !== undefined && (
                    <div className="packet-journey-inspector-knows">
                      <h6 className="packet-journey-knows-label">
                        {selectedNode.shownFacts.label}
                      </h6>
                      <dl className="packet-journey-knows-facts">
                        {selectedNode.shownFacts.facts.map((fact) => (
                          <div key={`${fact.label} ${fact.value}`}>
                            <dt>{fact.label}</dt>
                            <dd>{fact.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}

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
          {/* ------------------------------------------------------------ *
              THE INSTRUCTOR PANE — one beat at a time.

              Founder UX ruling (DEC-065): the five named regions were an
              improvement on the original stream and still put the question,
              the answer, the observation, the reason and the next control on
              screen together. The learner was reading a dashboard of lesson
              state instead of following a lesson.

              So the workspace splits. The topology stays on the left,
              persistent and never remounted, because it is the thing being
              reasoned about and losing it costs the learner their mental map.
              This side shows exactly ONE beat.

              Which beat is DERIVED — `resolveJourneyBeats` is a pure function
              of the view, so there is no second progression engine to disagree
              with `canAdvance`, and nothing is stored twice. The component
              holds one number: how far the learner has read at this journey
              state. `currentEvent.token` already moves on every observable
              change, so it is what resets that number.

              Everything already read is in the history below, closed.
           * ------------------------------------------------------------ */}
          <div className="packet-journey-instructor">
            {/*
              Progression, announced.

              Never unmounted, at any point in the journey — including before
              the learner starts. A live region that appears and disappears
              risks a missed or a duplicated announcement, so it lives OUTSIDE
              the beat card, which does change.

              It carries the authored narration of what changed. Focus moving
              to the new beat's heading tells a screen-reader learner WHERE
              they now are; this tells them WHAT happened in the network, and
              the two are different facts.
            */}
            <p
              role="status"
              aria-live="polite"
              className="packet-journey-announcement"
            >
              {view.announcement}
            </p>

            <section
              className={`packet-journey-beat is-${beat?.kind ?? "start"}`}
              aria-labelledby={`${instanceId}-beat`}
            >
              {/*
                WHERE AM I — the device, before the sentence about it.

                Founder ruling, Mission 8 refinement: when the instruction moves
                to a device the learner should be oriented immediately, not left
                to infer the location from body prose. It uses the pane's
                existing type hierarchy; nothing new was invented for it.

                It is `aria-hidden` because the heading below already begins
                with the same device name — a screen reader would otherwise
                announce "PC-A. PC-A — deciding how to send the packet."
              */}
              {beat?.device != null && (
                <p className="packet-journey-beat-device" aria-hidden="true">
                  {beat.device}
                </p>
              )}

              <h5
                className="packet-journey-beat-heading"
                id={`${instanceId}-beat`}
                ref={resultRef}
                tabIndex={-1}
              >
                {beat?.heading ?? view.orientation.title}
              </h5>

              {/*
                THE NETWORK'S PROGRESS, NOT THE PANE'S.

                Founder video UAT saw "Step 1 of 3" restart whenever a
                presentation sub-beat appeared, because the number counted
                beats. A beat is a screen; a journey stage is something the
                network did. Only a stage observation carries a number now, and
                a beat that is not a stage shows none.
              */}
              {beat?.journeyStep != null && (
                <p className="packet-journey-beat-progress">
                  {`Journey step ${beat.journeyStep.current} of ${beat.journeyStep.total}`}
                </p>
              )}

              {(beat?.body ?? []).map((line) => (
                <p key={line} className="packet-journey-beat-body">
                  {line}
                </p>
              ))}

              {/* Optional depth. Never required to follow the thread. */}
              {beat?.more != null && (
                <details className="packet-journey-why-disclosure">
                  <summary>Explain more</summary>
                  <p className="packet-journey-why">{beat.more}</p>
                </details>
              )}

              {/* ---------------------------------------------------------- *
                  The beat's own control, when it owns one.

                  Exactly one control is primary at any moment, and its label
                  says what pressing it will do — Founder UAT: "button language
                  must accurately describe what the learner will get."
               * ---------------------------------------------------------- */}
              {beat?.kind === "start" && view.startAction !== null && (
                <button
                  type="button"
                  className="packet-journey-start-action"
                  onClick={() => {
                    setState(startJourney(state));
                    moveToBeat();
                  }}
                >
                  {view.startAction.label}
                </button>
              )}

              {beat?.kind === "question" && prediction !== null && (
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
                      className="packet-journey-prediction-submit"
                      onClick={() => {
                        // The parameters are passed so committing also
                        // REVEALS: predict, then observe, with nothing in
                        // between. See `commitPrediction`.
                        setState(
                          commitPrediction(
                            state,
                            prediction.stageId,
                            choice,
                            parameters
                          )
                        );
                        setChoice(null);
                        moveToBeat();
                      }}
                    >
                      Submit this prediction
                    </button>
                  )}
                </fieldset>
              )}

              {beat?.kind === "question" &&
                prediction === null &&
                view.knowledgeCheck !== null && (
                  <fieldset className="packet-journey-prediction is-check">
                    <legend className="packet-journey-prediction-question">
                      {view.knowledgeCheck.prompt}
                    </legend>

                    <div className="packet-journey-options">
                      {view.knowledgeCheck.options.map((option) => (
                        <label key={option} className="packet-journey-option">
                          <input
                            type="radio"
                            name={`${instanceId}-check`}
                            value={option}
                            checked={checkChoice === option}
                            onChange={() => setCheckChoice(option)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>

                    {checkChoice !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          setState(
                            answerKnowledgeCheck(
                              state,
                              view.knowledgeCheck?.checkId ?? "",
                              checkChoice
                            )
                          );
                          setCheckChoice(null);
                          moveToBeat();
                        }}
                      >
                        Submit this answer
                      </button>
                    )}
                  </fieldset>
                )}

              {beat?.kind === "action" && (
                <div className="packet-journey-actions">
                  {view.actions.map((action) => (
                    <button
                      key={action.actionId}
                      type="button"
                      disabled={!action.available}
                      onClick={() => {
                        /*
                          `action.available` is the model still offering a
                          choice here, which it does after a change that did
                          not repair the fault and stops doing once one has.
                          Passing it lets the learner try again — and it is
                          NOT the answer key, which this component may not
                          read.
                        */
                        setState(
                          applyAction(state, action.actionId, action.available)
                        );
                        moveToBeat();
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}

              {view.remediationWithheld !== null && beat?.kind === "symptom" && (
                <p className="instruction-note">{view.remediationWithheld}</p>
              )}

              {/* ---------------------------------------------------------- *
                  Moving on.

                  Two different controls, deliberately. CONTINUE walks the
                  beats already available at this journey state — reading, not
                  progress. The authored advance control is what moves the
                  NETWORK, and it only appears on the last beat, so pressing it
                  is always the thing that changes the picture.
               * ---------------------------------------------------------- */}
              <div className="packet-journey-beat-controls">
                {beatIndex > 0 && (
                  <button
                    type="button"
                    className="packet-journey-beat-back"
                    onClick={() => setBeatIndex((index) => index - 1)}
                  >
                    Previous step
                  </button>
                )}

                {/*
                  CONTINUE reads on. It walks the beats already available at
                  this journey state and changes nothing in the network, so it
                  is deliberately NOT the progression control — a learner who
                  cannot tell "read the next thing" from "move the traffic" has
                  two primary buttons and no idea which is live.
                */}
                {beatIndex < beats.length - 1 && (
                  <button
                    type="button"
                    className="packet-journey-continue"
                    onClick={() => {
                      setBeatIndex((index) => index + 1);
                      moveToBeat();
                    }}
                  >
                    Continue
                  </button>
                )}

                {beatIndex === beats.length - 1 &&
                  view.canAdvance &&
                  beat?.kind !== "question" &&
                  beat?.kind !== "action" && (
                    <button
                      type="button"
                      className="packet-journey-advance"
                      onClick={() => {
                        setState(advance(state, parameters, sequencing));
                        moveToBeat();
                      }}
                    >
                      {view.advanceLabel}
                    </button>
                  )}
              </div>
            </section>

            {/* ---------------------------------------------------------- *
                QUICK REFERENCE — orientation, deliberately secondary.

                Founder UAT: "I did not notice the existing leg information
                because it was below the topology." Who is sending, what, to
                whom, where it is now, which connection — the questions asked
                at every step, beside the beat rather than under the drawing.

                Visually quieter than the beat and never a control: it answers
                orientation questions, it does not set tasks. Every value is
                copied from authored data, so a field the mission has not
                taught is simply not there.
             * ---------------------------------------------------------- */}
            {view.quickReference.length > 0 && (
              <section
                className="packet-journey-reference"
                aria-labelledby={`${instanceId}-reference`}
              >
                <h6
                  className="packet-journey-reference-label"
                  id={`${instanceId}-reference`}
                >
                  Quick reference
                </h6>
                <dl className="packet-journey-reference-rows">
                  {view.quickReference.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* ---------------------------------------------------------- *
                CURRENT NETWORK DETAILS — the state facts for this moment.

                These used to sit under the topology, in the workspace column.
                Founder UAT: "THIS LEG'S LOCAL DELIVERY", "WHAT ROUTER-1 SEES"
                and "WHAT ARRIVED" are journey state, not part of the picture,
                and putting them below the drawing made the left column a
                second thing to read while the instruction waited on the right.

                So they move here, BELOW the beat and BELOW the quick
                reference. That order is the requirement: instruction first,
                orientation second, detail third. The heading and the quieter
                treatment are what tell a learner this is supporting material
                rather than another step they have to complete.

                A definition list because that is the shape of the content — a
                device, and what it is showing — and because it gives assistive
                technology the pairing for free.

                Deliberately NOT a live region: the announcement above already
                says what changed, and a second region announcing the same
                change would say it twice.
             * ---------------------------------------------------------- */}
            {view.deviceFacts.length > 0 && (
              <section
                className="packet-journey-knows"
                aria-labelledby={`${instanceId}-details`}
              >
                <h6
                  className="packet-journey-reference-label"
                  id={`${instanceId}-details`}
                >
                  Current network details
                </h6>

                {view.deviceFacts.map((shown) => (
                  <div key={shown.nodeId} className="packet-journey-knows-block">
                    <p className="packet-journey-knows-label">{shown.label}</p>
                    <dl className="packet-journey-knows-facts">
                      {shown.facts.map((fact) => (
                        <div key={`${fact.label} ${fact.value}`}>
                          <dt>{fact.label}</dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </section>
            )}
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
