/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  describeCurriculumNavigationHeading,
  describeCurriculumSearchCount,
  type CurriculumNavigationEntry,
  type SearchDocument
} from "@tlp/shared-types";
import type { CurriculumSearchResponse } from "./curriculum-search-service";
import { CurriculumSearchView } from "./CurriculumSearchView";

/**
 * WP-005 — where a result matched, in the REAL CurriculumSearchView, observed
 * in a live DOM; and the DHCP empty state.
 *
 * Asserts rendered text and elements, never a helper's return value.
 *
 * ## What it does not prove
 *
 * How a screen reader announces the `<mark>` element, how the snippet reads
 * aloud, or how any of it looks. jsdom is not a browser; rendered
 * Architect/Founder review decides those.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

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
  listCurriculumNavigation: (...args: unknown[]) => listCurriculumNavigation(...args)
}));

/* Fixtures — placeholder text, not curriculum. */

const MISSION: SearchDocument = {
  modelVersion: "fixture",
  documentId: "curriculum:mission:nf-m4@1",
  sourceEngine: "curriculum",
  sourceRecordStableId: "nf-m4",
  sourceVersion: 1,
  sourceUpdatedAt: "2026-10-01T00:00:00Z",
  indexedAt: "2026-10-01T00:00:00Z",
  contentType: "mission",
  title: "The prefix and the decision",
  searchableText: "Decide whether a destination is on the local network.",
  keywords: [],
  sourceReference: "/missions/nf-m4",
  publicationState: "published",
  accessScope: "shared"
};

const LOCATED: CurriculumSearchResponse = {
  results: [MISSION],
  count: 1,
  matchLocations: [
    {
      documentId: MISSION.documentId,
      foundIn: "step",
      trail: [
        { kind: "course", title: "Networking Foundations" },
        { kind: "mission", title: "The prefix and the decision" },
        { kind: "step", title: "Asking for the hardware address" }
      ],
      snippet: {
        before: "The request PC-A sent is called ",
        match: "ARP",
        after: ". It asks which MAC address belongs to a local address."
      }
    }
  ]
};

const EMPTY: CurriculumSearchResponse = { results: [], count: 0, facets: { contentTypes: [] } };

const NAVIGATION: CurriculumNavigationEntry[] = [
  {
    stableId: "it-foundations",
    title: "IT and Cybersecurity Foundations",
    reference: "/learning-paths/it-foundations"
  }
];

const mounted: { container: HTMLElement; root: Root }[] = [];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  searchCurriculum.mockReset();
  searchMyNotes.mockReset().mockResolvedValue([]);
  listCurriculumNavigation.mockReset().mockResolvedValue(NAVIGATION);
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

async function submit(
  container: HTMLElement,
  query: string,
  outcome: CurriculumSearchResponse
): Promise<void> {
  const input = container.querySelector<HTMLInputElement>("#curriculum-search-query");
  if (input === null) throw new Error("query input is not rendered");
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      input,
      query
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  searchCurriculum.mockResolvedValueOnce(outcome);
  await act(async () => {
    input.form?.requestSubmit();
  });
  // Let the navigation read, started by the empty state, settle.
  await act(async () => {
    await Promise.resolve();
  });
}

function resultItem(container: HTMLElement): HTMLElement {
  const item = container.querySelector<HTMLElement>(
    'ol[aria-labelledby="curriculum-results-heading"] > li'
  );
  if (item === null) throw new Error("no result is rendered");
  return item;
}

function politeText(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[aria-live="polite"]')].map(
    (element) => element.textContent ?? ""
  );
}

describe("WP-005 — a result says where it matched", () => {
  it("renders the course → mission → step trail as words", async () => {
    const container = mount();
    await submit(container, "ARP", LOCATED);

    expect(resultItem(container).textContent).toContain(
      "Matched in lesson text: Course: Networking Foundations › Mission: The prefix and the decision › Step: Asking for the hardware address"
    );
  });

  it("marks the matched words with a <mark> element inside the snippet", async () => {
    const container = mount();
    await submit(container, "ARP", LOCATED);

    const marks = resultItem(container).querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe("ARP");
    expect(marks[0]?.parentElement?.textContent).toBe(
      "The request PC-A sent is called ARP. It asks which MAC address belongs to a local address."
    );
    // The match is carried by markup, never by a colour class.
    expect(marks[0]?.getAttribute("class")).toBeNull();
  });

  it("announces the result count politely when results change", async () => {
    const container = mount();
    await submit(container, "ARP", LOCATED);

    expect(politeText(container)).toContain(describeCurriculumSearchCount(1));
  });

  it("falls back to the plain snippet when a result has no location", async () => {
    const container = mount();
    await submit(container, "prefix", { results: [MISSION], count: 1 });

    const item = resultItem(container);
    expect(item.querySelector("mark")).toBeNull();
    expect(item.textContent).toContain(MISSION.searchableText);
  });
});

describe("WP-005 — DHCP returns the existing empty-results state", () => {
  it("shows the empty result and the published-curriculum list, not an error", async () => {
    const container = mount();
    await submit(container, "DHCP", EMPTY);

    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(politeText(container)).toContain(describeCurriculumSearchCount(0));
    expect(container.textContent).toContain(describeCurriculumNavigationHeading());

    const links = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        'section[aria-labelledby="curriculum-navigation-heading"] a'
      )
    ];
    expect(links.map((link) => link.textContent)).toEqual([
      "IT and Cybersecurity Foundations"
    ]);
  });
});
