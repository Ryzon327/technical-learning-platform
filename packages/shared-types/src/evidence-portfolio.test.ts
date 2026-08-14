import { describe, expect, it } from "vitest";
import {
  assembleEvidencePortfolio,
  competencyReferenceKey,
  buildEvidenceSourceLabel,
  buildPortfolioFilterOptions,
  describeEffectiveStatus,
  describeEvidenceOutcomeLabel,
  describeEvidenceSourceType,
  filterPortfolioItems,
  formatPortfolioDate,
  groupPortfolioItemsByCompetency,
  isCurrentProof,
  normalizePortfolioFilters,
  normalizePortfolioLimit,
  selectUngroupedItems,
  type EvidencePortfolioItem
} from "./evidence-portfolio";
import type { StudentEvidenceCompetencyLink } from "./evidence-competency";

function link(
  overrides: Partial<StudentEvidenceCompetencyLink> = {}
): StudentEvidenceCompetencyLink {
  return {
    id: "link-1",
    evidenceId: "evidence-1",
    competencyStableId: "competency.network.subnetting",
    competencyVersion: 2,
    competencyTitle: "Design and apply IPv4 subnetting",
    competencyReferenceState: "current",
    relationship: "required",
    linkSource: "approved_curriculum_mapping",
    linkSourceDescription: "Mapped by the approved curriculum definition.",
    linkedAt: "2026-08-13T00:00:00.000Z",
    ...overrides
  };
}

function item(
  overrides: Partial<EvidencePortfolioItem> = {}
): EvidencePortfolioItem {
  return {
    evidenceId: "evidence-1",
    sourceType: "lab_validation",
    sourceLabel: "Configure IPv4 subnets",
    outcomeLabel: "Passed",
    occurredAt: "2026-08-13T00:00:00.000Z",
    recordedAt: "2026-08-13T00:00:05.000Z",
    effectiveState: "active",
    evidenceOutcome: "positive",
    statusLabel: "Current evidence",
    underReview: false,
    isCurrentProof: true,
    correctionCount: 0,
    competencies: [link()],
    curriculum: [
      {
        competencyStableId: "competency.network.subnetting",
        competencyVersion: 2,
        courseStableId: "course.networking.foundations",
        courseTitle: "Networking Foundations",
        missionStableId: "mission.network.addressing"
      }
    ],
    ...overrides
  };
}

describe("filter normalization", () => {
  it("clamps the limit like the existing retrieval convention", () => {
    expect(normalizePortfolioLimit(undefined)).toBe(50);
    expect(normalizePortfolioLimit(0)).toBe(1);
    expect(normalizePortfolioLimit(5000)).toBe(200);
    expect(normalizePortfolioLimit("nonsense")).toBe(50);
  });

  it("keeps only canonical source types", () => {
    expect(normalizePortfolioFilters({ sourceType: "lab_validation" }).sourceType).toBe(
      "lab_validation"
    );
    expect(normalizePortfolioFilters({ sourceType: "anything" }).sourceType).toBe(
      undefined
    );
  });

  it("drops blank and oversized identifiers rather than failing", () => {
    expect(
      normalizePortfolioFilters({ competencyStableId: "   " }).competencyStableId
    ).toBe(undefined);
    expect(
      normalizePortfolioFilters({ courseStableId: "x".repeat(300) }).courseStableId
    ).toBe(undefined);
    expect(
      normalizePortfolioFilters({ courseStableId: " course.a " }).courseStableId
    ).toBe("course.a");
  });
});

describe("filtering", () => {
  const items = [
    item(),
    item({
      evidenceId: "evidence-2",
      sourceType: "assessment_attempt",
      sourceLabel: "IPv4 Subnetting Readiness",
      competencies: [
        link({
          id: "link-2",
          evidenceId: "evidence-2",
          competencyStableId: "competency.network.routing",
          competencyTitle: "Configure static routing"
        })
      ],
      curriculum: [
        {
          competencyStableId: "competency.network.routing",
          competencyVersion: 2,
          courseStableId: "course.networking.advanced",
          courseTitle: "Advanced Networking"
        }
      ]
    })
  ];

  it("filters by canonical source type", () => {
    const result = filterPortfolioItems(items, { sourceType: "assessment_attempt" });
    expect(result).toHaveLength(1);
    expect(result[0]?.evidenceId).toBe("evidence-2");
  });

  it("filters by competency", () => {
    const result = filterPortfolioItems(items, {
      competencyStableId: "competency.network.subnetting"
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.evidenceId).toBe("evidence-1");
  });

  it("filters by course through the curriculum relationship", () => {
    const result = filterPortfolioItems(items, {
      courseStableId: "course.networking.advanced"
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.evidenceId).toBe("evidence-2");
  });

  it("combines filters conjunctively", () => {
    expect(
      filterPortfolioItems(items, {
        sourceType: "assessment_attempt",
        courseStableId: "course.networking.foundations"
      })
    ).toHaveLength(0);
  });

  it("returns everything when no filter is supplied", () => {
    expect(filterPortfolioItems(items, {})).toHaveLength(2);
  });
});

describe("grouping is a presentation of the filtered result", () => {
  it("groups items under each competency they support", () => {
    const multi = item({
      competencies: [
        link(),
        link({
          id: "link-3",
          competencyStableId: "competency.network.routing",
          competencyTitle: "Configure static routing"
        })
      ]
    });

    const groups = groupPortfolioItemsByCompetency([multi]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.competencyStableId)).toContain(
      "competency.network.routing"
    );
  });

  it("groups only what the filter produced", () => {
    const items = [
      item(),
      item({
        evidenceId: "evidence-2",
        sourceType: "assessment_attempt",
        competencies: [
          link({ id: "link-2", competencyStableId: "competency.other" })
        ],
        curriculum: []
      })
    ];

    const portfolio = assembleEvidencePortfolio({
      items,
      filters: { sourceType: "lab_validation" }
    });

    expect(portfolio.totalCount).toBe(1);
    expect(portfolio.groups).toHaveLength(1);
    expect(portfolio.groups[0]?.competencyStableId).toBe(
      "competency.network.subnetting"
    );
  });

  it("counts only current proof within a group", () => {
    const groups = groupPortfolioItemsByCompetency([
      item(),
      item({
        evidenceId: "evidence-2",
        effectiveState: "invalidated",
        isCurrentProof: false
      })
    ]);

    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[0]?.currentProofCount).toBe(1);
  });

  it("surfaces items with no competency link rather than dropping them", () => {
    const orphan = item({ evidenceId: "evidence-3", competencies: [] });
    expect(selectUngroupedItems([item(), orphan])).toHaveLength(1);

    const portfolio = assembleEvidencePortfolio({
      items: [item(), orphan],
      filters: {}
    });
    expect(portfolio.ungroupedItems[0]?.evidenceId).toBe("evidence-3");
    expect(portfolio.totalCount).toBe(2);
  });
});

describe("corrected evidence stays visible and clearly identified", () => {
  it("keeps invalidated and superseded items in the portfolio", () => {
    const portfolio = assembleEvidencePortfolio({
      items: [
        item({
          evidenceId: "evidence-2",
          effectiveState: "invalidated",
          statusLabel: describeEffectiveStatus("invalidated", false),
          isCurrentProof: false,
          correctionCount: 1,
          lastCorrectionReason: "The validation profile was defective."
        })
      ],
      filters: {}
    });

    expect(portfolio.totalCount).toBe(1);
    expect(portfolio.items[0]?.statusLabel).toContain("No longer valid");
    expect(portfolio.items[0]?.isCurrentProof).toBe(false);
  });

  it("A: a passed assessment that is active and verified is current proof", () => {
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "passed"
      })
    ).toBe(true);
  });

  it("B: a failed assessment is never current proof, even active and verified", () => {
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "failed"
      })
    ).toBe(false);
  });

  it("C: a passed lab validation that is active and verified is current proof", () => {
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "passed"
      })
    ).toBe(true);
  });

  it("D: an incomplete lab validation is never current proof", () => {
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "incomplete"
      })
    ).toBe(false);
  });

  it("E/F: invalidated and superseded positive evidence is never current proof", () => {
    for (const state of ["invalidated", "superseded"] as const) {
      expect(
        isCurrentProof({
          effectiveState: state,
          integrityState: "verified",
          resultState: "passed"
        })
      ).toBe(false);
    }
  });

  it("indeterminate and unverified evidence fails closed", () => {
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "technical_error"
      })
    ).toBe(false);
    expect(
      isCurrentProof({ effectiveState: "active", integrityState: "verified" })
    ).toBe(false);
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "mismatch",
        resultState: "passed"
      })
    ).toBe(false);
  });

  it("restoration restores state only, never a negative outcome", () => {
    // A restored record is active again; the outcome rule still decides.
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "passed"
      })
    ).toBe(true);
    expect(
      isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "failed"
      })
    ).toBe(false);
  });

  it("the student view never shows negative evidence as current proof", () => {
    const negative = item({
      evidenceId: "evidence-failed",
      evidenceOutcome: "negative",
      isCurrentProof: isCurrentProof({
        effectiveState: "active",
        integrityState: "verified",
        resultState: "failed"
      })
    });

    const portfolio = assembleEvidencePortfolio({
      items: [negative],
      filters: {}
    });

    expect(portfolio.items[0]?.isCurrentProof).toBe(false);
    expect(portfolio.groups[0]?.currentProofCount).toBe(0);
  });

  it("describes every status as readable text, not a colour or badge", () => {
    expect(describeEffectiveStatus("active", false)).toBe("Current evidence");
    expect(describeEffectiveStatus("invalidated", false)).toContain(
      "kept for your records"
    );
    expect(describeEffectiveStatus("superseded", false)).toContain(
      "Replaced by newer evidence"
    );
    expect(describeEffectiveStatus("active", true)).toContain("under review");
    expect(describeEffectiveStatus("invalidated", true)).toContain("under review");

    for (const state of ["active", "invalidated", "superseded"] as const) {
      expect(describeEffectiveStatus(state, false).length).toBeGreaterThan(5);
    }
  });
});

describe("student-friendly labels", () => {
  it("prefers the recorded assessment or lab name", () => {
    expect(
      buildEvidenceSourceLabel("assessment_attempt", {
        assessmentTitle: "IPv4 Subnetting Readiness"
      })
    ).toBe("IPv4 Subnetting Readiness");
    expect(
      buildEvidenceSourceLabel("lab_validation", { labName: "Configure subnets" })
    ).toBe("Configure subnets");
  });

  it("falls back to a type label rather than a raw reference", () => {
    expect(buildEvidenceSourceLabel("lab_validation", {})).toBe("Hands-on lab");
    expect(buildEvidenceSourceLabel("assessment_attempt", {})).toBe("Assessment");
    expect(describeEvidenceSourceType("manual_authoritative")).toContain(
      "platform team"
    );
  });

  it("describes outcomes readably, or not at all", () => {
    expect(describeEvidenceOutcomeLabel({ resultState: "passed" })).toBe("Passed");
    expect(describeEvidenceOutcomeLabel({ resultState: "failed" })).toBe(
      "Not passed"
    );
    expect(describeEvidenceOutcomeLabel({ resultState: "incomplete" })).toBe(
      "Not yet complete"
    );
    expect(describeEvidenceOutcomeLabel({})).toBe(undefined);
  });

  it("formats dates readably and never crashes on bad input", () => {
    expect(formatPortfolioDate("2026-08-13T00:00:00.000Z")).toBe("2026-08-13");
    expect(formatPortfolioDate("not-a-date")).toBe("Date unavailable");
  });
});

describe("filter options are derived from the student's own evidence", () => {
  it("offers only types, competencies and courses the student actually has", () => {
    const options = buildPortfolioFilterOptions([item()]);
    expect(options.sourceTypes).toEqual([
      { value: "lab_validation", label: "Hands-on lab" }
    ]);
    expect(options.competencies[0]?.label).toBe(
      "Design and apply IPv4 subnetting"
    );
    expect(options.courses[0]?.courseStableId).toBe(
      "course.networking.foundations"
    );
  });

  it("derives options before filtering so the controls stay usable", () => {
    const portfolio = assembleEvidencePortfolio({
      items: [
        item(),
        item({ evidenceId: "evidence-2", sourceType: "assessment_attempt" })
      ],
      filters: { sourceType: "lab_validation" }
    });

    expect(portfolio.totalCount).toBe(1);
    expect(portfolio.availableFilters.sourceTypes).toHaveLength(2);
  });
});

describe("failure behaviour", () => {
  it("preserves the portfolio and identifies unavailable detail", () => {
    const portfolio = assembleEvidencePortfolio({
      items: [item()],
      filters: {},
      unavailableItems: [
        { evidenceId: "evidence-9", reason: "Supported competencies could not be loaded." }
      ]
    });

    expect(portfolio.totalCount).toBe(1);
    expect(portfolio.unavailableItems).toHaveLength(1);
    expect(portfolio.unavailableItems[0]?.reason).toContain("could not be loaded");
  });

  it("applies the limit to the filtered result", () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      item({ evidenceId: `evidence-${index}` })
    );
    expect(
      assembleEvidencePortfolio({ items: many, filters: { limit: 3 } }).totalCount
    ).toBe(3);
  });
});


describe("historical curriculum context is version aware", () => {
  const v2 = item({
    evidenceId: "evidence-v2",
    competencies: [
      link({
        id: "link-v2",
        evidenceId: "evidence-v2",
        competencyStableId: "competency.network.vlans",
        competencyVersion: 2,
        competencyTitle: "Configure VLANs"
      })
    ],
    curriculum: [
      {
        competencyStableId: "competency.network.vlans",
        competencyVersion: 2,
        courseStableId: "course.a",
        courseTitle: "Course A"
      }
    ]
  });

  const v5 = item({
    evidenceId: "evidence-v5",
    competencies: [
      link({
        id: "link-v5",
        evidenceId: "evidence-v5",
        competencyStableId: "competency.network.vlans",
        competencyVersion: 5,
        competencyTitle: "Configure VLANs"
      })
    ],
    curriculum: [
      {
        competencyStableId: "competency.network.vlans",
        competencyVersion: 5,
        courseStableId: "course.b",
        courseTitle: "Course B"
      }
    ]
  });

  it("keys curriculum context by stable id and version", () => {
    expect(
      competencyReferenceKey({
        competencyStableId: "competency.network.vlans",
        competencyVersion: 2
      })
    ).toBe("competency.network.vlans@2");
  });

  it("filters v2 evidence under Course A even while v5 maps to Course B", () => {
    const filtered = filterPortfolioItems([v2, v5], {
      courseStableId: "course.a"
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.evidenceId).toBe("evidence-v2");
  });

  it("filters v5 evidence under Course B", () => {
    const filtered = filterPortfolioItems([v2, v5], {
      courseStableId: "course.b"
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.evidenceId).toBe("evidence-v5");
  });

  it("groups each version with its own historical course", () => {
    const groups = groupPortfolioItemsByCompetency([v2, v5]);
    expect(groups).toHaveLength(2);

    const groupV2 = groups.find((group) => group.competencyVersion === 2);
    const groupV5 = groups.find((group) => group.competencyVersion === 5);
    expect(groupV2?.courseStableId).toBe("course.a");
    expect(groupV5?.courseStableId).toBe("course.b");
  });

  it("never lets a newer version supply context for older evidence", () => {
    // v2 evidence carries only the v2 context, even though v5 exists.
    const groups = groupPortfolioItemsByCompetency([v2]);
    expect(groups[0]?.courseTitle).toBe("Course A");
    expect(groups[0]?.courseStableId).not.toBe("course.b");
  });

  it("offers both course options while keeping them distinct", () => {
    const options = buildPortfolioFilterOptions([v2, v5]);
    expect(options.courses).toHaveLength(2);
    expect(options.competencies).toHaveLength(2);
  });
});
