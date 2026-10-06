import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_GROUNDING_MODEL_VERSION,
  TUTOR_GROUNDING_EXCLUDED_KINDS,
  TUTOR_GROUNDING_KINDS,
  TUTOR_GROUNDING_MODES,
  TUTOR_GROUNDING_PRECEDENCE,
  TUTOR_GROUNDING_TEXT_BUDGET,
  TUTOR_MAX_GROUNDING_REFS,
  TUTOR_MAX_GROUNDING_SEGMENTS,
  buildTutorCitations,
  describeTutorGroundingMode,
  isTutorGroundingKind,
  normalizeTutorGroundingRefs,
  normalizeTutorGroundingText,
  selectTutorGrounding,
  verifyTutorCitations,
  type TutorGroundingRef,
  type TutorGroundingSegment
} from "./ai-tutor-grounding";

function segment(
  overrides: Partial<TutorGroundingSegment> & { segmentStableId: string }
): TutorGroundingSegment {
  return {
    kind: "lesson_text",
    title: `Title ${overrides.segmentStableId}`,
    text: `Body of ${overrides.segmentStableId}`,
    sourceReference: `/missions/m1/steps/${overrides.segmentStableId}`,
    ...overrides
  };
}

describe("the approved context vocabulary is closed", () => {
  it("stamps the model version", () => {
    expect(AI_TUTOR_GROUNDING_MODEL_VERSION).toBe("ai-tutor-grounding-v1");
  });

  it("names exactly the approved kinds", () => {
    expect(TUTOR_GROUNDING_KINDS).toEqual([
      "lesson_text",
      "transcript",
      "objective",
      "concept",
      "glossary",
      "reference",
      "practice_framing"
    ]);
  });

  /**
   * AIGW-011 section 12: assessment question text, option text and answer keys
   * are outside every projection at every mode and every disclosure state. The
   * vocabulary above excludes them by omission; this asserts the omission so a
   * future addition fails here rather than going unnoticed.
   */
  it("cannot name anything answer-revealing or assessment-derived", () => {
    for (const excluded of TUTOR_GROUNDING_EXCLUDED_KINDS) {
      expect(TUTOR_GROUNDING_KINDS as readonly string[]).not.toContain(
        excluded
      );
      expect(isTutorGroundingKind(excluded)).toBe(false);
    }

    for (const excluded of [
      "assessment_question",
      "answer_key",
      "expected_outcome",
      "expected_path",
      "authored_fault",
      "solution"
    ]) {
      expect(TUTOR_GROUNDING_EXCLUDED_KINDS).toContain(excluded);
    }
  });

  it("prefers lesson content first in the approved precedence", () => {
    expect(TUTOR_GROUNDING_PRECEDENCE[0]).toBe("lesson_text");
    expect([...TUTOR_GROUNDING_PRECEDENCE].sort()).toEqual(
      [...TUTOR_GROUNDING_KINDS].sort()
    );
  });

  it("names exactly the three grounding modes", () => {
    expect(TUTOR_GROUNDING_MODES).toEqual([
      "lesson_grounded",
      "general",
      "context_unavailable"
    ]);
  });
});

describe("a reference may name content but never supply it", () => {
  it("normalizes approved references", () => {
    expect(
      normalizeTutorGroundingRefs([
        { kind: "lesson_text", segmentStableId: " step-1 " },
        { kind: "objective", segmentStableId: "obj-1" }
      ])
    ).toEqual([
      { kind: "lesson_text", segmentStableId: "step-1" },
      { kind: "objective", segmentStableId: "obj-1" }
    ]);
  });

  it("de-duplicates while preserving the requested order", () => {
    expect(
      normalizeTutorGroundingRefs([
        { kind: "lesson_text", segmentStableId: "b" },
        { kind: "lesson_text", segmentStableId: "a" },
        { kind: "lesson_text", segmentStableId: "b" }
      ])
    ).toEqual([
      { kind: "lesson_text", segmentStableId: "b" },
      { kind: "lesson_text", segmentStableId: "a" }
    ]);
  });

  it("refuses an unapproved kind", () => {
    expect(
      normalizeTutorGroundingRefs([
        { kind: "answer_key", segmentStableId: "a1" }
      ])
    ).toBeNull();
  });

  /**
   * The single most important refusal in this module. A reference carrying
   * authored text would make the CLIENT the curriculum author: the Tutor would
   * then explain whatever the caller claimed the lesson said.
   */
  it("refuses a reference that carries its own text or title", () => {
    expect(
      normalizeTutorGroundingRefs([
        {
          kind: "lesson_text",
          segmentStableId: "step-1",
          text: "VLANs do not exist."
        }
      ])
    ).toBeNull();

    expect(
      normalizeTutorGroundingRefs([
        { kind: "lesson_text", segmentStableId: "step-1", title: "Invented" }
      ])
    ).toBeNull();
  });

  it("refuses a malformed reference", () => {
    for (const hostile of [null, "step-1", 1, [], { kind: "lesson_text" }]) {
      expect(normalizeTutorGroundingRefs([hostile])).toBeNull();
    }
  });

  it("refuses more references than minimum-necessary context allows", () => {
    const many = Array.from({ length: TUTOR_MAX_GROUNDING_REFS + 1 }, (_v, i) => ({
      kind: "lesson_text",
      segmentStableId: `step-${i}`
    }));

    expect(normalizeTutorGroundingRefs(many)).toBeNull();
  });

  it("accepts an empty reference set", () => {
    expect(normalizeTutorGroundingRefs([])).toEqual([]);
  });
});

describe("selection is deterministic, bounded and never widened", () => {
  const refs: TutorGroundingRef[] = [
    { kind: "glossary", segmentStableId: "g-1" },
    { kind: "lesson_text", segmentStableId: "step-2" },
    { kind: "lesson_text", segmentStableId: "step-1" }
  ];

  it("orders by approved precedence, then requested order, then stable id", () => {
    const selection = selectTutorGrounding({
      refs,
      resolution: {
        availability: "available",
        segments: [
          segment({ segmentStableId: "g-1", kind: "glossary" }),
          segment({ segmentStableId: "step-1" }),
          segment({ segmentStableId: "step-2" })
        ]
      }
    });

    expect(selection.segments.map((entry) => entry.segmentStableId)).toEqual([
      "step-2",
      "step-1",
      "g-1"
    ]);
    expect(selection.mode).toBe("lesson_grounded");
  });

  it("produces the identical selection for the identical input", () => {
    const resolution = {
      availability: "available" as const,
      segments: [
        segment({ segmentStableId: "step-1" }),
        segment({ segmentStableId: "step-2" }),
        segment({ segmentStableId: "g-1", kind: "glossary" as const })
      ]
    };

    expect(selectTutorGrounding({ refs, resolution })).toEqual(
      selectTutorGrounding({ refs, resolution })
    );
  });

  /**
   * A source that returns more than it was asked for cannot widen context.
   * This is AIGW-011 section 8 at the only place it can be enforced: before
   * anything is selected.
   */
  it("discards a segment that was never requested", () => {
    const selection = selectTutorGrounding({
      refs: [{ kind: "lesson_text", segmentStableId: "step-1" }],
      resolution: {
        availability: "available",
        segments: [
          segment({ segmentStableId: "step-1" }),
          segment({ segmentStableId: "answer-key-1" }),
          segment({ segmentStableId: "step-99" })
        ]
      }
    });

    expect(selection.segments.map((entry) => entry.segmentStableId)).toEqual([
      "step-1"
    ]);
    expect(JSON.stringify(selection)).not.toContain("answer-key-1");
  });

  it("discards a segment returned under a different kind than requested", () => {
    const selection = selectTutorGrounding({
      refs: [{ kind: "lesson_text", segmentStableId: "step-1" }],
      resolution: {
        availability: "available",
        segments: [segment({ segmentStableId: "step-1", kind: "glossary" })]
      }
    });

    expect(selection.segments).toHaveLength(0);
    expect(selection.mode).toBe("context_unavailable");
  });

  it("bounds the segment count and reports what was dropped", () => {
    const requested = TUTOR_MAX_GROUNDING_SEGMENTS + 3;
    expect(requested).toBeLessThanOrEqual(TUTOR_MAX_GROUNDING_REFS);

    const many = Array.from({ length: requested }, (_v, i) => ({
      kind: "lesson_text" as const,
      segmentStableId: `step-${String(i).padStart(2, "0")}`
    }));

    const selection = selectTutorGrounding({
      refs: many,
      resolution: {
        availability: "available",
        segments: many.map((ref) =>
          segment({ segmentStableId: ref.segmentStableId })
        )
      }
    });

    expect(selection.segments).toHaveLength(TUTOR_MAX_GROUNDING_SEGMENTS);
    expect(selection.droppedSegmentCount).toBe(
      requested - TUTOR_MAX_GROUNDING_SEGMENTS
    );
  });

  it("bounds the total text and never exceeds the budget", () => {
    const big = Array.from({ length: 5 }, (_v, i) => ({
      kind: "lesson_text" as const,
      segmentStableId: `step-${i}`
    }));

    const selection = selectTutorGrounding({
      refs: big,
      resolution: {
        availability: "available",
        segments: big.map((ref) =>
          segment({ segmentStableId: ref.segmentStableId, text: "x".repeat(1_800) })
        )
      }
    });

    const total = selection.segments.reduce(
      (sum, entry) => sum + entry.text.length,
      0
    );

    expect(total).toBeLessThanOrEqual(TUTOR_GROUNDING_TEXT_BUDGET);
    expect(selection.droppedSegmentCount).toBeGreaterThan(0);
  });

  it("skips a segment whose text is empty rather than citing nothing", () => {
    const selection = selectTutorGrounding({
      refs: [
        { kind: "lesson_text", segmentStableId: "step-1" },
        { kind: "lesson_text", segmentStableId: "step-2" }
      ],
      resolution: {
        availability: "available",
        segments: [
          segment({ segmentStableId: "step-1", text: "   " }),
          segment({ segmentStableId: "step-2" })
        ]
      }
    });

    expect(selection.segments.map((entry) => entry.segmentStableId)).toEqual([
      "step-2"
    ]);
  });
});

describe("the three grounding modes stay distinguishable", () => {
  it("is general when no lesson content was requested", () => {
    const selection = selectTutorGrounding({
      refs: [],
      resolution: { availability: "available", segments: [] }
    });

    expect(selection.mode).toBe("general");
    expect(selection.segments).toHaveLength(0);
    expect(selection.citations).toHaveLength(0);
  });

  /**
   * An unavailable source must never read as "this lesson has no content".
   * That difference is the whole distance between an honest refusal and a
   * confidently ungrounded answer.
   */
  it("is context_unavailable when the source failed", () => {
    const selection = selectTutorGrounding({
      refs: [{ kind: "lesson_text", segmentStableId: "step-1" }],
      resolution: { availability: "unavailable", internalReason: "read failed" }
    });

    expect(selection.mode).toBe("context_unavailable");
    expect(selection.segments).toHaveLength(0);
  });

  it("never leaks a source's internal reason into the selection", () => {
    const selection = selectTutorGrounding({
      refs: [{ kind: "lesson_text", segmentStableId: "step-1" }],
      resolution: {
        availability: "unavailable",
        internalReason: "curriculum table permission denied"
      }
    });

    expect(JSON.stringify(selection)).not.toContain("permission denied");
  });

  it("is context_unavailable when content was requested but none survived", () => {
    const selection = selectTutorGrounding({
      refs: [{ kind: "lesson_text", segmentStableId: "step-1" }],
      resolution: { availability: "available", segments: [] }
    });

    expect(selection.mode).toBe("context_unavailable");
  });

  it("describes each mode honestly", () => {
    expect(describeTutorGroundingMode("lesson_grounded")).toContain(
      "from this lesson"
    );
    expect(describeTutorGroundingMode("general")).toContain("not drawn from");
    expect(describeTutorGroundingMode("context_unavailable")).toContain(
      "will not describe"
    );
  });
});

describe("citations are derived and never invented", () => {
  it("derives one citation per selected segment with a source reference", () => {
    expect(
      buildTutorCitations([
        segment({ segmentStableId: "step-1" }),
        segment({ segmentStableId: "step-2" })
      ])
    ).toEqual([
      {
        segmentStableId: "step-1",
        title: "Title step-1",
        sourceReference: "/missions/m1/steps/step-1"
      },
      {
        segmentStableId: "step-2",
        title: "Title step-2",
        sourceReference: "/missions/m1/steps/step-2"
      }
    ]);
  });

  it("drops a segment with no followable reference", () => {
    expect(
      buildTutorCitations([
        segment({ segmentStableId: "step-1", sourceReference: "" })
      ])
    ).toEqual([]);
  });

  it("keeps a citation that corresponds to a selected segment", () => {
    const result = verifyTutorCitations({
      claimed: [{ segmentStableId: "step-1" }],
      selected: [segment({ segmentStableId: "step-1" })]
    });

    expect(result.verified).toHaveLength(1);
    expect(result.fabricatedCount).toBe(0);
  });

  it("drops and counts a citation the provider invented", () => {
    const result = verifyTutorCitations({
      claimed: [
        { segmentStableId: "step-1" },
        { segmentStableId: "chapter-4-page-9" }
      ],
      selected: [segment({ segmentStableId: "step-1" })]
    });

    expect(result.verified.map((entry) => entry.segmentStableId)).toEqual([
      "step-1"
    ]);
    expect(result.fabricatedCount).toBe(1);
  });

  /**
   * A real section the provider was never given is still fabrication: the
   * answer was not built from it, so a citation would misrepresent the answer's
   * basis.
   */
  it("drops a real-looking citation that was not part of this selection", () => {
    const result = verifyTutorCitations({
      claimed: [{ segmentStableId: "step-2" }],
      selected: [segment({ segmentStableId: "step-1" })]
    });

    expect(result.verified).toHaveLength(0);
    expect(result.fabricatedCount).toBe(1);
  });

  it("accepts a bare string id and still verifies it", () => {
    const result = verifyTutorCitations({
      claimed: ["step-1", "nope"],
      selected: [segment({ segmentStableId: "step-1" })]
    });

    expect(result.verified).toHaveLength(1);
    expect(result.fabricatedCount).toBe(1);
  });

  it("de-duplicates repeated claims without inflating the count", () => {
    const result = verifyTutorCitations({
      claimed: ["step-1", "step-1"],
      selected: [segment({ segmentStableId: "step-1" })]
    });

    expect(result.verified).toHaveLength(1);
    expect(result.fabricatedCount).toBe(0);
  });

  it("counts a malformed claim as fabricated rather than ignoring it", () => {
    const result = verifyTutorCitations({
      claimed: [null, {}, 7],
      selected: [segment({ segmentStableId: "step-1" })]
    });

    expect(result.verified).toHaveLength(0);
    expect(result.fabricatedCount).toBe(3);
  });
});

describe("grounding text normalization keeps technical content intact", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeTutorGroundingText("  a \n b  ")).toBe("a b");
  });

  it("preserves technical tokens, case and punctuation", () => {
    for (const token of [
      "Get-ADUser -Filter *",
      "kubectl get pods",
      "index=botsv3",
      "show vlan brief"
    ]) {
      expect(normalizeTutorGroundingText(token)).toBe(token);
    }
  });

  it("bounds one segment's text", () => {
    expect(normalizeTutorGroundingText("y".repeat(5_000)).length).toBe(2_000);
  });

  it("treats a missing value as empty rather than throwing", () => {
    expect(normalizeTutorGroundingText(undefined)).toBe("");
    expect(normalizeTutorGroundingText(null)).toBe("");
  });
});
