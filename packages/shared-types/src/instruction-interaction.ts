import {
  isObservationNodeRole,
  isObservationSourceKind,
  isObservationStageOutcome,
  type ObservationAction,
  type ObservationConsequence,
  type ObservationInterface,
  type ObservationLink,
  type ObservationModel,
  type ObservationNode,
  type ObservationNodeRole,
  type ObservationSourceKind,
  type ObservationStage,
  type ObservationStageOutcome
} from "./observation-model";

/**
 * WP-H / CURR-011 / DEC-058 / DEC-059 — the Instructional Interaction Registry.
 *
 * ## What this is
 *
 * The ONE authoritative contract for learner-manipulable instructional
 * experiences referenced by a CURR-010 `interaction` step. It owns the closed
 * interaction-type vocabulary, the typed parameter contract per type, the
 * authored source discriminator, the progressive-support level, and the
 * projection from authored parameters into the shared `ObservationModel`.
 *
 * CURR-011 section 7: there is one registry, and it lives here. The
 * application side maps an already-validated type to a component; that is a
 * renderer mapping, not a second registry.
 *
 * ## Why parameters are a discriminated union
 *
 * `Record<string, unknown>` would make every invalid type/parameter combination
 * representable and would be exactly the arbitrary-JSON escape hatch DEC-054
 * closes and CURR-011 section 13 forbids. Discriminating on `interactionType`
 * means a packet journey missing its topology does not compile, before any
 * validator runs.
 *
 * Adding a future type is explicit and additive: a member of the union, a
 * validator arm, a renderer. **This is deliberately not a plugin framework.**
 * There is no registration function, no dynamic lookup by string into
 * user-supplied code, and nothing here loads anything.
 *
 * ## The security boundary is inertness, never pattern matching
 *
 * Interaction parameters are inert authored data. Nothing below can express
 * `eval`, `Function`, a script, a URL, a credential, a provider name, a session
 * identifier or an executable payload — not because a validator rejects them,
 * but because there is no field to put them in.
 *
 * **Code-looking text is valid instructional content.** Addresses, interface
 * names, VLAN identifiers and configuration fragments are ordinary teaching
 * material (CURR-011 section 13, CURR-010 section 10). No validator here
 * pattern-matches against markup-like or script-like strings, because a
 * platform that rejected `<script>` in prose could not teach its own subject.
 * Safety comes from the model carrying no executable position and from the
 * renderer escaping what it is given.
 *
 * ## No second networking truth model
 *
 * Every outcome is authored. There is no routing, switching, VLAN, ARP, STP,
 * subnet, next-hop, reachability or packet-parsing logic in this file, and the
 * scope fence in CURR-011 section 10.1 is enforced by the shape: a stage
 * carries its `outcome`, so there is nothing to compute it from.
 */

/* ------------------------------------------------------------------ *
 * The closed vocabulary
 * ------------------------------------------------------------------ */

/**
 * Registered interaction types. The set is CLOSED.
 *
 * An unregistered type is a hard publication failure (CURR-011 section 13),
 * which is what keeps the interaction step from becoming an arbitrary-content
 * escape hatch.
 *
 * Packet Journey is the first and, in WP-H, the only registered type. Linux,
 * Windows, Security and Cloud interactions are explicitly excluded scope
 * (CURR-011 section 6).
 */
export const INTERACTION_TYPES = ["packet_journey"] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export function isInteractionType(value: unknown): value is InteractionType {
  return (
    typeof value === "string" &&
    (INTERACTION_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Progressive support (DEC-059), from most assistance to least.
 *
 * ```text
 * SHOW ME → HELP ME → ASK ME → CHALLENGE ME → PROVE IT
 * ```
 *
 * Enforced SERVER-SIDE. The client is never the security boundary: a control
 * the browser still holds is not withheld.
 */
export const INTERACTION_SUPPORT_LEVELS = [
  "show_me",
  "help_me",
  "ask_me",
  "challenge_me",
  "prove_it"
] as const;

export type InteractionSupportLevel =
  (typeof INTERACTION_SUPPORT_LEVELS)[number];

export function isInteractionSupportLevel(
  value: unknown
): value is InteractionSupportLevel {
  return (
    typeof value === "string" &&
    (INTERACTION_SUPPORT_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * Ceiling on one authored interaction string.
 *
 * Matches `MISSION_STEP_TEXT_LIMIT`. It is declared here rather than imported
 * so this module has no import back to `mission-steps.ts`, which imports THIS
 * module — one direction only, no cycle. A test asserts the two are equal, so
 * changing one without the other fails rather than drifts.
 */
export const INTERACTION_TEXT_LIMIT = 20_000;

/**
 * Identity grammar for keys INTERNAL to one interaction's parameters — node,
 * interface, link, stage and action identifiers.
 *
 * Deliberately NOT the curriculum stable-id grammar. These are not curriculum
 * identities: they never appear in publication events, version lineage,
 * prerequisite rules or learner progress, and they are scoped to the single
 * authored interaction that declares them. They exist to be cross-referenced
 * within one parameter block and for nothing else.
 */
export const INTERACTION_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/* ------------------------------------------------------------------ *
 * Packet Journey — the authored parameter contract
 *
 * CURR-011 section 10. Topology, traffic, expected path, authored fault,
 * inspectable state, learner actions and the text trace.
 * ------------------------------------------------------------------ */

/**
 * One inspectable fact. Authored label and authored value, both plain text.
 *
 * An address lives here as a STRING. Nothing parses it, compares it, masks it
 * or does arithmetic on it — that would be the beginning of a subnet
 * calculator, which CURR-011 section 10.1 forbids.
 */
export interface PacketJourneyAttribute {
  readonly label: string;
  readonly value: string;
  /**
   * Display metadata: show this fact on a compact device face, not only under
   * full inspection.
   *
   * Authored, because the alternative is a renderer that recognises which facts
   * matter — matching a label against "VLAN" or "Mode" — which is domain
   * knowledge in the presentation layer and works for exactly one subject.
   *
   * It grants no meaning and no behaviour. Flagging an attribute does not make
   * it a VLAN, does not relate it to another device's attribute, and does not
   * imply anything can reach anything. Every attribute stays inspectable
   * whether or not it is flagged.
   */
  readonly prominent?: boolean;
}

export interface PacketJourneyInterface {
  readonly interfaceId: string;
  readonly label: string;
  readonly attributes: readonly PacketJourneyAttribute[];
}

export interface PacketJourneyNode {
  readonly nodeId: string;
  readonly label: string;
  readonly role: ObservationNodeRole;
  readonly interfaces: readonly PacketJourneyInterface[];
}

export interface PacketJourneyLink {
  readonly linkId: string;
  readonly label: string;
  /** Two interface ids. Drawn and listed; never traversed. */
  readonly endpoints: readonly [string, string];
}

/** What moves, where from, where to, and what starts it. */
export interface PacketJourneyTraffic {
  readonly label: string;
  readonly sourceNodeId: string;
  readonly destinationNodeId: string;
  readonly startActionLabel: string;
}

/**
 * A prediction checkpoint on a stage.
 *
 * **There is no answer key here, and there must never be one.** The learner
 * commits to an option and then observes the authored outcome; the observation
 * IS the reveal. That is DEC-058's `PREDICT → OBSERVE` and it needs no
 * correctness verdict, which is why WP-H needs no server-side commitment
 * protocol (Architect decision 11).
 *
 * Adding a correct-option field later would be adding an assessment answer to
 * curriculum content, and teaching mode produces no evidence.
 */
export interface PacketJourneyPrediction {
  readonly prompt: string;
  readonly options: readonly string[];
}

/**
 * One authored position in the journey.
 *
 * `narration` is the required text trace entry. It describes what is OBSERVED
 * at this point and must not carry the diagnosis: it is present at every
 * support level, because accessibility is not tutoring and must not disappear
 * when support is reduced (Architect decision 12).
 *
 * `decision` is the teaching — what the device decided and why. It is
 * answer-revealing, and the projection drops it at protected levels.
 *
 * `viaLinkId` names the authored link the traffic traversed to ARRIVE at this
 * stage. It is authored beside the stage for the same reason the fault's stop
 * point is authored beside the fault (CURR-011 section 10.1): so that no
 * consumer has to work it out. A renderer searching the link list for one that
 * joins two consecutive stages would be inferring a path element, which is the
 * forwarding computation section 10.1 forbids.
 *
 * It is optional. The first stage of a journey is where the traffic
 * originates, so nothing was traversed to reach it.
 */
export interface PacketJourneyStage {
  readonly stageId: string;
  readonly atNodeId: string;
  readonly narration: string;
  readonly decision?: string;
  readonly outcome: ObservationStageOutcome;
  readonly viaLinkId?: string;
  readonly prediction?: PacketJourneyPrediction;
}

/**
 * The intentional fault the learner is asked to find.
 *
 * `symptom` is what the learner can SEE, and is a legitimate observation kept
 * at every support level — PROVE IT withholds assistance, not observations.
 * `explanation` is why it happens, which is the answer, and is withheld at
 * protected levels.
 *
 * `stopsAtStageId` is authored: CURR-011 section 10.1 requires the stop point
 * to be authored with the fault rather than inferred from it.
 */
export interface PacketJourneyFault {
  readonly atNodeId: string;
  readonly symptom: string;
  readonly stopsAtStageId: string;
  readonly explanation: string;
}

/**
 * One enumerated remediation the learner may choose.
 *
 * `observation` is what they see after choosing it — authored for every
 * action, including the wrong ones, so an incorrect choice produces an
 * understandable consequence to investigate rather than a verdict.
 *
 * `resolvesFault` is the authored consequence, not a score. Nothing records
 * it, nothing counts it and no competency, evidence or progress follows from
 * it.
 */
export interface PacketJourneyAction {
  readonly actionId: string;
  readonly label: string;
  readonly resolvesFault: boolean;
  readonly observation: string;
}

/** What the learner sees once the journey completes. */
export interface PacketJourneyConfirmation {
  readonly narration: string;
  readonly summary: string;
}

/**
 * The authored Packet Journey.
 *
 * `interactionType` is repeated inside the parameters as the union
 * discriminant, so TypeScript can narrow, and the step's own `interactionType`
 * must agree with it. Two representations of one fact are checked rather than
 * reconciled — the same rule `resolvePersistedMissionSteps` applies to the
 * persisted `step_type`/`payload.type` pair.
 */
export interface PacketJourneyParameters {
  readonly interactionType: "packet_journey";
  readonly nodes: readonly PacketJourneyNode[];
  readonly links: readonly PacketJourneyLink[];
  readonly traffic: PacketJourneyTraffic;
  readonly stages: readonly PacketJourneyStage[];
  readonly fault?: PacketJourneyFault;
  readonly actions: readonly PacketJourneyAction[];
  readonly confirmation: PacketJourneyConfirmation;
}

/** The discriminated union. One member today; adding one is deliberate. */
export type InteractionParameters = PacketJourneyParameters;

/* ------------------------------------------------------------------ *
 * Strict validation
 *
 * Pure functions. No I/O, no clock, no randomness, no AI. Every message names
 * the offending element so an authoring failure is actionable.
 *
 * Unknown keys are REJECTED at every depth. WP-G established why for
 * documents: a typo in an optional field name silently produces content
 * missing that field, which publishes, and surfaces to a learner as a broken
 * lesson. The document parser cannot reach inside `parameters`, so the deep
 * rejection has to live here — and living here means authoring, the document
 * parser and publication all get it from one definition.
 * ------------------------------------------------------------------ */

type Collect = (message: string) => void;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function withinLimit(value: string): boolean {
  return value.length <= INTERACTION_TEXT_LIMIT;
}

/** Reject unknown keys, report missing required ones. */
function checkKeys(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  label: string,
  at: Collect
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
    if (value[key] === undefined) at(`${label} is missing "${key}"`);
  }

  return true;
}

/** A required authored string: present, non-empty, within the ceiling. */
function checkText(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): void {
  const value = source[key];
  if (!nonEmpty(value)) {
    if (value !== undefined) at(`${label}.${key} must be non-empty text`);
    return;
  }
  if (!withinLimit(value)) {
    at(`${label}.${key} exceeds ${INTERACTION_TEXT_LIMIT} characters`);
  }
}

/** An optional authored string: absent, or non-empty and within the ceiling. */
function checkOptionalText(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): void {
  if (source[key] === undefined) return;
  checkText(source, key, label, at);
}

function checkKey(
  source: Record<string, unknown>,
  key: string,
  label: string,
  at: Collect
): string | undefined {
  const value = source[key];
  if (!nonEmpty(value)) {
    if (value !== undefined) at(`${label}.${key} must be non-empty text`);
    return undefined;
  }
  if (!INTERACTION_KEY.test(value)) {
    at(
      `${label}.${key} is not a valid interaction key: "${value}" — 1-64 characters, lowercase letters, numbers, dot, underscore or hyphen`
    );
    return undefined;
  }
  return value;
}

function reportDuplicates(
  ids: readonly (string | undefined)[],
  label: string,
  at: Collect
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id === undefined) continue;
    if (seen.has(id)) at(`${label} declares a duplicate identifier: ${id}`);
    seen.add(id);
  }
}

const ATTRIBUTE_KEYS = ["label", "value", "prominent"] as const;
const ATTRIBUTE_REQUIRED = ["label", "value"] as const;
const INTERFACE_KEYS = ["interfaceId", "label", "attributes"] as const;
const NODE_KEYS = ["nodeId", "label", "role", "interfaces"] as const;
const LINK_KEYS = ["linkId", "label", "endpoints"] as const;
const TRAFFIC_KEYS = [
  "label",
  "sourceNodeId",
  "destinationNodeId",
  "startActionLabel"
] as const;
const PREDICTION_KEYS = ["prompt", "options"] as const;
const STAGE_KEYS = [
  "stageId",
  "atNodeId",
  "narration",
  "decision",
  "outcome",
  "viaLinkId",
  "prediction"
] as const;
const FAULT_KEYS = [
  "atNodeId",
  "symptom",
  "stopsAtStageId",
  "explanation"
] as const;
const ACTION_KEYS = [
  "actionId",
  "label",
  "resolvesFault",
  "observation"
] as const;
const CONFIRMATION_KEYS = ["narration", "summary"] as const;
const PACKET_JOURNEY_KEYS = [
  "interactionType",
  "nodes",
  "links",
  "traffic",
  "stages",
  "fault",
  "actions",
  "confirmation"
] as const;

/**
 * Validate authored Packet Journey parameters.
 *
 * Checks shape, then cross-reference integrity: every id a stage, link, fault
 * or traffic declaration names must exist within the SAME parameter block.
 * There is no cross-mission or cross-document reference to resolve, which is
 * the point of authoring the interaction inline (Architect decision 1) — a
 * reference that cannot dangle does not need a resolution step that can fail.
 */
export function validatePacketJourneyParameters(
  value: unknown,
  label: string,
  at: Collect
): void {
  if (
    !checkKeys(
      value,
      PACKET_JOURNEY_KEYS,
      [
        "interactionType",
        "nodes",
        "links",
        "traffic",
        "stages",
        "actions",
        "confirmation"
      ],
      label,
      at
    )
  ) {
    return;
  }

  if (value.interactionType !== "packet_journey") {
    at(
      `${label}.interactionType must be "packet_journey", not "${String(value.interactionType)}"`
    );
  }

  // --- nodes and their interfaces -------------------------------------
  const nodeIds: (string | undefined)[] = [];
  const interfaceIds: (string | undefined)[] = [];

  if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
    at(`${label}.nodes must list at least one device`);
  } else {
    value.nodes.forEach((entry, index) => {
      const nodeLabel = `${label}.nodes[${index}]`;
      if (!checkKeys(entry, NODE_KEYS, NODE_KEYS, nodeLabel, at)) return;

      nodeIds.push(checkKey(entry, "nodeId", nodeLabel, at));
      checkText(entry, "label", nodeLabel, at);

      if (!isObservationNodeRole(entry.role)) {
        at(
          `${nodeLabel}.role must be host, switch or router, not "${String(entry.role)}"`
        );
      }

      if (!Array.isArray(entry.interfaces)) {
        at(`${nodeLabel}.interfaces must be an array`);
        return;
      }

      entry.interfaces.forEach((iface, ifaceIndex) => {
        const ifaceLabel = `${nodeLabel}.interfaces[${ifaceIndex}]`;
        if (!checkKeys(iface, INTERFACE_KEYS, INTERFACE_KEYS, ifaceLabel, at)) {
          return;
        }

        interfaceIds.push(checkKey(iface, "interfaceId", ifaceLabel, at));
        checkText(iface, "label", ifaceLabel, at);

        if (!Array.isArray(iface.attributes)) {
          at(`${ifaceLabel}.attributes must be an array`);
          return;
        }

        iface.attributes.forEach((attribute, attributeIndex) => {
          const attributeLabel = `${ifaceLabel}.attributes[${attributeIndex}]`;
          if (
            !checkKeys(
              attribute,
              ATTRIBUTE_KEYS,
              ATTRIBUTE_REQUIRED,
              attributeLabel,
              at
            )
          ) {
            return;
          }
          checkText(attribute, "label", attributeLabel, at);
          checkText(attribute, "value", attributeLabel, at);

          // Display metadata, and strictly a boolean. A truthy string here
          // would be an author reaching for a value the flag cannot carry.
          if (
            attribute.prominent !== undefined &&
            typeof attribute.prominent !== "boolean"
          ) {
            at(`${attributeLabel}.prominent must be true or false`);
          }
        });
      });
    });
  }

  reportDuplicates(nodeIds, `${label}.nodes`, at);
  reportDuplicates(interfaceIds, `${label} interfaces`, at);

  const knownNodes = new Set(nodeIds.filter((id): id is string => !!id));
  const knownInterfaces = new Set(
    interfaceIds.filter((id): id is string => !!id)
  );

  // --- links -----------------------------------------------------------
  const linkIds: (string | undefined)[] = [];

  if (!Array.isArray(value.links)) {
    at(`${label}.links must be an array`);
  } else {
    value.links.forEach((entry, index) => {
      const linkLabel = `${label}.links[${index}]`;
      if (!checkKeys(entry, LINK_KEYS, LINK_KEYS, linkLabel, at)) return;

      linkIds.push(checkKey(entry, "linkId", linkLabel, at));
      checkText(entry, "label", linkLabel, at);

      if (!Array.isArray(entry.endpoints) || entry.endpoints.length !== 2) {
        at(`${linkLabel}.endpoints must name exactly two interfaces`);
        return;
      }

      entry.endpoints.forEach((endpoint, endpointIndex) => {
        if (!nonEmpty(endpoint) || !knownInterfaces.has(endpoint)) {
          at(
            `${linkLabel}.endpoints[${endpointIndex}] names an interface that is not declared on any node: ${String(endpoint)}`
          );
        }
      });
    });
  }

  reportDuplicates(linkIds, `${label}.links`, at);

  const knownLinks = new Set(linkIds.filter((id): id is string => !!id));

  // --- traffic ----------------------------------------------------------
  if (checkKeys(value.traffic, TRAFFIC_KEYS, TRAFFIC_KEYS, `${label}.traffic`, at)) {
    checkText(value.traffic, "label", `${label}.traffic`, at);
    checkText(value.traffic, "startActionLabel", `${label}.traffic`, at);

    for (const endpoint of ["sourceNodeId", "destinationNodeId"] as const) {
      const named = value.traffic[endpoint];
      if (!nonEmpty(named) || !knownNodes.has(named)) {
        at(
          `${label}.traffic.${endpoint} names a device that is not declared: ${String(named)}`
        );
      }
    }
  }

  // --- stages -----------------------------------------------------------
  const stageIds: (string | undefined)[] = [];

  if (!Array.isArray(value.stages) || value.stages.length === 0) {
    at(`${label}.stages must describe at least one step of the journey`);
  } else {
    value.stages.forEach((entry, index) => {
      const stageLabel = `${label}.stages[${index}]`;
      if (
        !checkKeys(
          entry,
          STAGE_KEYS,
          ["stageId", "atNodeId", "narration", "outcome"],
          stageLabel,
          at
        )
      ) {
        return;
      }

      stageIds.push(checkKey(entry, "stageId", stageLabel, at));

      // Publication-blocking: the text trace is required (CURR-011 s14.3).
      checkText(entry, "narration", stageLabel, at);
      checkOptionalText(entry, "decision", stageLabel, at);

      if (!nonEmpty(entry.atNodeId) || !knownNodes.has(entry.atNodeId)) {
        at(
          `${stageLabel}.atNodeId names a device that is not declared: ${String(entry.atNodeId)}`
        );
      }

      if (!isObservationStageOutcome(entry.outcome)) {
        at(
          `${stageLabel}.outcome must be proceeds or stops, not "${String(entry.outcome)}"`
        );
      }

      // The traversed link is a cross-reference like every other identifier in
      // this block: it must name a link declared in the SAME parameters. A
      // dangling one would leave a renderer with a link to highlight that does
      // not exist, and the honest place to catch that is authoring.
      if (entry.viaLinkId !== undefined) {
        if (!nonEmpty(entry.viaLinkId) || !knownLinks.has(entry.viaLinkId)) {
          at(
            `${stageLabel}.viaLinkId names a link that is not declared: ${String(entry.viaLinkId)}`
          );
        }
      }

      if (entry.prediction !== undefined) {
        const predictionLabel = `${stageLabel}.prediction`;
        if (
          checkKeys(
            entry.prediction,
            PREDICTION_KEYS,
            PREDICTION_KEYS,
            predictionLabel,
            at
          )
        ) {
          checkText(entry.prediction, "prompt", predictionLabel, at);

          const options = entry.prediction.options;
          if (!Array.isArray(options) || options.length < 2) {
            at(`${predictionLabel}.options must offer at least two choices`);
          } else {
            options.forEach((option, optionIndex) => {
              if (!nonEmpty(option)) {
                at(`${predictionLabel}.options[${optionIndex}] is empty`);
              }
            });
          }
        }
      }
    });
  }

  reportDuplicates(stageIds, `${label}.stages`, at);
  const knownStages = new Set(stageIds.filter((id): id is string => !!id));

  // --- fault ------------------------------------------------------------
  const authoredFault = value.fault;

  if (authoredFault !== undefined) {
    const faultLabel = `${label}.fault`;
    if (checkKeys(authoredFault, FAULT_KEYS, FAULT_KEYS, faultLabel, at)) {
      checkText(authoredFault, "symptom", faultLabel, at);
      checkText(authoredFault, "explanation", faultLabel, at);

      const faultNode = authoredFault.atNodeId;
      if (!nonEmpty(faultNode) || !knownNodes.has(faultNode)) {
        at(
          `${faultLabel}.atNodeId names a device that is not declared: ${String(faultNode)}`
        );
      }

      // The stop point is authored WITH the fault, never inferred from it.
      const stopId = authoredFault.stopsAtStageId;

      if (!nonEmpty(stopId) || !knownStages.has(stopId)) {
        at(
          `${faultLabel}.stopsAtStageId names a stage that is not declared: ${String(stopId)}`
        );
      } else if (Array.isArray(value.stages)) {
        // The named stage must actually be authored as stopping. Otherwise the
        // fault and the stage disagree about what the learner observes, and
        // the projection would have to pick a winner — which is exactly the
        // silent reconciliation this package refuses everywhere else.
        const stopStage = value.stages.find(
          (stage) => isPlainObject(stage) && stage.stageId === stopId
        );

        if (isPlainObject(stopStage) && stopStage.outcome !== "stops") {
          at(
            `${faultLabel}.stopsAtStageId names stage "${stopId}", whose authored outcome is "${String(stopStage.outcome)}"; a fault's stop point must be authored as stops`
          );
        }
      }
    }
  }

  // --- actions ----------------------------------------------------------
  const actionIds: (string | undefined)[] = [];
  let resolvingActions = 0;

  if (!Array.isArray(value.actions)) {
    at(`${label}.actions must be an array`);
  } else {
    value.actions.forEach((entry, index) => {
      const actionLabel = `${label}.actions[${index}]`;
      if (!checkKeys(entry, ACTION_KEYS, ACTION_KEYS, actionLabel, at)) return;

      actionIds.push(checkKey(entry, "actionId", actionLabel, at));
      checkText(entry, "label", actionLabel, at);
      checkText(entry, "observation", actionLabel, at);

      if (typeof entry.resolvesFault !== "boolean") {
        at(`${actionLabel}.resolvesFault must be true or false`);
      } else if (entry.resolvesFault) {
        resolvingActions += 1;
      }
    });
  }

  reportDuplicates(actionIds, `${label}.actions`, at);

  // A fault the learner cannot repair is a dead end, and a repair with nothing
  // to repair is a control that does nothing. Both are authoring defects.
  if (value.fault !== undefined && resolvingActions === 0) {
    at(
      `${label} authors a fault but no action that resolves it; the learner would have no way to proceed`
    );
  }
  if (value.fault === undefined && resolvingActions > 0) {
    at(
      `${label} authors an action that resolves a fault, but no fault is authored`
    );
  }

  // --- confirmation ------------------------------------------------------
  if (
    checkKeys(
      value.confirmation,
      CONFIRMATION_KEYS,
      CONFIRMATION_KEYS,
      `${label}.confirmation`,
      at
    )
  ) {
    checkText(value.confirmation, "narration", `${label}.confirmation`, at);
    checkText(value.confirmation, "summary", `${label}.confirmation`, at);
  }
}

/* ------------------------------------------------------------------ *
 * The interaction step's own validation
 * ------------------------------------------------------------------ */

/**
 * Validate the interaction-specific fields of a `MissionStepInteractionContent`.
 *
 * Called from `validateMissionStepContent`'s `interaction` arm, so authoring,
 * the WP-G document parser and server-side publication all reach it through
 * one path. A second definition anywhere would be the drift WP-G was built to
 * prevent.
 *
 * Returns messages rather than throwing, matching every other validator in
 * this package, so an authoring surface reports every problem at once.
 */
export function validateInteractionContent(
  content: unknown,
  label: string
): string[] {
  const errors: string[] = [];
  const at: Collect = (message) => errors.push(message);

  if (!isPlainObject(content)) {
    at(`${label}: interaction content must be an object`);
    return errors;
  }

  const declaredType = content.interactionType;

  if (!isInteractionType(declaredType)) {
    at(
      `${label}: "${String(declaredType)}" is not a registered interaction type; the registry is closed at ${INTERACTION_TYPES.join(", ")}`
    );
    // Without a registered type there is no parameter contract to check
    // against, and guessing one would be the escape hatch this closes.
    return errors;
  }

  // The authored source discriminator (CURR-011 section 9).
  if (!isObservationSourceKind(content.sourceKind)) {
    at(
      `${label}: sourceKind must be authored_teaching or live_lab, not "${String(content.sourceKind)}"`
    );
  } else if (content.sourceKind === "live_lab") {
    // Rejected until WP-K's adapter exists. Publishing a live interaction with
    // no adapter would promise authoritative observations the platform cannot
    // read, and the honest failure is at authoring time.
    at(
      `${label}: a live_lab interaction cannot be published until its observation adapter exists (WP-K); teaching mode must declare authored_teaching`
    );
  }

  if (!isInteractionSupportLevel(content.supportLevel)) {
    at(
      `${label}: supportLevel must be one of ${INTERACTION_SUPPORT_LEVELS.join(", ")}, not "${String(content.supportLevel)}"`
    );
  }

  const parameters = content.parameters;

  if (!isPlainObject(parameters)) {
    at(`${label}: an interaction step must carry typed parameters`);
    return errors;
  }

  // Two representations of one fact, checked and never reconciled. Rewriting
  // either would silently pick a winner and change what the learner receives.
  if (parameters.interactionType !== declaredType) {
    at(
      `${label}: interaction type "${declaredType}" disagrees with parameters type "${String(parameters.interactionType)}"`
    );
    return errors;
  }

  // Exhaustive over the closed registry. No default arm: registering a type
  // without a parameter contract is a compile error, not a silent pass.
  switch (declaredType) {
    case "packet_journey":
      validatePacketJourneyParameters(parameters, `${label}.parameters`, at);
      break;
  }

  return errors;
}

/* ------------------------------------------------------------------ *
 * Teaching-mode projection into the ObservationModel
 *
 * CURR-011 section 8. The renderer consumes the ObservationModel and never
 * authored parameters directly, so live mode becomes an adapter rather than a
 * rewrite of both presentations.
 * ------------------------------------------------------------------ */

/**
 * How far the learner has got.
 *
 * `revealedStageCount` is how many authored stages they have advanced through.
 * `appliedActionId` is the remediation they chose, if any.
 *
 * This is learner PROGRESS THROUGH AUTHORED CONTENT, not learner-supplied
 * state that could influence an outcome: every outcome was authored before the
 * learner arrived, and no field here can change one.
 */
export interface PacketJourneyProgress {
  readonly revealedStageCount: number;
  readonly appliedActionId: string | null;
}

export const INITIAL_PACKET_JOURNEY_PROGRESS: PacketJourneyProgress = {
  revealedStageCount: 0,
  appliedActionId: null
};

function projectInterface(iface: PacketJourneyInterface): ObservationInterface {
  return {
    interfaceId: iface.interfaceId,
    label: iface.label,
    // Authored parameters are, by definition, available: an author wrote them
    // down. Live mode is where `unavailable` and `unknown` earn their keep.
    attributes: iface.attributes.map((attribute) => ({
      label: attribute.label,
      value: attribute.value,
      availability: "available" as const,
      // Copied. The projection never decides which facts matter.
      ...(attribute.prominent !== undefined
        ? { prominent: attribute.prominent }
        : {})
    }))
  };
}

function projectNode(node: PacketJourneyNode): ObservationNode {
  return {
    nodeId: node.nodeId,
    label: node.label,
    role: node.role,
    interfaces: node.interfaces.map(projectInterface)
  };
}

function projectLink(link: PacketJourneyLink): ObservationLink {
  return {
    linkId: link.linkId,
    label: link.label,
    endpoints: link.endpoints,
    availability: "available"
  };
}

/**
 * Build the observation model for an authored packet journey at one point.
 *
 * ## What this does
 *
 * SELECTS authored content. Stages the learner has reached are `available` and
 * carry their authored narration, decision and outcome; stages beyond that
 * point are `unknown`, because the learner has not observed them yet — not
 * because anything failed.
 *
 * ## What this does not do, and must never do
 *
 * It computes no networking truth. It does not decide where traffic goes, does
 * not evaluate addresses, does not walk links and does not determine whether
 * the journey succeeds. Every one of those is a field it copies.
 *
 * The single conditional below is not a forwarding decision: it chooses which
 * AUTHORED consequence to surface, based on an AUTHORED `resolvesFault` flag
 * and an AUTHORED stop point.
 */
export function buildPacketJourneyObservationModel(
  parameters: LearnerPacketJourneyParameters,
  progress: PacketJourneyProgress,
  sourceKind: ObservationSourceKind = "authored_teaching"
): ObservationModel {
  const revealed = Math.max(
    0,
    Math.min(progress.revealedStageCount, parameters.stages.length)
  );

  // Absent when the support level withheld remediation. An empty list is the
  // correct reading: there is nothing the learner may apply.
  const authoredActions = parameters.actions ?? [];

  const appliedAction =
    progress.appliedActionId === null
      ? undefined
      : authoredActions.find(
          (action) => action.actionId === progress.appliedActionId
        );

  const faultResolved = appliedAction?.resolvesFault === true;

  const stages: ObservationStage[] = parameters.stages.map((stage, index) => {
    const observed = index < revealed;

    // The authored stage outcome describes the journey WHILE THE FAULT IS
    // PRESENT — validation requires the fault's stop point to be a stage whose
    // authored outcome is `stops`. Applying the authored remediation restores
    // the journey, so that one stage proceeds.
    //
    // Both halves are authored. Nothing here decides whether traffic can flow;
    // it selects between two authored outcomes using an authored flag.
    const isFaultStage =
      parameters.fault !== undefined &&
      parameters.fault.stopsAtStageId === stage.stageId;

    return {
      stageId: stage.stageId,
      atNodeId: stage.atNodeId,
      narration: stage.narration,
      ...(stage.decision !== undefined ? { decision: stage.decision } : {}),
      outcome:
        isFaultStage && faultResolved ? ("proceeds" as const) : stage.outcome,
      // Copied, never chosen. Which link was traversed is the same fact
      // whether the fault is present or repaired.
      ...(stage.viaLinkId !== undefined ? { viaLinkId: stage.viaLinkId } : {}),
      availability: observed ? ("available" as const) : ("unknown" as const)
    };
  });

  const currentStage = revealed > 0 ? stages[revealed - 1] : undefined;
  const atAuthoredStop =
    currentStage !== undefined && currentStage.outcome === "stops";
  const completed = revealed === parameters.stages.length && !atAuthoredStop;

  const consequence: ObservationConsequence | null =
    currentStage === undefined
      ? null
      : atAuthoredStop
        ? {
            state: "stopped",
            narration: currentStage.narration,
            ...(parameters.fault !== undefined
              ? { symptom: parameters.fault.symptom }
              : {})
          }
        : completed
          ? {
              // `confirmed` needs the authored confirmation to say anything.
              // When the level withheld it, the honest state is that the
              // journey is proceeding — not a confirmation with no words.
              state:
                faultResolved && parameters.confirmation !== undefined
                  ? "confirmed"
                  : "proceeding",
              narration:
                faultResolved && parameters.confirmation !== undefined
                  ? parameters.confirmation.narration
                  : currentStage.narration
            }
          : { state: "proceeding", narration: currentStage.narration };

  // Remediation is offered once the learner has actually met the failure, and
  // withdrawn once it has been applied. Offering it earlier would give away
  // that something is wrong before they observe it.
  const actionsAvailable = atAuthoredStop && appliedAction === undefined;

  const actions: ObservationAction[] = authoredActions.map((action) => ({
    actionId: action.actionId,
    label: action.label,
    available: actionsAvailable
  }));

  return {
    sourceKind,
    availability: "available",
    trafficLabel: parameters.traffic.label,
    nodes: parameters.nodes.map(projectNode),
    links: parameters.links.map(projectLink),
    stages,
    currentStageId: currentStage?.stageId ?? null,
    actions,
    consequence
  };
}

/* ------------------------------------------------------------------ *
 * Learner-safe parameter types
 *
 * The shapes that may cross the wire. Declared here, beside the authored
 * types, so the difference between the two is visible in one file rather than
 * inferred by comparing two.
 *
 * `mission-instruction.ts` owns the projection; these own its target.
 * ------------------------------------------------------------------ */

export interface LearnerPacketJourneyStage {
  readonly stageId: string;
  readonly atNodeId: string;
  readonly narration: string;
  /** Answer-revealing. Dropped at protected support levels. */
  readonly decision?: string;
  readonly outcome: ObservationStageOutcome;
  /**
   * The authored link traversed to arrive here. Carried at EVERY support
   * level: it says no more than `atNodeId` already does, and withholding it
   * would remove the learner's ability to see where the traffic went without
   * withholding the knowledge of where it ended up.
   */
  readonly viaLinkId?: string;
  readonly prediction?: PacketJourneyPrediction;
}

export interface LearnerPacketJourneyFault {
  readonly atNodeId: string;
  /** A legitimate observation. Present at every support level. */
  readonly symptom: string;
  readonly stopsAtStageId: string;
  /** Answer-revealing. Dropped at protected support levels. */
  readonly explanation?: string;
}

/**
 * The parameters a learner may receive.
 *
 * ## Why `actions` and `confirmation` are OPTIONAL here
 *
 * They are required on the authored type and optional on this one, and the
 * difference is the whole correction that followed the WP-H architecture
 * review.
 *
 * An authored remediation carries `resolvesFault` — which action is the right
 * one — and an `observation` describing what each action produces. Both are
 * answer-bearing: a learner reading the response would know the fix without
 * diagnosing anything. `confirmation` is the lesson's conclusion, which states
 * the answer in plain words.
 *
 * At CHALLENGE ME the server withholds answer-revealing information, so these
 * must be ABSENT from the response rather than hidden by the interface. A
 * client cannot be asked to hold protected content and merely not draw it: the
 * network response is readable, and "the UI has not displayed it yet" is not
 * withholding.
 *
 * The consequence is honest and is documented as a limitation: with no server
 * round-trip per action — which WP-H deliberately does not build — the authored
 * remediation step cannot be offered at CHALLENGE ME, because the consequence
 * of choosing an action IS the protected content. So remediation is withheld at
 * that level rather than shipped and concealed.
 */
export interface LearnerPacketJourneyParameters {
  readonly interactionType: "packet_journey";
  readonly nodes: readonly PacketJourneyNode[];
  readonly links: readonly PacketJourneyLink[];
  readonly traffic: PacketJourneyTraffic;
  readonly stages: readonly LearnerPacketJourneyStage[];
  readonly fault?: LearnerPacketJourneyFault;
  /** Answer-bearing. Absent when the support level withholds it. */
  readonly actions?: readonly PacketJourneyAction[];
  /** The conclusion. Absent when the support level withholds it. */
  readonly confirmation?: PacketJourneyConfirmation;
}

export type LearnerInteractionParameters = LearnerPacketJourneyParameters;

/**
 * Whether this support level withholds answer-revealing teaching material.
 *
 * DEC-059: CHALLENGE ME withholds "answer-revealing information", and PROVE IT
 * withholds instructional assistance. SHOW ME, HELP ME and ASK ME do not — at
 * ASK ME the expected result is withheld until commitment, which is a
 * SEQUENCING concern the client owns over already-authorized content
 * (Architect decision 11), not a different payload.
 */
export function withholdsAnswerRevealingContent(
  supportLevel: InteractionSupportLevel
): boolean {
  return supportLevel === "challenge_me" || supportLevel === "prove_it";
}

/**
 * Whether the whole teaching interaction is withheld at this level.
 *
 * CURR-011 section 11 states it directly: "A teaching-mode interaction that
 * would reveal the solution may be withheld at PROVE IT, because it is
 * instructional assistance by definition."
 *
 * This is why PROVE IT does not need the answer key stripped out of an
 * authored simulation that must still function — the simulation itself is the
 * assistance, so it goes, and the objective, the environment, the learner's
 * own tools and the accessible text equivalent all remain.
 *
 * A future LIVE interaction is NOT withheld here: it renders authoritative
 * observations with the expected path and authored fault removed. That
 * distinction is why this takes the source kind.
 */
export function withholdsEntireInteraction(
  supportLevel: InteractionSupportLevel,
  sourceKind: ObservationSourceKind
): boolean {
  return supportLevel === "prove_it" && sourceKind === "authored_teaching";
}
