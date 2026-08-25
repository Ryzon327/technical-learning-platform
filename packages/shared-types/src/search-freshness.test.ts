import { describe, expect, it } from "vitest";
import {
  SEARCH_SOURCE_OUTCOMES,
  buildSearchDocument,
  isSearchDocumentStale,
  type SearchSourceOutcome,
  type SearchSourceResolution
} from "./search-document";
import {
  SEARCH_FRESHNESS_FORBIDDEN_FIELDS,
  SEARCH_FRESHNESS_MODEL_VERSION,
  SEARCH_RECONCILIATION_MAX_ATTEMPTS,
  SEARCH_RECONCILIATION_MAX_DOCUMENTS,
  SEARCH_RETRYABLE_OUTCOMES,
  buildSearchFreshnessReport,
  describeAllFreshnessOutcomes,
  describeFreshnessOutcomeLabel,
  describeSearchFreshnessStatus,
  isFreshEnoughToServe,
  isRetryableSearchOutcome,
  normalizeReconciliationLimit
} from "./search-freshness";

const resolution = (
  outcome: SearchSourceOutcome,
  documentId = `curriculum:course:c-${outcome}@1`
): SearchSourceResolution => ({ documentId, outcome });

describe("only a resolved source may serve", () => {
  it("serves a resolved source", () => {
    expect(isFreshEnoughToServe(resolution("resolved"))).toBe(true);
  });

  /** C–F: every non-resolved outcome fails closed. */
  it("never serves stale, missing, unpublished, unauthorized or unavailable", () => {
    for (const outcome of [
      "stale",
      "missing",
      "unpublished",
      "unauthorized",
      "unavailable"
    ] as SearchSourceOutcome[]) {
      expect(isFreshEnoughToServe(resolution(outcome))).toBe(false);
    }
  });

  it("denies an outcome the contract does not recognise", () => {
    const future = resolution("partially_current" as unknown as SearchSourceOutcome);

    expect(isFreshEnoughToServe(future)).toBe(false);
  });

  it("stamps the model version", () => {
    expect(SEARCH_FRESHNESS_MODEL_VERSION).toBe("search-freshness-v1");
  });
});

describe("freshness is decided by source version", () => {
  const document = buildSearchDocument({
    sourceEngine: "curriculum",
    contentType: "course",
    sourceRecordStableId: "course.networking",
    sourceVersion: 3,
    title: "Networking Basics",
    searchableText: "Run show vlan brief.",
    sourceReference: "/courses/course.networking",
    publicationState: "published",
    accessScope: "shared",
    sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
    indexedAt: "2026-08-25T09:00:00.000Z"
  }) as NonNullable<ReturnType<typeof buildSearchDocument>>;

  it("A: the current version is not stale", () => {
    expect(isSearchDocumentStale(document, 3)).toBe(false);
  });

  it("B: a version mismatch is stale", () => {
    expect(isSearchDocumentStale(document, 4)).toBe(true);
    expect(isSearchDocumentStale(document, 2)).toBe(true);
  });

  /** Fail closed: an unknown current version cannot prove currency. */
  it("an unknown current version is stale", () => {
    expect(isSearchDocumentStale(document, null)).toBe(true);
    expect(isSearchDocumentStale(document, undefined)).toBe(true);
  });

  it("I: sourceUpdatedAt is preserved exactly", () => {
    expect(document.sourceUpdatedAt).toBe("2026-08-01T10:00:00.000Z");
  });

  /**
   * J: `indexedAt` is projection-generation time under this architecture. It
   * implies no database index, because none exists.
   */
  it("J: indexedAt carries the projection time, distinct from source time", () => {
    expect(document.indexedAt).toBe("2026-08-25T09:00:00.000Z");
    expect(document.indexedAt).not.toBe(document.sourceUpdatedAt);
  });
});

describe("reconciliation is bounded", () => {
  it("M: an explicit document bound exists", () => {
    expect(SEARCH_RECONCILIATION_MAX_DOCUMENTS).toBe(100);
  });

  it("M: the bound is enforced and never unbounded or zero", () => {
    expect(normalizeReconciliationLimit(5000)).toBe(100);
    expect(normalizeReconciliationLimit(0)).toBe(1);
    expect(normalizeReconciliationLimit(-10)).toBe(1);
    expect(normalizeReconciliationLimit(25)).toBe(25);
  });

  it("M: a non-numeric request falls back to the bound", () => {
    expect(normalizeReconciliationLimit("abc")).toBe(100);
    expect(normalizeReconciliationLimit(undefined)).toBe(100);
    expect(normalizeReconciliationLimit(Number.POSITIVE_INFINITY)).toBe(100);
  });
});

describe("retry is bounded and narrow", () => {
  it("N: an explicit attempt bound exists", () => {
    expect(SEARCH_RECONCILIATION_MAX_ATTEMPTS).toBe(2);
  });

  /**
   * Only transient unavailability is retried. A definitive outcome is an
   * answer, and retrying it could mask a real state change.
   */
  it("retries only an unreachable source", () => {
    expect(isRetryableSearchOutcome("unavailable")).toBe(true);

    for (const outcome of [
      "resolved",
      "stale",
      "missing",
      "unpublished",
      "unauthorized"
    ] as SearchSourceOutcome[]) {
      expect(isRetryableSearchOutcome(outcome)).toBe(false);
    }
  });

  it("names exactly one retryable outcome", () => {
    expect(SEARCH_RETRYABLE_OUTCOMES).toEqual(["unavailable"]);
  });
});

describe("the report is aggregate state only", () => {
  const run = [
    resolution("resolved"),
    resolution("resolved"),
    resolution("stale"),
    resolution("unpublished"),
    resolution("missing")
  ];

  it("K: counts every outcome deterministically", () => {
    const report = buildSearchFreshnessReport(run);

    expect(report.examined).toBe(5);
    expect(report.outcomes.resolved).toBe(2);
    expect(report.outcomes.stale).toBe(1);
    expect(report.outcomes.unpublished).toBe(1);
    expect(report.outcomes.missing).toBe(1);
    expect(report.servable).toBe(2);
    expect(report.unservable).toBe(3);
  });

  it("L: is idempotent for the same input", () => {
    expect(JSON.stringify(buildSearchFreshnessReport(run))).toBe(
      JSON.stringify(buildSearchFreshnessReport(run))
    );
  });

  it("K: is independent of resolution order", () => {
    const forward = buildSearchFreshnessReport(run);
    const reversed = buildSearchFreshnessReport([...run].reverse());

    expect(forward.outcomes).toEqual(reversed.outcomes);
    expect(forward.servable).toBe(reversed.servable);
    expect(forward.healthy).toBe(reversed.healthy);
  });

  it("servable and unservable always sum to examined", () => {
    const report = buildSearchFreshnessReport(run);

    expect(report.servable + report.unservable).toBe(report.examined);
  });

  /**
   * S/V/W: no document body, identifier, title, snippet, owner or query may
   * appear. A report naming records would leak the record existence
   * SEARCH-003 protects.
   */
  it("S: carries no record identity or content", () => {
    const serialized = JSON.stringify(buildSearchFreshnessReport(run));

    expect(serialized).not.toContain("curriculum:course");
    expect(serialized).not.toContain("documentId");
    for (const forbidden of SEARCH_FRESHNESS_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("S: carries exactly the approved aggregate fields", () => {
    expect(Object.keys(buildSearchFreshnessReport(run)).sort()).toEqual([
      "examined",
      "exhaustedRetries",
      "healthy",
      "modelVersion",
      "outcomes",
      "servable",
      "unservable"
    ]);
  });

  it("W: reports no hidden or corpus total", () => {
    const report = buildSearchFreshnessReport(run);

    expect(report).not.toHaveProperty("total");
    expect(report).not.toHaveProperty("hiddenCount");
    expect(report).not.toHaveProperty("corpusTotal");
    expect(report.examined).toBe(run.length);
  });

  it("forbids record-bearing fields as data", () => {
    for (const forbidden of ["documents", "documentIds", "titles", "query", "score"]) {
      expect(SEARCH_FRESHNESS_FORBIDDEN_FIELDS).toContain(forbidden);
    }
  });
});

describe("health means nothing needs attention", () => {
  it("a fully resolved run is healthy", () => {
    expect(
      buildSearchFreshnessReport([resolution("resolved")]).healthy
    ).toBe(true);
  });

  it("O: an exhausted retry is never healthy", () => {
    expect(
      buildSearchFreshnessReport([resolution("resolved")], 1).healthy
    ).toBe(false);
    expect(
      buildSearchFreshnessReport([resolution("resolved")], 1).exhaustedRetries
    ).toBe(1);
  });

  it("stale or unreachable content is never healthy", () => {
    expect(buildSearchFreshnessReport([resolution("stale")]).healthy).toBe(false);
    expect(buildSearchFreshnessReport([resolution("unavailable")]).healthy).toBe(
      false
    );
  });

  /**
   * H: retirement is a correct answer, not a pipeline fault. The run stays
   * healthy while still reporting that the content stopped being servable.
   */
  it("H: retired and missing content is reported without being unhealthy", () => {
    const report = buildSearchFreshnessReport([
      resolution("unpublished"),
      resolution("missing")
    ]);

    expect(report.healthy).toBe(true);
    expect(report.servable).toBe(0);
    expect(report.outcomes.unpublished).toBe(1);
    expect(report.outcomes.missing).toBe(1);
  });

  it("an empty run is reported honestly", () => {
    const report = buildSearchFreshnessReport([]);

    expect(report.examined).toBe(0);
    expect(report.servable).toBe(0);
    expect(describeSearchFreshnessStatus(report)).toContain("No search content");
  });
});

describe("operational status is accessible text", () => {
  it("describes a healthy run in words", () => {
    const status = describeSearchFreshnessStatus(
      buildSearchFreshnessReport([resolution("resolved")])
    );

    expect(status).toContain("current");
    expect(status).toContain("1 of 1");
  });

  it("names what needs attention", () => {
    const status = describeSearchFreshnessStatus(
      buildSearchFreshnessReport([resolution("stale"), resolution("unavailable")], 1)
    );

    expect(status).toContain("needs attention");
    expect(status).toContain("changed after being projected");
    expect(status).toContain("could not be reached");
    expect(status).toContain("still unreachable after retrying");
  });

  it("labels every outcome, so no raw code is ever rendered", () => {
    const labels = describeAllFreshnessOutcomes();

    expect(labels).toHaveLength(SEARCH_SOURCE_OUTCOMES.length);
    for (const outcome of SEARCH_SOURCE_OUTCOMES) {
      expect(describeFreshnessOutcomeLabel(outcome).length).toBeGreaterThan(0);
    }
  });

  it("exposes no record, credential or policy detail in any status text", () => {
    const wording = [
      describeSearchFreshnessStatus(buildSearchFreshnessReport([resolution("stale")])),
      ...describeAllFreshnessOutcomes()
    ]
      .join(" ")
      .toLowerCase();

    for (const leak of [
      "user_id",
      "auth.uid",
      "policy",
      "token",
      "supabase",
      "select ",
      "note"
    ]) {
      expect(wording).not.toContain(leak);
    }
  });
});

describe("this module introduces no later Search feature", () => {
  it("Y: exports nothing that ranks or scores", async () => {
    const module = await import("./search-freshness");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/(rank|score|relevance|weight|boost)/i);
    }
  });

  it("X: exports nothing that persists, caches or schedules", async () => {
    const module = await import("./search-freshness");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(
        /(cache|persist|store|materiali|worker|queue|cron|schedule|tsvector|trgm)/i
      );
    }
  });

  it("Q: names no note or private source", async () => {
    const module = await import("./search-freshness");
    const exported = Object.keys(module).join(" ").toLowerCase();

    for (const source of ["note", "private", "student"]) {
      expect(exported).not.toContain(source);
    }
  });

  it("is pure — the same input always yields the same report", () => {
    const once = buildSearchFreshnessReport([resolution("stale")]);
    const twice = buildSearchFreshnessReport([resolution("stale")]);

    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});
