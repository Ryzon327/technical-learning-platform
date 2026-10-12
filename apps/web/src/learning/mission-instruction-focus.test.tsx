/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MISSION_VERSION_UNAVAILABLE_REASON,
  checkNearTransferAnswer,
  type LearnerMissionStep,
  type LearnerPacketJourneyParameters,
  type NearTransferCheckRequest,
  type NearTransferCheckResult
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
  requests.length = 0;
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

/*
  WP-008 — the server's side of the near-transfer check (DEC-074).

  The learner step carries no answer, so the lesson asks for a verdict. This
  stands in for the API: it holds the authored answer the browser never sees,
  decides with the same shared `checkNearTransferAnswer`, and records every
  request so a test can see exactly what crossed the wire.
*/
const AUTHORED_ANSWER = {
  correctOptionIds: ["a"],
  explanation: "A switch is what carries traffic inside one network."
};

type Checker = (
  missionStableId: string,
  request: NearTransferCheckRequest
) => Promise<NearTransferCheckResult>;

const requests: Array<{ missionStableId: string; request: NearTransferCheckRequest }> = [];

const serverCheck: Checker = async (missionStableId, request) => {
  requests.push({ missionStableId, request });
  const content = REQUIRED_CHECK_STEP.content;
  if (content.type !== "near_transfer") throw new Error("not a near transfer");
  const question = content.questions.find(
    (candidate) => candidate.questionStableId === request.questionStableId
  );
  if (question === undefined) throw new Error("no such question");
  return checkNearTransferAnswer(
    { ...question, ...AUTHORED_ANSWER },
    request.selectedOptionIds
  );
};

/** Let a pending check settle, inside `act`, as a browser would. */
async function settleChecks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Mount into a real detached container and return it with its root. */
/** G-009: the version the lesson was "served" at; deliberately not 1. */
const MISSION_VERSION = 4;

function mount(
  steps: readonly LearnerMissionStep[],
  checker: Checker = serverCheck,
  onReloadInstruction?: () => void
): {
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
        missionVersion={MISSION_VERSION}
        instructionGeneration={1}
        checkNearTransferAnswer={checker}
        {...(onReloadInstruction !== undefined ? { onReloadInstruction } : {})}
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
    ]
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
  it("focuses the successor step's section, and it is not a Tab stop", async () => {
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
    // WP-008: the verdict is the server's, so let the check settle.
    await settleChecks();

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
 * WP-008 — the verdict is the server's, and the answer is not in the page
 * ------------------------------------------------------------------ */

describe("a committed near-transfer answer is judged by the server (WP-008)", () => {
  function choose(container: HTMLElement, optionId: string): void {
    click(
      container.querySelector(`input[value="${optionId}"]`),
      `option ${optionId}`
    );
  }

  function submit(container: HTMLElement): void {
    click(container.querySelector(".near-transfer-submit"), "Submit answer");
  }

  it("renders no authored answer or explanation before the learner commits", () => {
    const { container } = mount([REQUIRED_CHECK_STEP, SUCCESSOR]);

    expect(container.textContent).not.toContain(AUTHORED_ANSWER.explanation);
    expect(container.textContent).not.toContain("The expected answer");
    expect(JSON.stringify(REQUIRED_CHECK_STEP)).not.toContain("correctOptionIds");
    expect(requests).toEqual([]);
  });

  // G-009 added `missionVersion` to the request this test expects.
  it("sends the step, the question and the selection, and renders a correct verdict", async () => {
    const { container } = mount([REQUIRED_CHECK_STEP, SUCCESSOR]);

    choose(container, "a");
    submit(container);
    await settleChecks();

    expect(requests).toEqual([
      {
        missionStableId: MISSION,
        request: {
          missionVersion: MISSION_VERSION,
          stepStableId: "the-check",
          questionStableId: "q1",
          selectedOptionIds: ["a"]
        }
      }
    ]);

    const result = container.querySelector(".near-transfer-result");
    expect(result?.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector(".near-transfer-verdict")?.textContent).toBe(
      "Correct"
    );
    expect(result?.textContent).toContain("You chose: Switch-9");
    expect(result?.textContent).not.toContain("The expected answer");
    expect(result?.textContent).toContain(AUTHORED_ANSWER.explanation);
  });

  it("renders a wrong verdict without the authored answer (G-007, DEC-074)", async () => {
    const { container } = mount([REQUIRED_CHECK_STEP, SUCCESSOR]);

    choose(container, "b");
    submit(container);
    await settleChecks();

    const result = container.querySelector(".near-transfer-result");
    expect(container.querySelector(".near-transfer-verdict")?.textContent).toBe(
      "Not quite"
    );
    expect(result?.textContent).toContain("You chose: PC-Z");
    expect(result?.textContent).not.toContain("The expected answer");
    expect(result?.textContent).not.toContain("Switch-9");
    expect(result?.textContent).toContain(AUTHORED_ANSWER.explanation);

    // Being wrong never blocks: Finish still reveals what comes next.
    click(container.querySelector(".near-transfer-advance"), "Finish");
    expect(container.querySelectorAll(".instruction-step")).toHaveLength(2);
  });

  it("a check that fails says so, commits nothing, and can be submitted again", async () => {
    let fail = true;
    const flaky: Checker = (missionStableId, request) =>
      fail
        ? Promise.reject(new Error("network"))
        : serverCheck(missionStableId, request);
    const { container } = mount([REQUIRED_CHECK_STEP, SUCCESSOR], flaky);

    choose(container, "a");
    submit(container);
    await settleChecks();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      "Your answer could not be checked. Submit it again to try once more."
    );
    expect(container.querySelector(".near-transfer-result")).toBeNull();
    const retry = container.querySelector<HTMLButtonElement>(
      ".near-transfer-submit"
    );
    expect(retry?.disabled).toBe(false);
    expect(
      container.querySelector<HTMLInputElement>('input[value="a"]')?.checked
    ).toBe(true);

    fail = false;
    submit(container);
    await settleChecks();

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector(".near-transfer-verdict")?.textContent).toBe(
      "Correct"
    );
  });

  /*
    G-009 — the server refused to judge because the version on screen is no
    longer published. A distinct state: reload, never "submit it again".
  */
  const versionUnavailable = Object.assign(
    new Error("This activity was updated. Please reload to continue."),
    {
      code: "CONFLICT",
      status: 409,
      retryable: false,
      details: { reason: MISSION_VERSION_UNAVAILABLE_REASON }
    }
  );

  /** Focus Submit as a keyboard learner would, then press it. */
  function submitFromKeyboard(container: HTMLElement): HTMLButtonElement {
    const button = container.querySelector<HTMLButtonElement>(
      ".near-transfer-submit"
    );
    if (button === null) throw new Error("Submit is not rendered");
    act(() => button.focus());
    expect(document.activeElement).toBe(button);
    submit(container);
    return button;
  }

  it("G-009: a version-unavailable check shows the reload state, not the retry text, and commits nothing", async () => {
    let reloads = 0;
    const { container } = mount(
      [REQUIRED_CHECK_STEP, SUCCESSOR],
      () => Promise.reject(versionUnavailable),
      () => {
        reloads += 1;
      }
    );

    choose(container, "a");
    submit(container);
    await settleChecks();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      "This activity was updated. Please reload to continue."
    );
    expect(container.textContent).not.toContain("Submit it again");
    expect(container.textContent).not.toContain("could not be checked");
    // No verdict, no explanation, nothing revealed after the activity.
    expect(container.querySelector(".near-transfer-result")).toBeNull();
    expect(container.querySelector(".near-transfer-verdict")).toBeNull();
    expect(container.textContent).not.toContain(AUTHORED_ANSWER.explanation);
    expect(container.querySelectorAll(".instruction-step")).toHaveLength(1);

    const reload = container.querySelector<HTMLButtonElement>(
      ".near-transfer-reload"
    );
    expect(reload?.textContent?.trim()).toBe("Reload");
    expect(reload?.type).toBe("button");
    expect(reloads).toBe(0);
    click(reload, "Reload");
    expect(reloads).toBe(1);
  });

  it("G-009: an ordinary failed check still offers a retry and no reload", async () => {
    const { container } = mount(
      [REQUIRED_CHECK_STEP, SUCCESSOR],
      () => Promise.reject(new Error("network")),
      () => undefined
    );

    choose(container, "a");
    submit(container);
    await settleChecks();

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Your answer could not be checked. Submit it again to try once more."
    );
    expect(container.querySelector(".near-transfer-reload")).toBeNull();
  });

  it("G-009: focus lands where the existing check-failed state leaves it", async () => {
    // The existing check-failed state moves no focus: it stays on Submit.
    const failed = mount(
      [REQUIRED_CHECK_STEP, SUCCESSOR],
      () => Promise.reject(new Error("network"))
    );
    choose(failed.container, "a");
    const failedSubmit = submitFromKeyboard(failed.container);
    await settleChecks();
    expect(failed.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.activeElement).toBe(failedSubmit);

    act(() => failed.root.unmount());
    failed.container.remove();
    mounted.splice(mounted.indexOf(failed), 1);

    // The version-unavailable state does exactly the same.
    const stale = mount(
      [REQUIRED_CHECK_STEP, SUCCESSOR],
      () => Promise.reject(versionUnavailable),
      () => undefined
    );
    choose(stale.container, "a");
    const staleSubmit = submitFromKeyboard(stale.container);
    await settleChecks();
    expect(stale.container.querySelector(".near-transfer-reload")).not.toBeNull();
    expect(document.activeElement).toBe(staleSubmit);
  });

  it("disables Submit while the answer is with the server", async () => {
    let release: (result: NearTransferCheckResult) => void = () => undefined;
    const pending: Checker = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const { container } = mount([REQUIRED_CHECK_STEP, SUCCESSOR], pending);

    choose(container, "a");
    submit(container);

    expect(
      container.querySelector<HTMLButtonElement>(".near-transfer-submit")
        ?.disabled
    ).toBe(true);

    await act(async () => {
      release({
        correct: true,
        explanation: AUTHORED_ANSWER.explanation
      });
      await Promise.resolve();
    });

    expect(container.querySelector(".near-transfer-verdict")?.textContent).toBe(
      "Correct"
    );
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
