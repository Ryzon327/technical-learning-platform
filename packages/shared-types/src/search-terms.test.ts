import { describe, expect, it } from "vitest";
import {
  CURATED_CURRICULUM_TERM_ALIASES,
  CURRICULUM_MATCH_KINDS,
  DEFERRED_TERM_ALIAS_CANDIDATES,
  MAX_CURRICULUM_QUERY_VARIANTS,
  MIN_ALIAS_RETRIEVAL_LENGTH,
  PROTECTED_TECHNICAL_TERMS,
  REMOVABLE_TERMINAL_PUNCTUATION,
  SEARCH_TERM_FORBIDDEN_FIELDS,
  SEARCH_TERM_MODEL_VERSION,
  buildCurriculumQueryAdjustment,
  buildCurriculumQueryVariants,
  buildTieredCurriculumSearchResults,
  classifyCurriculumMatch,
  containsTokenSequence,
  describeCurriculumQueryAdjustment,
  normalizeTerminalPunctuation,
  withCurriculumQueryAdjustment,
  type ClassifiedSearchDocument,
  type CurriculumMatchKind
} from "./search-terms";

const values = (query: string) =>
  buildCurriculumQueryVariants(query).map((variant) => variant.value);

const kinds = (query: string) =>
  buildCurriculumQueryVariants(query).map((variant) => variant.matchKind);

describe("the curated vocabulary is small and attested", () => {
  it("contains exactly one approved alias", () => {
    expect(CURATED_CURRICULUM_TERM_ALIASES).toHaveLength(1);
    expect(CURATED_CURRICULUM_TERM_ALIASES[0]).toMatchObject({
      canonical: "Active Directory",
      alias: "AD"
    });
  });

  it("cites repository authority for every entry", () => {
    for (const entry of CURATED_CURRICULUM_TERM_ALIASES) {
      expect(entry.authority).toContain("SEARCH-005");
    }
  });

  /**
   * The provenance rule. These expansions are technically correct but no
   * repository authority establishes them, so they must not be in the live
   * vocabulary.
   */
  it("defers the acronyms whose expansions authority does not establish", () => {
    const deferred = DEFERRED_TERM_ALIAS_CANDIDATES.map((entry) => entry.alias);

    expect(deferred).toEqual(["RTO", "RPO", "IAM"]);

    const live = CURATED_CURRICULUM_TERM_ALIASES.flatMap((entry) => [
      entry.canonical,
      entry.alias
    ]).join(" ");
    for (const absent of [
      "RTO",
      "RPO",
      "IAM",
      "Recovery Time Objective",
      "Recovery Point Objective",
      "Identity and Access Management"
    ]) {
      expect(live).not.toContain(absent);
    }
  });

  it("explains each deferral as provenance, not correctness", () => {
    for (const entry of DEFERRED_TERM_ALIAS_CANDIDATES) {
      expect(entry.reason).toContain("no repository authority");
    }
  });

  it("stamps the model version", () => {
    expect(SEARCH_TERM_MODEL_VERSION).toBe("search-terms-v1");
  });

  /** No alternate form of a protected term may be manufactured as an alias. */
  it("creates no alias for a protected technical term", () => {
    for (const entry of CURATED_CURRICULUM_TERM_ALIASES) {
      expect(PROTECTED_TECHNICAL_TERMS).not.toContain(entry.canonical);
      expect(PROTECTED_TECHNICAL_TERMS).not.toContain(entry.alias);
    }
  });
});

describe("terminal punctuation only, never technical punctuation", () => {
  it("strips approved sentence punctuation from the end", () => {
    expect(normalizeTerminalPunctuation("kubectl?")).toBe("kubectl");
    expect(normalizeTerminalPunctuation("kubectl!")).toBe("kubectl");
    expect(normalizeTerminalPunctuation("kubectl,")).toBe("kubectl");
    expect(normalizeTerminalPunctuation("kubectl;")).toBe("kubectl");
    expect(normalizeTerminalPunctuation("kubectl:")).toBe("kubectl");
  });

  it("strips surrounding quotes", () => {
    expect(normalizeTerminalPunctuation('"show vlan brief"')).toBe(
      "show vlan brief"
    );
    expect(normalizeTerminalPunctuation("'kubectl'")).toBe("kubectl");
  });

  /**
   * SEARCH-005 section 8. These five must survive byte-for-byte; stripping any
   * of their punctuation would destroy the technical meaning.
   */
  it("preserves every protected technical term exactly", () => {
    for (const term of PROTECTED_TECHNICAL_TERMS) {
      expect(normalizeTerminalPunctuation(term)).toBe(term);
    }
  });

  it("never touches internal technical punctuation", () => {
    for (const query of [
      "index=botsv3",
      "Get-ADUser",
      "terraform plan",
      "show vlan brief",
      "C:/Users/admin",
      "app.config.json",
      "--dry-run",
      "user_name",
      "100%"
    ]) {
      expect(normalizeTerminalPunctuation(query)).toBe(query);
    }
  });

  it("strips a trailing question mark without harming an internal equals", () => {
    expect(normalizeTerminalPunctuation("index=botsv3?")).toBe("index=botsv3");
  });

  it("removes only the approved characters", () => {
    expect(REMOVABLE_TERMINAL_PUNCTUATION).toEqual(["?", "!", ",", ";", ":"]);
    for (const technical of ["=", "-", "_", "/", "."]) {
      expect(REMOVABLE_TERMINAL_PUNCTUATION).not.toContain(technical);
    }
  });

  it("does not case-normalize", () => {
    expect(normalizeTerminalPunctuation("PowerShell")).toBe("PowerShell");
    expect(normalizeTerminalPunctuation("Get-ADUser")).toBe("Get-ADUser");
  });
});

describe("alias detection is token-based, never substring", () => {
  it("detects a standalone acronym", () => {
    expect(containsTokenSequence("AD", "AD")).toBe(true);
    expect(containsTokenSequence("what is AD", "AD")).toBe(true);
  });

  /**
   * The defect this rule exists to prevent. A substring test would read the
   * acronym inside these tokens and broaden the search wrongly.
   */
  it("never reads an acronym inside a larger token", () => {
    for (const query of [
      "ADD",
      "Get-ADUser",
      "upload",
      "read",
      "broadcast",
      "administration",
      "advanced"
    ]) {
      expect(containsTokenSequence(query, "AD")).toBe(false);
    }
  });

  it("detects a multi-word canonical term", () => {
    expect(containsTokenSequence("Active Directory", "Active Directory")).toBe(
      true
    );
    expect(
      containsTokenSequence("configure Active Directory today", "Active Directory")
    ).toBe(true);
  });

  it("requires the phrase tokens to be contiguous", () => {
    expect(
      containsTokenSequence("Active and Directory", "Active Directory")
    ).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(containsTokenSequence("ad", "AD")).toBe(true);
    expect(containsTokenSequence("ACTIVE DIRECTORY", "Active Directory")).toBe(
      true
    );
  });
});

describe("variant generation is bounded and deterministic", () => {
  it("always keeps the original as variant 1", () => {
    for (const query of ["AD", "kubectl?", "Active Directory", "nothing"]) {
      const variants = buildCurriculumQueryVariants(query);
      expect(variants[0]?.value).toBe(query);
      expect(variants[0]?.matchKind).toBe("exact");
    }
  });

  it("expands an approved acronym to its canonical term", () => {
    expect(values("AD")).toEqual(["AD", "Active Directory"]);
    expect(kinds("AD")).toEqual(["exact", "alias"]);
  });

  /**
   * The retrieval-safety rule. The relationship stays bidirectional in the
   * vocabulary, but a two-character pattern would match "administration",
   * "advanced", "upload", "read" and "broadcast" under substring ILIKE.
   */
  it("never emits an alias shorter than the retrieval minimum", () => {
    expect(MIN_ALIAS_RETRIEVAL_LENGTH).toBe(3);
    expect(values("Active Directory")).toEqual(["Active Directory"]);
    expect(values("Active Directory")).not.toContain("AD");
  });

  it("keeps the short side of the relationship in the vocabulary", () => {
    expect(CURATED_CURRICULUM_TERM_ALIASES[0]?.alias).toBe("AD");
  });

  it("adds a normalized variant when punctuation differs", () => {
    expect(values("kubectl?")).toEqual(["kubectl?", "kubectl"]);
    expect(kinds("kubectl?")).toEqual(["exact", "normalized"]);
  });

  it("adds no normalized variant when nothing changed", () => {
    expect(values("kubectl")).toEqual(["kubectl"]);
  });

  it("collapses duplicates", () => {
    const variants = buildCurriculumQueryVariants("AD");
    const seen = new Set(variants.map((v) => v.value.toLowerCase()));
    expect(seen.size).toBe(variants.length);
  });

  it("never exceeds the cap", () => {
    expect(MAX_CURRICULUM_QUERY_VARIANTS).toBe(4);
    for (const query of [
      "AD",
      "AD?",
      "Active Directory AD",
      "AD AD AD AD AD",
      "show vlan brief"
    ]) {
      expect(
        buildCurriculumQueryVariants(query).length
      ).toBeLessThanOrEqual(MAX_CURRICULUM_QUERY_VARIANTS);
    }
  });

  /** The cap is a maximum, not a target — no filler variants are invented. */
  it("produces no filler variants", () => {
    expect(values("kubectl")).toHaveLength(1);
    expect(values("Proxmox")).toHaveLength(1);
  });

  it("does not compound variants combinatorially", () => {
    // Each alias derives from the ORIGINAL query, never from another variant,
    // so an alias can never be applied on top of a normalized alias.
    expect(values("AD?")).toEqual(["AD?", "AD", "Active Directory"]);
  });

  it("is unaffected by token order elsewhere in the query", () => {
    const forward = values("AD basics");
    const reversed = values("basics AD");

    expect(forward).toContain("Active Directory");
    expect(reversed).toContain("Active Directory");
    expect(forward.length).toBe(reversed.length);
  });

  it("returns nothing for an empty query", () => {
    expect(buildCurriculumQueryVariants("   ")).toEqual([]);
  });

  it("generates no variant for an unknown term", () => {
    expect(values("Proxmox")).toEqual(["Proxmox"]);
    expect(values("RTO")).toEqual(["RTO"]);
    expect(values("IAM")).toEqual(["IAM"]);
  });

  it("preserves every protected technical term as its own variant", () => {
    for (const term of PROTECTED_TECHNICAL_TERMS) {
      expect(values(term)[0]).toBe(term);
    }
  });

  it("is pure — the same query always yields the same variants", () => {
    expect(JSON.stringify(values("AD?"))).toBe(JSON.stringify(values("AD?")));
  });
});

describe("match classification", () => {
  const variants = buildCurriculumQueryVariants("AD");

  it("prefers the highest-priority match", () => {
    expect(classifyCurriculumMatch("AD fundamentals", variants)).toBe("exact");
  });

  it("classifies an alias-only match as alias", () => {
    expect(
      classifyCurriculumMatch("Configuring Active Directory", variants)
    ).toBe("alias");
  });

  it("classifies a normalized-only match as normalized", () => {
    const punctuated = buildCurriculumQueryVariants("kubectl?");
    expect(classifyCurriculumMatch("Using kubectl daily", punctuated)).toBe(
      "normalized"
    );
  });

  /** Failing to classify must never promote a result to the top tier. */
  it("falls to the last tier when nothing matches", () => {
    expect(classifyCurriculumMatch("unrelated text", variants)).toBe("alias");
  });

  it("names exactly the three approved match kinds", () => {
    expect(CURRICULUM_MATCH_KINDS).toEqual(["exact", "normalized", "alias"]);
  });

  it("reserves typo for SEARCH-005B", () => {
    expect(CURRICULUM_MATCH_KINDS).not.toContain("typo");
    const future = "typo" as unknown as CurriculumMatchKind;
    expect(CURRICULUM_MATCH_KINDS.indexOf(future)).toBe(-1);
  });
});

describe("match-class tiering, not relevance ranking", () => {
  const doc = (
    stableId: string,
    contentType: string,
    matchKind: CurriculumMatchKind
  ): ClassifiedSearchDocument => ({
    document: {
      modelVersion: "search-document-v1",
      documentId: `curriculum:${contentType}:${stableId}@1`,
      sourceEngine: "curriculum",
      sourceRecordStableId: stableId,
      sourceVersion: 1,
      contentType,
      title: stableId,
      searchableText: stableId,
      keywords: [],
      sourceReference: `/x/${stableId}`,
      publicationState: "published",
      accessScope: "shared",
      sourceUpdatedAt: "2026-08-01T10:00:00.000Z",
      indexedAt: "2026-08-23T09:00:00.000Z"
    } as never,
    matchKind
  });

  it("places exact before normalized before alias", () => {
    const result = buildTieredCurriculumSearchResults(
      [
        doc("c-alias", "course", "alias"),
        doc("c-exact", "course", "exact"),
        doc("c-normalized", "course", "normalized")
      ],
      10
    );

    expect(result.results.map((d) => d.sourceRecordStableId)).toEqual([
      "c-exact",
      "c-normalized",
      "c-alias"
    ]);
  });

  /**
   * The SEARCH-008 boundary. With everything in one tier the output must be
   * byte-identical to SEARCH-002's neutral order — content type, then stable id.
   */
  it("is byte-identical to neutral order when every result shares a tier", () => {
    const result = buildTieredCurriculumSearchResults(
      [
        doc("m-b", "mission", "exact"),
        doc("c-b", "course", "exact"),
        doc("c-a", "course", "exact"),
        doc("lp-a", "learning_path", "exact")
      ],
      10
    );

    expect(result.results.map((d) => d.sourceRecordStableId)).toEqual([
      "lp-a",
      "c-a",
      "c-b",
      "m-b"
    ]);
  });

  it("preserves neutral order inside each tier", () => {
    const result = buildTieredCurriculumSearchResults(
      [
        doc("c-b", "course", "alias"),
        doc("c-a", "course", "alias"),
        doc("lp-z", "learning_path", "exact"),
        doc("m-a", "mission", "exact")
      ],
      10
    );

    expect(result.results.map((d) => d.sourceRecordStableId)).toEqual([
      "lp-z",
      "m-a",
      "c-a",
      "c-b"
    ]);
  });

  /** Tiering runs before the bound, so an exact match cannot be truncated. */
  it("bounds after tiering, never before", () => {
    const result = buildTieredCurriculumSearchResults(
      [
        doc("c-a", "course", "alias"),
        doc("c-b", "course", "alias"),
        doc("m-z", "mission", "exact")
      ],
      1
    );

    expect(result.results.map((d) => d.sourceRecordStableId)).toEqual(["m-z"]);
    expect(result.count).toBe(1);
  });

  it("counts only the returned results", () => {
    const result = buildTieredCurriculumSearchResults(
      [doc("c-a", "course", "exact"), doc("c-b", "course", "exact")],
      1
    );

    expect(result.count).toBe(result.results.length);
    expect(result.count).toBe(1);
  });

  it("carries exactly results and count", () => {
    const result = buildTieredCurriculumSearchResults(
      [doc("c-a", "course", "exact")],
      10
    );

    expect(Object.keys(result).sort()).toEqual(["count", "results"]);
  });

  it("attaches no match kind to any returned document", () => {
    const result = buildTieredCurriculumSearchResults(
      [doc("c-a", "course", "alias")],
      10
    );

    expect(result.results[0]).not.toHaveProperty("matchKind");
    expect(JSON.stringify(result.results)).not.toContain("matchKind");
  });
});

describe("query-adjustment transparency", () => {
  it("reports an alias adjustment", () => {
    const adjustment = buildCurriculumQueryAdjustment(
      "AD",
      buildCurriculumQueryVariants("AD")
    );

    expect(adjustment).toEqual({
      originalQuery: "AD",
      effectiveQuery: "Active Directory",
      adjustmentKind: "alias"
    });
  });

  it("reports a normalized adjustment", () => {
    const adjustment = buildCurriculumQueryAdjustment(
      "kubectl?",
      buildCurriculumQueryVariants("kubectl?")
    );

    expect(adjustment).toMatchObject({
      effectiveQuery: "kubectl",
      adjustmentKind: "normalized"
    });
  });

  it("prefers the alias when both apply", () => {
    const adjustment = buildCurriculumQueryAdjustment(
      "AD?",
      buildCurriculumQueryVariants("AD?")
    );

    expect(adjustment?.adjustmentKind).toBe("alias");
    expect(adjustment?.effectiveQuery).toBe("Active Directory");
  });

  it("reports nothing when nothing meaningful changed", () => {
    expect(
      buildCurriculumQueryAdjustment(
        "kubectl",
        buildCurriculumQueryVariants("kubectl")
      )
    ).toBeUndefined();
  });

  it("omits the key entirely when there is no adjustment", () => {
    const attached = withCurriculumQueryAdjustment(
      { results: [], count: 0 },
      undefined
    );

    expect(attached).not.toHaveProperty("queryAdjustment");
    expect(Object.keys(attached).sort()).toEqual(["count", "results"]);
  });

  /** The leak test: no internal machinery may appear in what a learner gets. */
  it("exposes no internal detail", () => {
    const adjustment = buildCurriculumQueryAdjustment(
      "AD",
      buildCurriculumQueryVariants("AD")
    );
    const serialized = JSON.stringify(adjustment);

    expect(Object.keys(adjustment ?? {}).sort()).toEqual([
      "adjustmentKind",
      "effectiveQuery",
      "originalQuery"
    ]);
    for (const forbidden of SEARCH_TERM_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(serialized).not.toContain("ilike");
    expect(serialized).not.toContain("%");
  });

  it("never reports the exact kind as an adjustment", () => {
    const adjustment = buildCurriculumQueryAdjustment(
      "AD",
      buildCurriculumQueryVariants("AD")
    );

    expect(adjustment?.adjustmentKind).not.toBe("exact");
  });

  it("names both terms in the learner-facing sentence", () => {
    const sentence = describeCurriculumQueryAdjustment({
      originalQuery: "AD",
      effectiveQuery: "Active Directory",
      adjustmentKind: "alias"
    });

    expect(sentence).toContain("AD");
    expect(sentence).toContain("Active Directory");
    for (const forbidden of ["ilike", "pattern", "variant", "distance", "score"]) {
      expect(sentence.toLowerCase()).not.toContain(forbidden);
    }
  });

  /**
   * SEARCH-005 section 10 asks that the learner can return to their original
   * query. There is no API mode to suppress adjustment and none is needed: the
   * original query is permanently variant 1, exact matches tier above adjusted
   * ones, and the learner's own words are what the sentence names first.
   */
  it("names the learner's own words first", () => {
    const sentence = describeCurriculumQueryAdjustment({
      originalQuery: "AD",
      effectiveQuery: "Active Directory",
      adjustmentKind: "alias"
    });

    expect(sentence.indexOf("AD")).toBeLessThan(
      sentence.indexOf("Active Directory")
    );
  });

  it("forbids internal fields as data", () => {
    for (const forbidden of [
      "editDistance",
      "variants",
      "patterns",
      "candidateCount",
      "matchKind"
    ]) {
      expect(SEARCH_TERM_FORBIDDEN_FIELDS).toContain(forbidden);
    }
  });
});

describe("this module implements no later Search feature", () => {
  it("exports nothing that ranks, scores or weights", async () => {
    const module = await import("./search-terms");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/(rank|score|weight|relevance|boost|popularity)/i);
    }
  });

  it("exports nothing that recovers typos", async () => {
    const module = await import("./search-terms");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(
        /(typo|fuzzy|levenshtein|damerau|soundex|stem|trgm|spelling)/i
      );
    }
  });

  it("exports nothing that caches, indexes or reads a source", async () => {
    const module = await import("./search-terms");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(
        /(cache|index|materiali|supabase|client|fetch|query Source)/i
      );
    }
  });

  it("requires no database access to build the vocabulary", async () => {
    const module = await import("./search-terms");
    const serialized = JSON.stringify(module.CURATED_CURRICULUM_TERM_ALIASES);

    expect(serialized).not.toContain("select");
    expect(serialized).not.toContain("from");
    expect(serialized).toContain("Active Directory");
  });
});
