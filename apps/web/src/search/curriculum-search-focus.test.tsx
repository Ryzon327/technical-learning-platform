/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  describeCurriculumOriginalQueryAction,
  describeCurriculumOriginalQueryEmptyState,
  describeCurriculumSearchClearFilters,
  type CurriculumSearchContentType,
  type SearchDocument
} from "@tlp/shared-types";
import type { CurriculumSearchResponse } from "./curriculum-search-service";
import { CurriculumSearchView } from "./CurriculumSearchView";

/**
 * SEARCH-INTERACTION-REPAIR-1 — focus continuity and original-query facets in
 * the REAL CurriculumSearchView, observed in a live DOM.
 *
 * Follows `learning/mission-instruction-focus.test.tsx`: it asserts
 * `document.activeElement` and rendered text, never a helper's return value.
 *
 * ## Why each loading-state case also asserts `disabled === false`
 *
 * jsdom does not blur an element when it becomes disabled; Chromium does. A
 * regression back to `disabled={searching}` would therefore leave
 * `activeElement` on the control here and pass a focus-only assertion, while a
 * real browser drops focus to <body> — the defect this package repairs. The
 * `disabled` assertion is what fails in jsdom for that regression.
 *
 * ## What it does not prove
 *
 * Visible focus quality, screen-reader announcement, and real key handling.
 * jsdom is not a browser; rendered Architect/Founder review decides those.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/* The view's only collaborators, replaced so each search settles on demand. */
const searchCurriculum = vi.fn();
const searchMyNotes = vi.fn();
const listCurriculumNavigation = vi.fn();

vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ session: { access_token: "test-token" } })
}));
vi.mock("./curriculum-search-service", () => ({
  searchCurriculum: (...args: unknown[]) => searchCurriculum(...args)
}));
vi.mock("./note-search-service", () => ({
  searchMyNotes: (...args: unknown[]) => searchMyNotes(...args)
}));
vi.mock("./curriculum-navigation-service", () => ({
  listCurriculumNavigation: (...args: unknown[]) =>
    listCurriculumNavigation(...args)
}));

/* ------------------------------------------------------------------ *
 * Fixtures — placeholder text, not curriculum
 * ------------------------------------------------------------------ */

function doc(id: string, contentType: CurriculumSearchContentType): SearchDocument {
  return {
    modelVersion: "fixture",
    documentId: `fixture-${id}`,
    sourceEngine: "curriculum",
    sourceRecordStableId: `fixture-${id}`,
    sourceVersion: 1,
    sourceUpdatedAt: "2026-10-02T00:00:00Z",
    indexedAt: "2026-10-02T00:00:00Z",
    contentType,
    title: `Fixture ${id}`,
    searchableText: `Fixture text ${id}.`,
    keywords: [],
    sourceReference: `/fixture/${id}`,
    publicationState: "published",
    accessScope: "shared"
  };
}

function response(
  results: SearchDocument[],
  extra: Partial<CurriculumSearchResponse> = {}
): CurriculumSearchResponse {
  const order: CurriculumSearchContentType[] = [
    "learning_path",
    "course",
    "mission",
    "competency"
  ];
  return {
    results,
    count: results.length,
    facets: {
      contentTypes: order
        .map((value) => ({
          value,
          label: value,
          count: results.filter((result) => result.contentType === value).length
        }))
        .filter((facet) => facet.count > 0)
    },
    ...extra
  } as CurriculumSearchResponse;
}

const MIXED = response([doc("p1", "learning_path"), doc("c1", "course")]);
const COURSES = response([doc("c1", "course")]);
const EMPTY = response([]);

/** A promise the test settles explicitly, so the loading state is observable. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/* ------------------------------------------------------------------ *
 * Harness
 * ------------------------------------------------------------------ */

const mounted: { container: HTMLElement; root: Root }[] = [];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  searchCurriculum.mockReset();
  searchMyNotes.mockReset().mockResolvedValue([]);
  listCurriculumNavigation.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (entry === undefined) break;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

function mount(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<CurriculumSearchView />));
  mounted.push({ container, root });
  return container;
}

function queryInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    "#curriculum-search-query"
  );
  if (input === null) throw new Error("query input is not rendered");
  return input;
}

function checkbox(
  container: HTMLElement,
  contentType: CurriculumSearchContentType
): HTMLInputElement {
  const box = container.querySelector<HTMLInputElement>(
    `#curriculum-search-filter-${contentType}`
  );
  if (box === null) throw new Error(`${contentType} filter is not rendered`);
  return box;
}

function buttonByText(
  container: HTMLElement,
  text: string
): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text
  );
}

function fallbackClearButton(
  container: HTMLElement
): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    'section[aria-labelledby="search-fallback-heading"] button'
  );
}

/** Type a query and submit the form, settling with `outcome`. */
async function submit(
  container: HTMLElement,
  query: string,
  outcome: CurriculumSearchResponse
): Promise<void> {
  const input = queryInput(container);
  act(() => {
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setValue?.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  searchCurriculum.mockResolvedValueOnce(outcome);
  await act(async () => {
    input.form?.requestSubmit();
  });
}

/**
 * Focus `control`, activate it the way Space/Enter does (a click), and leave
 * the search it starts PENDING so the loading state can be observed.
 */
function activatePending(control: HTMLElement) {
  const pending = deferred<CurriculumSearchResponse>();
  searchCurriculum.mockReturnValueOnce(pending.promise);
  act(() => {
    control.focus();
    control.click();
  });
  return pending;
}

async function settle(work: () => void): Promise<void> {
  await act(async () => {
    work();
  });
}

/* ------------------------------------------------------------------ *
 * Filter checkboxes
 * ------------------------------------------------------------------ */

describe("filter toggle keeps focus on the checkbox", () => {
  it("while loading and after a successful search", async () => {
    const container = mount();
    await submit(container, "network", MIXED);

    const course = checkbox(container, "course");
    const pending = activatePending(course);

    expect(document.activeElement).toBe(course);
    expect(course.disabled).toBe(false);
    expect(course.getAttribute("aria-disabled")).toBe("true");

    await settle(() => pending.resolve(COURSES));

    expect(document.activeElement).toBe(checkbox(container, "course"));
    expect(course.checked).toBe(true);
    expect(course.getAttribute("aria-disabled")).toBe("false");
  });

  it("after a search that returns nothing", async () => {
    const container = mount();
    await submit(container, "network", MIXED);

    const course = checkbox(container, "course");
    const pending = activatePending(course);
    await settle(() => pending.resolve(EMPTY));

    expect(document.activeElement).toBe(course);
  });

  it("ignores activation while a search is already running", async () => {
    const container = mount();
    await submit(container, "network", MIXED);

    const course = checkbox(container, "course");
    const pending = activatePending(course);
    const calls = searchCurriculum.mock.calls.length;

    const mission = checkbox(container, "mission");
    act(() => mission.click());

    expect(searchCurriculum.mock.calls.length).toBe(calls);
    expect(mission.checked).toBe(false);

    await settle(() => pending.resolve(COURSES));
  });

  it("moves focus to the query input when search becomes unavailable", async () => {
    const container = mount();
    await submit(container, "network", MIXED);

    const course = checkbox(container, "course");
    const pending = activatePending(course);
    expect(document.activeElement).toBe(course);

    await settle(() => pending.reject(new Error("network down")));

    // The filter group is gone with the results; focus must not fall to body.
    expect(container.querySelector("fieldset")).toBeNull();
    expect(document.activeElement).toBe(queryInput(container));
  });
});

/* ------------------------------------------------------------------ *
 * Clear controls
 * ------------------------------------------------------------------ */

describe("clearing filters", () => {
  it("keeps focus on Clear filters while loading, then moves to the input", async () => {
    const container = mount();
    await submit(container, "network", MIXED);

    const course = checkbox(container, "course");
    const toggled = activatePending(course);
    await settle(() => toggled.resolve(COURSES));

    const clear = buttonByText(container, describeCurriculumSearchClearFilters());
    if (clear === undefined) throw new Error("Clear filters is not rendered");

    const pending = activatePending(clear);
    expect(document.activeElement).toBe(clear);
    expect(clear.disabled).toBe(false);
    expect(clear.getAttribute("aria-disabled")).toBe("true");

    await settle(() => pending.resolve(MIXED));

    // Nothing is left to clear, so the button is disabled and cannot hold focus.
    expect(clear.disabled).toBe(true);
    expect(document.activeElement).toBe(queryInput(container));
  });

  it("moves focus from the fallback clear button to the input as soon as it is removed", async () => {
    const container = mount();
    await submit(container, "network", MIXED);

    const toggled = activatePending(checkbox(container, "course"));
    await settle(() => toggled.resolve(EMPTY));

    const fallbackClear = fallbackClearButton(container);
    if (fallbackClear === null) throw new Error("fallback clear is not rendered");
    expect(fallbackClear.getAttribute("aria-disabled")).toBe("false");

    // No filter is active from the moment it is pressed, so the suggestion is
    // removed while the search is still loading — focus must not wait for it.
    const pending = activatePending(fallbackClear);
    expect(fallbackClear.isConnected).toBe(false);
    expect(container.textContent).toContain("Searching curriculum…");
    expect(document.activeElement).toBe(queryInput(container));

    await settle(() => pending.resolve(EMPTY));

    expect(fallbackClearButton(container)).toBeNull();
    expect(document.activeElement).toBe(queryInput(container));
  });

  it("does not take focus back once the learner has moved it", async () => {
    const container = mount();
    await submit(container, "network", MIXED);

    const toggled = activatePending(checkbox(container, "course"));
    await settle(() => toggled.resolve(COURSES));

    const clear = buttonByText(container, describeCurriculumSearchClearFilters());
    if (clear === undefined) throw new Error("Clear filters is not rendered");
    const pending = activatePending(clear);

    const resultLink = container.querySelector<HTMLAnchorElement>("ol a");
    if (resultLink === null) throw new Error("no result link rendered");
    act(() => resultLink.focus());

    await settle(() => pending.resolve(MIXED));

    expect(document.activeElement).not.toBe(queryInput(container));
    expect(document.activeElement).not.toBe(document.body);
  });
});

/* ------------------------------------------------------------------ *
 * Original-query activation
 * ------------------------------------------------------------------ */

describe("returning to the original query", () => {
  const TYPO = response([doc("c9", "course")], {
    queryAdjustment: {
      originalQuery: "kubctl",
      effectiveQuery: "kubectl",
      adjustmentKind: "typo"
    }
  } as Partial<CurriculumSearchResponse>);

  function facetLabelText(container: HTMLElement): string {
    return [...container.querySelectorAll("fieldset label")]
      .map((label) => label.textContent ?? "")
      .join("\n");
  }

  it("moves focus to the query input when the activated action disappears", async () => {
    const container = mount();
    await submit(container, "kubctl", TYPO);

    const action = buttonByText(
      container,
      describeCurriculumOriginalQueryAction("kubctl")
    );
    if (action === undefined) throw new Error("original-query action missing");

    act(() => {
      action.focus();
      action.click();
    });

    expect(action.isConnected).toBe(false);
    expect(document.activeElement).toBe(queryInput(container));
  });

  it("shows no recovered-result facet count beside the original-query empty state", async () => {
    const container = mount();
    await submit(container, "kubctl", TYPO);

    // Before: the recovered results are displayed, and so are their counts.
    expect(facetLabelText(container)).toContain("in these results");

    const action = buttonByText(
      container,
      describeCurriculumOriginalQueryAction("kubctl")
    );
    if (action === undefined) throw new Error("original-query action missing");
    act(() => action.click());

    expect(container.textContent).toContain(
      describeCurriculumOriginalQueryEmptyState("kubctl")
    );
    expect(container.querySelector("ol")).toBeNull();
    expect(facetLabelText(container)).not.toContain("in these results");
  });
});
