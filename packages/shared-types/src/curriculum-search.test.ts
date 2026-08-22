import { describe, expect, it } from "vitest";
import { buildSearchDocument, type SearchDocument } from "./search-document";
import {
  CURRICULUM_SEARCH_CONTENT_TYPES,
  CURRICULUM_SEARCH_DEFAULT_LIMIT,
  CURRICULUM_SEARCH_MAX_LIMIT,
  CURRICULUM_SEARCH_QUERY_MAX_LENGTH,
  buildCurriculumSearchResults,
  buildCurriculumSearchSnippet,
  buildCurriculumSourceReference,
  describeCurriculumContentType,
  describeCurriculumSearchCount,
  describeCurriculumSearchFallback,
  describeCurriculumSearchQueryError,
  escapeCurriculumSearchPattern,
  isCurriculumSearchContentType,
  normalizeCurriculumSearchLimit,
  normalizeCurriculumSearchQuery,
  orderCurriculumCandidates,
  selectHighestPublishedVersion,
  validateCurriculumSearchQuery,
  type CurriculumSearchCandidate
} from "./curriculum-search";

function candidate(
  overrides: Partial<CurriculumSearchCandidate> = {}
): CurriculumSearchCandidate {
  return {
    contentType: "course",
    stableId: "course.example",
    version: 1,
    title: "Networking Basics",
    description: "Run show vlan brief to inspect VLANs.",
    publicationState: "published",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides
  };
}

function documentFor(
  contentType: CurriculumSearchCandidate["contentType"],
  stableId: string,
  version = 1
): SearchDocument {
  return buildSearchDocument({
    sourceEngine: "curriculum",
    contentType,
    sourceRecordStableId: stableId,
    sourceVersion: version,
    title: stableId,
    sourceReference: buildCurriculumSourceReference(contentType, stableId),
    publicationState: "published",
    accessScope: "shared",
    sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
    indexedAt: "2026-08-21T09:00:00.000Z"
  })!;
}

describe("the searchable curriculum set", () => {
  it("is exactly the four approved types", () => {
    expect(CURRICULUM_SEARCH_CONTENT_TYPES).toEqual([
      "learning_path",
      "course",
      "mission",
      "competency"
    ]);
  });

  it("excludes modules, assets, labs and notes", () => {
    for (const excluded of [
      "module",
      "learning_asset",
      "lab_definition",
      "note"
    ]) {
      expect(isCurriculumSearchContentType(excluded)).toBe(false);
    }
  });

  it("labels every type in readable text", () => {
    expect(describeCurriculumContentType("learning_path")).toBe("Learning path");
    expect(describeCurriculumContentType("course")).toBe("Course");
    expect(describeCurriculumContentType("mission")).toBe("Mission");
    expect(describeCurriculumContentType("competency")).toBe("Competency");
  });

  it("builds a stable destination per type", () => {
    expect(buildCurriculumSourceReference("learning_path", "path.x")).toBe(
      "/learning-paths/path.x"
    );
    expect(buildCurriculumSourceReference("course", "course.x")).toBe(
      "/courses/course.x"
    );
    expect(buildCurriculumSourceReference("mission", "mission.x")).toBe(
      "/missions/mission.x"
    );
    expect(buildCurriculumSourceReference("competency", "competency.x")).toBe(
      "/competencies/competency.x"
    );
  });
});

describe("read resolution when several versions are published", () => {
  it("A: one published version is selected", () => {
    const selected = selectHighestPublishedVersion([candidate({ version: 1 })]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.version).toBe(1);
  });

  it("B: versions 1 and 2 published yields version 2 only", () => {
    const selected = selectHighestPublishedVersion([
      candidate({ version: 1 }),
      candidate({ version: 2 })
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.version).toBe(2);
  });

  it("C: versions 1, 2 and 3 published yields version 3 only", () => {
    const selected = selectHighestPublishedVersion([
      candidate({ version: 1 }),
      candidate({ version: 2 }),
      candidate({ version: 3 })
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.version).toBe(3);
  });

  it("D: the same stable id under two content types resolves independently", () => {
    const selected = selectHighestPublishedVersion([
      candidate({ contentType: "course", stableId: "shared.id", version: 2 }),
      candidate({ contentType: "course", stableId: "shared.id", version: 1 }),
      candidate({ contentType: "mission", stableId: "shared.id", version: 5 }),
      candidate({ contentType: "mission", stableId: "shared.id", version: 4 })
    ]);

    expect(selected).toHaveLength(2);
    expect(
      selected.find((entry) => entry.contentType === "course")?.version
    ).toBe(2);
    expect(
      selected.find((entry) => entry.contentType === "mission")?.version
    ).toBe(5);
  });

  it("E: each stable id receives its own highest published version", () => {
    const selected = selectHighestPublishedVersion([
      candidate({ stableId: "course.a", version: 1 }),
      candidate({ stableId: "course.a", version: 3 }),
      candidate({ stableId: "course.b", version: 7 }),
      candidate({ stableId: "course.b", version: 2 })
    ]);

    expect(selected).toHaveLength(2);
    expect(selected.find((e) => e.stableId === "course.a")?.version).toBe(3);
    expect(selected.find((e) => e.stableId === "course.b")?.version).toBe(7);
  });

  it("F: output is deterministic regardless of input order", () => {
    const rows = [
      candidate({ stableId: "course.b", version: 2 }),
      candidate({ contentType: "mission", stableId: "mission.a", version: 9 }),
      candidate({ stableId: "course.a", version: 5 }),
      candidate({ stableId: "course.a", version: 4 })
    ];

    const forward = selectHighestPublishedVersion(rows);
    const reversed = selectHighestPublishedVersion([...rows].reverse());

    expect(forward).toEqual(reversed);
    expect(forward.map((entry) => `${entry.contentType}:${entry.stableId}@${entry.version}`)).toEqual([
      "course:course.a@5",
      "course:course.b@2",
      "mission:mission.a@9"
    ]);
  });

  it("G: the built document preserves the selected authoritative version", () => {
    const selected = selectHighestPublishedVersion([
      candidate({ version: 1 }),
      candidate({ version: 4 })
    ]);

    const document = documentFor("course", selected[0]!.stableId, selected[0]!.version);

    expect(document.sourceVersion).toBe(4);
    expect(document.documentId).toBe("curriculum:course:course.example@4");
  });

  it("never selects a candidate that is not published", () => {
    for (const state of ["draft", "review", "retired"]) {
      expect(
        selectHighestPublishedVersion([candidate({ publicationState: state })])
      ).toEqual([]);
    }
  });

  it("prefers the highest PUBLISHED version, not the highest version overall", () => {
    const selected = selectHighestPublishedVersion([
      candidate({ version: 2, publicationState: "published" }),
      candidate({ version: 9, publicationState: "draft" })
    ]);

    expect(selected).toHaveLength(1);
    expect(selected[0]?.version).toBe(2);
  });

  it("returns nothing for an empty candidate set", () => {
    expect(selectHighestPublishedVersion([])).toEqual([]);
  });

  it("does not mutate the caller's candidates", () => {
    const rows = [candidate({ version: 1 }), candidate({ version: 2 })];
    const snapshot = JSON.stringify(rows);

    selectHighestPublishedVersion(rows);

    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});

describe("neutral deterministic ordering", () => {
  it("orders by content type, then stable id", () => {
    const ordered = orderCurriculumCandidates([
      candidate({ contentType: "competency", stableId: "z" }),
      candidate({ contentType: "learning_path", stableId: "b" }),
      candidate({ contentType: "learning_path", stableId: "a" }),
      candidate({ contentType: "mission", stableId: "m" })
    ]);

    expect(
      ordered.map((entry) => `${entry.contentType}:${entry.stableId}`)
    ).toEqual([
      "learning_path:a",
      "learning_path:b",
      "mission:m",
      "competency:z"
    ]);
  });

  it("is stable for repeated calls", () => {
    const rows = [
      candidate({ stableId: "b" }),
      candidate({ stableId: "a" })
    ];

    expect(orderCurriculumCandidates(rows)).toEqual(
      orderCurriculumCandidates(rows)
    );
  });

  it("carries no relevance or scoring signal", () => {
    const ordered = orderCurriculumCandidates([candidate()]) as unknown as Record<
      string,
      unknown
    >[];

    for (const key of ["score", "relevance", "rank", "weight"]) {
      expect(ordered[0]).not.toHaveProperty(key);
    }
  });
});

describe("query validation and bounds", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeCurriculumSearchQuery("  show   vlan  brief ")).toBe(
      "show vlan brief"
    );
  });

  it("preserves case and punctuation", () => {
    expect(normalizeCurriculumSearchQuery("Get-ADUser")).toBe("Get-ADUser");
    expect(normalizeCurriculumSearchQuery("index=botsv3")).toBe("index=botsv3");
    expect(normalizeCurriculumSearchQuery("kubectl")).not.toBe("KUBECTL");
  });

  it("rejects an empty or whitespace-only query", () => {
    for (const empty of ["", "   ", null, undefined]) {
      expect(validateCurriculumSearchQuery(empty)).toBe("query_missing");
    }
  });

  it("rejects a query beyond the bound", () => {
    expect(
      validateCurriculumSearchQuery("x".repeat(CURRICULUM_SEARCH_QUERY_MAX_LENGTH + 1))
    ).toBe("query_too_long");
  });

  it("accepts a query exactly at the bound", () => {
    expect(
      validateCurriculumSearchQuery("x".repeat(CURRICULUM_SEARCH_QUERY_MAX_LENGTH))
    ).toBeNull();
  });

  it("explains each query failure", () => {
    for (const error of ["query_missing", "query_too_long"] as const) {
      expect(describeCurriculumSearchQueryError(error).length).toBeGreaterThan(0);
    }
  });

  it("bounds the limit", () => {
    expect(normalizeCurriculumSearchLimit(undefined)).toBe(
      CURRICULUM_SEARCH_DEFAULT_LIMIT
    );
    expect(normalizeCurriculumSearchLimit(0)).toBe(1);
    expect(normalizeCurriculumSearchLimit(1000)).toBe(CURRICULUM_SEARCH_MAX_LIMIT);
    expect(normalizeCurriculumSearchLimit("abc")).toBe(
      CURRICULUM_SEARCH_DEFAULT_LIMIT
    );
    expect(normalizeCurriculumSearchLimit(10)).toBe(10);
  });
});

describe("wildcard escaping", () => {
  it("escapes the LIKE control characters", () => {
    expect(escapeCurriculumSearchPattern("100%")).toBe("100\\%");
    expect(escapeCurriculumSearchPattern("index_name")).toBe("index\\_name");
    expect(escapeCurriculumSearchPattern("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary technical text untouched", () => {
    for (const token of [
      "Get-ADUser",
      "kubectl",
      "terraform plan",
      "show vlan brief"
    ]) {
      expect(escapeCurriculumSearchPattern(token)).toBe(token);
    }
  });

  it("escapes an all-wildcard query rather than matching everything", () => {
    expect(escapeCurriculumSearchPattern("%")).toBe("\\%");
    expect(escapeCurriculumSearchPattern("%%%")).toBe("\\%\\%\\%");
  });
});

describe("snippets preserve the source representation", () => {
  it("returns short text unchanged", () => {
    expect(buildCurriculumSearchSnippet("Run kubectl get pods", "kubectl")).toBe(
      "Run kubectl get pods"
    );
  });

  it("preserves case and punctuation of the source", () => {
    const snippet = buildCurriculumSearchSnippet(
      "Use Get-ADUser -Filter * to list accounts",
      "get-aduser"
    );

    expect(snippet).toContain("Get-ADUser");
  });

  it("centres a long snippet on the match", () => {
    const text = `${"a".repeat(400)} index=botsv3 ${"b".repeat(400)}`;
    const snippet = buildCurriculumSearchSnippet(text, "index=botsv3");

    expect(snippet).toContain("index=botsv3");
    expect(snippet.length).toBeLessThanOrEqual(210);
  });

  it("falls back to the opening text when the match is not in the field", () => {
    const text = "c".repeat(500);
    const snippet = buildCurriculumSearchSnippet(text, "nowhere");

    expect(snippet.startsWith("ccc")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("handles empty text", () => {
    expect(buildCurriculumSearchSnippet("   ", "x")).toBe("");
  });
});

describe("the result set", () => {
  it("counts only the results actually returned", () => {
    const documents = [
      documentFor("course", "course.a"),
      documentFor("course", "course.b"),
      documentFor("course", "course.c")
    ];

    const bounded = buildCurriculumSearchResults(documents, 2);

    expect(bounded.results).toHaveLength(2);
    expect(bounded.count).toBe(2);
  });

  it("exposes no hidden or global total", () => {
    const bounded = buildCurriculumSearchResults(
      [documentFor("course", "course.a")],
      25
    ) as unknown as Record<string, unknown>;

    expect(Object.keys(bounded).sort()).toEqual(["count", "results"]);
    for (const forbidden of ["total", "totalCount", "matched", "hidden"]) {
      expect(bounded).not.toHaveProperty(forbidden);
    }
  });

  it("orders results neutrally", () => {
    const bounded = buildCurriculumSearchResults(
      [
        documentFor("competency", "competency.z"),
        documentFor("learning_path", "path.a"),
        documentFor("mission", "mission.m")
      ],
      25
    );

    expect(bounded.results.map((r) => r.contentType)).toEqual([
      "learning_path",
      "mission",
      "competency"
    ]);
  });

  it("describes the count accessibly", () => {
    expect(describeCurriculumSearchCount(0)).toBe("No matching curriculum found.");
    expect(describeCurriculumSearchCount(1)).toBe("1 result.");
    expect(describeCurriculumSearchCount(4)).toBe("4 results.");
  });
});

describe("the fallback message is honest", () => {
  it("says search is unavailable and retry is safe", () => {
    const message = describeCurriculumSearchFallback();

    expect(message).toContain("unavailable");
    expect(message).toContain("try again");
  });

  /**
   * SEARCH-002 section 12 assumes structured Learning Path and Course
   * navigation exists to fall back to. It does not exist in this application,
   * so the message must not send a learner somewhere that is not there.
   */
  it("does not claim curriculum navigation exists", () => {
    const message = describeCurriculumSearchFallback().toLowerCase();

    for (const claim of ["browse", "navigate", "learning paths", "courses"]) {
      expect(message).not.toContain(claim);
    }
  });
});
