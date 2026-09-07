/**
 * WP-NF-NT1 — the embedded near-transfer check.
 *
 * ## What this is, and what it deliberately is not
 *
 * A near-transfer check asks the learner to apply a concept they have just been
 * taught to a DIFFERENT but structurally related situation, inline, before the
 * mission closes. It is substantive instructional curriculum.
 *
 * It is not any of the four things it could be mistaken for:
 *
 *   PREDICTION        commit to what will happen, before observing it. Lives on
 *                     a packet-journey stage; resolved by comparison, and graded
 *                     only where the learner could already reason it out.
 *   KNOWLEDGE CHECK   reason about the concept being taught RIGHT NOW. Also a
 *                     packet-journey stage field, because it is about the thing
 *                     on screen.
 *   PRACTICE          optional repetition AFTER instruction. `PracticeCheckPanel`
 *                     and the ROAS `AssessmentDefinition` bundle own it, and it
 *                     carries a standing promise that it is not recorded and does
 *                     not complete the mission.
 *   MASTERY/EVIDENCE  recorded attempts against competency requirements. Owned by
 *                     the Evidence Engine, and deferred for authoring by
 *                     Architect Decision 4.
 *
 * A near-transfer check is none of those. It is a mission step, it is required
 * before the mission's closing handoff, and it produces nothing — no score, no
 * percentage, no attempt, no evidence, no competency state.
 *
 * ## Why it is not an AssessmentDefinition
 *
 * Three reasons, each sufficient. `AssessmentDefinition` has no per-question
 * explanation, so the authored reasoning could not be shown. It has no scenario
 * or topology, so a question about a diagram could not display one. And it is
 * unpublishable through the curriculum tree (Architect Decision 4), so a
 * Networking Foundations mission cannot reach one at all.
 *
 * Reusing it would also import `passingPercent`, `points` and `maxAttempts` —
 * the vocabulary of a graded assessment — into something that must never grade.
 *
 * ## Correctness
 *
 * Authored, deterministic, and decided by set comparison against
 * `correctOptionIds`. No AI is consulted, here or anywhere downstream.
 */

export const NEAR_TRANSFER_QUESTION_TYPES = [
  "single_choice",
  "multiple_choice"
] as const;

export type NearTransferQuestionType =
  (typeof NEAR_TRANSFER_QUESTION_TYPES)[number];

export interface NearTransferOption {
  readonly optionId: string;
  readonly text: string;
}

export interface NearTransferQuestion {
  readonly questionStableId: string;
  readonly type: NearTransferQuestionType;
  readonly prompt: string;
  readonly options: readonly NearTransferOption[];
  /**
   * The authored answer. One id for `single_choice`; one or more for
   * `multiple_choice`, compared as an exact set.
   *
   * Answer-bearing. The learner projection lifts it out of the question and
   * into a separate `answers` map, so a renderer drawing a question cannot
   * reach the answer by accident. It is still in the payload — correctness is
   * decided in the browser and there is no per-question round trip — which is
   * acceptable here for the one reason it is acceptable for ROAS practice:
   * near-transfer records nothing, so reading the payload only cheats the
   * learner out of the exercise. Withholding it until commitment is a
   * PRESENTATION rule, held in `near-transfer-presentation.ts`.
   */
  readonly correctOptionIds: readonly string[];
  /** Why that answer is right. Shown after commitment, however they answered. */
  readonly explanation: string;
}

/**
 * A network the learner reads but does not watch.
 *
 * Nodes and links only — no stages, no traffic, no motion. It exists so a
 * question can be ABOUT something, and it is deliberately the same vocabulary
 * the observation model uses so one topology renderer serves both.
 */
export interface NearTransferTopologyNode {
  readonly nodeId: string;
  readonly label: string;
  readonly role: "host" | "switch" | "router" | "printer";
  /** Optional authored note, shown when the learner selects the device. */
  readonly about?: string;
}

export interface NearTransferTopologyLink {
  readonly linkId: string;
  readonly label: string;
  readonly endpoints: readonly [string, string];
}

/**
 * A network that continues past the edge of the diagram (WP-NF-NT1B).
 *
 * Authored, and drawn — which is the whole point of it. Mission 1's
 * near-transfer asks which device connects the local network to another
 * network, and before this existed the only answer was a sentence: the fact
 * was in the accessible text and nowhere in the picture. A sighted beginner
 * should not have to read prose to discover a topology fact.
 *
 * It is not a node. It has no role, no interfaces, nothing to inspect, and it
 * is not in `nodes` — so it can never be offered as an answer to "which
 * device…", and no question may name it as one. See
 * `ObservationExternalNetwork`, which is what the renderer receives.
 */
export interface NearTransferExternalNetwork {
  readonly networkId: string;
  readonly label: string;
  /** The device the diagram reaches it through. Must be a node above. */
  readonly attachedToNodeId: string;
}

export interface NearTransferTopology {
  readonly nodes: readonly NearTransferTopologyNode[];
  readonly links: readonly NearTransferTopologyLink[];
  /**
   * Networks past the edge of the diagram.
   *
   * Optional: a topology entirely contained in the picture declares none.
   */
  readonly externalNetworks?: readonly NearTransferExternalNetwork[];
  /**
   * The same relationships in words, for a learner who cannot see the drawing.
   *
   * Required whenever a topology is authored. A diagram whose meaning exists
   * only in pixels is not an accessible equivalent, and CURR-011 section 14
   * does not permit one.
   */
  readonly textEquivalent: string;
}

export interface NearTransferContent {
  readonly type: "near_transfer";
  readonly title?: string;
  /** Short instructional framing, shown above the scenario. */
  readonly framing?: string;
  readonly topology?: NearTransferTopology;
  readonly questions: readonly NearTransferQuestion[];
}

/* ------------------------------------------------------------------ *
 * Validation
 *
 * Reports through a collector, the same convention `curriculum-document.ts`
 * and `instruction-interaction.ts` follow, so one pass reports every problem.
 * ------------------------------------------------------------------ */

const CONTENT_KEYS = ["type", "title", "framing", "topology", "questions"] as const;
const QUESTION_KEYS = [
  "questionStableId",
  "type",
  "prompt",
  "options",
  "correctOptionIds",
  "explanation"
] as const;
const OPTION_KEYS = ["optionId", "text"] as const;
const TOPOLOGY_KEYS = [
  "nodes",
  "links",
  "externalNetworks",
  "textEquivalent"
] as const;
const EXTERNAL_NETWORK_KEYS = [
  "networkId",
  "label",
  "attachedToNodeId"
] as const;
const NODE_KEYS = ["nodeId", "label", "role", "about"] as const;
const LINK_KEYS = ["linkId", "label", "endpoints"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkKeys(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
  at: (message: string) => void
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    at(`${label} must be an object`);
    return false;
  }

  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      at(`${label} carries an unknown field "${key}"`);
    }
  }

  for (const key of required) {
    if (!(key in value)) at(`${label} is missing "${key}"`);
  }

  return true;
}

function reportDuplicates(
  ids: readonly string[],
  label: string,
  at: (message: string) => void
): void {
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) at(`${label} reuses the identifier "${id}"`);
    seen.add(id);
  }
}

/**
 * Every rule about an authored near-transfer check.
 *
 * The document parser calls this for the interior; it checks the shallow key
 * set itself, exactly as it does for an interaction's parameters.
 */
export function validateNearTransferContent(
  value: unknown,
  label: string
): readonly string[] {
  const errors: string[] = [];
  const at = (message: string): void => {
    errors.push(message);
  };

  if (!checkKeys(value, CONTENT_KEYS, ["type", "questions"], label, at)) {
    return errors;
  }

  if (value.type !== "near_transfer") {
    at(`${label}.type must be near_transfer`);
  }

  if (value.title !== undefined && !nonEmpty(value.title)) {
    at(`${label}.title is empty`);
  }
  if (value.framing !== undefined && !nonEmpty(value.framing)) {
    at(`${label}.framing is empty`);
  }

  /* --- the scenario ------------------------------------------------- */

  const nodeIds = new Set<string>();

  if (value.topology !== undefined) {
    const topologyLabel = `${label}.topology`;

    if (
      checkKeys(
        value.topology,
        TOPOLOGY_KEYS,
        ["nodes", "links", "textEquivalent"],
        topologyLabel,
        at
      )
    ) {
      const topology = value.topology;

      // A drawing whose meaning exists only in pixels is not an equivalent.
      if (!nonEmpty(topology.textEquivalent)) {
        at(
          `${topologyLabel}.textEquivalent is required: a learner who cannot see the diagram must receive the same relationships in words`
        );
      }

      if (!Array.isArray(topology.nodes) || topology.nodes.length === 0) {
        at(`${topologyLabel}.nodes must list at least one device`);
      } else {
        topology.nodes.forEach((node, index) => {
          const nodeLabel = `${topologyLabel}.nodes[${index}]`;
          if (!checkKeys(node, NODE_KEYS, ["nodeId", "label", "role"], nodeLabel, at)) {
            return;
          }
          if (!nonEmpty(node.nodeId)) at(`${nodeLabel}.nodeId is empty`);
          if (!nonEmpty(node.label)) at(`${nodeLabel}.label is empty`);
          if (node.about !== undefined && !nonEmpty(node.about)) {
            at(`${nodeLabel}.about is empty`);
          }
          if (
            typeof node.role !== "string" ||
            !["host", "switch", "router", "printer"].includes(node.role)
          ) {
            at(`${nodeLabel}.role must be host, switch, router or printer`);
          }
          if (typeof node.nodeId === "string") nodeIds.add(node.nodeId);
        });

        reportDuplicates(
          topology.nodes
            .map((node) => (isPlainObject(node) ? node.nodeId : undefined))
            .filter((id): id is string => typeof id === "string"),
          `${topologyLabel}.nodes`,
          at
        );
      }

      if (!Array.isArray(topology.links)) {
        at(`${topologyLabel}.links must be a list`);
      } else {
        topology.links.forEach((link, index) => {
          const linkLabel = `${topologyLabel}.links[${index}]`;
          if (
            !checkKeys(link, LINK_KEYS, ["linkId", "label", "endpoints"], linkLabel, at)
          ) {
            return;
          }
          if (!nonEmpty(link.linkId)) at(`${linkLabel}.linkId is empty`);
          if (!nonEmpty(link.label)) at(`${linkLabel}.label is empty`);

          if (!Array.isArray(link.endpoints) || link.endpoints.length !== 2) {
            at(`${linkLabel}.endpoints must name exactly two devices`);
            return;
          }

          // A link to a device that is not on the diagram draws nothing and
          // means nothing.
          for (const endpoint of link.endpoints) {
            if (typeof endpoint !== "string" || !nodeIds.has(endpoint)) {
              at(
                `${linkLabel}.endpoints names a device that is not in this topology: ${String(endpoint)}`
              );
            }
          }
        });

        reportDuplicates(
          topology.links
            .map((link) => (isPlainObject(link) ? link.linkId : undefined))
            .filter((id): id is string => typeof id === "string"),
          `${topologyLabel}.links`,
          at
        );
      }

      /* --- networks past the edge of the diagram -------------------- */

      if (topology.externalNetworks !== undefined) {
        if (!Array.isArray(topology.externalNetworks)) {
          at(`${topologyLabel}.externalNetworks must be a list`);
        } else {
          topology.externalNetworks.forEach((network, index) => {
            const networkLabel = `${topologyLabel}.externalNetworks[${index}]`;
            if (
              !checkKeys(
                network,
                EXTERNAL_NETWORK_KEYS,
                ["networkId", "label", "attachedToNodeId"],
                networkLabel,
                at
              )
            ) {
              return;
            }

            if (!nonEmpty(network.networkId)) {
              at(`${networkLabel}.networkId is empty`);
            }
            // The label is what a learner reads on the plate. An empty one
            // draws a shape that states nothing.
            if (!nonEmpty(network.label)) at(`${networkLabel}.label is empty`);

            // A network reached through a device that is not on the diagram
            // draws a wire from nowhere.
            if (
              typeof network.attachedToNodeId !== "string" ||
              !nodeIds.has(network.attachedToNodeId)
            ) {
              at(
                `${networkLabel}.attachedToNodeId names a device that is not in this topology: ${String(network.attachedToNodeId)}`
              );
            }
          });

          reportDuplicates(
            topology.externalNetworks
              .map((network) =>
                isPlainObject(network) ? network.networkId : undefined
              )
              .filter((id): id is string => typeof id === "string"),
            `${topologyLabel}.externalNetworks`,
            at
          );
        }
      }
    }
  }

  /* --- the questions ------------------------------------------------ */

  if (!Array.isArray(value.questions) || value.questions.length === 0) {
    at(`${label}.questions must ask at least one question`);
    return errors;
  }

  value.questions.forEach((question, index) => {
    const questionLabel = `${label}.questions[${index}]`;

    if (
      !checkKeys(
        question,
        QUESTION_KEYS,
        [
          "questionStableId",
          "type",
          "prompt",
          "options",
          "correctOptionIds",
          "explanation"
        ],
        questionLabel,
        at
      )
    ) {
      return;
    }

    if (!nonEmpty(question.questionStableId)) {
      at(`${questionLabel}.questionStableId is empty`);
    }
    if (!nonEmpty(question.prompt)) at(`${questionLabel}.prompt is empty`);

    // A verdict with no reason leaves a learner who was wrong no better off.
    if (!nonEmpty(question.explanation)) {
      at(`${questionLabel}.explanation is required`);
    }

    const type = question.type;
    if (
      typeof type !== "string" ||
      !(NEAR_TRANSFER_QUESTION_TYPES as readonly string[]).includes(type)
    ) {
      at(`${questionLabel}.type must be single_choice or multiple_choice`);
    }

    const optionIds = new Set<string>();

    if (!Array.isArray(question.options) || question.options.length < 2) {
      at(`${questionLabel}.options must offer at least two choices`);
    } else {
      question.options.forEach((option, optionIndex) => {
        const optionLabel = `${questionLabel}.options[${optionIndex}]`;
        if (!checkKeys(option, OPTION_KEYS, ["optionId", "text"], optionLabel, at)) {
          return;
        }
        if (!nonEmpty(option.optionId)) at(`${optionLabel}.optionId is empty`);
        if (!nonEmpty(option.text)) at(`${optionLabel}.text is empty`);
        if (typeof option.optionId === "string") optionIds.add(option.optionId);
      });

      reportDuplicates(
        question.options
          .map((option) => (isPlainObject(option) ? option.optionId : undefined))
          .filter((id): id is string => typeof id === "string"),
        `${questionLabel}.options`,
        at
      );
    }

    const correct = question.correctOptionIds;

    if (!Array.isArray(correct) || correct.length === 0) {
      at(`${questionLabel}.correctOptionIds must name at least one option`);
      return;
    }

    // An answer nobody can select is a question nobody can get right, and it
    // would only ever be discovered by a learner.
    for (const id of correct) {
      if (typeof id !== "string" || !optionIds.has(id)) {
        at(
          `${questionLabel}.correctOptionIds names an option that is not offered: ${String(id)}`
        );
      }
    }

    reportDuplicates(
      correct.filter((id): id is string => typeof id === "string"),
      `${questionLabel}.correctOptionIds`,
      at
    );

    if (type === "single_choice" && correct.length !== 1) {
      at(
        `${questionLabel} is single_choice and names ${correct.length} correct options; it must name exactly one`
      );
    }
  });

  reportDuplicates(
    value.questions
      .map((q) => (isPlainObject(q) ? q.questionStableId : undefined))
      .filter((id): id is string => typeof id === "string"),
    `${label}.questions`,
    at
  );

  return errors;
}

/* ------------------------------------------------------------------ *
 * Correctness
 * ------------------------------------------------------------------ */

/**
 * Whether a selection matches the authored answer.
 *
 * Exact set equality, for both types. No partial credit — a learner who names
 * one of two hosts has not answered "which two devices are hosts", and telling
 * them they were partly right would teach them that they were.
 */
export function isNearTransferAnswerCorrect(
  question: NearTransferQuestion,
  selectedOptionIds: readonly string[]
): boolean {
  const selected = new Set(selectedOptionIds);
  const expected = new Set(question.correctOptionIds);

  if (selected.size !== expected.size) return false;

  for (const id of expected) {
    if (!selected.has(id)) return false;
  }

  return true;
}
