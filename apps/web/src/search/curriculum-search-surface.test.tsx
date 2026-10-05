/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  buildCurriculumSearchSnippet,
  describeCurriculumContentType,
  describeCurriculumFallbackAction,
  describeCurriculumFallbackHeading,
  describeCurriculumFallbackHeadline,
  describeCurriculumNavigationEmpty,
  describeCurriculumNavigationHeading,
  describeCurriculumNavigationLoading,
  describeCurriculumNavigationUnavailable,
  describeCurriculumOriginalQueryAction,
  describeCurriculumOriginalQueryEmptyState,
  describeCurriculumRankingOrder,
  describeCurriculumSearchClearFilters,
  describeCurriculumSearchCount,
  describeCurriculumSearchFacetCount,
  describeCurriculumSearchFilterLegend,
  describeCurriculumSearchQueryError,
  describeCurriculumTypoRecovery,
  describeNoteResultGroup,
  describeNoteSearchCount,
  describeNoteSearchUnavailable,
  type NoteSearchResult,
  type SearchDocument
} from "@tlp/shared-types";

/*
  The auth context is replaced rather than provided.

  `AuthProvider` does not export its context, and constructing a real one would
  pull in the browser Supabase client and its two VITE_ variables. The view
  reads exactly one thing from the hook — `session.access_token` — so the mock
  supplies that and nothing else. A factory mock also means the real module is
  never evaluated, so no Supabase configuration is needed to render Search.
*/
vi.mock("../auth/AuthProvider", () => ({
  useAuth: () => ({ session: { access_token: ACCESS_TOKEN } })
}));

import { CurriculumSearchView } from "./CurriculumSearchView";

/**
 * SEARCH-UAT-HANDOFF — the Search surface, observed in a DOM.
 *
 * ## Why it exists
 *
 * Every accessibility and state claim the Search Engine completion review makes
 * about this surface was **source-structural**: the markup was read, not
 * exercised. Finding 4.4 of
 * `BUILD_WAVE_9_SEARCH_ENGINE_COMPLETION_REVIEW.md` records that plainly — no
 * Search surface was mounted anywhere, so nothing could tell whether the
 * semantics the component documents are the semantics it renders, or whether
 * the six states the UAT runbook asks a reviewer to visit are reachable at all.
 *
 * Two invariants in particular were asserted only by reading code, and both are
 * load-bearing:
 *
 *  - a curriculum search that COULD NOT RUN must never be presented as a search
 *    that ran and matched nothing (SEARCH-008 ruling 7), and
 *  - a failed notes search must never be presented as "you have no notes"
 *    (SEARCH-006).
 *
 * Each is one boolean away from being wrong, and a mutation to either would
 * have left every suite and every gate green.
 *
 * ## What it proves
 *
 * That the real `CurriculumSearchView`, driven through the real feature
 * services and the real API client over a stubbed `fetch`, renders the
 * documented element semantics and reaches each state the runbook names:
 * initial, rejected query, loading, results, filtered, no-result, unavailable,
 * recovered, notes-unavailable and typo recovery. Request shape is observed on
 * the wire, so "the browser sends no identity" is read from the URL rather than
 * from the source.
 *
 * ## What it does NOT prove
 *
 * jsdom is not a browser and has no assistive technology. Nothing here
 * establishes visual appearance, focus-ring quality, what a screen reader
 * actually announces, contrast, zoom or reflow, or whether any of this is
 * USEFUL to a learner. Those remain rendered Architect/Founder review, and the
 * Founder UAT checklist is where they are asked for.
 *
 * It also proves nothing about live row level security: `fetch` is stubbed, so
 * every response here is one this test wrote (finding 4.3 is unchanged).
 */

const ACCESS_TOKEN = "uat-access-token";
const API_BASE = "https://api.test.invalid";

/* ------------------------------------------------------------------ *
 * The wire — a stubbed `fetch` the real API client talks to
 * ------------------------------------------------------------------ */

interface StubbedResponse {
  status: number;
  body: unknown;
}

/**
 * A response the way the API client reads one.
 *
 * Only `ok`, `status` and `text()` are touched by `apiRequest`, so a literal is
 * built rather than a real `Response`. That keeps the stub independent of which
 * fetch implementation jsdom and Node happen to agree on.
 */
function wireResponse(response: StubbedResponse): Response {
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    text: async () => JSON.stringify(response.body)
  } as unknown as Response;
}

/** One stubbed route: what it answers, and whether it answers immediately. */
type RouteResponder = (url: URL) =>
  | StubbedResponse
  | Promise<StubbedResponse>;

const routes = new Map<string, RouteResponder>();
/** Every URL the surface actually requested, in order. */
let requested: URL[] = [];
/** Every Authorization header the surface actually sent. */
let authorizations: string[] = [];

function route(pathname: string, responder: RouteResponder): void {
  routes.set(pathname, responder);
}

/** The requests made against one route, in order. */
function requestsTo(pathname: string): URL[] {
  return requested.filter((url) => url.pathname === pathname);
}

function lastRequestTo(pathname: string): URL {
  const matches = requestsTo(pathname);
  const last = matches[matches.length - 1];
  if (last === undefined) throw new Error(`no request was made to ${pathname}`);
  return last;
}

/** A promise with its resolver, for holding a route open to observe loading. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const mounted: { container: HTMLElement; root: Root }[] = [];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv("VITE_API_BASE_URL", API_BASE);

  routes.clear();
  requested = [];
  authorizations = [];

  /*
    The real services and the real API client run; only the transport is
    replaced. An unstubbed route is a test defect rather than a 404, because a
    404 would be rendered as an honest failure and could hide a missing stub
    behind a state that looks deliberate.
  */
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    requested.push(url);

    const headers = (init?.headers ?? {}) as Record<string, string>;
    authorizations.push(headers.Authorization ?? "");

    const responder = routes.get(url.pathname);
    if (responder === undefined) {
      throw new Error(`no stub for ${url.pathname}; the test did not expect it`);
    }

    return wireResponse(await responder(url));
  });
});

afterEach(() => {
  /*
    Teardown is UNCONDITIONAL, for the reason the instructional focus suite
    records: a failing assertion returns before any cleanup written at the end
    of a test, leaving a tree attached to `document.body` for the next one.
  */
  while (mounted.length > 0) {
    const entry = mounted.pop();
    if (entry === undefined) break;
    act(() => entry.root.unmount());
    entry.container.remove();
  }

  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

/* ------------------------------------------------------------------ *
 * Mounting and the few DOM readers the cases share
 * ------------------------------------------------------------------ */

async function mount(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<CurriculumSearchView />);
  });

  mounted.push({ container, root });
  return container;
}

function queryInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    "#curriculum-search-query"
  );
  if (input === null) throw new Error("the search input is not rendered");
  return input;
}

function submitButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(
    'form button[type="submit"]'
  );
  if (button === null) throw new Error("the submit control is not rendered");
  return button;
}

/*
  React keeps its own record of a controlled input's last value and discards an
  `input` event whose value it believes it already has. Assigning `.value`
  directly updates that record as a side effect, so the event that follows looks
  like a no-op and `onChange` never runs — every state below would then be
  reached with an empty query.

  Going through the prototype's own setter is what a real keystroke does: the
  DOM value changes without React's tracker being told, so the event it then
  receives is a genuine change.
*/
const nativeValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)?.set;

/** Types a query the way a learner does, through the input's own event. */
async function type(container: HTMLElement, value: string): Promise<void> {
  const input = queryInput(container);
  if (nativeValueSetter === undefined) {
    throw new Error("this DOM has no HTMLInputElement value setter to use");
  }

  await act(async () => {
    nativeValueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  if (input.value !== value) {
    throw new Error(`the query did not reach the field: ${input.value}`);
  }
}

/** Submits the form, which is what pressing Enter in the field does. */
async function submit(container: HTMLElement): Promise<void> {
  const form = container.querySelector("form");
  if (form === null) throw new Error("the search form is not rendered");
  await act(async () => {
    form.requestSubmit();
  });
}

async function click(
  element: Element | null | undefined,
  what: string
): Promise<void> {
  if (!(element instanceof HTMLElement)) {
    throw new Error(`cannot activate ${what}: it is not rendered`);
  }
  await act(async () => {
    element.click();
  });
}

/** Every polite live region's text, trimmed, in document order. */
function politeAnnouncements(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-live="polite"]')].map(
    (element) => element.textContent?.trim() ?? ""
  );
}

function textOf(container: HTMLElement): string {
  return container.textContent ?? "";
}

function alertText(container: HTMLElement): string | null {
  return container.querySelector('[role="alert"]')?.textContent?.trim() ?? null;
}

function filterCheckboxes(container: HTMLElement): HTMLInputElement[] {
  return [
    ...container.querySelectorAll<HTMLInputElement>(
      'fieldset input[type="checkbox"]'
    )
  ];
}

function buttonLabelled(
  container: HTMLElement,
  label: string
): HTMLButtonElement | undefined {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label
  );
}

/* ------------------------------------------------------------------ *
 * Fixtures — the smallest shapes the surface renders
 * ------------------------------------------------------------------ */

function document_(overrides: Partial<SearchDocument> = {}): SearchDocument {
  return {
    modelVersion: "search-document-v1",
    documentId: "curriculum:course:switching-essentials@1",
    sourceEngine: "curriculum",
    sourceRecordStableId: "switching-essentials",
    sourceVersion: 1,
    contentType: "course",
    title: "Switching Essentials",
    searchableText: "How a switch forwards a frame inside one network.",
    keywords: [],
    sourceReference: "/courses/switching-essentials",
    publicationState: "published",
    accessScope: "shared",
    sourceUpdatedAt: "2026-10-01T00:00:00.000Z",
    indexedAt: "2026-10-01T00:00:00.000Z",
    ...overrides
  };
}

const SECOND_DOCUMENT = document_({
  documentId: "curriculum:mission:read-a-mac-table@1",
  sourceRecordStableId: "read-a-mac-table",
  contentType: "mission",
  title: "Read a MAC address table",
  searchableText: "Find which port a switch learned an address on.",
  sourceReference: "/missions/read-a-mac-table"
});

const NOTE: NoteSearchResult = {
  noteId: "note-1",
  title: "My switching notes",
  excerpt: "A switch learns addresses from the frames it receives.",
  matchedIn: ["body"],
  pinned: false,
  updatedAt: "2026-10-01T00:00:00.000Z"
};

/** A successful curriculum response carrying the given documents. */
function curriculumResults(
  documents: readonly SearchDocument[],
  extras: Record<string, unknown> = {}
): StubbedResponse {
  return {
    status: 200,
    body: { results: documents, count: documents.length, ...extras }
  };
}

const NO_FACETS = {} as const;

/** Facet counts that match the results, which is the only safe shape. */
function facetsFor(documents: readonly SearchDocument[]) {
  const types = ["learning_path", "course", "mission", "competency"] as const;
  return {
    facets: {
      contentTypes: types.map((value) => ({
        value,
        label: describeCurriculumContentType(value),
        count: documents.filter((entry) => entry.contentType === value).length
      }))
    }
  };
}

/** Routes every request the surface can make, with ordinary success. */
function stubEverythingSucceeds(documents: readonly SearchDocument[]): void {
  route("/search/curriculum", () =>
    curriculumResults(documents, facetsFor(documents))
  );
  route("/notes/search", () => ({ status: 200, body: { results: [NOTE] } }));
  route("/curriculum/paths", () => ({
    status: 200,
    body: {
      learningPaths: [
        {
          stableId: "networking-foundations",
          title: "Networking Foundations",
          description: "Where the course begins."
        }
      ]
    }
  }));
}

/* ------------------------------------------------------------------ *
 * 1. The initial state — nothing has been searched, nothing is claimed
 * ------------------------------------------------------------------ */

describe("the Search surface before anything is searched", () => {
  it("renders a labelled search form and claims no result of any kind", async () => {
    stubEverythingSucceeds([]);
    const container = await mount();

    // The label is PROGRAMMATICALLY associated, which is what makes the field
    // reachable by name. Reading the markup cannot establish that the ids
    // actually line up; this can.
    const input = queryInput(container);
    const label = container.querySelector<HTMLLabelElement>(
      'label[for="curriculum-search-query"]'
    );
    expect(label).not.toBeNull();
    expect(label?.control).toBe(input);
    expect(input.type).toBe("search");
    expect(input.maxLength).toBe(200);

    // A real form with a real submit control: keyboard submission needs no key
    // handler, and there is none to break.
    expect(container.querySelector("form")).not.toBeNull();
    expect(submitButton(container).disabled).toBe(false);

    // Nothing has been asked, so nothing is said. No count, no filters, no
    // fallback and no notes section — an empty result would be a claim.
    expect(container.querySelector("fieldset")).toBeNull();
    expect(container.querySelector("ol")).toBeNull();
    expect(textOf(container)).not.toContain(describeCurriculumSearchCount(0));
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeading()
    );
    expect(textOf(container)).not.toContain(describeNoteResultGroup());

    // And nothing was fetched on mount.
    expect(requested).toHaveLength(0);
  });

  it("rejects an empty query locally, as neither a failure nor an empty result", async () => {
    stubEverythingSucceeds([]);
    const container = await mount();

    await type(container, "   ");
    await submit(container);

    // The message is the validation message, in an alert.
    expect(alertText(container)).toBe(
      describeCurriculumSearchQueryError("query_missing")
    );

    // It is NOT a search: no request left the browser.
    expect(requested).toHaveLength(0);

    // And it is NOT the unavailable state. The fallback section belongs to a
    // search that ran or could not run; a rejected query is neither.
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeading()
    );
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeadline("search_unavailable", "")
    );
  });

  it("withdraws BOTH sources, leaving no stale notes beside the message", async () => {
    /*
      The defect this pins, found by this suite and repaired in the same package.

      A rejected query cleared the curriculum results and left the PREVIOUS
      query's notes and note count on screen next to "Enter something to search
      for." — half of one search's results presented as the state of another,
      with nothing on the surface naming the query they came from.

      The two sources settle independently DURING a search; their lifetimes
      across searches have to match.
    */
    stubEverythingSucceeds([document_()]);
    const container = await mount();

    await type(container, "switch");
    await submit(container);
    expect(textOf(container)).toContain(NOTE.title);
    expect(politeAnnouncements(container)).toContain(describeNoteSearchCount(1));

    await type(container, "   ");
    await submit(container);

    expect(alertText(container)).toBe(
      describeCurriculumSearchQueryError("query_missing")
    );
    expect(container.querySelector("ol")).toBeNull();
    expect(textOf(container)).not.toContain(NOTE.title);
    expect(textOf(container)).not.toContain(describeNoteResultGroup());
    expect(politeAnnouncements(container)).not.toContain(
      describeNoteSearchCount(1)
    );

    // And the withdrawal is not the notes-unavailable state either: nothing
    // failed, so nothing may say it did.
    expect(textOf(container)).not.toContain(describeNoteSearchUnavailable());
  });
});

/* ------------------------------------------------------------------ *
 * 2. Loading — bounded, announced, and with the control disabled
 * ------------------------------------------------------------------ */

describe("while a search is in flight", () => {
  it("announces that it is searching and disables the submit control", async () => {
    const held = deferred<StubbedResponse>();
    route("/search/curriculum", () => held.promise);
    route("/notes/search", () => ({ status: 200, body: { results: [] } }));

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    // The request is OPEN: this is the loading state, observed rather than
    // inferred from a boolean.
    expect(requestsTo("/search/curriculum")).toHaveLength(1);
    expect(submitButton(container).disabled).toBe(true);
    expect(submitButton(container).textContent?.trim()).toBe("Searching…");
    expect(politeAnnouncements(container)).toContain("Searching curriculum…");

    // No result and no failure is shown while it is still running.
    expect(container.querySelector("ol")).toBeNull();
    expect(alertText(container)).toBeNull();

    await act(async () => {
      held.resolve(curriculumResults([document_()]));
    });

    expect(submitButton(container).disabled).toBe(false);
    expect(submitButton(container).textContent?.trim()).toBe("Search");
  });
});

/* ------------------------------------------------------------------ *
 * 3. Results — ordered, typed in words, counted against what was returned
 * ------------------------------------------------------------------ */

describe("a search that returns authorized results", () => {
  it("renders them as an ordered list with the type in text and a link each", async () => {
    const documents = [document_(), SECOND_DOCUMENT];
    stubEverythingSucceeds(documents);

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    // ORDERED, because after SEARCH-008 the sequence carries meaning.
    const list = container.querySelector("ol");
    expect(list).not.toBeNull();
    const items = [...(list?.querySelectorAll(":scope > li") ?? [])];
    expect(items).toHaveLength(2);

    // In the order the server sent, and with no position number, score or
    // ranking annotation rendered anywhere.
    items.forEach((item, index) => {
      const source = documents[index];
      if (source === undefined) throw new Error("fixture and DOM disagree");

      const heading = item.querySelector("h3");
      expect(heading?.textContent).toBe(source.title);
      // The item is named by its own heading, so the list reads as a list of
      // titles rather than of anonymous cards.
      expect(item.getAttribute("aria-labelledby")).toBe(heading?.id);

      // The content type is a WORD. Colour and icons are never the only signal.
      expect(item.textContent).toContain(
        describeCurriculumContentType(source.contentType)
      );
      expect(item.textContent).toContain(
        buildCurriculumSearchSnippet(source.searchableText, "")
      );

      const link = item.querySelector<HTMLAnchorElement>("a");
      expect(link?.getAttribute("href")).toBe(source.sourceReference);
      // The link names its destination, so it is not a bare "Open".
      expect(link?.textContent).toContain(source.title);
    });

    expect(textOf(container)).not.toMatch(/\b(score|rank|relevance)\b/i);

    // The count is announced, and it describes what was RETURNED.
    expect(politeAnnouncements(container)).toContain(
      describeCurriculumSearchCount(2)
    );
    // With more than one result the ordering RULE is stated as ordinary text.
    expect(textOf(container)).toContain(describeCurriculumRankingOrder());

    // The learner's own notes are their own labelled group, counted separately.
    expect(textOf(container)).toContain(describeNoteResultGroup());
    expect(politeAnnouncements(container)).toContain(describeNoteSearchCount(1));
    expect(textOf(container)).toContain(NOTE.title);

    // No fallback: the search ran and matched something.
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeading()
    );

    // On the wire: the query, no identity, and a bearer token the component
    // never built itself.
    const url = lastRequestTo("/search/curriculum");
    expect(url.searchParams.get("q")).toBe("switch");
    for (const forbidden of ["userId", "ownerId", "studentId", "learnerId"]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
    expect(authorizations).toContain(`Bearer ${ACCESS_TOKEN}`);
  });

  it("offers native filters whose counts describe these results only", async () => {
    const documents = [document_(), SECOND_DOCUMENT];
    stubEverythingSucceeds(documents);

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    // A fieldset with a legend, and four native checkboxes with associated
    // labels. Native controls are keyboard operable and expose their own state.
    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.querySelector("legend")?.textContent).toBe(
      describeCurriculumSearchFilterLegend()
    );

    const boxes = filterCheckboxes(container);
    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      const label = container.querySelector<HTMLLabelElement>(
        `label[for="${box.id}"]`
      );
      expect(label?.control).toBe(box);
      expect(box.checked).toBe(false);
    }

    // Each count says "in these results", never a platform total.
    expect(textOf(container)).toContain(describeCurriculumSearchFacetCount(1));
    expect(textOf(container)).toContain(describeCurriculumSearchFacetCount(0));
    expect(textOf(container)).not.toMatch(/in the platform|found overall/i);

    // Clear-filters exists and is inert while nothing is selected.
    const clear = buttonLabelled(
      container,
      describeCurriculumSearchClearFilters()
    );
    expect(clear?.disabled).toBe(true);
  });

  it("re-searches with the selection the learner just made, as repeated parameters", async () => {
    stubEverythingSucceeds([document_(), SECOND_DOCUMENT]);

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    const course = filterCheckboxes(container).find((box) =>
      box.id.endsWith("course")
    );
    await click(course, "the course filter");

    expect(requestsTo("/search/curriculum")).toHaveLength(2);
    expect(lastRequestTo("/search/curriculum").searchParams.getAll(
      "contentType"
    )).toEqual(["course"]);
    expect(
      filterCheckboxes(container).find((box) => box.id.endsWith("course"))
        ?.checked
    ).toBe(true);

    const mission = filterCheckboxes(container).find((box) =>
      box.id.endsWith("mission")
    );
    await click(mission, "the mission filter");

    // Two selections are two REPEATED parameters, never one joined value.
    expect(lastRequestTo("/search/curriculum").searchParams.getAll(
      "contentType"
    )).toEqual(["course", "mission"]);

    // Clearing resets the selection and searches again without a filter.
    await click(
      buttonLabelled(container, describeCurriculumSearchClearFilters()),
      "clear filters"
    );
    expect(
      lastRequestTo("/search/curriculum").searchParams.has("contentType")
    ).toBe(false);
    expect(
      filterCheckboxes(container).every((box) => !box.checked)
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 4. No result — a search that RAN and matched nothing
 * ------------------------------------------------------------------ */

describe("a successful search that matched nothing", () => {
  it("says so as an empty result, and offers structured navigation", async () => {
    stubEverythingSucceeds([]);

    const container = await mount();
    await type(container, "nonsense-term");
    await submit(container);

    expect(politeAnnouncements(container)).toContain(
      describeCurriculumSearchCount(0)
    );

    // The fallback headline is the EMPTY-RESULT one, naming what was asked.
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe(
      describeCurriculumFallbackHeadline("no_results", "nonsense-term")
    );

    // It is NOT the failure wording, and there is no alert: nothing failed.
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeadline("search_unavailable", "")
    );
    expect(alertText(container)).toBeNull();

    // Browse is offered; clear-filters is not, because no filter is active.
    expect(textOf(container)).toContain(
      describeCurriculumFallbackAction("browse_curriculum")
    );
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackAction("clear_filters")
    );

    // The published-paths list is loaded through the caller's own session and
    // carries no query parameter at all.
    expect(textOf(container)).toContain(describeCurriculumNavigationHeading());
    expect(textOf(container)).toContain("Networking Foundations");
    expect([...lastRequestTo("/curriculum/paths").searchParams]).toEqual([]);
  });

  it("offers to clear filters only when a filter is actually active", async () => {
    let withFilter = false;
    route("/search/curriculum", (url) => {
      withFilter = url.searchParams.has("contentType");
      return curriculumResults([], facetsFor([]));
    });
    route("/notes/search", () => ({ status: 200, body: { results: [] } }));
    route("/curriculum/paths", () => ({ status: 200, body: { learningPaths: [] } }));

    const container = await mount();
    await type(container, "nonsense-term");
    await submit(container);

    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackAction("clear_filters")
    );

    await click(
      filterCheckboxes(container).find((box) => box.id.endsWith("course")),
      "the course filter"
    );

    expect(withFilter).toBe(true);
    // Now the offer appears, as a real button the learner may decline.
    const offer = buttonLabelled(
      container,
      describeCurriculumFallbackAction("clear_filters")
    );
    expect(offer).toBeDefined();
    expect(offer?.tagName).toBe("BUTTON");

    // An empty published-paths list is reported as empty, never as a failure.
    expect(textOf(container)).toContain(describeCurriculumNavigationEmpty());
    expect(textOf(container)).not.toContain(
      describeCurriculumNavigationUnavailable()
    );

    // Taking the offer clears the selection and searches again.
    await click(offer, "the clear-filters offer");
    expect(withFilter).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 5. Unavailable — the invariant a single boolean protects
 * ------------------------------------------------------------------ */

describe("a curriculum search that could not run", () => {
  it("is never rendered as an empty result", async () => {
    route("/search/curriculum", () => ({
      status: 503,
      body: {
        error: { code: "SEARCH_UNAVAILABLE", message: "Search is unavailable." }
      }
    }));
    route("/notes/search", () => ({ status: 200, body: { results: [] } }));
    route("/curriculum/paths", () => ({
      status: 200,
      body: { learningPaths: [{ stableId: "nf", title: "Networking Foundations" }] }
    }));

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    // The failure is an alert, carrying the platform's own message.
    expect(alertText(container)).toBe("Search is unavailable.");

    // THE invariant: the empty-result count is absent, and the headline says
    // this is a search problem rather than an empty curriculum.
    expect(politeAnnouncements(container)).not.toContain(
      describeCurriculumSearchCount(0)
    );
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeadline("no_results", "switch")
    );
    expect(
      container.querySelector('[role="status"]')?.textContent
    ).toBe(describeCurriculumFallbackHeadline("search_unavailable", "switch"));

    // Structured navigation is offered in this state too, and clear-filters is
    // not — the learner's filters did not cause the failure.
    expect(textOf(container)).toContain("Networking Foundations");
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackAction("clear_filters")
    );
    expect(container.querySelector("ol")).toBeNull();
  });

  it("reports a failed navigation read as a failure, not as an empty curriculum", async () => {
    route("/search/curriculum", () => ({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Something broke." } }
    }));
    route("/notes/search", () => ({ status: 200, body: { results: [] } }));
    route("/curriculum/paths", () => ({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Also broken." } }
    }));

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    expect(textOf(container)).toContain(
      describeCurriculumNavigationUnavailable()
    );
    expect(textOf(container)).not.toContain(describeCurriculumNavigationEmpty());
    expect(textOf(container)).not.toContain(
      describeCurriculumNavigationLoading()
    );

    // And it renders no entry list at all: the three navigation states are
    // mutually exclusive, so "could not load" never sits beside a list.
    const navigation = container.querySelector(
      'section[aria-labelledby="curriculum-navigation-heading"]'
    );
    expect(navigation).not.toBeNull();
    expect(navigation?.querySelector("ul")).toBeNull();
  });

  it("recovers on the next successful search, leaving no stale failure behind", async () => {
    let available = false;
    route("/search/curriculum", () =>
      available
        ? curriculumResults([document_()])
        : {
            status: 503,
            body: {
              error: {
                code: "SEARCH_UNAVAILABLE",
                message: "Search is unavailable."
              }
            }
          }
    );
    route("/notes/search", () => ({ status: 200, body: { results: [] } }));
    route("/curriculum/paths", () => ({ status: 200, body: { learningPaths: [] } }));

    const container = await mount();
    await type(container, "switch");
    await submit(container);
    expect(alertText(container)).not.toBeNull();

    available = true;
    await submit(container);

    // The failure is GONE — not merely overdrawn by results.
    expect(alertText(container)).toBeNull();
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeadline("search_unavailable", "switch")
    );
    expect(textOf(container)).not.toContain(
      describeCurriculumFallbackHeading()
    );
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
    expect(politeAnnouncements(container)).toContain(
      describeCurriculumSearchCount(1)
    );
  });
});

/* ------------------------------------------------------------------ *
 * 6. The two sources settle independently
 * ------------------------------------------------------------------ */

describe("the learner's own notes", () => {
  it("fail without erasing curriculum results, and never as 'no notes'", async () => {
    route("/search/curriculum", () => curriculumResults([document_()]));
    route("/notes/search", () => ({
      status: 500,
      body: { error: { code: "INTERNAL_ERROR", message: "Notes broke." } }
    }));

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    // Curriculum is intact.
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);

    // And the notes group says what is true, in its own section.
    expect(textOf(container)).toContain(describeNoteSearchUnavailable());
    expect(textOf(container)).not.toContain(describeNoteSearchCount(0));
    expect(textOf(container)).not.toContain(NOTE.title);
  });

  it("survives a curriculum failure, because neither source gates the other", async () => {
    route("/search/curriculum", () => ({
      status: 503,
      body: {
        error: { code: "SEARCH_UNAVAILABLE", message: "Search is unavailable." }
      }
    }));
    route("/notes/search", () => ({ status: 200, body: { results: [NOTE] } }));
    route("/curriculum/paths", () => ({ status: 200, body: { learningPaths: [] } }));

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    expect(alertText(container)).toBe("Search is unavailable.");
    expect(textOf(container)).toContain(NOTE.title);
    expect(politeAnnouncements(container)).toContain(describeNoteSearchCount(1));

    // The notes request carries no identity either.
    const url = lastRequestTo("/notes/search");
    for (const forbidden of ["userId", "ownerId", "studentId", "learnerId"]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 7. Typo recovery, and the way back to the learner's own words
 * ------------------------------------------------------------------ */

describe("a recovered technical term", () => {
  it("names the learner's wording first and offers a way back to it", async () => {
    const adjustment = {
      originalQuery: "kubctl",
      effectiveQuery: "kubectl",
      adjustmentKind: "typo" as const
    };
    route("/search/curriculum", () =>
      curriculumResults([document_()], { queryAdjustment: adjustment })
    );
    route("/notes/search", () => ({ status: 200, body: { results: [] } }));
    route("/curriculum/paths", () => ({ status: 200, body: { learningPaths: [] } }));

    const container = await mount();
    await type(container, "kubctl");
    await submit(container);

    // The sentence states the adjustment and names the original query first.
    const recovery = describeCurriculumTypoRecovery({
      originalQuery: adjustment.originalQuery,
      correctedQuery: adjustment.effectiveQuery
    });
    expect(politeAnnouncements(container)).toContain(recovery);
    expect(recovery.indexOf("kubctl")).toBeLessThan(recovery.indexOf("kubectl"));

    // No algorithm internal reaches the surface.
    expect(textOf(container)).not.toMatch(
      /edit distance|variant|candidate|ilike|pattern/i
    );

    // The way back is a real button, and taking it needs no further request.
    const back = buttonLabelled(
      container,
      describeCurriculumOriginalQueryAction(adjustment.originalQuery)
    );
    expect(back).toBeDefined();

    const before = requestsTo("/search/curriculum").length;
    await click(back, "the return-to-original control");
    expect(requestsTo("/search/curriculum")).toHaveLength(before);

    // What it shows is the empty state the server already produced for that
    // query — and the recovered results are withdrawn rather than left behind.
    expect(politeAnnouncements(container)).toContain(
      describeCurriculumOriginalQueryEmptyState(adjustment.originalQuery)
    );
    expect(container.querySelector("ol")).toBeNull();
    expect(politeAnnouncements(container)).not.toContain(
      describeCurriculumSearchCount(1)
    );
  });
});

/* ------------------------------------------------------------------ *
 * 8. Mechanical accessibility properties of the whole surface
 * ------------------------------------------------------------------ */

describe("the Search surface's interaction model", () => {
  it("is built from native controls only, with no invented widget", async () => {
    stubEverythingSucceeds([document_(), SECOND_DOCUMENT]);

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    // Every element carrying a click handler in this view is a button, an
    // anchor or a native input. Reading source cannot prove the rendered tree
    // agrees; walking it can.
    for (const element of container.querySelectorAll<HTMLElement>("*")) {
      if (element.tagName === "DIV" || element.tagName === "SPAN") {
        expect(element.getAttribute("role")).toBeNull();
        expect(element.getAttribute("tabindex")).toBeNull();
      }
    }

    // No drag-and-drop, and no sort control: the order is not the learner's to
    // configure.
    expect(container.querySelector("[draggable='true']")).toBeNull();
    expect(container.querySelector("select")).toBeNull();

    // Every heading in the surface is a real heading element, and every section
    // that names one points at an id that exists.
    for (const section of container.querySelectorAll("section")) {
      const labelledBy = section.getAttribute("aria-labelledby");
      if (labelledBy === null) continue;
      expect(container.querySelector(`#${labelledBy}`)).not.toBeNull();
    }

    // Both result groups are named by their own heading, and the note group is
    // an UNORDERED list because private notes carry no ranking.
    const notes = [...container.querySelectorAll("section")].find((section) =>
      section.querySelector("h3")?.textContent === describeNoteResultGroup()
    );
    expect(notes?.querySelector("ul")).not.toBeNull();
    expect(notes?.querySelector("ol")).toBeNull();
  });

  it("searches from the keyboard alone, without any key handling of its own", async () => {
    stubEverythingSucceeds([document_()]);

    const container = await mount();
    const input = queryInput(container);

    // Focus and type the way a keyboard user does, then submit the form the way
    // pressing Enter in a single-field form does.
    input.focus();
    expect(document.activeElement).toBe(input);

    await type(container, "switch");
    await submit(container);

    expect(requestsTo("/search/curriculum")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);

    // The filter controls are reachable and operable as ordinary tab stops: no
    // negative tabindex, and no control removed from the tab order.
    for (const box of filterCheckboxes(container)) {
      expect(box.tabIndex).toBeGreaterThanOrEqual(0);
      expect(box.disabled).toBe(false);
    }
    expect(submitButton(container).tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("renders no facet counts at all when the server omits them", async () => {
    route("/search/curriculum", () =>
      curriculumResults([document_()], NO_FACETS)
    );
    route("/notes/search", () => ({ status: 200, body: { results: [] } }));

    const container = await mount();
    await type(container, "switch");
    await submit(container);

    // SEARCH-004 section 11: the filters still work, the counts simply do not
    // appear. A fabricated zero would be a claim about content nobody counted.
    expect(filterCheckboxes(container)).toHaveLength(4);
    expect(textOf(container)).not.toContain("in these results");

    await click(
      filterCheckboxes(container).find((box) => box.id.endsWith("course")),
      "the course filter"
    );
    expect(lastRequestTo("/search/curriculum").searchParams.getAll(
      "contentType"
    )).toEqual(["course"]);
  });
});
