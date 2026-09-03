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
import networkingFoundations from "../../../../content/curriculum/networking-foundations.json";

/**
 * WP-I — the development-only UAT surface.
 *
 * ## What this is
 *
 * A viewport onto the real instructional pipeline. It parses a curriculum
 * document with the real curriculum parser, projects it with the real learner
 * projection, and renders it with the real `MissionInstruction` — which
 * dispatches to the real `InteractionSurface` and `PacketJourney`.
 *
 * A reviewer looking at this is looking at production components fed production
 * contracts. Nothing below draws a step, and nothing below knows what a packet
 * journey is.
 *
 * ## Two documents, and why the real one is here
 *
 * WP-J Module 1 added the production Networking Foundations document alongside
 * the architecture fixture. That was the point of the slice: the fixture proves
 * the CONTRACT works, and only real authored curriculum can be reviewed for
 * whether it TEACHES. Copying Module 1 into a second fixture would have created
 * a second curriculum truth that drifts the moment either side changes, so the
 * authored file is read directly.
 *
 * ## Why both are imported HERE and not in the entry path
 *
 * `App.tsx` reaches this module through a `lazy(() => import(...))` that exists
 * only inside an `import.meta.env.DEV` branch. In a production build Vite
 * replaces that with `false`, the branch folds away, the dynamic import
 * disappears, and neither this component nor either document is emitted.
 *
 * A static import of any of them in `App.tsx` would defeat that and ship
 * curriculum inside the learner bundle. `scripts/verify-wpi.sh` asserts both
 * halves — the guard here and the absence of a static import there — and, when
 * a build is present, greps the emitted bundle for fixture AND Networking
 * Foundations markers. `scripts/verify-wpj15.sh` asserts the same from the
 * other direction, because that bundle check is what pays for its source rule
 * excluding this directory.
 *
 * ## Which document is being reviewed, and says so
 *
 * The banner is not decoration, and it is not the same sentence for both. The
 * architecture fixture was written to exercise the CONTRACT rather than to
 * teach, so its banner tells a reviewer not to judge teaching quality —
 * otherwise fixture weaknesses get reported as platform defects. Carrying that
 * sentence onto real curriculum would be exactly wrong, so the production
 * document says the opposite: teaching quality IS what is under review. The
 * runbook's finding classification depends on the reviewer knowing which one
 * they are looking at.
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

/**
 * The documents a reviewer may open.
 *
 * ## Why two, and why the second is the REAL one
 *
 * The fixture exercises the contract; it was never written to teach. Judging
 * instructional quality against it would produce findings about a test artefact.
 * So the production Networking Foundations document is offered here directly —
 * the same file the publication command reads, parsed by the same parser and
 * projected by the same projection.
 *
 * It is deliberately NOT copied into a second UAT fixture. A copy would drift
 * from the authored course the moment either changed, and a reviewer would be
 * approving text that no learner will ever receive.
 *
 * ## Why the notice differs per document
 *
 * The fixture's banner tells a reviewer NOT to judge teaching quality. Carrying
 * that sentence over to real curriculum would be exactly wrong: for Networking
 * Foundations the teaching quality is the thing under review, and only the
 * Founder can rule on it.
 */
const UAT_DOCUMENTS = [
  {
    key: "networking-foundations",
    label: "Networking Foundations",
    subtitle: "Production curriculum — Module 1",
    value: networkingFoundations,
    isProduction: true
  },
  {
    key: "architecture-fixture",
    label: "Architecture fixture",
    subtitle: "Contract exercise — not curriculum",
    value: fixture,
    isProduction: false
  }
] as const;

type UatDocumentKey = (typeof UAT_DOCUMENTS)[number]["key"];

export function UatHarness() {
  const [documentKey, setDocumentKey] =
    useState<UatDocumentKey>("networking-foundations");

  const selectedDocument =
    UAT_DOCUMENTS.find((entry) => entry.key === documentKey) ??
    UAT_DOCUMENTS[0];

  const outcome = loadUatDocument(selectedDocument.value);

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
          <h1>{selectedDocument.label} does not parse</h1>
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

        {selectedDocument.isProduction ? (
          <p className="uat-notice" role="note">
            You are reviewing <strong>{selectedDocument.label}</strong>, the
            real production curriculum document — the same file the publication
            command reads, parsed and projected exactly as a learner would
            receive it. <strong>Teaching quality is in scope here.</strong> It
            has not been published to any database; this surface reads the
            authored file directly.
          </p>
        ) : (
          <p className="uat-notice" role="note">
            You are reviewing the <strong>architecture fixture</strong>, which
            exists to exercise the curriculum contract rather than to teach
            well. Judge the platform here; judge teaching quality on the
            production document instead.
          </p>
        )}

        <div className="uat-controls">
          <p
            className="uat-control-group"
            role="group"
            aria-labelledby="uat-document-label"
          >
            <span id="uat-document-label" className="uat-control-label">
              Document
            </span>
            {UAT_DOCUMENTS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={documentKey === entry.key}
                onClick={() => {
                  setDocumentKey(entry.key);
                  // A mission id from the previous document names nothing in
                  // this one, and a stale selection would surface as the
                  // projection's content_error — a real fail-closed state
                  // reported for an unreal reason.
                  setMissionStableId(null);
                  setResetKey((key) => key + 1);
                }}
              >
                {entry.label} — {entry.subtitle}
              </button>
            ))}
          </p>

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
          Showing <strong>{selectedDocument.label}</strong> /{" "}
          <strong>{selected ?? "no mission"}</strong> at{" "}
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
