import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CURRICULUM_AUTHORABLE_ASSET_TYPES,
  CURRICULUM_DOCUMENT_KINDS,
  CURRICULUM_DOCUMENT_STABLE_ID,
  CURRICULUM_PREREQUISITE_REQUIREMENT_TYPES,
  MISSION_COMPETENCY_RELATIONSHIPS,
  MISSION_STEP_STABLE_ID,
  MISSION_STEP_TYPES,
  PREREQUISITE_TARGET_NODE_TYPES,
  hasDocumentCompetencyPrerequisiteCycle,
  isPublishableDocumentKind,
  parseCurriculumDocument,
  type CurriculumDocument
} from "@tlp/shared-types";

/**
 * WP-G — the authored curriculum document contract.
 *
 * The fixture is parsed by the real parser rather than by a copy of it, so a
 * contract change that the fixture no longer satisfies fails here.
 */

/**
 * The real fixture file, parsed by the real parser.
 *
 * This test lives in `services/api` rather than beside the contract because
 * `packages/shared-types` has no Node type definitions and must stay free of
 * I/O — every module there is a pure contract. Adding `@types/node` to read one
 * file would be a dependency change WP-G is not authorized to make, and
 * inlining a copy of the fixture would create the second truth the whole
 * package exists to avoid.
 */
const FIXTURE_PATH = new URL(
  "../../../content/fixtures/curriculum-architecture-example.json",
  import.meta.url
);

function fixtureValue(): unknown {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
}

function parsedFixture(): CurriculumDocument {
  const result = parseCurriculumDocument(fixtureValue());
  if (!result.valid) {
    throw new Error(`fixture is invalid:\n  ${result.errors.join("\n  ")}`);
  }
  return result.document;
}

/** The fixture with one mutation applied, for negative cases. */
function mutate(apply: (draft: Record<string, unknown>) => void): unknown {
  const draft = fixtureValue() as Record<string, unknown>;
  apply(draft);
  return draft;
}

function errorsFrom(value: unknown): readonly string[] {
  const result = parseCurriculumDocument(value);
  if (result.valid) throw new Error("expected the document to be rejected");
  return result.errors;
}

function expectRejected(value: unknown, fragment: string): void {
  const errors = errorsFrom(value);
  expect(
    errors.some((error) => error.includes(fragment)),
    `expected an error containing "${fragment}", received:\n  ${errors.join("\n  ")}`
  ).toBe(true);
}

/* ------------------------------------------------------------------ *
 * The fixture
 * ------------------------------------------------------------------ */

describe("the architecture fixture", () => {
  it("is a valid curriculum document", () => {
    const result = parseCurriculumDocument(fixtureValue());
    if (!result.valid) {
      throw new Error(`fixture is invalid:\n  ${result.errors.join("\n  ")}`);
    }
    expect(result.valid).toBe(true);
  });

  it("exercises every approved step type", () => {
    const types = parsedFixture()
      .missions.flatMap((mission) => mission.steps)
      .map((step) => step.content.type);

    for (const type of MISSION_STEP_TYPES) {
      expect(types).toContain(type);
    }
  });

  it("exercises both competency relationships", () => {
    const relationships = parsedFixture()
      .missions.flatMap((mission) => mission.competencies)
      .map((link) => link.relationship);

    for (const relationship of MISSION_COMPETENCY_RELATIONSHIPS) {
      expect(relationships).toContain(relationship);
    }
  });

  it("declares a competency prerequisite and an explicit prerequisite rule", () => {
    const document = parsedFixture();
    expect(document.competencyPrerequisites.length).toBeGreaterThan(0);
    expect(document.prerequisiteRules.length).toBeGreaterThan(0);
  });

  it("is marked as a fixture and is therefore not publishable", () => {
    const document = parsedFixture();
    expect(document.documentKind).toBe("architecture_fixture");
    expect(isPublishableDocumentKind(document.documentKind)).toBe(false);
  });

  it("carries code-looking instructional text without being rejected", () => {
    // DEC-057: the platform must be able to teach shell, HTML and security
    // material. Structural validation judges structure, never resemblance.
    const serialised = JSON.stringify(parsedFixture());
    expect(serialised).toContain("<section>");
    expect(serialised).toContain("ip -br addr show");
  });
});

/* ------------------------------------------------------------------ *
 * Vocabulary agreement
 * ------------------------------------------------------------------ */

describe("the document reuses the established vocabularies", () => {
  it("uses the same stable-id grammar as mission steps", () => {
    expect(CURRICULUM_DOCUMENT_STABLE_ID.source).toBe(
      MISSION_STEP_STABLE_ID.source
    );
  });

  it("lists exactly the two document kinds", () => {
    expect([...CURRICULUM_DOCUMENT_KINDS]).toEqual([
      "production",
      "architecture_fixture"
    ]);
  });

  it("lists exactly the prerequisite target node types the table allows", () => {
    expect([...PREREQUISITE_TARGET_NODE_TYPES]).toEqual([
      "course",
      "module",
      "mission"
    ]);
  });

  it("lists exactly the prerequisite requirement types the table allows", () => {
    expect([...CURRICULUM_PREREQUISITE_REQUIREMENT_TYPES].sort()).toEqual(
      [
        "competency",
        "content_completion",
        "equivalent_competency",
        "readiness_assessment"
      ].sort()
    );
  });

  it("only accepts the authorable asset vocabulary", () => {
    for (const unauthorable of ["lab", "assessment", "video"]) {
      expect([...CURRICULUM_AUTHORABLE_ASSET_TYPES]).not.toContain(
        unauthorable
      );
      expectRejected(
        mutate((draft) => {
          const missions = draft.missions as Array<Record<string, unknown>>;
          const assets = missions[0]?.assets as Array<Record<string, unknown>>;
          if (assets[0]) assets[0].assetType = unauthorable;
        }),
        "is not authorable"
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * Shape and unknown fields
 * ------------------------------------------------------------------ */

describe("strict shape", () => {
  it("rejects a non-object document", () => {
    expectRejected("not a document", "document must be an object");
    expectRejected(null, "document must be an object");
    expectRejected([], "document must be an object");
  });

  it("rejects an unknown top-level field", () => {
    expectRejected(
      mutate((draft) => {
        draft.notes = "an escape hatch";
      }),
      'document carries an unknown field "notes"'
    );
  });

  it("rejects the _note convention explicitly", () => {
    // Architect Decision 2: no free-form metadata escape hatch. An ignored
    // field is a place for instructions to hide.
    expectRejected(
      mutate((draft) => {
        draft._note = "authoring aside";
      }),
      'unknown field "_note"'
    );
  });

  it("rejects an unknown field on a nested node", () => {
    expectRejected(
      mutate((draft) => {
        (draft.course as Record<string, unknown>).subtitle = "extra";
      }),
      'course carries an unknown field "subtitle"'
    );
  });

  it("rejects a misspelled optional field rather than ignoring it", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const assets = missions[0]?.assets as Array<Record<string, unknown>>;
        if (assets[0]) {
          delete assets[0].altText;
          assets[0].altTxt = "a typo that must not pass";
        }
      }),
      'unknown field "altTxt"'
    );
  });

  it("rejects a missing required field", () => {
    expectRejected(
      mutate((draft) => {
        delete (draft.course as Record<string, unknown>).title;
      }),
      'course is missing "title"'
    );
  });

  it("rejects a missing documentKind", () => {
    expectRejected(
      mutate((draft) => {
        delete draft.documentKind;
      }),
      'document is missing "documentKind"'
    );
  });

  it("rejects an unrecognised documentKind", () => {
    expectRejected(
      mutate((draft) => {
        draft.documentKind = "draft";
      }),
      "documentKind must be production or architecture_fixture"
    );
  });
});

/* ------------------------------------------------------------------ *
 * No coercion
 * ------------------------------------------------------------------ */

describe("nothing is silently repaired", () => {
  it("rejects a numeric string where a number belongs", () => {
    expectRejected(
      mutate((draft) => {
        (draft.course as Record<string, unknown>).position = "0";
      }),
      "course.position must be a non-negative integer"
    );
  });

  it("rejects a fractional position", () => {
    expectRejected(
      mutate((draft) => {
        (draft.course as Record<string, unknown>).position = 1.5;
      }),
      "must be a non-negative integer"
    );
  });

  it("rejects a negative position", () => {
    expectRejected(
      mutate((draft) => {
        (draft.course as Record<string, unknown>).position = -1;
      }),
      "must be a non-negative integer"
    );
  });

  it("rejects a whitespace-only title rather than trimming it into absence", () => {
    expectRejected(
      mutate((draft) => {
        (draft.course as Record<string, unknown>).title = "   ";
      }),
      "course.title must not be empty"
    );
  });

  it("rejects a string where a boolean belongs", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const links = missions[0]?.competencies as Array<
          Record<string, unknown>
        >;
        if (links[0]) links[0].required = "true";
      }),
      "must be true or false"
    );
  });

  it("rejects an object where an array belongs", () => {
    expectRejected(
      mutate((draft) => {
        draft.modules = { first: {} };
      }),
      "document.modules must be an array"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Identity and ordering
 * ------------------------------------------------------------------ */

describe("identity and ordering", () => {
  it("rejects an invalid stable id", () => {
    expectRejected(
      mutate((draft) => {
        (draft.course as Record<string, unknown>).stableId = "Not Valid!";
      }),
      "is not a valid stable id"
    );
  });

  it("rejects a duplicate module identity", () => {
    expectRejected(
      mutate((draft) => {
        const modules = draft.modules as Array<Record<string, unknown>>;
        if (modules[1] && modules[0]) modules[1].stableId = modules[0].stableId;
      }),
      "duplicate stable id"
    );
  });

  it("rejects an identity reused across node kinds", () => {
    expectRejected(
      mutate((draft) => {
        const modules = draft.modules as Array<Record<string, unknown>>;
        if (modules[0]) {
          modules[0].stableId = (draft.course as Record<string, unknown>)
            .stableId;
        }
      }),
      "document node identities declares a duplicate stable id"
    );
  });

  it("rejects duplicate module positions", () => {
    expectRejected(
      mutate((draft) => {
        const modules = draft.modules as Array<Record<string, unknown>>;
        if (modules[1]) modules[1].position = 0;
      }),
      "modules declares a duplicate position"
    );
  });

  it("rejects duplicate mission positions within one module", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        if (missions[1] && missions[0]) {
          missions[1].moduleStableId = missions[0].moduleStableId;
        }
      }),
      "declares a duplicate position"
    );
  });

  it("rejects duplicate step positions within one mission", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const steps = missions[0]?.steps as Array<Record<string, unknown>>;
        if (steps[1]) steps[1].position = 0;
      }),
      "steps declares a duplicate position"
    );
  });

  it("rejects duplicate step identities within one mission", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const steps = missions[0]?.steps as Array<Record<string, unknown>>;
        if (steps[1] && steps[0]) steps[1].stableId = steps[0].stableId;
      }),
      "steps declares a duplicate stable id"
    );
  });
});

/* ------------------------------------------------------------------ *
 * References
 * ------------------------------------------------------------------ */

describe("cross references", () => {
  it("rejects a mission naming an unknown module", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        if (missions[0]) missions[0].moduleStableId = "no-such-module";
      }),
      "references an unknown module"
    );
  });

  it("rejects a mission naming an unknown competency", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const links = missions[0]?.competencies as Array<
          Record<string, unknown>
        >;
        if (links[0]) links[0].competencyStableId = "no.such-competency";
      }),
      "references an unknown competency"
    );
  });

  it("rejects a module with no mission", () => {
    expectRejected(
      mutate((draft) => {
        const modules = draft.modules as Array<Record<string, unknown>>;
        modules.push({
          stableId: "arch-fixture-mod-3",
          title: "Empty",
          description: "A module with no mission.",
          position: 2
        });
      }),
      "contains no mission"
    );
  });

  it("rejects a mission with no required competency", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const links = missions[0]?.competencies as Array<
          Record<string, unknown>
        >;
        for (const link of links) link.required = false;
      }),
      "must map to at least one required competency"
    );
  });

  it("rejects a competency mapped to no mission", () => {
    expectRejected(
      mutate((draft) => {
        const competencies = draft.competencies as Array<
          Record<string, unknown>
        >;
        competencies.push({
          stableId: "arch.fixture-orphan",
          title: "Orphan",
          description: "Never mapped to a mission."
        });
      }),
      "never mapped to a mission"
    );
  });

  it("rejects a step naming an asset not authored on its mission", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const steps = missions[0]?.steps as Array<Record<string, unknown>>;
        const diagram = steps.find(
          (step) =>
            (step.content as Record<string, unknown>).type === "diagram"
        );
        if (diagram) {
          (diagram.content as Record<string, unknown>).assetStableId =
            "no-such-asset";
        }
      }),
      "references an asset that is not authored on this mission"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Prerequisites
 * ------------------------------------------------------------------ */

describe("prerequisites", () => {
  it("rejects a competency prerequisite naming an unknown competency", () => {
    expectRejected(
      mutate((draft) => {
        const edges = draft.competencyPrerequisites as Array<
          Record<string, unknown>
        >;
        if (edges[0]) edges[0].prerequisiteCompetencyStableId = "no.such-thing";
      }),
      "references an unknown prerequisite competency"
    );
  });

  it("rejects a competency requiring itself", () => {
    expectRejected(
      mutate((draft) => {
        const edges = draft.competencyPrerequisites as Array<
          Record<string, unknown>
        >;
        if (edges[0]) {
          edges[0].prerequisiteCompetencyStableId =
            edges[0].competencyStableId;
        }
      }),
      "cannot require itself"
    );
  });

  it("rejects a competency prerequisite cycle", () => {
    expectRejected(
      mutate((draft) => {
        const edges = draft.competencyPrerequisites as Array<
          Record<string, unknown>
        >;
        edges.push({
          competencyStableId: "arch.fixture-primary",
          prerequisiteCompetencyStableId: "arch.fixture-secondary"
        });
      }),
      "cycle"
    );
  });

  it("detects a cycle without recursing on a long chain", () => {
    const document = parsedFixture();
    const long: CurriculumDocument = {
      ...document,
      competencyPrerequisites: Array.from({ length: 5000 }, (_, index) => ({
        competencyStableId: `c${index}`,
        prerequisiteCompetencyStableId: `c${index + 1}`
      }))
    };

    expect(hasDocumentCompetencyPrerequisiteCycle(long)).toBe(false);
  });

  it("rejects a rule targeting a node outside the document", () => {
    expectRejected(
      mutate((draft) => {
        const rules = draft.prerequisiteRules as Array<Record<string, unknown>>;
        if (rules[0]) rules[0].targetStableId = "no-such-mission";
      }),
      "targets a mission that is not in this document"
    );
  });

  it("rejects a rule requiring a competency outside the document", () => {
    expectRejected(
      mutate((draft) => {
        const rules = draft.prerequisiteRules as Array<Record<string, unknown>>;
        if (rules[0]) {
          rules[0].requirementType = "competency";
          rules[0].requirementStableId = "no.such-competency";
        }
      }),
      "requires a competency that is not in this document"
    );
  });

  it("rejects an unrecognised requirement type", () => {
    expectRejected(
      mutate((draft) => {
        const rules = draft.prerequisiteRules as Array<Record<string, unknown>>;
        if (rules[0]) rules[0].requirementType = "vibes";
      }),
      "requirementType must be"
    );
  });

  it("rejects a rule with no explanation", () => {
    expectRejected(
      mutate((draft) => {
        const rules = draft.prerequisiteRules as Array<Record<string, unknown>>;
        if (rules[0]) rules[0].explanation = "";
      }),
      "explanation must not be empty"
    );
  });

  it("accepts a readiness_assessment requirement without resolving it", () => {
    // Assessment authoring is deferred, so no document can declare the
    // assessment it names. Requiring resolution would make a legitimate rule
    // unauthorable; grammar is checked and existence is not claimed.
    const result = parseCurriculumDocument(
      mutate((draft) => {
        const rules = draft.prerequisiteRules as Array<Record<string, unknown>>;
        if (rules[0]) {
          rules[0].requirementType = "readiness_assessment";
          rules[0].requirementStableId = "arch.fixture-readiness";
        }
      })
    );

    expect(result.valid).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Mission steps
 * ------------------------------------------------------------------ */

describe("mission steps", () => {
  function withStepContent(content: unknown): unknown {
    return mutate((draft) => {
      const missions = draft.missions as Array<Record<string, unknown>>;
      const steps = missions[0]?.steps as Array<Record<string, unknown>>;
      if (steps[0]) steps[0].content = content;
    });
  }

  it("rejects an unapproved step type", () => {
    expectRejected(
      withStepContent({ type: "video", uri: "https://example.test/v.mp4" }),
      "is not an approved step type"
    );
  });

  it("rejects an unknown field inside step content", () => {
    expectRejected(
      withStepContent({
        type: "concept",
        paragraphs: ["Fine."],
        renderAs: "html"
      }),
      'unknown field "renderAs"'
    );
  });

  it("rejects a payload that does not match its declared type", () => {
    expectRejected(
      withStepContent({ type: "concept", command: "ls" }),
      "unknown field"
    );
  });

  it("rejects an unregistered interaction type at authoring time", () => {
    // CURR-011 s13: an unregistered interaction type is a hard publication
    // failure. The document never parses, so the publication command never
    // receives a document to write.
    const result = parseCurriculumDocument(
      withStepContent({
        type: "interaction",
        interactionStableId: "fixture-packet-journey",
        interactionType: "subnet_slider",
        sourceKind: "authored_teaching",
        supportLevel: "show_me",
        parameters: { interactionType: "subnet_slider" },
        textEquivalent: "E"
      })
    );

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.join(" ")).toContain("not a registered interaction type");
  });

  it("rejects a live_lab interaction until its adapter exists", () => {
    const result = parseCurriculumDocument(
      withStepContent({
        type: "interaction",
        interactionStableId: "fixture-packet-journey",
        interactionType: "packet_journey",
        sourceKind: "live_lab",
        supportLevel: "show_me",
        parameters: {
          interactionType: "packet_journey",
          nodes: [
            {
              nodeId: "pc-a",
              label: "PC-A",
              role: "host",
              interfaces: []
            }
          ],
          links: [],
          traffic: {
            label: "a request",
            sourceNodeId: "pc-a",
            destinationNodeId: "pc-a",
            startActionLabel: "Send it"
          },
          stages: [
            {
              stageId: "s1",
              atNodeId: "pc-a",
              narration: "It leaves.",
              outcome: "proceeds"
            }
          ],
          actions: [],
          confirmation: { narration: "Arrived.", summary: "Done." }
        },
        textEquivalent: "E"
      })
    );

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.join(" ")).toContain("WP-K");
  });

  it("rejects an unknown field inside interaction parameters", () => {
    // The document parser cannot reach inside `parameters`; the registry's own
    // validator does the deep rejection. This proves the two are connected.
    const result = parseCurriculumDocument(
      withStepContent({
        type: "interaction",
        interactionStableId: "fixture-packet-journey",
        interactionType: "packet_journey",
        sourceKind: "authored_teaching",
        supportLevel: "show_me",
        parameters: {
          interactionType: "packet_journey",
          routingTable: [],
          nodes: [
            { nodeId: "pc-a", label: "PC-A", role: "host", interfaces: [] }
          ],
          links: [],
          traffic: {
            label: "a request",
            sourceNodeId: "pc-a",
            destinationNodeId: "pc-a",
            startActionLabel: "Send it"
          },
          stages: [
            {
              stageId: "s1",
              atNodeId: "pc-a",
              narration: "It leaves.",
              outcome: "proceeds"
            }
          ],
          actions: [],
          confirmation: { narration: "Arrived.", summary: "Done." }
        },
        textEquivalent: "E"
      })
    );

    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.errors.join(" ")).toContain('unknown field "routingTable"');
  });

  it("rejects a diagram with no text alternative", () => {
    expectRejected(
      withStepContent({
        type: "diagram",
        assetStableId: "fixture-topology"
      }),
      "text alternative"
    );
  });

  it("rejects a step whose stable id is invalid", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const steps = missions[0]?.steps as Array<Record<string, unknown>>;
        if (steps[0]) steps[0].stableId = "NO";
      }),
      "is not a valid stable id"
    );
  });

  it("accepts every listed content key for its type", () => {
    // Pins the unknown-key table against the contract it mirrors: a key removed
    // from mission-steps.ts makes one of these fail to validate.
    const complete: Record<string, unknown> = {
      concept: { type: "concept", title: "T", paragraphs: ["P"] },
      diagram: {
        type: "diagram",
        assetStableId: "fixture-topology",
        caption: "C",
        textAlternative: "A"
      },
      command: {
        type: "command",
        command: "ls",
        output: "a",
        language: "shell",
        caption: "C"
      },
      prediction: {
        type: "prediction",
        prompt: "P",
        options: ["a"],
        expectedOutcome: "a"
      },
      interaction: {
        type: "interaction",
        interactionStableId: "fixture-packet-journey",
        interactionType: "packet_journey",
        sourceKind: "authored_teaching",
        supportLevel: "show_me",
        // The smallest parameter block the registry accepts: one device, no
        // fault and therefore no repair action. This test proves the KEYS are
        // all accepted, so the values only have to be valid.
        parameters: {
          interactionType: "packet_journey",
          nodes: [
            {
              nodeId: "pc-a",
              label: "PC-A",
              role: "host",
              interfaces: [
                {
                  interfaceId: "pc-a-eth0",
                  label: "eth0",
                  attributes: [{ label: "IP address", value: "10.0.0.5/24" }]
                }
              ]
            }
          ],
          links: [],
          traffic: {
            label: "an echo request",
            sourceNodeId: "pc-a",
            destinationNodeId: "pc-a",
            startActionLabel: "Send it"
          },
          stages: [
            {
              stageId: "s1",
              atNodeId: "pc-a",
              narration: "PC-A sends the request.",
              decision: "It is on the local network.",
              outcome: "proceeds",
              prediction: { prompt: "What next?", options: ["a", "b"] }
            }
          ],
          actions: [],
          confirmation: { narration: "It arrives.", summary: "Done." }
        },
        textEquivalent: "E",
        caption: "C"
      },
      practice: {
        type: "practice",
        assessmentStableId: "arch.fixture-practice",
        framing: "F"
      },
      reference: {
        type: "reference",
        label: "L",
        assetStableId: "fixture-topology",
        note: "N"
      }
    };

    expect(Object.keys(complete).sort()).toEqual([...MISSION_STEP_TYPES].sort());

    for (const [type, content] of Object.entries(complete)) {
      const result = parseCurriculumDocument(withStepContent(content));
      if (!result.valid) {
        throw new Error(
          `${type} with every listed key was rejected:\n  ${result.errors.join("\n  ")}`
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * Assets
 * ------------------------------------------------------------------ */

describe("curriculum assets", () => {
  function mutateAsset(
    apply: (asset: Record<string, unknown>) => void
  ): unknown {
    return mutate((draft) => {
      const missions = draft.missions as Array<Record<string, unknown>>;
      const assets = missions[0]?.assets as Array<Record<string, unknown>>;
      if (assets[0]) apply(assets[0]);
    });
  }

  it("rejects a visual asset with no alt text", () => {
    expectRejected(
      mutateAsset((asset) => {
        delete asset.altText;
      }),
      "alt"
    );
  });

  it("rejects a relative uri", () => {
    expectRejected(
      mutateAsset((asset) => {
        asset.uri = "/fixtures/topology.svg";
      }),
      "absolute http or https URL"
    );
  });

  it("rejects a whitespace-padded uri rather than trimming it", () => {
    expectRejected(
      mutateAsset((asset) => {
        asset.uri = " https://example.test/fixtures/topology.svg";
      }),
      "absolute http or https URL"
    );
  });

  it("rejects a duplicate asset identity within one mission", () => {
    expectRejected(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        const assets = missions[0]?.assets as Array<Record<string, unknown>>;
        if (assets[0]) {
          assets.push({ ...assets[0], position: 1 });
        }
      }),
      "assets declares a duplicate stable id"
    );
  });
});

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

describe("error reporting", () => {
  it("reports every problem rather than only the first", () => {
    const errors = errorsFrom(
      mutate((draft) => {
        (draft.course as Record<string, unknown>).title = "";
        (draft.course as Record<string, unknown>).position = "0";
        draft.extraneous = true;
      })
    );

    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("names the offending node so an author can find it", () => {
    const errors = errorsFrom(
      mutate((draft) => {
        const missions = draft.missions as Array<Record<string, unknown>>;
        if (missions[0]) missions[0].title = "";
      })
    );

    expect(
      errors.some((error) =>
        error.includes("arch-fixture-m1-every-step-type")
      )
    ).toBe(true);
  });
});
