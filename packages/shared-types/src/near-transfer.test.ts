import { describe, expect, it } from "vitest";
import {
  NEAR_TRANSFER_QUESTION_TYPES,
  isNearTransferAnswerCorrect,
  validateNearTransferContent,
  type NearTransferContent,
  type NearTransferQuestion
} from "./near-transfer";
import {
  validateMissionStepContent,
  type MissionStepContent
} from "./mission-steps";

/**
 * WP-NF-NT1 — the generic near-transfer contract.
 *
 * Nothing in this file mentions a mission, a course, Laptop-A or a switch. The
 * capability is generic and these tests hold it to that: the Mission 1 content
 * is protected separately, in the course's own suite.
 */

/* ------------------------------------------------------------------ *
 * A valid authored check, and one deliberate change per test
 * ------------------------------------------------------------------ */

function valid(): Record<string, unknown> {
  return {
    type: "near_transfer",
    title: "A title",
    framing: "Some framing.",
    topology: {
      nodes: [
        { nodeId: "a", label: "A", role: "host" },
        { nodeId: "b", label: "B", role: "switch" },
        { nodeId: "c", label: "C", role: "router", about: "A note." }
      ],
      links: [
        { linkId: "ab", label: "A to B", endpoints: ["a", "b"] },
        { linkId: "cb", label: "C to B", endpoints: ["c", "b"] }
      ],
      externalNetworks: [
        { networkId: "beyond", label: "Somewhere else", attachedToNodeId: "c" }
      ],
      textEquivalent:
        "A connects to B. C connects to B. C also connects to somewhere else."
    },
    questions: [
      {
        questionStableId: "q1",
        type: "multiple_choice",
        prompt: "Which two?",
        options: [
          { optionId: "o1", text: "A" },
          { optionId: "o2", text: "B" },
          { optionId: "o3", text: "C" }
        ],
        correctOptionIds: ["o1", "o3"],
        explanation: "Because of the reason."
      },
      {
        questionStableId: "q2",
        type: "single_choice",
        prompt: "Which one?",
        options: [
          { optionId: "p1", text: "A" },
          { optionId: "p2", text: "B" }
        ],
        correctOptionIds: ["p2"],
        explanation: "Because of the other reason."
      }
    ]
  };
}

/** Apply one mutation to an otherwise valid check, and validate the result. */
function withChange(
  apply: (draft: Record<string, unknown>) => void
): readonly string[] {
  const draft = valid();
  apply(draft);
  return validateNearTransferContent(draft, "step");
}

function questions(draft: Record<string, unknown>): Record<string, unknown>[] {
  return draft.questions as Record<string, unknown>[];
}

function topology(draft: Record<string, unknown>): Record<string, unknown> {
  return draft.topology as Record<string, unknown>;
}

describe("an authored near-transfer check", () => {
  it("accepts a complete one", () => {
    expect(validateNearTransferContent(valid(), "step")).toEqual([]);
  });

  it("is accepted through the mission step vocabulary, not only directly", () => {
    // Test 1 of the work package: the curriculum schema itself accepts it.
    // Validating the module in isolation would prove the rules run, not that
    // a mission can carry one.
    expect(
      validateMissionStepContent(valid() as unknown as MissionStepContent, "step")
    ).toEqual([]);
  });

  it("offers exactly two question types", () => {
    expect([...NEAR_TRANSFER_QUESTION_TYPES]).toEqual([
      "single_choice",
      "multiple_choice"
    ]);
  });

  it("needs no topology: a question can be about prose alone", () => {
    const draft = valid();
    delete draft.topology;

    expect(validateNearTransferContent(draft, "step")).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Rejection. Each of these is a way an authored check could be wrong in a
 * manner only a learner would discover.
 * ------------------------------------------------------------------ */

describe("a malformed near-transfer check is rejected", () => {
  it("refuses an unknown field at the top level", () => {
    const errors = withChange((draft) => {
      draft.passingPercent = 80;
    });

    // Named specifically. `passingPercent` is the exact vocabulary this
    // capability exists to stay out of, so an author reaching for it should
    // be told the field does not exist rather than have it quietly ignored.
    expect(errors.join(" ")).toContain("passingPercent");
  });

  it("refuses an unknown field inside a question", () => {
    const errors = withChange((draft) => {
      const q = questions(draft)[0];
      if (q) q.points = 5;
    });

    expect(errors.join(" ")).toContain("points");
  });

  it("refuses an unknown field inside an option", () => {
    const errors = withChange((draft) => {
      const option = (questions(draft)[0]?.options as Record<string, unknown>[])[0];
      if (option) option.correct = true;
    });

    expect(errors.join(" ")).toContain('unknown field "correct"');
  });

  it("refuses an unknown field inside the topology", () => {
    const errors = withChange((draft) => {
      topology(draft).stages = [];
    });

    // A near-transfer topology is a network at rest. `stages` would be the
    // first step towards a journey nobody authored.
    expect(errors.join(" ")).toContain('unknown field "stages"');
  });

  it("refuses a check that asks nothing", () => {
    const errors = withChange((draft) => {
      draft.questions = [];
    });

    expect(errors.join(" ")).toContain("at least one question");
  });

  it("refuses a question with fewer than two choices", () => {
    const errors = withChange((draft) => {
      const q = questions(draft)[1];
      if (q) q.options = [{ optionId: "p1", text: "A" }];
    });

    expect(errors.join(" ")).toContain("at least two choices");
  });

  it("refuses a question with no authored explanation", () => {
    const errors = withChange((draft) => {
      const q = questions(draft)[0];
      if (q) q.explanation = "   ";
    });

    expect(errors.join(" ")).toContain("explanation is required");
  });

  it("refuses an answer that names an option nobody is offered", () => {
    const errors = withChange((draft) => {
      const q = questions(draft)[1];
      if (q) q.correctOptionIds = ["p9"];
    });

    expect(errors.join(" ")).toContain("not offered");
  });

  it("refuses a single-choice question with two correct answers", () => {
    const errors = withChange((draft) => {
      const q = questions(draft)[1];
      if (q) q.correctOptionIds = ["p1", "p2"];
    });

    expect(errors.join(" ")).toContain("must name exactly one");
  });

  it("refuses a multiple-choice question with no correct answer", () => {
    const errors = withChange((draft) => {
      const q = questions(draft)[0];
      if (q) q.correctOptionIds = [];
    });

    expect(errors.join(" ")).toContain("at least one option");
  });

  it("refuses two options that share an id", () => {
    const errors = withChange((draft) => {
      const options = questions(draft)[1]?.options as Record<string, unknown>[];
      if (options[1]) options[1].optionId = "p1";
    });

    expect(errors.join(" ")).toContain('reuses the identifier "p1"');
  });

  it("refuses two questions that share an id", () => {
    const errors = withChange((draft) => {
      const q = questions(draft)[1];
      if (q) q.questionStableId = "q1";
    });

    expect(errors.join(" ")).toContain('reuses the identifier "q1"');
  });

  it("refuses a link to a device that is not on the diagram", () => {
    const errors = withChange((draft) => {
      const links = topology(draft).links as Record<string, unknown>[];
      if (links[0]) links[0].endpoints = ["a", "z"];
    });

    expect(errors.join(" ")).toContain("not in this topology");
  });

  it("refuses two links that share an id", () => {
    const errors = withChange((draft) => {
      const links = topology(draft).links as Record<string, unknown>[];
      if (links[1]) links[1].linkId = "ab";
    });

    expect(errors.join(" ")).toContain('reuses the identifier "ab"');
  });

  it("refuses two devices that share an id", () => {
    const errors = withChange((draft) => {
      const nodes = topology(draft).nodes as Record<string, unknown>[];
      if (nodes[1]) nodes[1].nodeId = "a";
    });

    expect(errors.join(" ")).toContain('reuses the identifier "a"');
  });

  it("refuses a drawing whose meaning exists only in pixels", () => {
    const errors = withChange((draft) => {
      topology(draft).textEquivalent = "";
    });

    expect(errors.join(" ")).toContain("must receive the same relationships in words");
  });

  it("refuses a topology with no textEquivalent at all", () => {
    const errors = withChange((draft) => {
      delete topology(draft).textEquivalent;
    });

    expect(errors.join(" ")).toContain('is missing "textEquivalent"');
  });

  it("refuses a network reached through a device that is not on the diagram", () => {
    // It would draw a wire from nowhere, or nothing at all — and "nothing at
    // all" is exactly the defect this feature exists to close.
    const errors = withChange((draft) => {
      const networks = topology(draft).externalNetworks as Record<
        string,
        unknown
      >[];
      if (networks[0]) networks[0].attachedToNodeId = "not-a-device";
    });

    expect(errors.join(" ")).toContain("not in this topology");
  });

  it("refuses a network with no label", () => {
    // The label is what a learner reads on the plate. An empty one draws a
    // shape that states nothing.
    const errors = withChange((draft) => {
      const networks = topology(draft).externalNetworks as Record<
        string,
        unknown
      >[];
      if (networks[0]) networks[0].label = "  ";
    });

    expect(errors.join(" ")).toContain("label is empty");
  });

  it("refuses two networks that share an id", () => {
    const errors = withChange((draft) => {
      topology(draft).externalNetworks = [
        { networkId: "beyond", label: "One", attachedToNodeId: "c" },
        { networkId: "beyond", label: "Two", attachedToNodeId: "a" }
      ];
    });

    expect(errors.join(" ")).toContain('reuses the identifier "beyond"');
  });

  it("refuses an unknown field on a network", () => {
    // `role` in particular: a network past the edge is not a device, and
    // giving it one would be the first step to drawing it as another card.
    const errors = withChange((draft) => {
      const networks = topology(draft).externalNetworks as Record<
        string,
        unknown
      >[];
      if (networks[0]) networks[0].role = "router";
    });

    expect(errors.join(" ")).toContain('unknown field "role"');
  });

  it("accepts a topology that declares no external network", () => {
    const draft = valid();
    delete topology(draft).externalNetworks;

    expect(validateNearTransferContent(draft, "step")).toEqual([]);
  });

  it("refuses a device whose role is not one the renderer draws", () => {
    const errors = withChange((draft) => {
      const nodes = topology(draft).nodes as Record<string, unknown>[];
      if (nodes[0]) nodes[0].role = "firewall";
    });

    expect(errors.join(" ")).toContain("must be host, switch, router or printer");
  });

  it("reports every problem in one pass, rather than the first", () => {
    // The collector convention. An author fixing one field at a time and
    // re-running is how a five-minute correction becomes an afternoon.
    const errors = withChange((draft) => {
      draft.questions = [];
      draft.title = "";
    });

    expect(errors.length).toBeGreaterThan(1);
  });
});

/* ------------------------------------------------------------------ *
 * Correctness
 * ------------------------------------------------------------------ */

function question(
  type: "single_choice" | "multiple_choice",
  correctOptionIds: readonly string[]
): NearTransferQuestion {
  return {
    questionStableId: "q",
    type,
    prompt: "?",
    options: [
      { optionId: "a", text: "A" },
      { optionId: "b", text: "B" },
      { optionId: "c", text: "C" }
    ],
    correctOptionIds,
    explanation: "Because."
  };
}

describe("correctness is authored, deterministic and exact", () => {
  it("accepts the single authored answer", () => {
    expect(isNearTransferAnswerCorrect(question("single_choice", ["b"]), ["b"])).toBe(
      true
    );
  });

  it("rejects a different single answer", () => {
    expect(isNearTransferAnswerCorrect(question("single_choice", ["b"]), ["a"])).toBe(
      false
    );
  });

  it("accepts a multiple-choice set in any order", () => {
    const q = question("multiple_choice", ["a", "c"]);

    expect(isNearTransferAnswerCorrect(q, ["c", "a"])).toBe(true);
  });

  it("rejects a subset of the authored answer", () => {
    // No partial credit. A learner who names one of two hosts has not answered
    // "which two devices are hosts", and being told they were partly right
    // would teach them that they were.
    const q = question("multiple_choice", ["a", "c"]);

    expect(isNearTransferAnswerCorrect(q, ["a"])).toBe(false);
  });

  it("rejects a superset of the authored answer", () => {
    const q = question("multiple_choice", ["a", "c"]);

    expect(isNearTransferAnswerCorrect(q, ["a", "b", "c"])).toBe(false);
  });

  it("rejects an empty selection", () => {
    expect(isNearTransferAnswerCorrect(question("single_choice", ["b"]), [])).toBe(
      false
    );
  });

  it("ignores a repeated selection rather than counting it", () => {
    const q = question("multiple_choice", ["a", "c"]);

    expect(isNearTransferAnswerCorrect(q, ["a", "c", "a"])).toBe(true);
  });

  it("is a pure comparison, with nothing to consult", () => {
    // Test 14: no AI decides correctness. Proved by the shape of the thing —
    // the function takes authored content and a selection, returns a boolean,
    // and there is nothing else in scope it could ask.
    expect(isNearTransferAnswerCorrect.length).toBe(2);

    const source = isNearTransferAnswerCorrect.toString();
    for (const forbidden of ["fetch", "await", "provider", "prompt("]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

/* ------------------------------------------------------------------ *
 * What it must never become
 * ------------------------------------------------------------------ */

describe("a near-transfer check produces nothing", () => {
  it("has no field for a score, an attempt, or competency", () => {
    // Tests 12 and 13, checked against the CONTRACT rather than one instance:
    // the only fields that exist are the ones listed, so there is nowhere for
    // an attempt or a competency reference to be recorded even by mistake.
    const content: NearTransferContent = valid() as unknown as NearTransferContent;

    expect(Object.keys(content).sort()).toEqual([
      "framing",
      "questions",
      "title",
      "topology",
      "type"
    ]);

    const names = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      if (value === null || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        names.add(key);
        walk(nested);
      }
    };
    walk(content);

    for (const forbidden of [
      "score",
      "points",
      "passingPercent",
      "maxAttempts",
      "attempts",
      "mastery",
      "evidence",
      "competencyStableId",
      "streak"
    ]) {
      expect(names.has(forbidden)).toBe(false);
    }
  });

  it("rejects any of those fields if an author adds one", () => {
    for (const forbidden of [
      "score",
      "points",
      "passingPercent",
      "maxAttempts",
      "competencyStableId"
    ]) {
      const errors = withChange((draft) => {
        draft[forbidden] = 1;
      });

      expect(errors.join(" ")).toContain(forbidden);
    }
  });
});


/* ------------------------------------------------------------------ *
 * PORT NAMES ON A CONNECTION
 *
 * Founder UAT, Mission 2's "Try it on a different switch": the questions ask
 * which ports carry copies and which entry the switch learns, and the diagram
 * named no port. The mapping lived only in prose.
 *
 * The renderer was never the gap. `buildTopologyLayout` has drawn `prominent`
 * interface labels beside wires since WP-I; this contract simply had no way to
 * say which port a link occupies on a device, so there was nothing to flag.
 * These fix the shape of that answer, which is what stops a later author
 * writing a port name onto a device the wire does not reach.
 * ------------------------------------------------------------------ */

function links(draft: Record<string, unknown>): Record<string, unknown>[] {
  return topology(draft).links as Record<string, unknown>[];
}

describe("a port name on a connection", () => {
  it("is optional, and its absence is not a defect", () => {
    // Every topology authored before this existed declares none.
    expect(validateNearTransferContent(valid(), "step")).toEqual([]);
  });

  it("is accepted on either end, or on both", () => {
    expect(
      withChange((draft) => {
        links(draft)[0]!.portLabels = [{ nodeId: "b", label: "Port 1" }];
        links(draft)[1]!.portLabels = [
          { nodeId: "b", label: "Port 2" },
          { nodeId: "c", label: "Gi0/0" }
        ];
      })
    ).toEqual([]);
  });

  it("is refused on a device the connection does not reach", () => {
    // The label would be drawn against a wire that does not touch it.
    expect(
      withChange((draft) => {
        links(draft)[0]!.portLabels = [{ nodeId: "c", label: "Port 1" }];
      })
    ).toEqual([
      "step.topology.links[0].portLabels[0].nodeId is not an endpoint of this link: c"
    ]);
  });

  it("is refused twice on one end", () => {
    // Two names for one port is two answers to one question.
    expect(
      withChange((draft) => {
        links(draft)[0]!.portLabels = [
          { nodeId: "b", label: "Port 1" },
          { nodeId: "b", label: "Port 9" }
        ];
      })
    ).toEqual(["step.topology.links[0].portLabels[1] names b a second time"]);
  });

  it("is refused empty, or with an unknown key, or as a non-list", () => {
    expect(
      withChange((draft) => {
        links(draft)[0]!.portLabels = [{ nodeId: "b", label: "  " }];
      })
    ).toEqual(["step.topology.links[0].portLabels[0].label is empty"]);

    expect(
      withChange((draft) => {
        links(draft)[0]!.portLabels = [
          { nodeId: "b", label: "Port 1", prominent: true }
        ];
      })
    ).not.toEqual([]);

    expect(
      withChange((draft) => {
        links(draft)[0]!.portLabels = "Port 1";
      })
    ).toEqual(["step.topology.links[0].portLabels must be a list"]);
  });
});
