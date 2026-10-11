import { describe, expect, it } from "vitest";
import type { SearchDocument } from "./search-document";
import {
  CURRICULUM_MATCH_SNIPPET_AFTER,
  CURRICULUM_MATCH_SNIPPET_BEFORE,
  buildCurriculumMatchSnippet,
  compactCurriculumMatchText,
  describeCurriculumMatchFoundIn,
  describeCurriculumMatchTrail,
  withCurriculumMatchLocations,
  type CurriculumSearchMatchLocation
} from "./search-match-location";

function doc(id: string): SearchDocument {
  return {
    modelVersion: "fixture",
    documentId: id,
    sourceEngine: "curriculum",
    sourceRecordStableId: id,
    sourceVersion: 1,
    sourceUpdatedAt: "2026-10-01T00:00:00Z",
    indexedAt: "2026-10-01T00:00:00Z",
    contentType: "mission",
    title: id,
    searchableText: "",
    keywords: [],
    sourceReference: `/missions/${id}`,
    publicationState: "published",
    accessScope: "shared"
  };
}

const location = (documentId: string): CurriculumSearchMatchLocation => ({
  documentId,
  foundIn: "step",
  trail: [{ kind: "mission", title: documentId }]
});

describe("WP-005 match snippets", () => {
  it("splits short text around the match without ellipses", () => {
    expect(buildCurriculumMatchSnippet("The request is called ARP.", 22, 3)).toEqual({
      before: "The request is called ",
      match: "ARP",
      after: "."
    });
  });

  it("bounds long text on both sides and says so with an ellipsis", () => {
    const text = `${"a".repeat(200)}ARP${"b".repeat(200)}`;
    const snippet = buildCurriculumMatchSnippet(text, 200, 3);

    expect(snippet.match).toBe("ARP");
    expect(snippet.before).toBe(`…${"a".repeat(CURRICULUM_MATCH_SNIPPET_BEFORE)}`);
    expect(snippet.after).toBe(`${"b".repeat(CURRICULUM_MATCH_SNIPPET_AFTER)}…`);
  });

  it("compacts whitespace into the coordinate space offsets use", () => {
    expect(compactCurriculumMatchText("  one\n\ttwo   three ")).toBe("one two three");
  });
});

describe("WP-005 locations travel beside the results", () => {
  it("attaches a location for each RETURNED result, in result order", () => {
    const results = { results: [doc("b"), doc("a")], count: 2 };
    const located = [
      { document: doc("a"), location: location("a") },
      { document: doc("b"), location: location("b") },
      { document: doc("withheld"), location: location("withheld") }
    ];

    const attached = withCurriculumMatchLocations(results, located);

    expect(attached.matchLocations?.map((entry) => entry.documentId)).toEqual(["b", "a"]);
    expect(JSON.stringify(attached)).not.toContain("withheld");
  });

  it("omits the key when nothing returned has a location", () => {
    expect(withCurriculumMatchLocations({ results: [], count: 0 }, [])).toEqual({
      results: [],
      count: 0
    });
  });

  it("never adds a field to a Search Document", () => {
    const attached = withCurriculumMatchLocations(
      { results: [doc("a")], count: 1 },
      [{ document: doc("a"), location: location("a") }]
    );

    expect(attached.results[0]).toEqual(doc("a"));
  });
});

describe("WP-005 location wording", () => {
  it("states the trail as words", () => {
    expect(
      describeCurriculumMatchTrail([
        { kind: "course", title: "Networking Foundations" },
        { kind: "mission", title: "The prefix and the decision" },
        { kind: "step", title: "Step 2" }
      ])
    ).toBe(
      "Course: Networking Foundations › Mission: The prefix and the decision › Step: Step 2"
    );
  });

  it("names where the match was found", () => {
    expect(describeCurriculumMatchFoundIn("title")).toBe("Matched in the title");
    expect(describeCurriculumMatchFoundIn("description")).toBe(
      "Matched in the description"
    );
    expect(describeCurriculumMatchFoundIn("step")).toBe("Matched in lesson text");
  });
});
