import { describe, expect, it } from "vitest";
import {
  buildCurriculumFallbackGuidance,
  buildCurriculumNavigationEntries,
  CURRICULUM_FALLBACK_ACTIONS,
  CURRICULUM_NAVIGATION_MAX_ENTRIES,
  describeCurriculumFallbackAction,
  describeCurriculumFallbackHeading,
  describeCurriculumFallbackHeadline,
  describeCurriculumNavigationEmpty,
  describeCurriculumNavigationHeading,
  describeCurriculumNavigationIntro,
  describeCurriculumNavigationLoading,
  describeCurriculumNavigationUnavailable,
  SEARCH_FALLBACK_FORBIDDEN_FIELDS,
  SEARCH_FALLBACK_MODEL_VERSION,
  SEARCH_FALLBACK_REASONS
} from "./search-fallback";

/**
 * SEARCH-008 — Search Fallback.
 *
 * The central property under test is that a search that FAILED and a search that
 * honestly found NOTHING remain two different statements, and that no suggestion
 * can describe anything the learner was not shown.
 */

// ---------------------------------------------------------------------------
// The two states are never conflated
// ---------------------------------------------------------------------------

describe("the fallback vocabulary separates failure from emptiness", () => {
  it("pins the approved reasons", () => {
    expect([...SEARCH_FALLBACK_REASONS]).toEqual([
      "no_results",
      "search_unavailable"
    ]);
  });

  it("says nothing matched only when the search actually ran", () => {
    const headline = describeCurriculumFallbackHeadline("no_results", "vlan");

    expect(headline).toContain("No matching curriculum found");
    expect(headline).toContain("vlan");
  });

  /** Ruling 7: SEARCH FAILED must never be rendered as 0 RESULTS. */
  it("never claims an empty result when search could not run", () => {
    const headline = describeCurriculumFallbackHeadline(
      "search_unavailable",
      "vlan"
    );

    expect(headline.toLowerCase()).toContain("unavailable");
    expect(headline.toLowerCase()).toContain("not an empty result");
    expect(headline).not.toContain("No matching curriculum found");
  });

  it("keeps the degraded headline from naming a match outcome", () => {
    const headline = describeCurriculumFallbackHeadline(
      "search_unavailable",
      "kubectl"
    ).toLowerCase();

    for (const claim of ["no results", "0 results", "nothing matched", "no matching"]) {
      expect(headline).not.toContain(claim);
    }
  });

  it("produces different wording for the two states", () => {
    expect(describeCurriculumFallbackHeadline("no_results", "x")).not.toBe(
      describeCurriculumFallbackHeadline("search_unavailable", "x")
    );
  });

  it("handles an empty query without inventing one", () => {
    const headline = describeCurriculumFallbackHeadline("no_results", "   ");

    expect(headline).toBe("No matching curriculum found.");
  });

  it("echoes the learner's own technical query unchanged", () => {
    for (const query of ["Get-ADUser", "index=botsv3", "show vlan brief", "AD"]) {
      expect(describeCurriculumFallbackHeadline("no_results", query)).toContain(
        query
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Suggestions are offers, and only the approved ones
// ---------------------------------------------------------------------------

describe("suggestions are bounded learner actions", () => {
  it("pins the approved action vocabulary", () => {
    expect([...CURRICULUM_FALLBACK_ACTIONS]).toEqual([
      "clear_filters",
      "browse_curriculum"
    ]);
  });

  it("offers clearing filters only when a filter is actually active", () => {
    const withFilter = buildCurriculumFallbackGuidance({
      reason: "no_results",
      query: "vlan",
      filterActive: true
    });
    const withoutFilter = buildCurriculumFallbackGuidance({
      reason: "no_results",
      query: "vlan",
      filterActive: false
    });

    expect(withFilter.suggestions.map((s) => s.action)).toContain("clear_filters");
    expect(withoutFilter.suggestions.map((s) => s.action)).not.toContain(
      "clear_filters"
    );
  });

  /**
   * A dependency failure was not caused by the learner's filters. Offering to
   * clear them would imply it was, and would send the learner to re-run a search
   * against a source that is still down.
   */
  it("never offers clearing filters after a dependency failure", () => {
    const guidance = buildCurriculumFallbackGuidance({
      reason: "search_unavailable",
      query: "vlan",
      filterActive: true
    });

    expect(guidance.suggestions.map((s) => s.action)).not.toContain(
      "clear_filters"
    );
  });

  it("always offers structured navigation", () => {
    for (const reason of SEARCH_FALLBACK_REASONS) {
      for (const filterActive of [true, false]) {
        const guidance = buildCurriculumFallbackGuidance({
          reason,
          query: "vlan",
          filterActive
        });

        expect(guidance.suggestions.map((s) => s.action)).toContain(
          "browse_curriculum"
        );
      }
    }
  });

  it("emits only actions from the approved vocabulary", () => {
    for (const reason of SEARCH_FALLBACK_REASONS) {
      const guidance = buildCurriculumFallbackGuidance({
        reason,
        query: "vlan",
        filterActive: true
      });

      for (const suggestion of guidance.suggestions) {
        expect(CURRICULUM_FALLBACK_ACTIONS).toContain(suggestion.action);
        expect(suggestion.label).toBe(
          describeCurriculumFallbackAction(suggestion.action)
        );
      }
    }
  });

  /**
   * SEARCH-005 owns query interpretation. A "did you mean", synonym, related
   * term or broadened query here would be a second correction system.
   */
  it("suggests no query rewriting of any kind", () => {
    const guidance = buildCurriculumFallbackGuidance({
      reason: "no_results",
      query: "kubctl",
      filterActive: true
    });

    const text = JSON.stringify(guidance).toLowerCase();
    for (const forbidden of [
      "did you mean",
      "synonym",
      "related",
      "instead try",
      "broaden",
      "kubectl"
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("changes no filter and carries no instruction to change one", () => {
    const guidance = buildCurriculumFallbackGuidance({
      reason: "no_results",
      query: "vlan",
      filterActive: true
    });

    const serialized = JSON.stringify(guidance);
    for (const forbidden of ["contentType", "filter:", "applyFilter", "relax"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Nothing the learner did not receive can reach the guidance
// ---------------------------------------------------------------------------

describe("guidance derives only from its declared inputs", () => {
  it("takes exactly one parameter and no result, count or client", () => {
    expect(buildCurriculumFallbackGuidance).toHaveLength(1);
  });

  it("is a pure function of its inputs", () => {
    const input = {
      reason: "no_results" as const,
      query: "vlan",
      filterActive: true
    };

    expect(JSON.stringify(buildCurriculumFallbackGuidance(input))).toBe(
      JSON.stringify(buildCurriculumFallbackGuidance(input))
    );
  });

  it("holds the forbidden-field prohibition as data", () => {
    for (const forbidden of [
      "candidateCount",
      "totalCount",
      "hiddenCount",
      "withheldCount",
      "unauthorizedCount",
      "suggestedTerms",
      "relatedQueries",
      "synonyms",
      "noteId",
      "noteBody",
      "userId",
      "ownerId",
      "score"
    ]) {
      expect(SEARCH_FALLBACK_FORBIDDEN_FIELDS).toContain(forbidden);
    }
  });

  it("carries no forbidden field in any produced guidance", () => {
    for (const reason of SEARCH_FALLBACK_REASONS) {
      for (const filterActive of [true, false]) {
        const serialized = JSON.stringify(
          buildCurriculumFallbackGuidance({ reason, query: "vlan", filterActive })
        );

        for (const forbidden of SEARCH_FALLBACK_FORBIDDEN_FIELDS) {
          expect(serialized).not.toContain(forbidden);
        }
      }
    }
  });

  it("exposes exactly three fields", () => {
    const guidance = buildCurriculumFallbackGuidance({
      reason: "no_results",
      query: "vlan",
      filterActive: false
    });

    expect(Object.keys(guidance).sort()).toEqual([
      "headline",
      "reason",
      "suggestions"
    ]);
  });
});

// ---------------------------------------------------------------------------
// Structured navigation
// ---------------------------------------------------------------------------

describe("navigation entries carry only what a learner may see", () => {
  it("drops an internal database identifier rather than carrying it", () => {
    const entries = buildCurriculumNavigationEntries([
      {
        stableId: "networking-fundamentals",
        title: "Networking fundamentals",
        description: "Switching, routing and VLANs."
      } as unknown as { stableId: string; title: string; description?: string }
    ]);

    const serialized = JSON.stringify(entries);
    for (const forbidden of ["uuid", "userId", "ownerId", "publicationState"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(Object.keys(entries[0] ?? {}).sort()).toEqual([
      "description",
      "reference",
      "stableId",
      "title"
    ]);
  });

  it("never copies an extra field from the source row", () => {
    const entries = buildCurriculumNavigationEntries([
      {
        id: "11111111-1111-4111-8111-111111111111",
        stableId: "networking-fundamentals",
        title: "Networking fundamentals",
        version: 4,
        publicationState: "published",
        estimatedMinutes: 120
      } as unknown as { stableId: string; title: string; description?: string }
    ]);

    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(serialized).not.toContain("estimatedMinutes");
    expect(serialized).not.toContain("version");
  });

  it("preserves the source-of-truth link", () => {
    const entries = buildCurriculumNavigationEntries([
      { stableId: "cloud-basics", title: "Cloud basics" }
    ]);

    expect(entries[0]?.reference).toBe("/learning-paths/cloud-basics");
  });

  it("omits description entirely when the source has none", () => {
    const entries = buildCurriculumNavigationEntries([
      { stableId: "cloud-basics", title: "Cloud basics" }
    ]);

    expect(Object.keys(entries[0] ?? {}).sort()).toEqual([
      "reference",
      "stableId",
      "title"
    ]);
  });

  it("drops a row with no stable identity or no title", () => {
    const entries = buildCurriculumNavigationEntries([
      { stableId: "", title: "No identity" },
      { stableId: "no-title", title: "   " },
      { stableId: "good", title: "Good" }
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.stableId).toBe("good");
  });

  it("bounds the list", () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      stableId: `path-${index}`,
      title: `Path ${index}`
    }));

    expect(buildCurriculumNavigationEntries(many)).toHaveLength(
      CURRICULUM_NAVIGATION_MAX_ENTRIES
    );
  });

  it("returns an empty list for an empty source, without inventing an entry", () => {
    expect(buildCurriculumNavigationEntries([])).toEqual([]);
  });

  it("preserves the source order it was given", () => {
    const entries = buildCurriculumNavigationEntries([
      { stableId: "zulu", title: "Zulu" },
      { stableId: "alpha", title: "Alpha" }
    ]);

    expect(entries.map((entry) => entry.stableId)).toEqual(["zulu", "alpha"]);
  });
});

describe("navigation wording is honest in every state", () => {
  it("names the section in words", () => {
    expect(describeCurriculumNavigationHeading()).toContain("Browse");
  });

  it("explains its presence differently for each reason", () => {
    expect(describeCurriculumNavigationIntro("search_unavailable")).toContain(
      "unavailable"
    );
    expect(describeCurriculumNavigationIntro("no_results")).not.toBe(
      describeCurriculumNavigationIntro("search_unavailable")
    );
  });

  /**
   * A failed navigation read must never render as "there is no curriculum".
   * These are different facts and the messages must not be interchangeable.
   */
  it("distinguishes a failed read from a genuinely empty curriculum", () => {
    const unavailable = describeCurriculumNavigationUnavailable();
    const empty = describeCurriculumNavigationEmpty();

    expect(unavailable).not.toBe(empty);
    expect(unavailable.toLowerCase()).toContain("could not be loaded");
    expect(empty.toLowerCase()).toContain("no published learning paths");
    expect(unavailable.toLowerCase()).not.toContain("no published learning paths");
  });

  it("says something while loading rather than rendering nothing", () => {
    expect(describeCurriculumNavigationLoading().toLowerCase()).toContain(
      "loading"
    );
  });

  it("names the guidance section in words", () => {
    expect(describeCurriculumFallbackHeading().length).toBeGreaterThan(0);
  });

  it("records a model version", () => {
    expect(SEARCH_FALLBACK_MODEL_VERSION).toBe("search-fallback-v1");
  });
});
