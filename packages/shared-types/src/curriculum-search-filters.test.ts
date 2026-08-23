import { describe, expect, it } from "vitest";
import {
  CURRICULUM_SEARCH_CONTENT_TYPES,
  type CurriculumSearchContentType
} from "./curriculum-search";
import {
  CURRICULUM_SEARCH_FILTER_DIMENSIONS,
  CURRICULUM_SEARCH_FILTER_DISPOSITIONS,
  CURRICULUM_SEARCH_FILTER_MODEL_VERSION,
  CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES,
  CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS,
  CURRICULUM_SEARCH_MAX_CONTENT_TYPE_FILTERS,
  applyCurriculumSearchFilter,
  buildCurriculumSearchFacets,
  buildCurriculumSearchFacetsSafely,
  buildCurriculumSearchFilter,
  clearCurriculumSearchFilter,
  curriculumSearchFacetCountsMatchResults,
  describeCurriculumSearchClearFilters,
  describeCurriculumSearchFacetCount,
  describeCurriculumSearchFacetOption,
  describeCurriculumSearchFilterError,
  describeCurriculumSearchFilterLegend,
  isUnfilteredCurriculumSearch,
  normalizeCurriculumSearchContentTypeFilter,
  validateCurriculumSearchContentTypeFilter,
  withCurriculumSearchFacets
} from "./curriculum-search-filters";

/** Only the fields filtering and faceting read. */
const result = (contentType: string, stableId: string) => ({
  contentType,
  stableId
});

const sample = [
  result("learning_path", "lp-a"),
  result("course", "c-a"),
  result("course", "c-b"),
  result("mission", "m-a"),
  result("competency", "comp-a")
];

describe("the filter vocabulary is exactly the searchable types", () => {
  it("matches SEARCH-002's searchable content types", () => {
    expect(CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES).toEqual([
      "learning_path",
      "course",
      "mission",
      "competency"
    ]);
    expect(CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES).toEqual(
      CURRICULUM_SEARCH_CONTENT_TYPES
    );
  });

  it("caps a selection at the size of the vocabulary", () => {
    expect(CURRICULUM_SEARCH_MAX_CONTENT_TYPE_FILTERS).toBe(4);
  });

  it("exposes exactly one filter dimension", () => {
    expect(CURRICULUM_SEARCH_FILTER_DIMENSIONS).toEqual(["contentType"]);
  });

  it("stamps the model version", () => {
    expect(CURRICULUM_SEARCH_FILTER_MODEL_VERSION).toBe(
      "curriculum-search-filters-v1"
    );
  });

  /**
   * The vocabulary can never name something search cannot return, because it IS
   * the searchable set rather than a copy of it.
   */
  it("names no unsearchable source", () => {
    const joined = CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES.join(" ");

    for (const unsearchable of [
      "module",
      "lab",
      "note",
      "learning_asset",
      "certificate",
      "evidence"
    ]) {
      expect(joined).not.toContain(unsearchable);
    }
  });
});

describe("normalization is deterministic", () => {
  it("treats an absent filter as no filtering", () => {
    expect(normalizeCurriculumSearchContentTypeFilter(undefined)).toEqual([]);
    expect(normalizeCurriculumSearchContentTypeFilter(null)).toEqual([]);
    expect(normalizeCurriculumSearchContentTypeFilter([])).toEqual([]);
    expect(isUnfilteredCurriculumSearch(buildCurriculumSearchFilter([]))).toBe(
      true
    );
  });

  it("accepts a single value", () => {
    expect(normalizeCurriculumSearchContentTypeFilter("course")).toEqual([
      "course"
    ]);
  });

  it("accepts repeated values", () => {
    expect(
      normalizeCurriculumSearchContentTypeFilter(["course", "mission"])
    ).toEqual(["course", "mission"]);
  });

  it("collapses duplicates", () => {
    expect(
      normalizeCurriculumSearchContentTypeFilter([
        "mission",
        "course",
        "mission",
        "course"
      ])
    ).toEqual(["course", "mission"]);
  });

  it("orders by the fixed vocabulary regardless of request order", () => {
    const forward = normalizeCurriculumSearchContentTypeFilter([
      "learning_path",
      "course",
      "mission",
      "competency"
    ]);
    const reversed = normalizeCurriculumSearchContentTypeFilter([
      "competency",
      "mission",
      "course",
      "learning_path"
    ]);

    expect(forward).toEqual([
      "learning_path",
      "course",
      "mission",
      "competency"
    ]);
    expect(reversed).toEqual(forward);
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCurriculumSearchContentTypeFilter([" course "])).toEqual([
      "course"
    ]);
  });

  it("accepts all four types", () => {
    expect(
      normalizeCurriculumSearchContentTypeFilter([
        ...CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES
      ])
    ).toHaveLength(4);
  });

  it("never yields a value outside the approved vocabulary", () => {
    for (const contentType of normalizeCurriculumSearchContentTypeFilter([
      "course",
      "module",
      "lab",
      "note"
    ])) {
      expect(CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES).toContain(contentType);
    }
  });

  it("clears back to unfiltered", () => {
    expect(clearCurriculumSearchFilter()).toEqual({ contentTypes: [] });
    expect(isUnfilteredCurriculumSearch(clearCurriculumSearchFilter())).toBe(
      true
    );
  });
});

describe("unsupported values are rejected, not ignored", () => {
  it("accepts an absent filter", () => {
    expect(validateCurriculumSearchContentTypeFilter(undefined)).toBeNull();
    expect(validateCurriculumSearchContentTypeFilter([])).toBeNull();
  });

  it("accepts every approved type", () => {
    for (const contentType of CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES) {
      expect(validateCurriculumSearchContentTypeFilter(contentType)).toBeNull();
    }
  });

  it("rejects an unknown value rather than dropping it", () => {
    expect(validateCurriculumSearchContentTypeFilter("everything")).toBe(
      "content_type_unknown"
    );
  });

  /**
   * Each of these is a source SEARCH-004 must not make searchable. Rejecting
   * them at validation means a client cannot probe for them by watching which
   * values change the result set.
   */
  it("rejects an unsearchable source type", () => {
    for (const unsupported of [
      "module",
      "learning_module",
      "lab",
      "lab_definition",
      "note",
      "learning_asset",
      "certificate",
      "evidence"
    ]) {
      expect(validateCurriculumSearchContentTypeFilter(unsupported)).toBe(
        "content_type_unknown"
      );
    }
  });

  it("rejects a publication state as a filter value", () => {
    for (const state of ["draft", "review", "retired", "published"]) {
      expect(validateCurriculumSearchContentTypeFilter(state)).toBe(
        "content_type_unknown"
      );
    }
  });

  it("rejects an access scope as a filter value", () => {
    for (const scope of ["private", "shared", "restricted"]) {
      expect(validateCurriculumSearchContentTypeFilter(scope)).toBe(
        "content_type_unknown"
      );
    }
  });

  it("rejects an internal identifier as a filter value", () => {
    expect(
      validateCurriculumSearchContentTypeFilter(
        "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
      )
    ).toBe("content_type_unknown");
  });

  it("rejects one bad value inside an otherwise valid list", () => {
    expect(
      validateCurriculumSearchContentTypeFilter(["course", "lab"])
    ).toBe("content_type_unknown");
  });

  it("rejects a non-string value", () => {
    expect(validateCurriculumSearchContentTypeFilter([7])).toBe(
      "content_type_unknown"
    );
    expect(validateCurriculumSearchContentTypeFilter([{ contentType: "course" }])).toBe(
      "content_type_unknown"
    );
  });

  it("ignores an empty repeated value", () => {
    expect(validateCurriculumSearchContentTypeFilter(["course", ""])).toBeNull();
    expect(
      normalizeCurriculumSearchContentTypeFilter(["course", ""])
    ).toEqual(["course"]);
  });

  it("explains the error with approved labels only", () => {
    const message = describeCurriculumSearchFilterError("content_type_unknown");

    expect(message).toContain("Course");
    expect(message).toContain("Mission");
    expect(message).not.toContain("Lab");
    expect(message).not.toContain("Module");

    expect(describeCurriculumSearchFilterError("content_type_too_many")).toContain(
      "4"
    );
  });
});

describe("filtering narrows without reordering", () => {
  it("returns everything when unfiltered", () => {
    expect(
      applyCurriculumSearchFilter(sample, buildCurriculumSearchFilter(undefined))
    ).toEqual(sample);
  });

  it("keeps one content type", () => {
    expect(
      applyCurriculumSearchFilter(sample, buildCurriculumSearchFilter("course"))
    ).toEqual([result("course", "c-a"), result("course", "c-b")]);
  });

  it("keeps several content types", () => {
    expect(
      applyCurriculumSearchFilter(
        sample,
        buildCurriculumSearchFilter(["mission", "course"])
      )
    ).toEqual([
      result("course", "c-a"),
      result("course", "c-b"),
      result("mission", "m-a")
    ]);
  });

  it("keeps everything when all four are selected", () => {
    expect(
      applyCurriculumSearchFilter(
        sample,
        buildCurriculumSearchFilter([
          ...CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES
        ])
      )
    ).toEqual(sample);
  });

  /**
   * Filtering is a subsequence of the input. Ordering stays SEARCH-002's
   * neutral order — no score, no weight, no relevance reshuffle.
   */
  it("preserves the incoming order exactly", () => {
    const filtered = applyCurriculumSearchFilter(
      sample,
      buildCurriculumSearchFilter(["competency", "learning_path"])
    );

    expect(filtered.map((entry) => entry.stableId)).toEqual([
      "lp-a",
      "comp-a"
    ]);
  });

  it("can only ever remove results", () => {
    for (const contentType of CURRICULUM_SEARCH_FILTERABLE_CONTENT_TYPES) {
      const filtered = applyCurriculumSearchFilter(
        sample,
        buildCurriculumSearchFilter(contentType)
      );

      expect(filtered.length).toBeLessThanOrEqual(sample.length);
      for (const entry of filtered) expect(sample).toContain(entry);
    }
  });

  it("does not mutate the caller's results", () => {
    const snapshot = JSON.stringify(sample);
    applyCurriculumSearchFilter(sample, buildCurriculumSearchFilter("course"));
    expect(JSON.stringify(sample)).toBe(snapshot);
  });

  it("yields nothing when the selection matches nothing", () => {
    expect(
      applyCurriculumSearchFilter(
        [result("course", "c-a")],
        buildCurriculumSearchFilter("competency")
      )
    ).toEqual([]);
  });
});

describe("facets count the returned results and nothing else", () => {
  it("counts each returned type", () => {
    expect(buildCurriculumSearchFacets(sample).contentTypes).toEqual([
      { value: "learning_path", label: "Learning path", count: 1 },
      { value: "course", label: "Course", count: 2 },
      { value: "mission", label: "Mission", count: 1 },
      { value: "competency", label: "Competency", count: 1 }
    ]);
  });

  it("sums exactly to the number of results", () => {
    const total = buildCurriculumSearchFacets(sample).contentTypes.reduce(
      (sum, facet) => sum + facet.count,
      0
    );

    expect(total).toBe(sample.length);
  });

  /**
   * The hidden-record test. A facet is built from the results the learner
   * receives, so a candidate that was withheld earlier is simply not in the
   * input and cannot raise any count.
   */
  it("a withheld candidate cannot raise a count", () => {
    const surfaced = [result("course", "c-a")];
    const withheld = [result("course", "c-secret"), result("mission", "m-secret")];

    const facets = buildCurriculumSearchFacets(surfaced);

    expect(facets.contentTypes).toEqual([
      { value: "course", label: "Course", count: 1 }
    ]);
    expect(JSON.stringify(facets)).not.toContain("secret");
    expect(
      facets.contentTypes.reduce((sum, facet) => sum + facet.count, 0)
    ).toBe(surfaced.length);
    expect(withheld).toHaveLength(2);
  });

  it("omits a type with no returned result rather than reporting zero", () => {
    const facets = buildCurriculumSearchFacets([result("course", "c-a")]);

    expect(facets.contentTypes.map((facet) => facet.value)).toEqual(["course"]);
    for (const facet of facets.contentTypes) expect(facet.count).toBeGreaterThan(0);
  });

  it("returns no facets at all for an empty result set", () => {
    expect(buildCurriculumSearchFacets([])).toEqual({ contentTypes: [] });
  });

  it("fabricates no facet value for an unapproved content type", () => {
    const facets = buildCurriculumSearchFacets([
      result("course", "c-a"),
      result("lab_definition", "lab-a"),
      result("note", "note-a")
    ]);

    const values = facets.contentTypes.map((facet) => facet.value).join(" ");

    expect(facets.contentTypes.map((facet) => facet.value)).toEqual(["course"]);
    expect(values).not.toContain("lab");
    expect(values).not.toContain("note");
  });

  it("follows the neutral vocabulary order, not count order", () => {
    const facets = buildCurriculumSearchFacets([
      result("competency", "comp-a"),
      result("competency", "comp-b"),
      result("competency", "comp-c"),
      result("learning_path", "lp-a")
    ]);

    expect(facets.contentTypes.map((facet) => facet.value)).toEqual([
      "learning_path",
      "competency"
    ]);
  });

  it("carries only a value, a label and a count", () => {
    for (const facet of buildCurriculumSearchFacets(sample).contentTypes) {
      expect(Object.keys(facet).sort()).toEqual(["count", "label", "value"]);
    }
  });

  it("uses approved learner-safe labels", () => {
    expect(
      buildCurriculumSearchFacets(sample).contentTypes.map((facet) => facet.label)
    ).toEqual(["Learning path", "Course", "Mission", "Competency"]);
  });

  it("exposes no internal identifier as a facet value", () => {
    const serialized = JSON.stringify(buildCurriculumSearchFacets(sample));

    expect(serialized).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    expect(serialized).not.toContain("lp-a");
    expect(serialized).not.toContain("c-a");
  });
});

describe("facet failure omits facets and preserves search", () => {
  it("returns undefined rather than throwing", () => {
    const exploding = [
      {
        get contentType(): string {
          throw new Error("facet source unavailable");
        }
      }
    ];

    expect(buildCurriculumSearchFacetsSafely(exploding)).toBeUndefined();
  });

  it("omits the facets key entirely when computation fails", () => {
    const attached = withCurriculumSearchFacets({
      results: [
        {
          get contentType(): string {
            throw new Error("facet source unavailable");
          }
        } as never
      ],
      count: 1
    });

    expect(attached).not.toHaveProperty("facets");
    expect(attached.count).toBe(1);
  });

  it("still returns the results when facets are omitted", () => {
    const attached = withCurriculumSearchFacets({
      results: [
        {
          get contentType(): string {
            throw new Error("facet source unavailable");
          }
        } as never
      ],
      count: 1
    });

    expect(attached.results).toHaveLength(1);
  });
});

describe("the result-count invariant", () => {
  it("holds for a normal faceted response", () => {
    const attached = withCurriculumSearchFacets({
      results: sample as never,
      count: sample.length
    });

    expect(attached.facets).toBeDefined();
    expect(curriculumSearchFacetCountsMatchResults(attached)).toBe(true);
  });

  it("holds trivially when facets were omitted", () => {
    expect(
      curriculumSearchFacetCountsMatchResults({ results: [], count: 0 })
    ).toBe(true);
  });

  it("fails when a facet count exceeds the returned results", () => {
    expect(
      curriculumSearchFacetCountsMatchResults({
        results: [],
        count: 0,
        facets: {
          contentTypes: [{ value: "course", label: "Course", count: 7 }]
        }
      })
    ).toBe(false);
  });

  it("fails when count disagrees with the returned results", () => {
    expect(
      curriculumSearchFacetCountsMatchResults({
        results: sample as never,
        count: 99,
        facets: buildCurriculumSearchFacets(sample)
      })
    ).toBe(false);
  });

  it("holds for the empty result set", () => {
    const attached = withCurriculumSearchFacets({ results: [], count: 0 });

    expect(attached.facets).toEqual({ contentTypes: [] });
    expect(curriculumSearchFacetCountsMatchResults(attached)).toBe(true);
  });
});

describe("no hidden or global total is expressible", () => {
  it("forbids every hidden-total field as data", () => {
    for (const forbidden of [
      "candidateCount",
      "totalCount",
      "globalTotal",
      "hiddenCount",
      "unauthorizedCount",
      "withheldCount",
      "overFetchCount"
    ]) {
      expect(CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS).toContain(forbidden);
    }
  });

  it("a faceted response carries none of them", () => {
    const attached = withCurriculumSearchFacets({
      results: sample as never,
      count: sample.length
    });

    for (const forbidden of CURRICULUM_SEARCH_FORBIDDEN_COUNT_FIELDS) {
      expect(attached).not.toHaveProperty(forbidden);
      expect(JSON.stringify(attached)).not.toContain(forbidden);
    }
  });

  it("carries only results, count and facets", () => {
    const attached = withCurriculumSearchFacets({
      results: sample as never,
      count: sample.length
    });

    expect(Object.keys(attached).sort()).toEqual(["count", "facets", "results"]);
  });
});

describe("wording never implies a corpus-wide total", () => {
  it("describes a count as belonging to these results", () => {
    expect(describeCurriculumSearchFacetCount(1)).toBe("1 in these results");
    expect(describeCurriculumSearchFacetCount(7)).toBe("7 in these results");
  });

  it("claims nothing about the platform as a whole", () => {
    const wording = [
      describeCurriculumSearchFacetCount(7),
      describeCurriculumSearchFacetOption({
        value: "course",
        label: "Course",
        count: 7
      }),
      describeCurriculumSearchFilterLegend(),
      describeCurriculumSearchClearFilters()
    ]
      .join(" ")
      .toLowerCase();

    for (const overclaim of [
      "in the platform",
      "overall",
      "in total",
      "total",
      "available",
      "exist",
      "all courses",
      "hidden",
      "withheld"
    ]) {
      expect(wording).not.toContain(overclaim);
    }
  });

  it("labels a facet option with its type and its count", () => {
    expect(
      describeCurriculumSearchFacetOption({
        value: "course",
        label: "Course",
        count: 2
      })
    ).toBe("Course, 2 in these results");
  });

  it("names the filter group and the clear control in text", () => {
    expect(describeCurriculumSearchFilterLegend()).toContain("content type");
    expect(describeCurriculumSearchClearFilters()).toBe("Clear filters");
  });
});

describe("unimplemented filter dimensions are recorded, not invented", () => {
  const dispositions = new Map(
    CURRICULUM_SEARCH_FILTER_DISPOSITIONS.map((entry) => [
      entry.dimension,
      entry
    ])
  );

  it("records a disposition for every deferred hierarchy dimension", () => {
    for (const dimension of [
      "learningPath",
      "course",
      "module",
      "mission",
      "competency"
    ]) {
      expect(dispositions.get(dimension)?.disposition).toBe("deferred");
    }
  });

  it("assigns hierarchy filtering to no other feature", () => {
    const reasons = CURRICULUM_SEARCH_FILTER_DISPOSITIONS.map(
      (entry) => entry.reason
    ).join(" ");

    for (const feature of [
      "SEARCH-005",
      "SEARCH-006",
      "SEARCH-007",
      "SEARCH-008"
    ]) {
      expect(reasons).not.toContain(feature);
    }
  });

  it("records lab and tag as not applicable", () => {
    expect(dispositions.get("lab")?.disposition).toBe("not_applicable");
    expect(dispositions.get("tag")?.disposition).toBe("not_applicable");
    expect(dispositions.get("tag")?.reason).toContain("Notes tag model");
  });

  it("records private versus shared as not applicable", () => {
    expect(dispositions.get("accessScope")?.disposition).toBe("not_applicable");
  });

  it("records publication state as deliberately not exposed", () => {
    const entry = dispositions.get("publicationState");

    expect(entry?.disposition).toBe("not_exposed");
    expect(entry?.reason).toContain("draft");
    expect(entry?.reason).toContain("retired");
  });
});

describe("this module implements no later search feature", () => {
  it("exports nothing that ranks, scores or weights", async () => {
    const module = await import("./curriculum-search-filters");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/(rank|score|weight|relevance|boost)/i);
    }
  });

  it("exports nothing that caches, indexes or normalizes terms", async () => {
    const module = await import("./curriculum-search-filters");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(
        /(cache|index|materiali|synonym|stem|fuzzy|typo|embedding|semantic)/i
      );
    }
  });

  it("names no note, lab or module source", async () => {
    const module = await import("./curriculum-search-filters");
    const exported = Object.keys(module).join(" ").toLowerCase();

    for (const source of ["note", "lab", "module"]) {
      expect(exported).not.toContain(source);
    }
  });

  it("is pure — the same input always yields the same output", () => {
    const once = JSON.stringify(buildCurriculumSearchFacets(sample));
    const twice = JSON.stringify(buildCurriculumSearchFacets(sample));

    expect(once).toBe(twice);
  });

  it("accepts only the approved content types at the type level", () => {
    const selected: CurriculumSearchContentType[] =
      normalizeCurriculumSearchContentTypeFilter(["course"]);

    expect(selected).toEqual(["course"]);
  });
});
