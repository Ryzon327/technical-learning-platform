import { describe, expect, it } from "vitest";
import {
  SEARCHABLE_TEXT_MAX_LENGTH,
  SEARCH_CONTENT_TYPES,
  SEARCH_DOCUMENT_FORBIDDEN_FIELDS,
  SEARCH_DOCUMENT_MODEL_VERSION,
  SEARCH_INDEXED_SOURCE_ENGINES,
  SEARCH_SOURCE_OUTCOMES,
  buildSearchDocument,
  buildSearchDocumentId,
  canServeSearchDocument,
  describeIndexedSourceEngines,
  describeIndexingFailure,
  describeSearchDocumentError,
  describeSearchSourceOutcome,
  isSearchContentType,
  isSearchDocumentStale,
  isSearchSourceEngine,
  isSharedIndexEligible,
  normalizeSearchKeywords,
  normalizeSearchableText,
  validateSearchDocumentInput,
  type BuildSearchDocumentInput
} from "./search-document";

function input(
  overrides: Partial<BuildSearchDocumentInput> = {}
): BuildSearchDocumentInput {
  return {
    sourceEngine: "curriculum",
    contentType: "learning_path",
    sourceRecordStableId: "path.network-foundations",
    sourceVersion: 3,
    title: "Network Foundations",
    searchableText: "Design and defend a segmented network.",
    keywords: ["networking", "segmentation"],
    sourceReference: "/learning-paths/path.network-foundations",
    publicationState: "published",
    accessScope: "shared",
    sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
    indexedAt: "2026-08-20T09:00:00.000Z",
    ...overrides
  };
}

describe("the indexed source engine set", () => {
  it("indexes curriculum only", () => {
    expect(SEARCH_INDEXED_SOURCE_ENGINES).toEqual(["curriculum"]);
  });

  /**
   * SEARCH-006 section 8 forbids placing private note content into a broadly
   * shared index that relies only on filters for safety. The notes engine is
   * therefore absent by design, not by omission.
   */
  it("never indexes the Knowledge and Notes engine", () => {
    for (const forbidden of ["knowledge", "knowledge_notes", "notes", "student_notes"]) {
      expect(SEARCH_INDEXED_SOURCE_ENGINES as readonly string[]).not.toContain(forbidden);
      expect(isSearchSourceEngine(forbidden)).toBe(false);
    }
  });

  it("tells the Founder which engines are indexed", () => {
    const described = describeIndexedSourceEngines();

    expect(described).toHaveLength(1);
    expect(described[0]).toContain("curriculum");
  });

  it("recognises only approved engines", () => {
    expect(isSearchSourceEngine("curriculum")).toBe(true);
    for (const rejected of ["evidence", "certificate", "", null, 7]) {
      expect(isSearchSourceEngine(rejected)).toBe(false);
    }
  });
});

describe("the content type vocabulary", () => {
  it("carries exactly the approved searchable types", () => {
    expect(SEARCH_CONTENT_TYPES).toEqual([
      "learning_path",
      "course",
      "module",
      "mission",
      "competency",
      "learning_asset",
      "lab_definition"
    ]);
  });

  it("rejects an unapproved type", () => {
    for (const rejected of ["note", "certificate", "evidence", "", null]) {
      expect(isSearchContentType(rejected)).toBe(false);
    }
  });
});

describe("document identity is stable, never internal", () => {
  it("derives the document id from stable identity and version", () => {
    expect(
      buildSearchDocumentId({
        sourceEngine: "curriculum",
        contentType: "learning_path",
        sourceRecordStableId: "path.network-foundations",
        sourceVersion: 3
      })
    ).toBe("curriculum:learning_path:path.network-foundations@3");
  });

  it("changes when the source version changes", () => {
    const v3 = buildSearchDocument(input({ sourceVersion: 3 }))!;
    const v4 = buildSearchDocument(input({ sourceVersion: 4 }))!;

    expect(v3.documentId).not.toBe(v4.documentId);
  });

  it("is reproducible for the same source", () => {
    expect(buildSearchDocument(input())!.documentId).toBe(
      buildSearchDocument(input())!.documentId
    );
  });

  it("never carries an internal database identifier", () => {
    const document = buildSearchDocument(input()) as unknown as Record<string, unknown>;

    for (const forbidden of SEARCH_DOCUMENT_FORBIDDEN_FIELDS) {
      expect(document).not.toHaveProperty(forbidden);
    }
  });

  it("does not leak a field smuggled through the input", () => {
    const smuggled = {
      ...input(),
      id: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      rawHtml: "<script>x</script>"
    } as BuildSearchDocumentInput;

    const document = buildSearchDocument(smuggled) as unknown as Record<string, unknown>;

    expect(document).not.toHaveProperty("id");
    expect(document).not.toHaveProperty("userId");
    expect(document).not.toHaveProperty("rawHtml");
  });

  it("preserves the source stable id and version verbatim", () => {
    const document = buildSearchDocument(input())!;

    expect(document.sourceRecordStableId).toBe("path.network-foundations");
    expect(document.sourceVersion).toBe(3);
    expect(document.modelVersion).toBe(SEARCH_DOCUMENT_MODEL_VERSION);
  });
});

describe("normalizing multiple source types", () => {
  it("normalizes a learning path", () => {
    const document = buildSearchDocument(input())!;

    expect(document.contentType).toBe("learning_path");
    expect(document.title).toBe("Network Foundations");
    expect(document.sourceReference).toBe("/learning-paths/path.network-foundations");
  });

  it("normalizes a competency through the same contract", () => {
    const document = buildSearchDocument(
      input({
        contentType: "competency",
        sourceRecordStableId: "competency.subnetting",
        sourceVersion: 2,
        title: "Subnetting",
        sourceReference: "/competencies/competency.subnetting"
      })
    )!;

    expect(document.contentType).toBe("competency");
    expect(document.documentId).toBe("curriculum:competency:competency.subnetting@2");
    expect(document.modelVersion).toBe(SEARCH_DOCUMENT_MODEL_VERSION);
  });

  it("carries optional curriculum context by stable id only", () => {
    const document = buildSearchDocument(
      input({ curriculumContext: { courseStableId: "course.networking" } })
    )!;

    expect(document.curriculumContext).toEqual({ courseStableId: "course.networking" });
  });

  it("carries competency references at an exact version", () => {
    const document = buildSearchDocument(
      input({
        competencyReferences: [
          { competencyStableId: "competency.subnetting", competencyVersion: 2 }
        ]
      })
    )!;

    expect(document.competencyReferences).toEqual([
      { competencyStableId: "competency.subnetting", competencyVersion: 2 }
    ]);
  });

  it("omits optional sections entirely when absent", () => {
    const document = buildSearchDocument(input())!;

    expect(document).not.toHaveProperty("curriculumContext");
    expect(document).not.toHaveProperty("competencyReferences");
  });
});

describe("conservative text normalization", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeSearchableText("  a   b \n c  ")).toBe("a b c");
  });

  it("bounds length", () => {
    expect(normalizeSearchableText("x".repeat(SEARCHABLE_TEXT_MAX_LENGTH + 500)).length).toBe(
      SEARCHABLE_TEXT_MAX_LENGTH
    );
  });

  /**
   * SEARCH-005 section 8 requires meaningful technical tokens to survive.
   * SEARCH-001 must therefore normalize conservatively and must NOT fold case,
   * strip punctuation, expand synonyms or correct spelling.
   */
  it.each([
    "Get-ADUser",
    "index=botsv3",
    "kubectl",
    "terraform plan",
    "show vlan brief"
  ])("preserves the technical token %s", (token) => {
    expect(normalizeSearchableText(`run ${token} now`)).toContain(token);
  });

  it("preserves case exactly", () => {
    expect(normalizeSearchableText("Get-ADUser")).toBe("Get-ADUser");
    expect(normalizeSearchableText("Get-ADUser")).not.toBe("get-aduser");
  });

  it("preserves punctuation that distinguishes technical content", () => {
    expect(normalizeSearchableText("index=botsv3")).toBe("index=botsv3");
    expect(normalizeSearchableText("a/b-c_d.e")).toBe("a/b-c_d.e");
  });

  it("de-duplicates keywords while keeping order", () => {
    expect(normalizeSearchKeywords(["b", "a", "b", "  ", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("falls back to the title when no searchable text is supplied", () => {
    const document = buildSearchDocument(input({ searchableText: undefined }))!;

    expect(document.searchableText).toBe("Network Foundations");
  });
});

describe("malformed sources fail safely", () => {
  it.each([
    ["source_engine_unknown", { sourceEngine: "notes" }],
    ["content_type_unknown", { contentType: "note" }],
    ["source_identity_missing", { sourceRecordStableId: "   " }],
    ["source_version_invalid", { sourceVersion: 0 }],
    ["source_version_invalid", { sourceVersion: 1.5 }],
    ["title_missing", { title: "" }],
    ["source_reference_missing", { sourceReference: "" }]
  ] as const)("reports %s", (expected, override) => {
    expect(validateSearchDocumentInput(input(override as never))).toBe(expected);
  });

  it("accepts a well-formed source", () => {
    expect(validateSearchDocumentInput(input())).toBeNull();
  });

  it("produces no document at all for malformed input", () => {
    expect(buildSearchDocument(input({ title: "" }))).toBeNull();
    expect(buildSearchDocument(input({ sourceEngine: "notes" }))).toBeNull();
  });

  it("explains every failure in plain language", () => {
    for (const error of [
      "source_engine_unknown",
      "content_type_unknown",
      "source_identity_missing",
      "source_version_invalid",
      "title_missing",
      "source_reference_missing"
    ] as const) {
      expect(describeSearchDocumentError(error).length).toBeGreaterThan(0);
    }
  });
});

describe("private content never enters the shared foundation", () => {
  it("treats shared content as shared-index eligible", () => {
    expect(isSharedIndexEligible(buildSearchDocument(input())!)).toBe(true);
  });

  it("refuses private content", () => {
    const document = buildSearchDocument(input({ accessScope: "private" }))!;

    expect(document.accessScope).toBe("private");
    expect(isSharedIndexEligible(document)).toBe(false);
  });

  it("cannot even represent a note as an indexed source", () => {
    expect(buildSearchDocument(input({ sourceEngine: "knowledge_notes" }))).toBeNull();
    expect(buildSearchDocument(input({ contentType: "note" }))).toBeNull();
  });
});

describe("staleness is detectable", () => {
  it("is not stale when the source version matches", () => {
    expect(isSearchDocumentStale(buildSearchDocument(input())!, 3)).toBe(false);
  });

  it("is stale when the source moved on", () => {
    expect(isSearchDocumentStale(buildSearchDocument(input())!, 4)).toBe(true);
  });

  it("fails closed when the source version cannot be read", () => {
    expect(isSearchDocumentStale(buildSearchDocument(input())!, null)).toBe(true);
    expect(isSearchDocumentStale(buildSearchDocument(input())!, undefined)).toBe(true);
  });

  it("records an indexing failure for later identification", () => {
    expect(
      describeIndexingFailure({
        sourceEngine: "curriculum",
        sourceRecordStableId: "path.network-foundations",
        reason: "stale",
        detectedAt: "2026-08-20T09:00:00.000Z"
      })
    ).toBe("curriculum/path.network-foundations: stale");
  });
});

describe("a document can never authorize itself", () => {
  it("serves only a resolved source", () => {
    expect(canServeSearchDocument({ documentId: "d", outcome: "resolved" })).toBe(true);
  });

  it.each(["missing", "stale", "unpublished", "unauthorized", "unavailable"] as const)(
    "never serves a %s source",
    (outcome) => {
      expect(canServeSearchDocument({ documentId: "d", outcome })).toBe(false);
    }
  );

  /**
   * SEARCH-001 section 6 excludes permission decisions based only on index
   * fields. `canServeSearchDocument` takes a RESOLUTION, so a document's own
   * publication state and access scope cannot answer the question — proven here
   * by showing a perfectly "published, shared" document still cannot be served
   * without a resolved source.
   */
  it("cannot be answered from index metadata alone", () => {
    const document = buildSearchDocument(
      input({ publicationState: "published", accessScope: "shared" })
    )!;

    expect(document.publicationState).toBe("published");
    expect(document.accessScope).toBe("shared");
    expect(
      canServeSearchDocument({ documentId: document.documentId, outcome: "unauthorized" })
    ).toBe(false);
  });

  it("names every resolution outcome", () => {
    expect(SEARCH_SOURCE_OUTCOMES).toEqual([
      "resolved",
      "missing",
      "stale",
      "unpublished",
      "unauthorized",
      "unavailable"
    ]);
    for (const outcome of SEARCH_SOURCE_OUTCOMES) {
      expect(describeSearchSourceOutcome(outcome).length).toBeGreaterThan(0);
    }
  });

  it("never tells a learner an unauthorized result exists in detail", () => {
    expect(describeSearchSourceOutcome("unauthorized")).toBe(
      "You do not have access to this content."
    );
  });
});

describe("the model owns no source truth and needs no AI", () => {
  it("exports no writer, mutator or persistence helper", async () => {
    const module = await import("./search-document");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/^(save|persist|write|store|insert|update|delete)/i);
    }
  });

  it("exports no query, ranking or filtering capability", async () => {
    const module = await import("./search-document");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/(rank|score|facet|filterResults|executeSearch|runQuery)/i);
    }
  });

  it("produces a document deterministically, with no clock of its own", () => {
    const first = buildSearchDocument(input())!;
    const second = buildSearchDocument(input())!;

    expect(first).toEqual(second);
    expect(first.indexedAt).toBe("2026-08-20T09:00:00.000Z");
  });
});
