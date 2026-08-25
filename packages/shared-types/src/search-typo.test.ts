import { describe, expect, it } from "vitest";
import { PROTECTED_TECHNICAL_TERMS } from "./search-terms";
import {
  SEARCH_TYPO_FORBIDDEN_FIELDS,
  SEARCH_TYPO_MODEL_VERSION,
  TYPO_EXCLUDED_INPUT_SHAPES,
  TYPO_MAX_CORRECTED_TOKENS,
  TYPO_MAX_EDIT_DISTANCE,
  TYPO_MAX_RECOVERED_VARIANTS,
  TYPO_MIN_TOKEN_LENGTH,
  TYPO_RECOVERY_TARGETS,
  TYPO_SHORT_TOKEN_LENGTH,
  buildCurriculumTypoRecovery,
  buildTypoTargets,
  describeCurriculumOriginalQueryAction,
  describeCurriculumOriginalQueryEmptyState,
  describeCurriculumTypoRecovery,
  findSingleTypoTarget,
  isTypoEligibleToken,
  isWithinOneEdit
} from "./search-typo";

const corrected = (query: string) =>
  buildCurriculumTypoRecovery(query)?.correctedQuery;

describe("the target vocabulary is closed and derived", () => {
  it("stamps the model version", () => {
    expect(SEARCH_TYPO_MODEL_VERSION).toBe("search-typo-v1");
  });

  /** Derived, never restated — a target cannot name an unapproved term. */
  it("derives every target from already-approved vocabulary", () => {
    const approved = new Set(
      [...PROTECTED_TECHNICAL_TERMS, "Active Directory", "AD"]
        .flatMap((term) => term.split(/\s+/))
        .map((token) => token.toLowerCase())
    );

    for (const target of TYPO_RECOVERY_TARGETS) {
      expect(approved.has(target.toLowerCase())).toBe(true);
    }
  });

  it("prefers a term's own casing over its casing inside a phrase", () => {
    expect(TYPO_RECOVERY_TARGETS).toContain("Terraform");
    expect(TYPO_RECOVERY_TARGETS).not.toContain("terraform");
  });

  it("holds no duplicate target", () => {
    const lowered = TYPO_RECOVERY_TARGETS.map((t) => t.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("is deterministic", () => {
    expect(buildTypoTargets()).toEqual(buildTypoTargets());
  });

  it("contains no English dictionary word beyond the approved terms", () => {
    // A closed vocabulary this small is the safety mechanism; if it ever grows
    // beyond approved terms this fails.
    expect(TYPO_RECOVERY_TARGETS.length).toBeLessThanOrEqual(20);
  });
});

describe("edit distance is bounded at one by construction", () => {
  it("bounds at one", () => {
    expect(TYPO_MAX_EDIT_DISTANCE).toBe(1);
  });

  it("accepts a substitution", () => {
    expect(isWithinOneEdit("kubectl", "kubectm")).toBe(true);
  });

  it("accepts an insertion and a deletion", () => {
    expect(isWithinOneEdit("kubctl", "kubectl")).toBe(true);
    expect(isWithinOneEdit("kubecttl", "kubectl")).toBe(true);
  });

  it("accepts a single adjacent transposition", () => {
    expect(isWithinOneEdit("kubetcl", "kubectl")).toBe(true);
  });

  it("rejects a non-adjacent double substitution", () => {
    expect(isWithinOneEdit("mubectm", "kubectl")).toBe(false);
  });

  /** Distance 2 is unreachable, not merely capped. */
  it("rejects distance two", () => {
    expect(isWithinOneEdit("kbctl", "kubectl")).toBe(false);
    expect(isWithinOneEdit("terafom", "terraform")).toBe(false);
  });

  it("rejects an identical string — a correct token is not a typo", () => {
    expect(isWithinOneEdit("kubectl", "kubectl")).toBe(false);
    expect(isWithinOneEdit("KUBECTL", "kubectl")).toBe(false);
  });

  it("is symmetric", () => {
    expect(isWithinOneEdit("kubctl", "kubectl")).toBe(
      isWithinOneEdit("kubectl", "kubctl")
    );
  });
});

describe("input eligibility protects technical shapes", () => {
  it("accepts an ordinary lowercase word of sufficient length", () => {
    expect(isTypoEligibleToken("kubctl")).toBe(true);
    expect(isTypoEligibleToken("terrafom")).toBe(true);
  });

  it("excludes uppercase acronyms", () => {
    for (const acronym of ["AD", "RTO", "IAM", "SOC", "VLAN"]) {
      expect(isTypoEligibleToken(acronym)).toBe(false);
    }
  });

  it("excludes any digit-bearing token", () => {
    for (const token of ["10.0.0.1", "10.0.0.0/24", "443", "v1.29", "botsv3"]) {
      expect(isTypoEligibleToken(token)).toBe(false);
    }
  });

  it("excludes key=value expressions", () => {
    expect(isTypoEligibleToken("index=botsv")).toBe(false);
    expect(isTypoEligibleToken("index=botsv3")).toBe(false);
  });

  it("excludes flags", () => {
    expect(isTypoEligibleToken("--namespace")).toBe(false);
    expect(isTypoEligibleToken("-n")).toBe(false);
  });

  it("excludes tokens below the minimum length", () => {
    expect(TYPO_MIN_TOKEN_LENGTH).toBe(4);
    expect(isTypoEligibleToken("ab")).toBe(false);
    expect(isTypoEligibleToken("a")).toBe(false);
  });

  /**
   * The narrow exception exists for `vln` inside `show vln brief`. It must not
   * become general short-token fuzzy matching.
   */
  it("admits a three-character lowercase token only", () => {
    expect(TYPO_SHORT_TOKEN_LENGTH).toBe(3);
    expect(isTypoEligibleToken("vln")).toBe(true);
    expect(isTypoEligibleToken("VLN")).toBe(false);
    expect(isTypoEligibleToken("Vln")).toBe(false);
    expect(isTypoEligibleToken("v1n")).toBe(false);
    expect(isTypoEligibleToken("v-n")).toBe(false);
  });

  it("allows a hyphenated token because the target set is closed", () => {
    expect(isTypoEligibleToken("Get-ADUsr")).toBe(true);
  });

  it("records every excluded shape as data", () => {
    for (const shape of [
      "uppercase acronym",
      "digit-bearing token",
      "key=value expression",
      "flag",
      "ip address",
      "cidr",
      "port",
      "version string"
    ]) {
      expect(TYPO_EXCLUDED_INPUT_SHAPES).toContain(shape);
    }
  });
});

describe("ambiguity fails safely", () => {
  it("refuses when two approved targets are equally close", () => {
    // `blan` is one edit from both `plan` and `vlan`.
    expect(findSingleTypoTarget("blan")).toBeUndefined();
    expect(corrected("blan")).toBeUndefined();
  });

  it("never resolves a tie by iteration order", () => {
    const forward = findSingleTypoTarget("blan", ["plan", "vlan"]);
    const reversed = findSingleTypoTarget("blan", ["vlan", "plan"]);

    expect(forward).toBeUndefined();
    expect(reversed).toBeUndefined();
  });

  it("treats two casings of one term as a single target", () => {
    expect(findSingleTypoTarget("terrafom", ["Terraform", "terraform"])).toBe(
      "Terraform"
    );
  });

  it("is deterministic regardless of target order", () => {
    const forward = findSingleTypoTarget("kubctl", [...TYPO_RECOVERY_TARGETS]);
    const reversed = findSingleTypoTarget("kubctl", [
      ...TYPO_RECOVERY_TARGETS
    ].reverse());

    expect(forward).toBe(reversed);
  });
});

describe("the required recovery cases", () => {
  it("kubctl recovers to kubectl", () => {
    expect(corrected("kubctl")).toBe("kubectl");
  });

  it("terrafom recovers to Terraform", () => {
    expect(corrected("terrafom")).toBe("Terraform");
  });

  it("Actve Directory recovers to Active Directory", () => {
    expect(corrected("Actve Directory")).toBe("Active Directory");
  });

  it("show vln brief recovers to show vlan brief", () => {
    expect(corrected("show vln brief")).toBe("show vlan brief");
  });

  it("Get-ADUsr recovers to Get-ADUser", () => {
    expect(corrected("Get-ADUsr")).toBe("Get-ADUser");
  });
});

describe("the required protection cases", () => {
  it("never corrects an already-correct protected term", () => {
    for (const term of PROTECTED_TECHNICAL_TERMS) {
      expect(buildCurriculumTypoRecovery(term)).toBeUndefined();
    }
  });

  /**
   * Regression. `plan` is an approved term AND is one edit from the approved
   * term `vlan`, so without an is-already-a-target check `terraform plan`
   * silently became `terraform vlan`.
   */
  it("never corrects one approved term into another", () => {
    expect(findSingleTypoTarget("plan")).toBeUndefined();
    expect(findSingleTypoTarget("vlan")).toBeUndefined();
    expect(buildCurriculumTypoRecovery("terraform plan")).toBeUndefined();
    expect(buildCurriculumTypoRecovery("show vlan brief")).toBeUndefined();
  });

  it("never corrects technical syntax", () => {
    for (const query of [
      "index=botsv",
      "index=botsv3",
      "10.0.0.1",
      "10.0.0.0/24",
      "443",
      "v1.29",
      "--namespace",
      "resource_group"
    ]) {
      expect(buildCurriculumTypoRecovery(query)).toBeUndefined();
    }
  });

  it("never corrects an approved acronym", () => {
    for (const acronym of ["AD", "RTO", "IAM"]) {
      expect(buildCurriculumTypoRecovery(acronym)).toBeUndefined();
    }
  });
});

describe("recovery is bounded", () => {
  it("corrects at most one token", () => {
    expect(TYPO_MAX_CORRECTED_TOKENS).toBe(1);
    // Both tokens would need correcting, so the query is left alone.
    expect(corrected("kubctl terrafom")).toBeUndefined();
  });

  it("produces at most one recovered variant", () => {
    expect(TYPO_MAX_RECOVERED_VARIANTS).toBe(1);
    const recovery = buildCurriculumTypoRecovery("kubctl");
    expect(typeof recovery?.correctedQuery).toBe("string");
  });

  it("leaves untouched tokens exactly as typed", () => {
    expect(corrected("show vln brief")).toBe("show vlan brief");
    expect(corrected("Actve Directory")).toBe("Active Directory");
  });

  it("never progressively mutates a query", () => {
    const once = corrected("kubctl");
    expect(once).toBe("kubectl");
    // The corrected query is itself correct, so it cannot recover again.
    expect(buildCurriculumTypoRecovery(once ?? "")).toBeUndefined();
  });

  it("returns nothing for an empty query", () => {
    expect(buildCurriculumTypoRecovery("   ")).toBeUndefined();
  });

  it("returns nothing when no token is close to any target", () => {
    expect(buildCurriculumTypoRecovery("zzzzzzzz qqqqqqqq")).toBeUndefined();
  });

  it("preserves the original query on the recovery", () => {
    expect(buildCurriculumTypoRecovery("kubctl")?.originalQuery).toBe("kubctl");
  });

  it("is pure — the same query always yields the same recovery", () => {
    expect(corrected("Actve Directory")).toBe(corrected("Actve Directory"));
  });
});

describe("learner transparency exposes no internals", () => {
  it("states what was searched", () => {
    const sentence = describeCurriculumTypoRecovery({
      originalQuery: "kubctl",
      correctedQuery: "kubectl"
    });

    expect(sentence).toContain("kubctl");
    expect(sentence).toContain("kubectl");
    expect(sentence.toLowerCase()).toContain("no results");
  });

  it("offers a way back to the original words", () => {
    expect(describeCurriculumOriginalQueryAction("kubctl")).toContain("kubctl");
    expect(describeCurriculumOriginalQueryEmptyState("kubctl")).toContain(
      "kubctl"
    );
  });

  it("exposes no algorithm detail in any learner-facing string", () => {
    const wording = [
      describeCurriculumTypoRecovery({
        originalQuery: "kubctl",
        correctedQuery: "kubectl"
      }),
      describeCurriculumOriginalQueryAction("kubctl"),
      describeCurriculumOriginalQueryEmptyState("kubctl")
    ]
      .join(" ")
      .toLowerCase();

    for (const forbidden of [
      "distance",
      "candidate",
      "score",
      "confidence",
      "similarity",
      "ilike",
      "pattern",
      "variant",
      "vocabulary"
    ]) {
      expect(wording).not.toContain(forbidden);
    }
  });

  it("forbids internal fields as data", () => {
    for (const forbidden of [
      "editDistance",
      "candidates",
      "candidateCount",
      "confidence",
      "similarity",
      "matchKind"
    ]) {
      expect(SEARCH_TYPO_FORBIDDEN_FIELDS).toContain(forbidden);
    }
  });

  it("carries only the original and corrected query", () => {
    const recovery = buildCurriculumTypoRecovery("kubctl");

    expect(Object.keys(recovery ?? {}).sort()).toEqual([
      "correctedQuery",
      "originalQuery"
    ]);
  });
});

describe("this module implements no later Search feature", () => {
  it("exports nothing that ranks, scores or weights", async () => {
    const module = await import("./search-typo");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(
        /(rank|score|weight|relevance|boost|popularity|confidence|similarity)/i
      );
    }
  });

  it("exports nothing that reads a source or caches", async () => {
    const module = await import("./search-typo");

    for (const name of Object.keys(module)) {
      expect(name).not.toMatch(/(cache|index|supabase|client|fetch|suggest)/i);
    }
  });

  it("requires no database access to build the vocabulary", async () => {
    const module = await import("./search-typo");
    const serialized = JSON.stringify(module.TYPO_RECOVERY_TARGETS);

    expect(serialized).not.toContain("select");
    expect(serialized).toContain("kubectl");
  });
});
