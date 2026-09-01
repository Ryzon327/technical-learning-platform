import { useState } from "react";
import {
  INTERACTION_SUPPORT_LEVELS,
  type InteractionSupportLevel
} from "@tlp/shared-types";
import { MissionInstruction } from "../learning/MissionInstruction";
import {
  buildUatInstruction,
  listUatMissions,
  loadUatDocument
} from "./uat-instruction";
import fixture from "../../../../content/fixtures/curriculum-architecture-example.json";

/**
 * WP-I — the development-only UAT surface.
 *
 * ## What this is
 *
 * A viewport onto the real instructional pipeline. It parses the architecture
 * fixture with the real curriculum parser, projects it with the real learner
 * projection, and renders it with the real `MissionInstruction` — which
 * dispatches to the real `InteractionSurface` and `PacketJourney`.
 *
 * A reviewer looking at this is looking at production components fed production
 * contracts. Nothing below draws a step, and nothing below knows what a packet
 * journey is.
 *
 * ## Why the fixture is imported HERE and not in the entry path
 *
 * `App.tsx` reaches this module through a `lazy(() => import(...))` that exists
 * only inside an `import.meta.env.DEV` branch. In a production build Vite
 * replaces that with `false`, the branch folds away, the dynamic import
 * disappears, and neither this component nor the fixture is emitted.
 *
 * A static import of either in `App.tsx` would defeat that and ship fixture
 * curriculum inside the learner bundle. `scripts/verify-wpi.sh` asserts both
 * halves — the guard here and the absence of a static import there — and, when
 * a build is present, greps the emitted bundle for fixture markers.
 *
 * ## This is not learner curriculum, and says so
 *
 * The banner is not decoration. The architecture fixture was written to
 * exercise the CONTRACT, not to teach well, and a reviewer has to know that
 * before judging what they read — otherwise authored-content weaknesses get
 * reported as platform defects. The runbook's finding classification depends on
 * the same distinction.
 *
 * ## What this component deliberately cannot do
 *
 * No Supabase client, no API client, no token, no fetch, no persistence, no
 * progress, no evidence, no AI, and no networking calculation. It holds two
 * pieces of selection state and a remount key, and nothing else.
 */

const SUPPORT_LEVEL_LABELS: Readonly<Record<InteractionSupportLevel, string>> = {
  show_me: "SHOW ME",
  help_me: "HELP ME",
  ask_me: "ASK ME",
  challenge_me: "CHALLENGE ME",
  prove_it: "PROVE IT"
};

export function UatHarness() {
  const outcome = loadUatDocument(fixture);

  const [missionStableId, setMissionStableId] = useState<string | null>(null);
  const [supportLevel, setSupportLevel] =
    useState<InteractionSupportLevel>("show_me");
  // Bumping this remounts the instruction subtree, which resets the interaction
  // to its initial state. The interaction owns its own progress, so remounting
  // is the honest reset — nothing reaches in and mutates it.
  const [resetKey, setResetKey] = useState(0);

  if (outcome.state === "invalid") {
    return (
      <main className="shell">
        <section className="card" role="alert">
          <p className="eyebrow">Development UAT surface</p>
          <h1>The architecture fixture does not parse</h1>
          <p>
            The real curriculum parser refused this document. Nothing is
            rendered, because anything shown would be assembled from the parts
            that happened to survive.
          </p>
          <ul>
            {outcome.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  const missions = listUatMissions(outcome.document);
  const selected = missionStableId ?? missions[0]?.stableId ?? null;
  const selectedMission = missions.find(
    (mission) => mission.stableId === selected
  );
  const instruction =
    selected === null
      ? null
      : buildUatInstruction(outcome.document, selected, supportLevel);

  return (
    <main className="shell">
      <section className="card" aria-labelledby="uat-title">
        <p className="eyebrow">Development UAT surface</p>
        <h1 id="uat-title">Instructional review harness</h1>

        <p className="uat-notice" role="note">
          This is a development and UAT surface, not learner curriculum. It
          renders the <strong>architecture fixture</strong>, which exists to
          exercise the curriculum contract rather than to teach well. Judge the
          platform here; judge teaching quality only once real curriculum is
          authored.
        </p>

        <div className="uat-controls">
          <p className="uat-control-group" role="group" aria-labelledby="uat-mission-label">
            <span id="uat-mission-label" className="uat-control-label">
              Mission
            </span>
            {missions.map((mission) => (
              <button
                key={mission.stableId}
                type="button"
                aria-pressed={selected === mission.stableId}
                onClick={() => {
                  setMissionStableId(mission.stableId);
                  setResetKey((key) => key + 1);
                }}
              >
                {mission.title} ({mission.stepCount} steps
                {mission.hasInteraction ? ", interaction" : ""})
              </button>
            ))}
          </p>

          <p className="uat-control-group" role="group" aria-labelledby="uat-level-label">
            <span id="uat-level-label" className="uat-control-label">
              Support level
            </span>
            {INTERACTION_SUPPORT_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={supportLevel === level}
                onClick={() => {
                  setSupportLevel(level);
                  setResetKey((key) => key + 1);
                }}
              >
                {SUPPORT_LEVEL_LABELS[level]}
              </button>
            ))}
          </p>

          <p className="uat-control-group">
            <button type="button" onClick={() => setResetKey((key) => key + 1)}>
              Reset the interaction
            </button>
          </p>
        </div>

        <p className="uat-state">
          Showing <strong>{selected ?? "no mission"}</strong> at{" "}
          <strong>{SUPPORT_LEVEL_LABELS[supportLevel]}</strong>.
        </p>

        {/*
          A reviewer aid, and deliberately only that.

          A `prediction` step renders a prompt and a list of options with
          nothing selectable, because it is read-only by design. On screen that
          is indistinguishable from a question that has broken, and Founder UAT
          reported it as exactly that.

          Saying so here costs nothing and changes nothing: no learner sees this
          surface, the step architecture is untouched, and how predictions are
          authored inside a real lesson stays WP-J's decision. The alternative —
          making the fixture interactive to stop it looking broken — would be
          changing the product to suit the test.
        */}
        {selectedMission?.hasPassivePrediction === true && (
          <p className="uat-notice" role="note">
            <strong>Renderer example — no response required.</strong> This
            mission contains a read-only <strong>prediction step</strong>: a
            prompt with a list of options and nothing to select. That is what
            the step type does today, not a broken control. The interactive
            prediction you can commit to lives inside the Packet Journey.
          </p>
        )}
      </section>

      <section className="card" aria-label="Rendered mission instruction">
        {instruction === null && <p>No mission is selected.</p>}

        {instruction?.state === "content_error" && (
          <p role="alert">
            The learner projection reported this mission&apos;s content as
            unavailable. That is the real fail-closed behaviour, not a harness
            limitation.
          </p>
        )}

        {instruction?.state === "legacy_brief" && (
          <p>
            This mission has no authored steps, so the learner would receive the
            legacy brief: {instruction.description}
          </p>
        )}

        {instruction?.state === "available" && selected !== null && (
          <MissionInstruction
            key={`${selected}-${supportLevel}-${resetKey}`}
            steps={instruction.steps}
            assets={instruction.assets}
            missionStableId={selected}
          />
        )}
      </section>
    </main>
  );
}

export default UatHarness;
