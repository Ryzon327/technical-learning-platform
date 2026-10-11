import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_CURRICULUM_QUERY_VARIANTS } from "@tlp/shared-types";
import {
  MAX_SEARCH_ALIAS_GROUP_MEMBERS,
  acronymTermOf,
  approvedSearchAliasGroups,
  buildAliasAwareQueryVariants,
  buildRetrievalConditions,
  findFirstMatch,
  findSearchAliasGroup,
  findVariantMatch,
  isAcronymTerm,
  loadSearchAliasDataSet,
  toRetrievalPattern,
  validateSearchAliasDataSet,
  wordPatternFor
} from "./search-aliases";

/**
 * WP-005 — the alias data set and the matching rules, as pure units.
 *
 * Every test here runs against the CHECKED-IN data file, so adding a group to
 * the file is automatically covered by the data-driven cases below.
 */

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const groups = approvedSearchAliasGroups();
const keyOf = (value: string) => value.toLowerCase();

/** WP-005 Appendix A, verbatim, one group per line. */
const APPENDIX_A = [
  ["ARP", "Address Resolution Protocol"],
  ["IP", "Internet Protocol"],
  ["MAC", "Media Access Control"],
  ["DNS", "Domain Name System"],
  ["DHCP", "Dynamic Host Configuration Protocol"],
  ["TCP", "Transmission Control Protocol"],
  ["UDP", "User Datagram Protocol"],
  ["ICMP", "Internet Control Message Protocol"],
  ["NAT", "Network Address Translation"],
  ["CIDR", "Classless Inter-Domain Routing"],
  ["VLAN", "Virtual LAN", "Virtual Local Area Network"],
  ["LAN", "Local Area Network"],
  ["WAN", "Wide Area Network"],
  ["default gateway", "gateway"]
];

describe("WP-005 alias data set", () => {
  it("the checked-in file validates and loads server-side", () => {
    const dataSet = loadSearchAliasDataSet();

    expect(dataSet.dataSet).toBe("tlp-search-acronym-aliases");
    expect(dataSet.version).toBeGreaterThanOrEqual(1);
    expect(validateSearchAliasDataSet(dataSet).valid).toBe(true);
  });

  it("seeds every Appendix A group, member for member", () => {
    for (const expected of APPENDIX_A) {
      expect(groups.map((group) => [...group.members])).toContainEqual(expected);
    }
  });

  it("preserves the existing AD / Active Directory alias", () => {
    expect(groups.map((group) => [...group.members])).toContainEqual([
      "AD",
      "Active Directory"
    ]);
  });

  it("every group records where it came from", () => {
    for (const group of groups) {
      expect(group.source.trim()).not.toBe("");
    }
  });

  /**
   * "Include every acronym used in published course content." Every
   * acronym-shaped token in the Networking Foundations course document is
   * either a data-set member or one of the reviewed non-acronyms below, so a
   * new acronym in content fails here until the data set covers it.
   */
  it("covers every acronym in the Networking Foundations content", () => {
    const content = read("../../../content/curriculum/networking-foundations.json");
    const NOT_ACRONYMS = new Set([
      // Emphasis in learner prose, not acronyms.
      "NOT",
      "AND",
      "CAN",
      "TO",
      "GROUP",
      // The ping command written in capitals for emphasis.
      "PING"
    ]);
    const tokens = new Set(
      [...content.matchAll(/\b[A-Z][A-Z0-9]{1,6}\b|\b[A-Z]{2,}v\d\b/g)].map(
        (match) => match[0]
      )
    );

    const members = new Set(groups.flatMap((group) => group.members));
    for (const token of tokens) {
      if (NOT_ACRONYMS.has(token)) continue;
      expect(members, `uncovered acronym: ${token}`).toContain(token);
    }
  });

  it("covers the acronyms Router-on-a-Stick teaches", () => {
    const content = read("../../../packages/shared-types/src/roas-curriculum.ts");
    const members = new Set(groups.flatMap((group) => group.members));

    for (const acronym of ["VLAN", "PC", "IPv4", "IEEE", "ID"]) {
      expect(content).toMatch(new RegExp(`\\b${acronym}s?\\b`));
      expect(members).toContain(acronym);
    }
  });

  it("no group exceeds the size that fits SEARCH-005A's variant cap", () => {
    for (const group of groups) {
      expect(group.members.length).toBeLessThanOrEqual(MAX_SEARCH_ALIAS_GROUP_MEMBERS);
    }
    expect(MAX_SEARCH_ALIAS_GROUP_MEMBERS).toBe(MAX_CURRICULUM_QUERY_VARIANTS - 1);
  });
});

describe("WP-005 alias data validation refuses an unsafe file", () => {
  const valid = {
    dataSet: "fixture",
    version: 1,
    groups: [{ members: ["ARP", "Address Resolution Protocol"], source: "fixture" }]
  };

  it("accepts a well-formed fixture", () => {
    expect(validateSearchAliasDataSet(valid).valid).toBe(true);
  });

  it.each([
    ["a member repeated across groups", {
      ...valid,
      groups: [...valid.groups, { members: ["arp", "Another"], source: "x" }]
    }],
    ["a group of four", {
      ...valid,
      groups: [{ members: ["A1", "B2", "C3", "D4"], source: "x" }]
    }],
    ["a group of one", { ...valid, groups: [{ members: ["ARP"], source: "x" }] }],
    ["regular-expression syntax", {
      ...valid,
      groups: [{ members: ["A.RP", "Address"], source: "x" }]
    }],
    ["a PostgREST reserved character", {
      ...valid,
      groups: [{ members: ["ARP(x)", "Address"], source: "x" }]
    }],
    ["a missing source", {
      ...valid,
      groups: [{ members: ["ARP", "Address Resolution Protocol"], source: "" }]
    }],
    ["no groups", { ...valid, groups: [] }]
  ])("refuses %s", (_label, fixture) => {
    expect(validateSearchAliasDataSet(fixture).valid).toBe(false);
  });
});

describe("WP-005 matching rules", () => {
  it("an acronym is a data member with no space and two capitals", () => {
    expect(isAcronymTerm("ARP")).toBe(true);
    expect(isAcronymTerm("IPv4")).toBe(true);
    expect(isAcronymTerm("AD")).toBe(true);
    expect(isAcronymTerm("gateway")).toBe(false);
    expect(isAcronymTerm("Virtual LAN")).toBe(false);
  });

  it("acronyms match whole words only, case-insensitively", () => {
    const arp = { value: "ARP", matchKind: "exact" as const };

    expect(findVariantMatch("Keep your skills sharp.", arp)).toBeUndefined();
    expect(findVariantMatch("The request is called ARP.", arp)).toBeDefined();
    expect(findVariantMatch("the request is called arp.", arp)).toBeDefined();
    expect(findVariantMatch("Two ARPs were sent.", arp)).toBeDefined();
    expect(findVariantMatch("ARP's reply arrived.", arp)).toBeDefined();
    expect(
      findVariantMatch("Keep your skills sharp.", { value: "arp", matchKind: "exact" })
    ).toBeUndefined();
  });

  it("the short acronym AD never matches inside another word", () => {
    const ad = { value: "AD", matchKind: "exact" as const };

    for (const text of ["advanced addressing", "Get-ADUser", "upload", "broadcast"]) {
      expect(findVariantMatch(text, ad)).toBeUndefined();
    }
    expect(findVariantMatch("AD replication", ad)).toBeDefined();
  });

  it("expanded forms match as phrases, tolerating a plural or possessive", () => {
    const phrase = { value: "Address Resolution Protocol", matchKind: "alias" as const };

    expect(findVariantMatch("the address resolution protocol", phrase)).toBeDefined();
    expect(findVariantMatch("Address Resolution Protocols", phrase)).toBeDefined();
    expect(findVariantMatch("Address Resolution Protocol's role", phrase)).toBeDefined();
    expect(findVariantMatch("address and resolution", phrase)).toBeUndefined();
  });

  it("the first match wins, and its position is exact", () => {
    const text = "Before ARP comes the Address Resolution Protocol.";
    const match = findFirstMatch(text, [
      { value: "Address Resolution Protocol", matchKind: "alias" },
      { value: "ARP", matchKind: "exact" }
    ]);

    expect(match).toEqual({ start: 7, length: 3 });
  });

  it("a word pattern is built only from a letters-and-digits data member", () => {
    expect(wordPatternFor("ARP")).toBe("\\yARPs?\\y");
    expect(() => wordPatternFor("A.RP")).toThrow();
    expect(() => wordPatternFor("ARP|.*")).toThrow();
  });

  it("the learner's own text never becomes a regular expression", () => {
    // "arp" names the ARP member, so the pattern uses the DATA spelling.
    expect(toRetrievalPattern({ value: "arp", matchKind: "exact" }, "arp")).toEqual({
      mode: "word",
      term: "ARP"
    });
    // Anything that is not an acronym member stays an escaped substring.
    expect(
      toRetrievalPattern({ value: "ARP.*", matchKind: "exact" }, "ARP.*")
    ).toEqual({ mode: "substring", value: "ARP.*" });
    expect(acronymTermOf("sharp")).toBeUndefined();
  });

  it("builds one condition per column per pattern", () => {
    expect(
      buildRetrievalConditions(
        ["title", "description"],
        [
          { mode: "word", term: "ARP" },
          { mode: "substring", value: "Address Resolution Protocol" }
        ]
      )
    ).toBe(
      "title.imatch.\\yARPs?\\y,description.imatch.\\yARPs?\\y," +
        "title.ilike.%Address Resolution Protocol%," +
        "description.ilike.%Address Resolution Protocol%"
    );
  });
});

describe("WP-005 equivalence", () => {
  it("resolves a query to its group despite case, punctuation, plural or possessive", () => {
    for (const query of ["ARP", "arp", "ARP?", "ARPs", "ARP's", " address resolution protocol "]) {
      expect(findSearchAliasGroup(query)?.members).toContain("ARP");
    }
    expect(findSearchAliasGroup("default gateways")?.members).toContain("gateway");
  });

  it("does not widen a word that merely resembles an acronym", () => {
    expect(findSearchAliasGroup("sharp")).toBeUndefined();
    expect(findSearchAliasGroup("ads")).toBeUndefined();
    expect(findSearchAliasGroup("ARP cache")).toBeUndefined();
  });

  it("keeps the learner's query first and adds the other members", () => {
    expect(buildAliasAwareQueryVariants("ARP")).toEqual([
      { value: "ARP", matchKind: "exact" },
      { value: "Address Resolution Protocol", matchKind: "alias" }
    ]);
    expect(buildAliasAwareQueryVariants("address resolution protocol")).toEqual([
      { value: "address resolution protocol", matchKind: "exact" },
      { value: "ARP", matchKind: "alias" }
    ]);
  });

  it("leaves a query outside the data set exactly as SEARCH-005A built it", () => {
    expect(buildAliasAwareQueryVariants("kubectl?")).toEqual([
      { value: "kubectl?", matchKind: "exact" },
      { value: "kubectl", matchKind: "normalized" }
    ]);
  });

  /**
   * Acceptance criterion 8 at the unit level: EVERY ordered pair of members in
   * EVERY group, read from the checked-in file. The integration-level version
   * lives in `wp005-search.test.ts`.
   */
  it("every alias pair in the data set resolves both directions", () => {
    let pairs = 0;
    for (const group of groups) {
      for (const from of group.members) {
        const variants = buildAliasAwareQueryVariants(from).map((variant) =>
          keyOf(variant.value)
        );
        expect(variants.length).toBeLessThanOrEqual(MAX_CURRICULUM_QUERY_VARIANTS);
        for (const to of group.members) {
          expect(variants, `${from} -> ${to}`).toContain(keyOf(to));
          pairs += 1;
        }
      }
    }
    expect(pairs).toBeGreaterThan(groups.length * 2);
  });
});

describe("WP-005 alias data stays server-side data", () => {
  it("no browser source reads or names the data file", () => {
    for (const path of [
      "../../../apps/web/src/search/CurriculumSearchView.tsx",
      "../../../apps/web/src/search/curriculum-search-service.ts"
    ]) {
      const source = read(path);
      expect(source).not.toContain("search-acronym-aliases");
      expect(source).not.toContain("search-aliases");
    }
  });

  it("the shared package holds no copy of the WP-005 data set", () => {
    const shared = read("../../../packages/shared-types/src/search-match-location.ts");
    for (const member of ["Address Resolution Protocol", "Media Access Control"]) {
      expect(shared).not.toContain(member);
    }
  });
});
