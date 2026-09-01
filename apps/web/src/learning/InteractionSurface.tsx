import type { LearnerInteractionStep } from "@tlp/shared-types";
import { PacketJourney } from "./PacketJourney";
import {
  describeUnsupportedInteraction,
  describeWithheldInteraction
} from "./packet-journey-presentation";

/**
 * WP-H — mapping a validated interaction type to its component.
 *
 * ## This is a renderer mapping, not a second registry
 *
 * CURR-011 section 7 is explicit about the difference. The vocabulary, the
 * parameter contract and the `ObservationModel` live in
 * `packages/shared-types`; publication refuses anything the registry does not
 * know. By the time a type reaches this file it has already been validated
 * server-side, and all that remains is choosing a component for it.
 *
 * So there is no registration call, no lookup of a name into user-supplied
 * code, and nothing dynamic. The mapping is a `switch`, which means a
 * registered type with no component is a compile error rather than a lesson
 * that silently renders nothing.
 *
 * ## Both no-render states are honest, and neither leaks
 *
 * `withheld` is the support level doing its job: the server sent no
 * parameters, so there is nothing here to hide and nothing a learner could
 * read out of the response. CURR-011 section 11 records that a teaching
 * simulation which would reveal the solution is instructional assistance, and
 * PROVE IT withholds assistance.
 *
 * The unsupported case reports the defect and renders nothing else. CURR-011
 * section 16: it "never falls back to raw payload output" — dumping the
 * authored structure would put a data structure in front of a learner and
 * could expose authored content the presentation had no component to gate.
 */
export function InteractionSurface({
  content,
  instanceId
}: {
  content: LearnerInteractionStep;
  instanceId: string;
}) {
  if (content.presentation.state === "withheld") {
    return (
      <p className="instruction-note">{describeWithheldInteraction()}</p>
    );
  }

  const parameters = content.presentation.parameters;

  switch (parameters.interactionType) {
    case "packet_journey":
      return (
        <PacketJourney
          parameters={parameters}
          instanceId={instanceId}
          // Sequencing input, not an authorization input. The server has
          // already decided what `parameters` contains; this only decides how
          // much the learner is asked to do before seeing the next authored
          // observation. Nothing downstream can reveal what is not here.
          supportLevel={content.supportLevel}
        />
      );
    default:
      // Unreachable while every registered type has a component above. It
      // stays because "unreachable" is a claim about today's registry, and the
      // honest failure is a reported defect rather than a blank area.
      return (
        <p className="instruction-note">{describeUnsupportedInteraction()}</p>
      );
  }
}
