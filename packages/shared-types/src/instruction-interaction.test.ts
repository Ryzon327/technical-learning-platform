import { describe, expect, it } from "vitest";
import {
  INITIAL_PACKET_JOURNEY_PROGRESS,
  INTERACTION_KEY,
  INTERACTION_SUPPORT_LEVELS,
  INTERACTION_TEXT_LIMIT,
  INTERACTION_TYPES,
  buildPacketJourneyObservationModel,
  isInteractionSupportLevel,
  isInteractionType,
  validateInteractionContent,
  withholdsAnswerRevealingContent,
  withholdsEntireInteraction,
  type InteractionParameters,
  type LearnerPacketJourneyParameters
} from "./instruction-interaction";
import { MISSION_STEP_TEXT_LIMIT } from "./mission-steps";
import { OBSERVATION_SOURCE_KINDS } from "./observation-model";

/**
 * WP-H / CURR-011 — the interaction registry, proven as pure functions.
 *
 * Nothing here needs a DOM, a database or a network, which is deliberate: the
 * repository has no rendered-DOM harness and WP-H may not add one, so every
 * rule that matters is expressed as a total function over plain values.
 */

/** A complete, valid authored packet journey. Tests mutate copies of it. */
const journey: InteractionParameters = {
  interactionType: "packet_journey",
  nodes: [
    {
      nodeId: "pc-a",
      label: "PC-A",
      role: "host",
      interfaces: [
        {
          interfaceId: "pc-a-eth0",
          label: "eth0",
          attributes: [
            { label: "IP address", value: "192.168.10.10/24" },
            { label: "Default gateway", value: "192.168.10.1" }
          ]
        }
      ]
    },
    {
      nodeId: "r-1",
      label: "Router-1",
      role: "router",
      interfaces: [
        {
          interfaceId: "r-1-gi0-0-10",
          label: "Gi0/0.10",
          attributes: [{ label: "VLAN", value: "10" }]
        }
      ]
    }
  ],
  links: [
    {
      linkId: "link-a",
      label: "PC-A to Router-1",
      endpoints: ["pc-a-eth0", "r-1-gi0-0-10"]
    }
  ],
  traffic: {
    label: "an ICMP echo request",
    sourceNodeId: "pc-a",
    destinationNodeId: "r-1",
    startActionLabel: "Send the ping"
  },
  stages: [
    {
      stageId: "s1",
      atNodeId: "pc-a",
      narration: "PC-A sends the request towards its gateway.",
      decision: "The destination is on another network, so it uses the gateway.",
      outcome: "proceeds"
    },
    {
      stageId: "s2",
      atNodeId: "r-1",
      narration: "The frame arrives at Router-1 and is discarded.",
      decision: "There is no subinterface for VLAN 20.",
      outcome: "stops",
      // The link traversed to arrive here. Authored beside the stage, so no
      // consumer has to work it out from which devices happen to be adjacent.
      viaLinkId: "link-a",
      prediction: {
        prompt: "What will Router-1 do?",
        options: ["Forward it", "Discard it"]
      }
    }
  ],
  fault: {
    atNodeId: "r-1",
    symptom: "The ping reports 100% packet loss.",
    stopsAtStageId: "s2",
    explanation: "Router-1 has no subinterface for VLAN 20."
  },
  actions: [
    {
      actionId: "add-vlan-20",
      label: "Add the VLAN 20 subinterface",
      resolvesFault: true,
      observation: "Router-1 now forwards the frame into VLAN 20."
    },
    {
      actionId: "restart-pc-a",
      label: "Restart PC-A",
      resolvesFault: false,
      observation: "PC-A comes back up; the ping still fails."
    }
  ],
  confirmation: {
    narration: "The reply returns to PC-A.",
    summary: "One subinterface per VLAN."
  }
};

function content(overrides: Record<string, unknown> = {}) {
  return {
    type: "interaction",
    interactionStableId: "packet-journey",
    interactionType: "packet_journey",
    sourceKind: "authored_teaching",
    supportLevel: "show_me",
    parameters: journey,
    textEquivalent: "Follow the request hop by hop.",
    ...overrides
  };
}

function params(overrides: Record<string, unknown>): unknown {
  return { ...journey, ...overrides };
}

/* ------------------------------------------------------------------ *
 * The registry
 * ------------------------------------------------------------------ */

describe("the interaction registry is closed", () => {
  it("registers exactly packet_journey in WP-H", () => {
    expect([...INTERACTION_TYPES]).toEqual(["packet_journey"]);
  });

  it("recognises only registered types", () => {
    expect(isInteractionType("packet_journey")).toBe(true);
    for (const notRegistered of [
      "subnet_slider",
      "linux_shell",
      "PACKET_JOURNEY",
      "",
      null,
      42
    ]) {
      expect(isInteractionType(notRegistered)).toBe(false);
    }
  });

  it("carries the five approved support levels in order", () => {
    expect([...INTERACTION_SUPPORT_LEVELS]).toEqual([
      "show_me",
      "help_me",
      "ask_me",
      "challenge_me",
      "prove_it"
    ]);
    expect(isInteractionSupportLevel("prove_it")).toBe(true);
    expect(isInteractionSupportLevel("prove it")).toBe(false);
  });

  it("keeps its text ceiling equal to the mission-step ceiling", () => {
    // The constant is declared locally to avoid an import cycle. This is what
    // stops the two drifting apart.
    expect(INTERACTION_TEXT_LIMIT).toBe(MISSION_STEP_TEXT_LIMIT);
  });
});

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

describe("a valid packet journey validates", () => {
  it("accepts the complete authored contract", () => {
    expect(validateInteractionContent(content(), "s01")).toEqual([]);
  });

  it("accepts a journey with no fault and no actions", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            stages: [journey.stages[0]],
            fault: undefined,
            actions: []
          })
        }),
        "s01"
      )
    ).toEqual([]);
  });
});

describe("malformed interaction content is refused", () => {
  it("refuses an unregistered interaction type", () => {
    expect(
      validateInteractionContent(
        content({ interactionType: "subnet_slider" }),
        "s01"
      ).join(" ")
    ).toContain("not a registered interaction type");
  });

  it("refuses a missing parameters block", () => {
    expect(
      validateInteractionContent(content({ parameters: undefined }), "s01").join(
        " "
      )
    ).toContain("must carry typed parameters");
  });

  it("refuses a disagreement between the two type discriminators", () => {
    expect(
      validateInteractionContent(
        content({ parameters: params({ interactionType: "packet_flow" }) }),
        "s01"
      ).join(" ")
    ).toContain("disagrees with parameters type");
  });

  it("refuses an unapproved support level", () => {
    expect(
      validateInteractionContent(content({ supportLevel: "hard" }), "s01").join(
        " "
      )
    ).toContain("supportLevel must be one of");
  });

  it("refuses content that is not an object", () => {
    expect(validateInteractionContent("packet journey", "s01").join(" ")).toContain(
      "must be an object"
    );
  });
});

describe("unknown keys are rejected at every depth", () => {
  it("rejects an unknown key on the parameters block", () => {
    expect(
      validateInteractionContent(
        content({ parameters: params({ topology: [] }) }),
        "s01"
      ).join(" ")
    ).toContain('unknown field "topology"');
  });

  it("rejects an unknown key on a node", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            nodes: [{ ...journey.nodes[0], hostname: "pc-a" }]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain('unknown field "hostname"');
  });

  it("rejects an unknown key on a stage", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            stages: [{ ...journey.stages[0], nextHop: "r-1" }]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain('unknown field "nextHop"');
  });

  it("rejects an unknown key on an interface attribute", () => {
    const nodes = [
      {
        ...journey.nodes[0],
        interfaces: [
          {
            interfaceId: "pc-a-eth0",
            label: "eth0",
            attributes: [{ label: "IP", value: "10.0.0.1", unit: "cidr" }]
          }
        ]
      },
      journey.nodes[1]
    ];

    expect(
      validateInteractionContent(content({ parameters: params({ nodes }) }), "s01").join(
        " "
      )
    ).toContain('unknown field "unit"');
  });

  it("rejects a typo in an optional field name rather than dropping it", () => {
    // The WP-G reasoning, applied one level deeper: a silently dropped field
    // publishes and surfaces to a learner as a broken lesson.
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            stages: [{ ...journey.stages[0], decison: "typo" }]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain('unknown field "decison"');
  });
});

describe("cross-references inside one interaction must resolve", () => {
  it("refuses a stage at an undeclared device", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            stages: [{ ...journey.stages[0], atNodeId: "r-99" }]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("names a device that is not declared");
  });

  it("refuses a link endpoint that is not an interface on any node", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            links: [
              { linkId: "l1", label: "bad", endpoints: ["pc-a-eth0", "nope"] }
            ]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("not declared on any node");
  });

  it("refuses a stage that arrives over an undeclared link", () => {
    // WP-I correction. `viaLinkId` is a cross-reference like every other
    // identifier here: a dangling one would leave a renderer highlighting a
    // link that does not exist, and authoring is the honest place to catch it.
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            stages: [
              journey.stages[0],
              { ...journey.stages[1], viaLinkId: "link-99" }
            ]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("names a link that is not declared");
  });

  it("accepts an attribute flagged for the device face", () => {
    // WP-I final correction. `prominent` is display metadata: it says show this
    // fact early, and confers no meaning at all.
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            nodes: [
              {
                ...journey.nodes[0]!,
                interfaces: [
                  {
                    interfaceId: "pc-a-eth0",
                    label: "eth0",
                    attributes: [
                      { label: "VLAN", value: "10", prominent: true },
                      { label: "IP address", value: "192.168.10.10/24" }
                    ]
                  }
                ]
              },
              journey.nodes[1]
            ]
          })
        }),
        "s01"
      )
    ).toEqual([]);
  });

  it("refuses a display flag that is not a boolean", () => {
    // A truthy string here would be an author reaching for a value the flag
    // cannot carry — a label, a rank, a colour. It carries none of those.
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            nodes: [
              {
                ...journey.nodes[0]!,
                interfaces: [
                  {
                    interfaceId: "pc-a-eth0",
                    label: "eth0",
                    attributes: [
                      { label: "VLAN", value: "10", prominent: "yes" }
                    ]
                  }
                ]
              },
              journey.nodes[1]
            ]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("prominent must be true or false");
  });

  it("accepts a stage that names no traversed link", () => {
    // The first stage is where the traffic originates, so nothing was crossed
    // to reach it. Absence is correct, not an authoring omission.
    const { viaLinkId: _viaLinkId, ...withoutLink } = journey.stages[1]!;

    expect(
      validateInteractionContent(
        content({
          parameters: params({ stages: [journey.stages[0], withoutLink] })
        }),
        "s01"
      )
    ).toEqual([]);
  });

  it("refuses a fault whose stop point is not a declared stage", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            fault: { ...journey.fault!, stopsAtStageId: "s99" }
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("names a stage that is not declared");
  });

  it("refuses duplicate identifiers", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            stages: [journey.stages[0], journey.stages[0]]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("duplicate identifier");
  });

  it("refuses a fault whose stop point is authored as proceeding", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            fault: { ...journey.fault!, stopsAtStageId: "s1" }
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("must be authored as stops");
  });

  it("refuses a fault with no action that repairs it", () => {
    expect(
      validateInteractionContent(
        content({ parameters: params({ actions: [journey.actions[1]] }) }),
        "s01"
      ).join(" ")
    ).toContain("no action that resolves it");
  });

  it("refuses a repair action with no fault to repair", () => {
    expect(
      validateInteractionContent(
        content({ parameters: params({ fault: undefined }) }),
        "s01"
      ).join(" ")
    ).toContain("no fault is authored");
  });
});

describe("the required text trace is publication-blocking", () => {
  it("refuses a stage with no narration", () => {
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            stages: [{ ...journey.stages[0], narration: "   " }]
          })
        }),
        "s01"
      ).join(" ")
    ).toContain("narration must be non-empty text");
  });
});

describe("code-looking instructional content is never pattern-matched", () => {
  it("accepts configuration, markup and shell text as authored values", () => {
    // The platform has to be able to teach its own subject matter. Safety is
    // inertness and renderer escaping, never keyword rejection.
    const nodes = [
      {
        ...journey.nodes[0],
        interfaces: [
          {
            interfaceId: "pc-a-eth0",
            label: "<script>alert(1)</script>",
            attributes: [
              { label: "Command", value: "ip addr add 10.0.0.1/24 dev eth0" },
              { label: "Config", value: "encapsulation dot1Q 20" }
            ]
          }
        ]
      },
      journey.nodes[1]
    ];

    expect(
      validateInteractionContent(
        content({
          parameters: params({
            nodes,
            links: [
              {
                linkId: "link-a",
                label: "PC-A to Router-1",
                endpoints: ["pc-a-eth0", "r-1-gi0-0-10"]
              }
            ]
          })
        }),
        "s01"
      )
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The source discriminator
 * ------------------------------------------------------------------ */

describe("teaching mode and live mode are distinguished", () => {
  it("offers both source kinds in the shared vocabulary", () => {
    expect([...OBSERVATION_SOURCE_KINDS]).toEqual([
      "authored_teaching",
      "live_lab"
    ]);
  });

  it("accepts an authored teaching interaction", () => {
    expect(
      validateInteractionContent(content({ sourceKind: "authored_teaching" }), "s01")
    ).toEqual([]);
  });

  it("refuses a live_lab interaction until WP-K's adapter exists", () => {
    expect(
      validateInteractionContent(content({ sourceKind: "live_lab" }), "s01").join(" ")
    ).toContain("WP-K");
  });

  it("refuses an unrecognised source kind", () => {
    expect(
      validateInteractionContent(content({ sourceKind: "simulated" }), "s01").join(
        " "
      )
    ).toContain("sourceKind must be");
  });
});

/* ------------------------------------------------------------------ *
 * Support-level rules
 * ------------------------------------------------------------------ */

describe("support-level rules", () => {
  it("withholds answer-revealing content only at CHALLENGE ME and PROVE IT", () => {
    expect(withholdsAnswerRevealingContent("show_me")).toBe(false);
    expect(withholdsAnswerRevealingContent("help_me")).toBe(false);
    expect(withholdsAnswerRevealingContent("ask_me")).toBe(false);
    expect(withholdsAnswerRevealingContent("challenge_me")).toBe(true);
    expect(withholdsAnswerRevealingContent("prove_it")).toBe(true);
  });

  it("withholds a whole teaching interaction only at PROVE IT", () => {
    for (const level of INTERACTION_SUPPORT_LEVELS) {
      expect(withholdsEntireInteraction(level, "authored_teaching")).toBe(
        level === "prove_it"
      );
    }
  });

  it("does not withhold a future live interaction at PROVE IT", () => {
    // CURR-011 s11: authoritative observations are not instructional
    // assistance, so live mode renders with the expected path removed rather
    // than being withheld. The seam has to record that distinction now.
    expect(withholdsEntireInteraction("prove_it", "live_lab")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * The observation model projection
 * ------------------------------------------------------------------ */

const learnerParams = journey as unknown as LearnerPacketJourneyParameters;

describe("the observation model describes authored truth", () => {
  it("marks unobserved stages unknown rather than absent or false", () => {
    const model = buildPacketJourneyObservationModel(
      learnerParams,
      INITIAL_PACKET_JOURNEY_PROGRESS
    );

    expect(model.stages).toHaveLength(2);
    expect(model.stages.every((s) => s.availability === "unknown")).toBe(true);
    expect(model.currentStageId).toBeNull();
    expect(model.consequence).toBeNull();
  });

  it("marks reached stages available and names the current one", () => {
    const model = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 1,
      appliedActionId: null
    });

    expect(model.stages[0]?.availability).toBe("available");
    expect(model.stages[1]?.availability).toBe("unknown");
    expect(model.currentStageId).toBe("s1");
    expect(model.consequence?.state).toBe("proceeding");
  });

  it("stops at the authored stop point and shows the symptom", () => {
    const model = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 2,
      appliedActionId: null
    });

    expect(model.consequence?.state).toBe("stopped");
    expect(model.consequence?.symptom).toContain("packet loss");
  });

  it("offers remediation only once the failure has been observed", () => {
    const before = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 1,
      appliedActionId: null
    });
    const atStop = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 2,
      appliedActionId: null
    });

    expect(before.actions.every((a) => !a.available)).toBe(true);
    expect(atStop.actions.every((a) => a.available)).toBe(true);
  });

  it("lets the journey proceed once the authored repair is applied", () => {
    const model = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 2,
      appliedActionId: "add-vlan-20"
    });

    expect(model.stages[1]?.outcome).toBe("proceeds");
    expect(model.consequence?.state).toBe("confirmed");
    expect(model.consequence?.narration).toContain("reply returns");
  });

  it("keeps the journey stopped after an action that does not repair it", () => {
    const model = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 2,
      appliedActionId: "restart-pc-a"
    });

    expect(model.stages[1]?.outcome).toBe("stops");
    expect(model.consequence?.state).toBe("stopped");
  });

  it("labels the source so a presentation can say what it is looking at", () => {
    expect(
      buildPacketJourneyObservationModel(
        learnerParams,
        INITIAL_PACKET_JOURNEY_PROGRESS
      ).sourceKind
    ).toBe("authored_teaching");
  });

  it("produces an identical model for identical authored state and actions", () => {
    // No randomness, no clock, no AI. Determinism is what lets a learner and a
    // reviewer see the same lesson.
    const progress = { revealedStageCount: 2, appliedActionId: "add-vlan-20" };

    expect(
      buildPacketJourneyObservationModel(learnerParams, progress)
    ).toEqual(buildPacketJourneyObservationModel(learnerParams, progress));
  });

  it("tolerates a progress count beyond the authored stages", () => {
    const model = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 99,
      appliedActionId: null
    });

    expect(model.stages.every((s) => s.availability === "available")).toBe(true);
  });

  it("carries the traversed link through unchanged", () => {
    // WP-I correction. `viaLinkId` is copied from the authored stage, exactly
    // like `atNodeId` and `outcome`. The builder decides nothing about it.
    const model = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 2,
      appliedActionId: null
    });

    expect(model.stages[0]?.viaLinkId).toBeUndefined();
    expect(model.stages[1]?.viaLinkId).toBe("link-a");
  });

  it("keeps the traversed link the same once the repair is applied", () => {
    // Which link was crossed is the same fact whether the fault is present or
    // repaired. Only the authored outcome changes.
    const repaired = buildPacketJourneyObservationModel(learnerParams, {
      revealedStageCount: 2,
      appliedActionId: "add-vlan-20"
    });

    expect(repaired.stages[1]?.viaLinkId).toBe("link-a");
    expect(repaired.stages[1]?.outcome).toBe("proceeds");
  });

  it("carries the display flag through to the observation model", () => {
    // Copied, like everything else. The projection never decides which facts
    // matter, and a renderer that recognised "VLAN" by name would be networking
    // knowledge in the presentation layer.
    const flagged = {
      ...journey,
      nodes: [
        {
          ...journey.nodes[0]!,
          interfaces: [
            {
              interfaceId: "pc-a-eth0",
              label: "eth0",
              attributes: [
                { label: "VLAN", value: "10", prominent: true },
                { label: "IP address", value: "192.168.10.10/24" }
              ]
            }
          ]
        },
        journey.nodes[1]!
      ]
    } as unknown as LearnerPacketJourneyParameters;

    const attributes = buildPacketJourneyObservationModel(
      flagged,
      INITIAL_PACKET_JOURNEY_PROGRESS
    ).nodes[0]?.interfaces[0]?.attributes;

    expect(attributes?.[0]?.prominent).toBe(true);
    // Absent rather than false: nothing invents a default the author did not
    // write, and "not flagged" is not the same statement as "flagged off".
    expect(attributes?.[1] !== undefined && "prominent" in attributes[1]).toBe(
      false
    );
  });

  it("carries no competency, evidence, score or progress field", () => {
    const serialised = JSON.stringify(
      buildPacketJourneyObservationModel(learnerParams, {
        revealedStageCount: 2,
        appliedActionId: "add-vlan-20"
      })
    );

    for (const forbidden of ["competency", "evidence", "score", "passed"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe("interaction keys are scoped to one interaction", () => {
  it("accepts short internal keys the curriculum grammar would reject", () => {
    // Node and stage ids are not curriculum stable ids: they never appear in
    // publication events, version lineage or learner progress.
    expect(INTERACTION_KEY.test("s1")).toBe(true);
    expect(INTERACTION_KEY.test("pc-a")).toBe(true);
    expect(INTERACTION_KEY.test("Router-1")).toBe(false);
    expect(INTERACTION_KEY.test("")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Authored topology groups
 *
 * The Architect-approved additive fact: an author may declare groups and place
 * devices in them. It exists so a presentation can SHOW which devices are being
 * studied together without working it out — the inference the previous revision
 * correctly refused to make.
 *
 * These tests pin three things: the contract is strict, it is optional, and it
 * means nothing beyond membership.
 * ------------------------------------------------------------------ */

/**
 * The fixture's devices as plain objects.
 *
 * These tests hand the validator DELIBERATELY MALFORMED input — an unknown
 * field, a dangling reference — which the authored type exists to make
 * unrepresentable. Widening once here keeps that intent in one place instead of
 * a cast at every call site.
 */
const journeyNodes = journey.nodes as unknown as readonly Record<
  string,
  unknown
>[];

/** The same journey, with both devices placed in one authored group. */
const grouped = params({
  groups: [{ groupId: "local-network", label: "Local network" }],
  nodes: journeyNodes.map((node) => ({ ...node, groupId: "local-network" }))
});

describe("authored groups are optional and additive", () => {
  it("accepts an interaction that declares none", () => {
    // Every interaction authored before groups existed. If this ever fails,
    // the field stopped being additive.
    expect(validateInteractionContent(content(), "step")).toEqual([]);
    expect((journey as { groups?: unknown }).groups).toBeUndefined();
  });

  it("accepts an interaction that declares one and places devices in it", () => {
    expect(
      validateInteractionContent(content({ parameters: grouped }), "step")
    ).toEqual([]);
  });

  it("accepts a declared group nothing belongs to", () => {
    // Odd, but not invalid: an author may declare a group before authoring the
    // devices for it. The presentation simply draws no boundary.
    expect(
      validateInteractionContent(
        content({
          parameters: params({
            groups: [{ groupId: "local-network", label: "Local network" }]
          })
        }),
        "step"
      )
    ).toEqual([]);
  });
});

describe("group references must resolve, and fail closed when they do not", () => {
  it("refuses a device naming a group that was never declared", () => {
    const errors = validateInteractionContent(
      content({
        parameters: params({
          nodes: journeyNodes.map((node) => ({ ...node, groupId: "no-such-group" }))
        })
      }),
      "step"
    );

    // The tempting repair — inventing the group the author meant — is exactly
    // the inferred membership this contract removes, so authoring refuses.
    expect(errors.join(" ")).toContain("names a group that is not declared");
  });

  it("refuses two groups sharing an identifier", () => {
    const errors = validateInteractionContent(
      content({
        parameters: params({
          groups: [
            { groupId: "local-network", label: "Local network" },
            { groupId: "local-network", label: "The other one" }
          ]
        })
      }),
      "step"
    );

    expect(errors.join(" ")).toContain("duplicate identifier");
  });

  it("refuses an empty or malformed group identifier", () => {
    for (const groupId of ["", "Local Network", "local network"]) {
      const errors = validateInteractionContent(
        content({ parameters: params({ groups: [{ groupId, label: "x" }] }) }),
        "step"
      );

      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it("refuses a group with no label", () => {
    // The label is drawn on the boundary and read aloud in the arrangement
    // description. An unnamed boundary asserts a grouping without saying what
    // it is, which is worse than no boundary.
    const errors = validateInteractionContent(
      content({
        parameters: params({ groups: [{ groupId: "local-network", label: "  " }] })
      }),
      "step"
    );

    expect(errors.join(" ")).toContain("must be non-empty text");
  });

  it("refuses an unknown field on a group", () => {
    // The same rule as everywhere else in this contract, and it is what keeps
    // a group from quietly acquiring a subnet.
    const errors = validateInteractionContent(
      content({
        parameters: params({
          groups: [
            { groupId: "local-network", label: "Local network", subnet: "10.0.0.0/24" }
          ]
        })
      }),
      "step"
    );

    expect(errors.join(" ")).toContain('unknown field "subnet"');
  });

  it("refuses a group nested inside a group", () => {
    // There is no nesting in this slice, so a parent reference is an unknown
    // field rather than a relationship with undefined meaning.
    const errors = validateInteractionContent(
      content({
        parameters: params({
          groups: [
            { groupId: "campus", label: "Campus" },
            { groupId: "local-network", label: "Local network", parentGroupId: "campus" }
          ]
        })
      }),
      "step"
    );

    expect(errors.join(" ")).toContain('unknown field "parentGroupId"');
  });

  it("still refuses an unknown field on a node", () => {
    // `groupId` became allowed; nothing else did.
    const errors = validateInteractionContent(
      content({
        parameters: params({
          nodes: [
            { ...journeyNodes[0], subnet: "10.0.0.0/24" },
            journeyNodes[1]
          ]
        })
      }),
      "step"
    );

    expect(errors.join(" ")).toContain('unknown field "subnet"');
  });
});

describe("the projection copies group membership and never assigns it", () => {
  it("carries the declared groups into the observation model", () => {
    const model = buildPacketJourneyObservationModel(
      grouped as unknown as LearnerPacketJourneyParameters,
      INITIAL_PACKET_JOURNEY_PROGRESS
    );

    expect(model.groups).toEqual([
      { groupId: "local-network", label: "Local network" }
    ]);
    expect(model.nodes.map((node) => node.groupId)).toEqual([
      "local-network",
      "local-network"
    ]);
  });

  it("reports an empty list when the author declared none", () => {
    // Empty rather than absent, so a consumer never has to decide what a
    // missing list means.
    const model = buildPacketJourneyObservationModel(
      journey as unknown as LearnerPacketJourneyParameters,
      INITIAL_PACKET_JOURNEY_PROGRESS
    );

    expect(model.groups).toEqual([]);
    expect(model.nodes.every((node) => node.groupId === undefined)).toBe(true);
  });

  it("leaves an ungrouped device ungrouped", () => {
    // Router-1 is attached to PC-A and is in no group. Nothing promotes it on
    // the strength of being connected to a member.
    const partial = params({
      groups: [{ groupId: "local-network", label: "Local network" }],
      nodes: [
        {
          ...journeyNodes[0],
          groupId: "local-network"
        },
        journeyNodes[1]
      ]
    });

    expect(validateInteractionContent(content({ parameters: partial }), "step")).toEqual(
      []
    );

    const model = buildPacketJourneyObservationModel(
      partial as unknown as LearnerPacketJourneyParameters,
      INITIAL_PACKET_JOURNEY_PROGRESS
    );

    expect(model.nodes[0]?.groupId).toBe("local-network");
    expect(model.nodes[1]?.groupId).toBeUndefined();
  });

  it("adds no networking meaning to a group", () => {
    const model = buildPacketJourneyObservationModel(
      grouped as unknown as LearnerPacketJourneyParameters,
      INITIAL_PACKET_JOURNEY_PROGRESS
    );

    // A group is an id and a label. There is nothing else in one to read, so
    // no consumer can recover a subnet, a domain or a reachability claim.
    expect(Object.keys(model.groups[0] ?? {}).sort()).toEqual([
      "groupId",
      "label"
    ]);

    const serialised = JSON.stringify(model.groups);
    for (const forbidden of [
      "subnet",
      "mask",
      "vlan",
      "broadcast",
      "routing",
      "gateway",
      "reachable"
    ]) {
      expect(serialised.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("an authored device explanation is optional, validated and copied", () => {
  /**
   * WP-J Module 1, Founder UAT — device inspection.
   *
   * `about` is one optional authored string per node, carrying what that
   * device is doing in this scenario. Like every other authored string here it
   * is checked for shape and never for content: the validator is not a
   * proofreader, and what the sentence teaches is a Human UAT judgement.
   */
  const explained = params({
    nodes: journeyNodes.map((node) => ({
      ...node,
      about: "This device is here for a reason the author explains."
    }))
  });

  it("accepts an interaction that authors none", () => {
    // The additive test. Every interaction written before this field existed
    // must still validate exactly as it did.
    expect(validateInteractionContent(content(), "step")).toEqual([]);
  });

  it("accepts an authored explanation", () => {
    expect(
      validateInteractionContent(content({ parameters: explained }), "step")
    ).toEqual([]);
  });

  it("refuses an explanation that is present but empty", () => {
    // A blank string is an authoring accident, not a decision to write none.
    // Absent and empty must not mean the same thing.
    const errors = validateInteractionContent(
      content({
        parameters: params({
          nodes: [{ ...journeyNodes[0], about: "   " }, journeyNodes[1]]
        })
      }),
      "step"
    );

    expect(errors.join(" ")).toContain("about");
  });

  it("refuses an explanation past the authored text ceiling", () => {
    const errors = validateInteractionContent(
      content({
        parameters: params({
          nodes: [
            { ...journeyNodes[0], about: "x".repeat(100_000) },
            journeyNodes[1]
          ]
        })
      }),
      "step"
    );

    expect(errors.join(" ")).toContain("about");
  });

  it("copies it into the observation model verbatim", () => {
    // Copied, never composed, summarised or supplied. What the learner reads
    // is exactly what the author wrote.
    const model = buildPacketJourneyObservationModel(
      explained as unknown as LearnerPacketJourneyParameters,
      INITIAL_PACKET_JOURNEY_PROGRESS
    );

    expect(model.nodes.map((node) => node.about)).toEqual([
      "This device is here for a reason the author explains.",
      "This device is here for a reason the author explains."
    ]);
  });

  it("leaves an unexplained device unexplained", () => {
    const model = buildPacketJourneyObservationModel(
      journey as unknown as LearnerPacketJourneyParameters,
      INITIAL_PACKET_JOURNEY_PROGRESS
    );

    expect(model.nodes.every((node) => node.about === undefined)).toBe(true);
  });
});
