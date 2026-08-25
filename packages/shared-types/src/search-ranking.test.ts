import { describe, expect, it } from "vitest";
import {
  buildRankedCurriculumSearchResults,
  classifyCurriculumTitlePrecision,
  describeCurriculumRankingOrder,
  CURRICULUM_TITLE_PRECISIONS,
  SEARCH_RANKING_FORBIDDEN_SIGNALS,
  SEARCH_RANKING_MODEL_VERSION
} from "./search-ranking";
import { buildSearchDocument, type SearchDocument } from "./search-document";
import { PROTECTED_TECHNICAL_TERMS } from "./search-terms";
import type {
  ClassifiedSearchDocument,
  CurriculumMatchKind,
  CurriculumQueryVariant
} from "./search-terms";
import type { CurriculumSearchContentType } from "./curriculum-search";

/**
 * SEARCH-008 — Search Result Ranking.
 *
 * These tests prove the ORDER and its inputs. They do not prove row level
 * security: ranking never reads a database, and the documents it receives were
 * already authorized by the caller's own RLS-scoped read before they arrived.
 */

const INDEXED_AT = "2026-08-25T12:00:00.000Z";

function doc(input: {
  contentType: CurriculumSearchContentType;
  stableId: string;
  title: string;
  version?: number;
  updatedAt?: string;
}): SearchDocument {
  const built = buildSearchDocument({
    sourceEngine: "curriculum",
    contentType: input.contentType,
    sourceRecordStableId: input.stableId,
    sourceVersion: input.version ?? 1,
    title: input.title,
    searchableText: input.title,
    sourceReference: `/${input.contentType}/${input.stableId}`,
    publicationState: "published",
    accessScope: "shared",
    sourceUpdatedAt: input.updatedAt ?? "2026-01-01T00:00:00.000Z",
    indexedAt: INDEXED_AT
  });

  if (!built) throw new Error("test fixture is invalid");
  return built;
}

function classify(
  entries: readonly { document: SearchDocument; matchKind?: CurriculumMatchKind }[]
): ClassifiedSearchDocument[] {
  return entries.map((entry) => ({
    document: entry.document,
    matchKind: entry.matchKind ?? "exact"
  }));
}

const exactVariant = (value: string): CurriculumQueryVariant[] => [
  { value, matchKind: "exact" }
];

const titles = (results: { results: SearchDocument[] }): string[] =>
  results.results.map((result) => result.title);

// ---------------------------------------------------------------------------
// Title precision — the one signal SEARCH-008 adds
// ---------------------------------------------------------------------------

describe("title precision is classified by the approved vocabulary", () => {
  it("recognises a whole-title match", () => {
    expect(
      classifyCurriculumTitlePrecision("Active Directory", exactVariant("Active Directory"))
    ).toBe("whole_title");
  });

  it("is case-insensitive and whitespace-tolerant for a whole-title match", () => {
    expect(
      classifyCurriculumTitlePrecision("  active   directory  ", exactVariant("Active Directory"))
    ).toBe("whole_title");
  });

  it("recognises a contiguous token sequence in the title", () => {
    expect(
      classifyCurriculumTitlePrecision("Terraform plan basics", exactVariant("terraform plan"))
    ).toBe("title_token");
  });

  it("recognises a substring that is not a token sequence", () => {
    expect(
      classifyCurriculumTitlePrecision("Terraform planning guide", exactVariant("terraform plan"))
    ).toBe("title_substring");
  });

  it("falls to description-only when the title does not carry the search", () => {
    expect(
      classifyCurriculumTitlePrecision("Cloud foundations", exactVariant("terraform"))
    ).toBe("description_only");
  });

  it("returns the STRONGEST precision any approved variant achieves", () => {
    const variants: CurriculumQueryVariant[] = [
      { value: "directory services", matchKind: "exact" },
      { value: "Active Directory", matchKind: "alias" }
    ];

    expect(classifyCurriculumTitlePrecision("Active Directory", variants)).toBe(
      "whole_title"
    );
  });

  it("classifies an empty variant set as the weakest class", () => {
    expect(classifyCurriculumTitlePrecision("Anything", [])).toBe(
      "description_only"
    );
  });

  it("keeps description_only last in the vocabulary", () => {
    expect(
      CURRICULUM_TITLE_PRECISIONS[CURRICULUM_TITLE_PRECISIONS.length - 1]
    ).toBe("description_only");
  });

  it("pins the approved precision vocabulary", () => {
    expect([...CURRICULUM_TITLE_PRECISIONS]).toEqual([
      "whole_title",
      "title_token",
      "title_substring",
      "description_only"
    ]);
  });
});

// ---------------------------------------------------------------------------
// The approved precedence
// ---------------------------------------------------------------------------

describe("R2 — title precision orders results within one match class", () => {
  it("ranks a whole-title match above a title token match", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "course", stableId: "b", title: "kubectl basics" }) },
        { document: doc({ contentType: "course", stableId: "a", title: "kubectl" }) }
      ]),
      exactVariant("kubectl"),
      10
    );

    expect(titles(ranked)).toEqual(["kubectl", "kubectl basics"]);
  });

  it("ranks a title token match above a title substring match", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "course", stableId: "a", title: "Terraform planning guide" }) },
        { document: doc({ contentType: "course", stableId: "b", title: "Terraform plan review" }) }
      ]),
      exactVariant("terraform plan"),
      10
    );

    expect(titles(ranked)).toEqual([
      "Terraform plan review",
      "Terraform planning guide"
    ]);
  });

  it("ranks a title substring match above a description-only match", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "course", stableId: "a", title: "Cloud foundations" }) },
        { document: doc({ contentType: "course", stableId: "b", title: "Terraforming basics" }) }
      ]),
      exactVariant("terraform"),
      10
    );

    expect(titles(ranked)).toEqual(["Terraforming basics", "Cloud foundations"]);
  });
});

describe("R1 — the SEARCH-005 match class dominates title precision", () => {
  /**
   * The load-bearing ruling. A result that matched the learner's ACTUAL words
   * must never be displaced by one that only matched after the query was
   * adjusted, however precisely that one matches.
   */
  it("keeps an exact-class description match above a typo-class whole-title match", () => {
    const variants: CurriculumQueryVariant[] = [
      { value: "vlan", matchKind: "exact" },
      { value: "kubectl", matchKind: "typo" }
    ];

    const ranked = buildRankedCurriculumSearchResults(
      classify([
        {
          document: doc({ contentType: "course", stableId: "a", title: "kubectl" }),
          matchKind: "typo"
        },
        {
          document: doc({ contentType: "course", stableId: "b", title: "Networking" }),
          matchKind: "exact"
        }
      ]),
      variants,
      10
    );

    expect(titles(ranked)).toEqual(["Networking", "kubectl"]);
  });

  it("orders exact before normalized before alias before typo", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "course", stableId: "d", title: "D" }), matchKind: "typo" },
        { document: doc({ contentType: "course", stableId: "c", title: "C" }), matchKind: "alias" },
        { document: doc({ contentType: "course", stableId: "b", title: "B" }), matchKind: "normalized" },
        { document: doc({ contentType: "course", stableId: "a", title: "A" }), matchKind: "exact" }
      ]),
      exactVariant("zzz-no-title-match"),
      10
    );

    expect(titles(ranked)).toEqual(["A", "B", "C", "D"]);
  });

  it("ranks an unclassifiable result last rather than first", () => {
    const known = doc({ contentType: "course", stableId: "a", title: "A" });
    const stranger = doc({ contentType: "course", stableId: "b", title: "B" });

    const ranked = buildRankedCurriculumSearchResults(
      [
        // The stranger carries a document whose id is absent from the map used
        // for its own tier, which is what an unclassifiable entry looks like.
        { document: stranger, matchKind: undefined as unknown as CurriculumMatchKind },
        { document: known, matchKind: "exact" }
      ],
      exactVariant("zzz-no-title-match"),
      10
    );

    expect(titles(ranked)).toEqual(["A", "B"]);
  });
});

describe("R3 and R4 — the existing SEARCH-002 order survives every tie", () => {
  it("keeps the content-type neutral order when match and title tie", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "competency", stableId: "a", title: "Same" }) },
        { document: doc({ contentType: "mission", stableId: "a", title: "Same" }) },
        { document: doc({ contentType: "course", stableId: "a", title: "Same" }) },
        { document: doc({ contentType: "learning_path", stableId: "a", title: "Same" }) }
      ]),
      exactVariant("Same"),
      10
    );

    expect(ranked.results.map((result) => result.contentType)).toEqual([
      "learning_path",
      "course",
      "mission",
      "competency"
    ]);
  });

  it("keeps the stable-id tie-break within one content type", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "course", stableId: "charlie", title: "Same" }) },
        { document: doc({ contentType: "course", stableId: "alpha", title: "Same" }) },
        { document: doc({ contentType: "course", stableId: "bravo", title: "Same" }) }
      ]),
      exactVariant("Same"),
      10
    );

    expect(ranked.results.map((result) => result.sourceRecordStableId)).toEqual([
      "alpha",
      "bravo",
      "charlie"
    ]);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("the order is fully deterministic", () => {
  const documents = [
    doc({ contentType: "course", stableId: "b", title: "kubectl basics" }),
    doc({ contentType: "mission", stableId: "a", title: "kubectl" }),
    doc({ contentType: "learning_path", stableId: "c", title: "Networking with kubectl" }),
    doc({ contentType: "competency", stableId: "d", title: "Container operations" })
  ];

  it("produces identical output for identical input", () => {
    const once = buildRankedCurriculumSearchResults(
      classify(documents.map((document) => ({ document }))),
      exactVariant("kubectl"),
      10
    );
    const twice = buildRankedCurriculumSearchResults(
      classify(documents.map((document) => ({ document }))),
      exactVariant("kubectl"),
      10
    );

    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });

  it("cannot be reordered by permuting the input", () => {
    const baseline = titles(
      buildRankedCurriculumSearchResults(
        classify(documents.map((document) => ({ document }))),
        exactVariant("kubectl"),
        10
      )
    );

    const permutations = [
      [3, 2, 1, 0],
      [1, 3, 0, 2],
      [2, 0, 3, 1],
      [0, 3, 2, 1]
    ];

    for (const permutation of permutations) {
      const shuffled = permutation.map((index) => documents[index] as SearchDocument);
      expect(
        titles(
          buildRankedCurriculumSearchResults(
            classify(shuffled.map((document) => ({ document }))),
            exactVariant("kubectl"),
            10
          )
        )
      ).toEqual(baseline);
    }
  });

  it("returns an empty, honest result for an empty input", () => {
    const ranked = buildRankedCurriculumSearchResults([], exactVariant("x"), 10);

    expect(ranked.results).toEqual([]);
    expect(ranked.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Ranking runs BEFORE the limit
// ---------------------------------------------------------------------------

describe("ranking happens before the requested limit is applied", () => {
  /**
   * If bounding ran first, the whole-title match would be truncated away in
   * favour of a weaker result that sorts earlier NEUTRALLY — the learner would
   * lose the single most relevant result to an implementation detail.
   */
  it("keeps a whole-title match that neutral order would have truncated", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "learning_path", stableId: "a", title: "Introduction to networking" }) },
        { document: doc({ contentType: "competency", stableId: "z", title: "vlan" }) }
      ]),
      exactVariant("vlan"),
      1
    );

    expect(titles(ranked)).toEqual(["vlan"]);
    expect(ranked.count).toBe(1);
  });

  it("reports the bounded count, never the input size", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([
        { document: doc({ contentType: "course", stableId: "a", title: "A" }) },
        { document: doc({ contentType: "course", stableId: "b", title: "B" }) },
        { document: doc({ contentType: "course", stableId: "c", title: "C" }) }
      ]),
      exactVariant("A"),
      2
    );

    expect(ranked.count).toBe(2);
    expect(ranked.results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Technical tokens
// ---------------------------------------------------------------------------

describe("protected technical tokens rank correctly", () => {
  it("ranks an exact technical title above a looser containing title", () => {
    for (const term of PROTECTED_TECHNICAL_TERMS) {
      const ranked = buildRankedCurriculumSearchResults(
        classify([
          {
            document: doc({
              contentType: "course",
              stableId: "aaa",
              title: `Working with ${term} in production`
            })
          },
          { document: doc({ contentType: "course", stableId: "zzz", title: term }) }
        ]),
        exactVariant(term),
        10
      );

      expect(ranked.results[0]?.title).toBe(term);
    }
  });

  it("does not read Get-ADUser as the acronym AD", () => {
    expect(
      classifyCurriculumTitlePrecision("Get-ADUser reference", exactVariant("AD"))
    ).toBe("title_substring");
    expect(
      classifyCurriculumTitlePrecision("AD fundamentals", exactVariant("AD"))
    ).toBe("title_token");
  });
});

// ---------------------------------------------------------------------------
// What can never influence the order
// ---------------------------------------------------------------------------

describe("the ranking surface admits no forbidden signal", () => {
  it("takes exactly three parameters and none of them is an identity", () => {
    expect(buildRankedCurriculumSearchResults).toHaveLength(3);
  });

  it("holds the forbidden-signal prohibition as data", () => {
    for (const forbidden of [
      "relevanceScore",
      "rankScore",
      "score",
      "boost",
      "weight",
      "popularity",
      "clickHistory",
      "engagement",
      "analytics",
      "userId",
      "ownerId",
      "sourceUpdatedAt",
      "freshness",
      "noteBody",
      "embedding"
    ]) {
      expect(SEARCH_RANKING_FORBIDDEN_SIGNALS).toContain(forbidden);
    }
  });

  /** SEARCH-007 stays integrated but is never a ranking key. */
  it("ignores sourceUpdatedAt entirely", () => {
    const older = doc({
      contentType: "course",
      stableId: "aaa",
      title: "Same title",
      updatedAt: "2020-01-01T00:00:00.000Z"
    });
    const newer = doc({
      contentType: "course",
      stableId: "zzz",
      title: "Same title",
      updatedAt: "2026-08-01T00:00:00.000Z"
    });

    const ranked = buildRankedCurriculumSearchResults(
      classify([{ document: newer }, { document: older }]),
      exactVariant("Same title"),
      10
    );

    // Stable id decides, exactly as before SEARCH-008. Recency does not.
    expect(ranked.results.map((result) => result.sourceRecordStableId)).toEqual([
      "aaa",
      "zzz"
    ]);
  });

  it("attaches no score, rank, position or ordering diagnostic to a result", () => {
    const ranked = buildRankedCurriculumSearchResults(
      classify([{ document: doc({ contentType: "course", stableId: "a", title: "A" }) }]),
      exactVariant("A"),
      10
    );

    const serialized = JSON.stringify(ranked);
    for (const forbidden of [
      "score",
      "rank",
      "relevance",
      "position",
      "titlePrecision",
      "matchKind",
      "candidateCount",
      "hiddenCount"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("returns the caller's own documents unchanged", () => {
    const original = doc({ contentType: "course", stableId: "a", title: "A" });

    const ranked = buildRankedCurriculumSearchResults(
      classify([{ document: original }]),
      exactVariant("A"),
      10
    );

    expect(ranked.results[0]).toBe(original);
  });

  /**
   * The only text that can move a result is its own TITLE.
   *
   * This is why corpus vocabulary — and, upstream, private note text — cannot
   * become a ranking input: there is no channel from body text into the order.
   * A document whose searchable text is stuffed with the query still ranks
   * exactly where its title puts it.
   */
  it("cannot be moved by searchable text, only by the title", () => {
    const plain = buildSearchDocument({
      sourceEngine: "curriculum",
      contentType: "course",
      sourceRecordStableId: "aaa",
      sourceVersion: 1,
      title: "Cloud foundations",
      searchableText: "Cloud foundations",
      sourceReference: "/course/aaa",
      publicationState: "published",
      accessScope: "shared",
      sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
      indexedAt: INDEXED_AT
    });

    const stuffed = buildSearchDocument({
      sourceEngine: "curriculum",
      contentType: "course",
      sourceRecordStableId: "aaa",
      sourceVersion: 1,
      title: "Cloud foundations",
      searchableText: "vlan vlan vlan vlan vlan vlan vlan vlan",
      keywords: ["vlan", "vlan", "vlan"],
      sourceReference: "/course/aaa",
      publicationState: "published",
      accessScope: "shared",
      sourceUpdatedAt: "2026-01-01T00:00:00.000Z",
      indexedAt: INDEXED_AT
    });

    const other = doc({ contentType: "course", stableId: "zzz", title: "vlan" });

    const withPlain = titles(
      buildRankedCurriculumSearchResults(
        classify([{ document: plain as SearchDocument }, { document: other }]),
        exactVariant("vlan"),
        10
      )
    );

    const withStuffed = titles(
      buildRankedCurriculumSearchResults(
        classify([{ document: stuffed as SearchDocument }, { document: other }]),
        exactVariant("vlan"),
        10
      )
    );

    expect(withPlain).toEqual(["vlan", "Cloud foundations"]);
    expect(withStuffed).toEqual(withPlain);
  });
});

// ---------------------------------------------------------------------------
// Learner-facing explanation
// ---------------------------------------------------------------------------

describe("the ordering explanation is honest text", () => {
  it("describes the rule in words", () => {
    const explanation = describeCurriculumRankingOrder();

    expect(explanation).toContain("title");
    expect(explanation).toContain("description");
    expect(explanation.length).toBeGreaterThan(40);
  });

  it("states that the order does not depend on behaviour", () => {
    const explanation = describeCurriculumRankingOrder().toLowerCase();

    expect(explanation).toContain("popularity");
    expect(explanation).toContain("other learners");
  });

  it("exposes no internal ordering vocabulary", () => {
    const explanation = describeCurriculumRankingOrder();

    for (const internal of [
      "whole_title",
      "title_token",
      "title_substring",
      "description_only",
      "matchKind",
      "tier"
    ]) {
      expect(explanation).not.toContain(internal);
    }
  });

  it("records a model version", () => {
    expect(SEARCH_RANKING_MODEL_VERSION).toBe("search-ranking-v1");
  });
});
