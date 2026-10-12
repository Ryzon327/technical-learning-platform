/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  MISSION_VERSION_UNAVAILABLE_REASON,
  type LearnerMissionInstructionResponse,
  type NearTransferCheckRequest
} from "@tlp/shared-types";
import { ApiRequestError } from "../lib/api-client";

/**
 * G-009 — the near-transfer check, as `LearningView` wires it.
 *
 * `MissionInstruction` is tested on its own in
 * `mission-instruction-focus.test.tsx`. This proves the two facts only the
 * view can: the version a check names is the `mission.version` of the lesson
 * the view loaded, and Reload re-runs the view's own instruction load.
 *
 * Only the session and the service module are replaced; the view, the
 * presentation functions and the lesson renderer are the real ones.
 */

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ session: { access_token: "learner-token" } })
}));

vi.mock("./learning-service", () => ({
  loadPublishedLearningPath: vi.fn(),
  loadLearningPathProgress: vi.fn(),
  loadResumeTarget: vi.fn(),
  loadRecommendedNextAction: vi.fn(),
  loadMissionInstruction: vi.fn(),
  checkNearTransferAnswer: vi.fn(),
  recordMissionProgress: vi.fn()
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const service = await import("./learning-service");
const { LearningView } = await import("./LearningView");

/** A lesson with one near-transfer question, served at `version`. */
function lesson(
  missionStableId: string,
  version: number
): LearnerMissionInstructionResponse {
  return {
    mission: { stableId: missionStableId, version, title: "A mission" },
    instruction: {
      state: "available",
      assets: [],
      steps: [
        {
          stableId: "the-check",
          position: 0,
          content: {
            type: "near_transfer",
            title: `Version ${version} activity`,
            questions: [
              {
                questionStableId: "q1",
                type: "single_choice",
                prompt: "Which device joins two networks?",
                options: [
                  { optionId: "router", text: "The router" },
                  { optionId: "switch", text: "The switch" }
                ]
              }
            ]
          }
        }
      ]
    }
  };
}

const unavailable = () =>
  Promise.reject(
    new ApiRequestError({
      message: "The platform could not complete that request.",
      code: "DEPENDENCY_UNAVAILABLE",
      status: 503,
      retryable: true
    })
  );

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  vi.mocked(service.loadPublishedLearningPath).mockImplementation(unavailable);
  vi.mocked(service.loadLearningPathProgress).mockImplementation(unavailable);
  vi.mocked(service.loadResumeTarget).mockImplementation(unavailable);
  vi.mocked(service.loadRecommendedNextAction).mockImplementation(unavailable);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Render the view and open the first mission in the outline. */
async function openFirstMission(): Promise<string> {
  await act(async () => {
    root.render(<LearningView />);
  });
  await settle();

  const first = container.querySelector<HTMLButtonElement>(
    'nav[aria-labelledby="learning-outline-title"] button'
  );
  if (first === null) throw new Error("the course outline rendered no mission");
  const missionStableId = first.getAttribute("aria-controls") ?? "";
  act(() => first.click());
  await settle();
  return missionStableId;
}

function answer(optionId: string): void {
  const option = container.querySelector<HTMLInputElement>(
    `input[value="${optionId}"]`
  );
  if (option === null) throw new Error(`option ${optionId} is not rendered`);
  act(() => option.click());
  const submit = container.querySelector<HTMLButtonElement>(
    ".near-transfer-submit"
  );
  if (submit === null) throw new Error("Submit is not rendered");
  act(() => submit.click());
}

describe("G-009: a near-transfer check names the version of the lesson the view loaded", () => {
  it("sends the loaded mission.version, and Reload re-runs the instruction load", async () => {
    const served = [7, 8];
    vi.mocked(service.loadMissionInstruction).mockImplementation(
      async (_token, missionStableId) =>
        lesson(missionStableId, served.shift() ?? 99)
    );
    const sent: NearTransferCheckRequest[] = [];
    vi.mocked(service.checkNearTransferAnswer).mockImplementation(
      (_token, _missionStableId, request) => {
        sent.push(request);
        return Promise.reject(
          new ApiRequestError({
            message: "This activity was updated. Please reload to continue.",
            code: "CONFLICT",
            status: 409,
            retryable: false,
            details: { reason: MISSION_VERSION_UNAVAILABLE_REASON }
          })
        );
      }
    );

    await openFirstMission();
    expect(service.loadMissionInstruction).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Version 7 activity");

    answer("router");
    await settle();

    // The version is the one delivered WITH the lesson on screen.
    expect(sent).toEqual([
      {
        missionVersion: 7,
        stepStableId: "the-check",
        questionStableId: "q1",
        selectedOptionIds: ["router"]
      }
    ]);
    expect(container.textContent).toContain(
      "This activity was updated. Please reload to continue."
    );
    expect(container.textContent).not.toContain("Submit it again");

    const reload = container.querySelector<HTMLButtonElement>(
      ".near-transfer-reload"
    );
    expect(reload).not.toBeNull();
    act(() => reload?.click());
    await settle();

    // The SAME instruction load ran again, for the same mission, and the
    // reloaded lesson replaced the stale one, its activity starting fresh.
    expect(service.loadMissionInstruction).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = vi.mocked(service.loadMissionInstruction)
      .mock.calls;
    expect(secondCall?.[1]).toBe(firstCall?.[1]);
    expect(container.textContent).toContain("Version 8 activity");
    expect(container.textContent).not.toContain("Version 7 activity");
    expect(container.querySelector(".near-transfer-reload")).toBeNull();
    expect(container.textContent).not.toContain(
      "This activity was updated. Please reload to continue."
    );

    // The next check names the RELOADED lesson's version.
    answer("switch");
    await settle();
    expect(sent.map((request) => request.missionVersion)).toEqual([7, 8]);
  });
});
