import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_LESSON_CONTEXT_MODEL_VERSION,
  AI_TUTOR_LESSON_FORBIDDEN_FIELDS,
  TUTOR_DEFAULT_PRESENTATION,
  TUTOR_EXPLANATION_DEPTHS,
  TUTOR_FORBIDDEN_PEDAGOGY_MECHANICS,
  TUTOR_LANGUAGE_REGISTERS,
  TUTOR_OPTIONALITY_CONTRACT,
  TUTOR_PANEL_PLACEMENT,
  TUTOR_RENDERING_ROLES,
  TUTOR_RENDERING_RULES,
  buildTutorLessonSession,
  buildTutorRendering,
  isTutorExplanationDepth,
  isTutorLanguageRegister,
  resolveTutorPresentation
} from "./ai-tutor-lesson-context";

const lesson = {
  courseStableId: "networking-foundations",
  moduleStableId: "module-1",
  missionStableId: "mission-2",
  missionVersion: 3
};

describe("the lesson-workspace interaction is represented, not recreated", () => {
  it("stamps the model version", () => {
    expect(AI_TUTOR_LESSON_CONTEXT_MODEL_VERSION).toBe(
      "ai-tutor-lesson-context-v1"
    );
  });

  /**
   * A single literal placement, so "the Tutor is a separate page the learner
   * navigates away to" is not a representable state.
   */
  it("admits exactly one placement", () => {
    expect(TUTOR_PANEL_PLACEMENT).toBe("in_lesson_workspace");
  });

  it("preserves learner state and requires no navigation", () => {
    const session = buildTutorLessonSession({
      lesson,
      position: { stepStableId: "step-4", sceneId: "scene-2" },
      contextSuppliedAutomatically: true
    });

    expect(session.placement).toBe("in_lesson_workspace");
    expect(session.learnerStatePreserved).toBe(true);
    expect(session.navigationRequired).toBe(false);
    expect(session.contextSuppliedAutomatically).toBe(true);
  });

  it("carries the lesson position the workspace supplied", () => {
    const session = buildTutorLessonSession({
      lesson,
      position: { stepStableId: "step-4", stepType: "concept" },
      contextSuppliedAutomatically: true
    });

    expect(session.position).toEqual({
      stepStableId: "step-4",
      stepType: "concept"
    });
  });

  it("remains askable from a lesson that has reached no step", () => {
    const session = buildTutorLessonSession({
      lesson,
      contextSuppliedAutomatically: false
    });

    expect(session.position).toEqual({});
    expect(session.contextSuppliedAutomatically).toBe(false);
  });

  it("carries only stable identity and version", () => {
    const session = buildTutorLessonSession({
      lesson,
      contextSuppliedAutomatically: true
    });

    expect(session.lesson).toEqual(lesson);

    const keys = Object.keys(session.lesson);
    for (const forbidden of AI_TUTOR_LESSON_FORBIDDEN_FIELDS) {
      expect(keys).not.toContain(forbidden);
    }
  });

  /**
   * The builder assigns identity field by field rather than spreading, so a
   * caller cannot smuggle a learner id or a disclosure claim into the session.
   */
  it("drops a field the caller added to the lesson identity", () => {
    const session = buildTutorLessonSession({
      lesson: {
        ...lesson,
        userId: "learner-1",
        disclosureState: "permitted"
      } as typeof lesson,
      contextSuppliedAutomatically: true
    });

    const serialized = JSON.stringify(session.lesson);

    expect(serialized).not.toContain("learner-1");
    expect(serialized).not.toContain("disclosureState");
  });

  it("omits an absent optional module rather than carrying an empty one", () => {
    const session = buildTutorLessonSession({
      lesson: { ...lesson, moduleStableId: "" },
      contextSuppliedAutomatically: true
    });

    expect(Object.keys(session.lesson)).not.toContain("moduleStableId");
  });

  it("records that the Tutor is optional and its absence is normal", () => {
    const text = TUTOR_OPTIONALITY_CONTRACT.join(" ").toLowerCase();

    expect(text).toContain("optional");
    expect(text).toContain("remains readable and completable");
    expect(text).toContain("accessibility and narration");
    expect(text).toContain("never as an answer");
  });
});

describe("presentation preference defaults to concise", () => {
  it("names the approved vocabularies", () => {
    expect(TUTOR_EXPLANATION_DEPTHS).toEqual([
      "concise",
      "standard",
      "deeper"
    ]);
    expect(TUTOR_LANGUAGE_REGISTERS).toEqual(["default", "plain_language"]);
  });

  it("defaults to a concise answer in the default register", () => {
    expect(TUTOR_DEFAULT_PRESENTATION).toEqual({
      explanationDepth: "concise",
      languageRegister: "default"
    });
  });

  it("honours an approved preference", () => {
    expect(
      resolveTutorPresentation({
        explanationDepth: "deeper",
        languageRegister: "plain_language"
      })
    ).toEqual({
      explanationDepth: "deeper",
      languageRegister: "plain_language"
    });
  });

  /**
   * Fail closed in the pedagogical direction: an unrecognised preference gets
   * the conservative default, never the most expansive option.
   */
  it("falls back to the concise default for an unapproved value", () => {
    for (const hostile of [
      { explanationDepth: "exhaustive" },
      { explanationDepth: 3 },
      { languageRegister: "grade_4" },
      { languageRegister: null },
      {},
      null,
      undefined,
      "deeper"
    ]) {
      expect(resolveTutorPresentation(hostile)).toEqual(
        TUTOR_DEFAULT_PRESENTATION
      );
    }
  });

  it("narrows a partially valid preference per field", () => {
    expect(
      resolveTutorPresentation({
        explanationDepth: "deeper",
        languageRegister: "grade_4"
      })
    ).toEqual({ explanationDepth: "deeper", languageRegister: "default" });
  });

  it("guards each vocabulary", () => {
    expect(isTutorExplanationDepth("concise")).toBe(true);
    expect(isTutorExplanationDepth("exhaustive")).toBe(false);
    expect(isTutorLanguageRegister("plain_language")).toBe(true);
    expect(isTutorLanguageRegister("simple")).toBe(false);
  });
});

describe("no pressure mechanic is nameable", () => {
  it("holds the prohibition as data", () => {
    for (const mechanic of [
      "streak",
      "timer",
      "countdown",
      "leaderboard",
      "points",
      "urgency"
    ]) {
      expect(TUTOR_FORBIDDEN_PEDAGOGY_MECHANICS).toContain(mechanic);
    }
  });

  /**
   * Asserted over KEYS and the role vocabulary, never over prose.
   *
   * A substring scan of answer text would be both too weak and too strong: too
   * strong because "xp" lives inside "explanation" and "points" is ordinary
   * English, and too weak because the real prohibition is structural. No field
   * and no semantic role may exist for a pressure mechanic, so a surface has
   * nothing to render one from.
   */
  it("gives a rendered answer no field or role a mechanic could use", () => {
    const rendering = buildTutorRendering({
      answer: "A VLAN is one broadcast domain.",
      explanation: "Traffic does not cross a VLAN boundary without routing.",
      stepGuidance: ["Reread the trunking section."],
      references: ["Trunk ports"]
    });

    const keys = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>
      )) {
        keys.add(key.toLowerCase());
        walk(nested);
      }
    };
    walk(rendering);

    for (const mechanic of TUTOR_FORBIDDEN_PEDAGOGY_MECHANICS) {
      expect(keys).not.toContain(mechanic.toLowerCase());
      expect(TUTOR_RENDERING_ROLES as readonly string[]).not.toContain(
        mechanic
      );
    }
  });

  it("states the rendering rules, including the no-colour-alone rule", () => {
    const text = TUTOR_RENDERING_RULES.join(" ").toLowerCase();

    expect(text).toContain("keyboard alone");
    expect(text).toContain("focus");
    expect(text).toContain("colour alone");
    expect(text).toContain("announced");
    expect(text).toContain("inert");
  });
});

describe("the accessible rendering contract is structural", () => {
  it("names the approved semantic roles", () => {
    expect(TUTOR_RENDERING_ROLES).toEqual([
      "heading",
      "paragraph",
      "list",
      "code",
      "reference",
      "status"
    ]);
  });

  it("asserts keyboard reach and non-colour signalling by construction", () => {
    const rendering = buildTutorRendering({ answer: "Short answer." });

    expect(rendering.keyboardReachable).toBe(true);
    expect(rendering.colorIsNotTheOnlySignal).toBe(true);
    expect(rendering.modelVersion).toBe(AI_TUTOR_LESSON_CONTEXT_MODEL_VERSION);
  });

  it("renders a concise answer as one paragraph with no empty headings", () => {
    const rendering = buildTutorRendering({ answer: "Short answer." });

    expect(rendering.blocks).toEqual([
      { role: "paragraph", text: "Short answer." }
    ]);
  });

  it("gives a heading to every section it actually has", () => {
    const rendering = buildTutorRendering({
      answer: "Answer.",
      explanation: "Because of this.",
      stepGuidance: ["Try the step again."],
      references: ["Trunk ports"]
    });

    expect(rendering.blocks.map((block) => block.role)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "heading",
      "list",
      "heading",
      "reference"
    ]);
  });

  it("never emits a heading for an absent or blank section", () => {
    const rendering = buildTutorRendering({
      answer: "Answer.",
      explanation: "   ",
      stepGuidance: ["  ", ""],
      references: ["   "]
    });

    expect(rendering.blocks).toEqual([
      { role: "paragraph", text: "Answer." }
    ]);
  });

  /**
   * A status — "this is a general explanation", "the Tutor is unavailable" —
   * comes FIRST and becomes the announcement. A screen-reader user must learn
   * that an answer is ungrounded before hearing the answer, not after.
   */
  it("puts a status first and announces it", () => {
    const rendering = buildTutorRendering({
      answer: "Answer.",
      statusStatement: "This is a general explanation."
    });

    expect(rendering.blocks[0]).toEqual({
      role: "status",
      text: "This is a general explanation."
    });
    expect(rendering.screenReaderAnnouncement).toBe(
      "This is a general explanation."
    );
  });

  it("announces the answer itself when there is no status", () => {
    const rendering = buildTutorRendering({ answer: "A VLAN is a domain." });

    expect(rendering.screenReaderAnnouncement).toBe(
      "Tutor answer. A VLAN is a domain."
    );
  });

  it("never leaves the announcement empty", () => {
    expect(
      buildTutorRendering({ answer: "x" }).screenReaderAnnouncement.length
    ).toBeGreaterThan(0);
  });
});
