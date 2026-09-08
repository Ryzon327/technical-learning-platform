/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  LearnerMissionStep,
  LearnerPacketJourneyParameters
} from "@tlp/shared-types";
import { MissionInstruction } from "./MissionInstruction";
import { nextInstructionStepId } from "./near-transfer-presentation";

/**
 * The ONE test in this repository that observes focus rather than inferring it.
 *
 * ## Why it exists
 *
 * Mutation testing found the gap it fills. Deleting a single production line —
 * `stepRefs.current.get(revealTarget)?.focus()` — disabled BOTH instructional
 * focus handoffs while every suite and every gate stayed green. The pure
 * helpers still returned the right step id, the settlement still flipped, the
 * reveal still happened; nothing moved focus, and nothing could tell.
 *
 * Both paths converge on that one effect, so one mutation kills both. Each
 * case below therefore asserts independently, and each must fail on its own.
 *
 * ## What it proves, and what it does not
 *
 * It proves that after a learner finishes a required activity, `activeElement`
 * is the section of the step that press revealed. That is a mechanical
 * property of a live DOM.
 *
 * It does NOT prove the handoff is usable, that a screen reader announces
 * anything sensible, or that the movement feels right. jsdom is not a browser
 * and has no assistive technology. Rendered Architect/Founder UAT is still
 * where those are decided.
 */

const MISSION = "nf-test-mission";

/*
  jsdom is missing two things the journey touches on every click.

  `scrollIntoView` does not exist at all, and `moveToBeat` calls it unguarded
  after each advance — an unstubbed run throws inside a rAF callback where the
  failure surfaces as an unhandled rejection rather than a failed assertion.

  `requestAnimationFrame` exists but is asynchronous, which is the subtler
  hazard: a rAF scheduled by the LAST advance can fire after the Finish click
  and call `heading.focus()`, stealing focus from the section the reveal just
  moved to. Making it synchronous keeps each click's focus effects inside that
  click's own `act()` window, so the last focus to run is the one the reveal
  performed — which is exactly the ordering a browser produces and the thing
  under test.
*/
/*
  React 19 reads this global to decide whether `act` is legitimate. It is not
  in the ambient DOM lib types, so it is declared rather than cast at each use.
*/
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let realRaf: typeof globalThis.requestAnimationFrame;

/*
  Mounted trees are torn down UNCONDITIONALLY, in `afterEach`.

  Calling `unmount()` at the end of each test looks equivalent and is not: a
  failing assertion returns before it, leaving the tree attached to
  `document.body` with `activeElement` still pointing into it. The next test
  then starts with another test's focus, and its failure message names an
  element it never rendered — which is exactly what the first mutation run
  produced before this existed.
*/
const mounted: { container: HTMLElement; root: Root }[] = [];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  realRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  }) as typeof globalThis.requestAnimationFrame;
});

afterEach(() => {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (entry === undefined) break;
    act(() => entry.root.unmount());
    entry.container.remove();
  }

  globalThis.requestAnimationFrame = realRaf;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

/** Mount into a real detached container and return it with its root. */
function mount(steps: readonly LearnerMissionStep[]): {
  container: HTMLElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <MissionInstruction
        steps={steps}
        assets={[]}
        missionStableId={MISSION}
        instructionGeneration={1}
      />
    );
  });

  const entry = { container, root };
  mounted.push(entry);
  return entry;
}

/** Every rendered step section, by the stable id its ref is keyed on. */
function sectionOf(container: HTMLElement, index: number): HTMLElement {
  const sections = container.querySelectorAll<HTMLElement>(".instruction-step");
  const section = sections[index];
  if (section === undefined) {
    throw new Error(
      `no step section at index ${index}; ${sections.length} rendered`
    );
  }
  return section;
}

function click(element: Element | null | undefined, what: string): void {
  if (!(element instanceof HTMLElement)) {
    throw new Error(`cannot click ${what}: it is not rendered`);
  }
  act(() => {
    element.click();
  });
}

function byText(
  container: HTMLElement,
  selector: string,
  text: string
): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>(selector)].find(
    (element) => element.textContent?.trim() === text
  );
}

/* ------------------------------------------------------------------ *
 * Fixtures — the smallest publication-valid shapes that reach settlement
 * ------------------------------------------------------------------ */

/**
 * Two stages, both proceeding, no prediction and no decision.
 *
 * A prediction would gate the advance and suppress the advance control; a
 * `decision` would insert an extra explanatory beat and a `Continue` click.
 * Neither adds anything to a focus test, and both make it fragile.
 *
 * Link endpoints are INTERFACE ids — the packet journey's links join
 * interfaces, unlike the near-transfer topology's, which join nodes.
 */
const JOURNEY: LearnerPacketJourneyParameters = {
  interactionType: "packet_journey",
  nodes: [
    {
      nodeId: "pc-a",
      label: "PC-A",
      role: "host",
      interfaces: [{ interfaceId: "pc-a-eth0", label: "eth0", attributes: [] }]
    },
    {
      nodeId: "sw-1",
      label: "Switch-1",
      role: "switch",
      interfaces: [{ interfaceId: "sw-1-p1", label: "Port 1", attributes: [] }]
    }
  ],
  links: [
    {
      linkId: "link-a",
      label: "PC-A to Switch-1 port 1",
      endpoints: ["pc-a-eth0", "sw-1-p1"]
    }
  ],
  traffic: {
    label: "one delivery",
    sourceNodeId: "pc-a",
    destinationNodeId: "sw-1",
    startActionLabel: "Send the delivery"
  },
  stages: [
    {
      stageId: "s1",
      atNodeId: "pc-a",
      narration: "PC-A sends.",
      outcome: "proceeds"
    },
    {
      stageId: "s2",
      atNodeId: "sw-1",
      narration: "It arrives at Switch-1.",
      outcome: "proceeds",
      viaLinkId: "link-a"
    }
  ],
  confirmation: {
    narration: "Delivered.",
    summary: "One delivery, one connection."
  }
};

const REQUIRED_JOURNEY_STEP: LearnerMissionStep = {
  stableId: "the-walkthrough",
  position: 0,
  content: {
    type: "interaction",
    interactionStableId: "a-journey",
    interactionType: "packet_journey",
    sourceKind: "authored_teaching",
    supportLevel: "show_me",
    textEquivalent: "Follow one delivery from PC-A to Switch-1.",
    requiredForProgression: true,
    presentation: { state: "available", parameters: JOURNEY }
  }
};

const REQUIRED_CHECK_STEP: LearnerMissionStep = {
  stableId: "the-check",
  position: 0,
  content: {
    type: "near_transfer",
    title: "Try a different network",
    framing: "One question about a network you have not seen.",
    questions: [
      {
        questionStableId: "q1",
        type: "single_choice",
        prompt: "Which device carries traffic between the two machines?",
        options: [
          { optionId: "a", text: "Switch-9" },
          { optionId: "b", text: "PC-Z" }
        ]
      }
    ],
    answers: {
      q1: {
        correctOptionIds: ["a"],
        explanation: "A switch is what carries traffic inside one network."
      }
    }
  }
};

const SUCCESSOR: LearnerMissionStep = {
  stableId: "what-comes-next",
  position: 1,
  content: {
    type: "concept",
    title: "What you just watched",
    paragraphs: ["The delivery crossed one connection."]
  }
};

/* ------------------------------------------------------------------ *
 * CASE A — the Packet Journey's Finish activity
 * ------------------------------------------------------------------ */

describe("finishing a required Packet Journey moves focus to what it revealed", () => {
  it("focuses the successor step's section, and it is not a Tab stop", () => {
    const steps = [REQUIRED_JOURNEY_STEP, SUCCESSOR];
    const { container } = mount(steps);

    // Withheld to begin with: the successor must not be on screen yet, or
    // there would be nothing for finishing to reveal.
    expect(container.querySelectorAll(".instruction-step")).toHaveLength(1);

    // Two advances, exactly. The start control is never rendered — the view
    // state begins `started: true` — so the advance button is the only way
    // forward, and its label changes between the two presses.
    click(
      container.querySelector(".packet-journey-advance"),
      "the first advance"
    );
    click(
      container.querySelector(".packet-journey-advance"),
      "the second advance"
    );

    const finish = container.querySelector<HTMLElement>(
      ".packet-journey-settle"
    );
    expect(finish?.textContent?.trim()).toBe("Finish activity");

    click(finish, "Finish activity");

    // 1. the successor is rendered
    expect(container.querySelectorAll(".instruction-step")).toHaveLength(2);
    const successor = sectionOf(container, 1);
    expect(successor.textContent).toContain("What you just watched");

    // 2. focus is ON it — read from the live DOM, not from a helper
    expect(document.activeElement).toBe(successor);

    // 3. programmatically focusable only
    expect(successor.tabIndex).toBe(-1);

    // 4. the control that was pressed is gone, so it cannot still hold focus
    expect(container.querySelector(".packet-journey-settle")).toBeNull();
    expect(document.activeElement).not.toBe(finish);

    // 5. no ordinary Tab stop was added: every step section stays at -1
    for (const section of container.querySelectorAll<HTMLElement>(
      ".instruction-step"
    )) {
      expect(section.tabIndex).toBe(-1);
    }

  });
});

/* ------------------------------------------------------------------ *
 * CASE B — the near-transfer's Finish
 * ------------------------------------------------------------------ */

describe("finishing a required near-transfer moves focus to what it revealed", () => {
  it("focuses the successor step's section, and it is not a Tab stop", () => {
    const steps = [REQUIRED_CHECK_STEP, SUCCESSOR];
    const { container } = mount(steps);

    expect(container.querySelectorAll(".instruction-step")).toHaveLength(1);

    // Answer, commit, finish — the three acts the component actually offers.
    const option = container.querySelector<HTMLInputElement>(
      'input[type="radio"]'
    );
    expect(option).not.toBeNull();
    click(option, "the first option");

    const submit = container.querySelector<HTMLButtonElement>(
      ".near-transfer-submit"
    );
    expect(submit?.textContent?.trim()).toBe("Submit answer");
    expect(submit?.disabled).toBe(false);
    click(submit, "Submit answer");

    // The label is "Finish" only on the LAST question, which this is.
    const finish = container.querySelector<HTMLElement>(
      ".near-transfer-advance"
    );
    expect(finish?.textContent?.trim()).toBe("Finish");

    click(finish, "Finish");

    expect(container.querySelectorAll(".instruction-step")).toHaveLength(2);
    const successor = sectionOf(container, 1);
    expect(successor.textContent).toContain("What you just watched");

    expect(document.activeElement).toBe(successor);
    expect(successor.tabIndex).toBe(-1);

    expect(container.querySelector(".near-transfer-advance")).toBeNull();
    expect(document.activeElement).not.toBe(finish);

    for (const section of container.querySelectorAll<HTMLElement>(
      ".instruction-step"
    )) {
      expect(section.tabIndex).toBe(-1);
    }

  });

  it("resolves Mission 2's near-transfer successor to the closing step", () => {
    /*
      The one Mission-2-specific fact, asserted against the production helper
      rather than by rendering the whole mission. Re-authoring nine steps in a
      DOM test would make it fragile without proving anything the two cases
      above do not already prove about the mechanism.
    */
    const missionTwoOrder: readonly LearnerMissionStep[] = [
      { ...REQUIRED_CHECK_STEP, stableId: "m2-s8-try-a-different-switch" },
      { ...SUCCESSOR, stableId: "m2-s9-what-comes-next" }
    ];

    expect(
      nextInstructionStepId(missionTwoOrder, "m2-s8-try-a-different-switch")
    ).toBe("m2-s9-what-comes-next");
  });
});

/* ------------------------------------------------------------------ *
 * CASE C — a required activity with nothing after it
 * ------------------------------------------------------------------ */

describe("a terminal required activity invents no successor to focus", () => {
  it("settles without moving focus anywhere, and without throwing", () => {
    // The activity IS the last authored step. `nextInstructionStepId` returns
    // null, the reveal effect returns early, and nothing is focused — which is
    // correct: there is nowhere to go, and a fabricated target would be a
    // heading no author wrote.
    const { container } = mount([REQUIRED_JOURNEY_STEP]);

    click(container.querySelector(".packet-journey-advance"), "advance one");
    click(container.querySelector(".packet-journey-advance"), "advance two");

    const finish = container.querySelector<HTMLElement>(
      ".packet-journey-settle"
    );
    expect(finish?.textContent?.trim()).toBe("Finish activity");

    click(finish, "Finish activity");

    // Still exactly one step, and no invented element took focus.
    expect(container.querySelectorAll(".instruction-step")).toHaveLength(1);
    expect(document.activeElement).not.toBe(finish);

    /*
      And nothing was fabricated to receive it.

      The failure this guards against is a well-meant one: adding an empty or
      visually-hidden element purely so focus has somewhere to land. That is
      curriculum nobody authored, and a screen reader would announce it.
    */
    expect(container.querySelector('[aria-hidden="true"][tabindex]')).toBeNull();
    expect(container.querySelector(".sr-only, .visually-hidden")).toBeNull();

    // The only focusable-by-script element is the step section that was
    // already there; no new -1 target appeared alongside it.
    const programmatic = container.querySelectorAll<HTMLElement>(
      '[tabindex="-1"]'
    );
    expect([...programmatic].every((element) =>
      element.classList.contains("instruction-step") ||
      element.classList.contains("packet-journey-beat-heading")
    )).toBe(true);

  });
});
