import { describe, expect, it } from "vitest";
import {
  AI_TUTOR_CALLING_ENGINE,
  AI_TUTOR_PRIVACY_CLASSES,
  AI_TUTOR_REQUEST_CONTRACT_VERSION,
  AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS,
  AI_TUTOR_TASK_TYPES,
  TUTOR_MAX_NOTE_EXCERPTS,
  TUTOR_NOTE_EXCERPT_MAX_LENGTH,
  TUTOR_QUESTION_MAX_LENGTH,
  TUTOR_REQUEST_REJECTIONS,
  assembleTutorRequest,
  containsForbiddenTutorInputField,
  describeTutorRequestRejection,
  isTutorTaskType,
  mayIncludeInTutorContext,
  screenTutorQuestion,
  type TutorRequestAssemblyContext,
  type TutorRequestInput,
  type TutorRequestRejection
} from "./ai-tutor-request";
import { TUTOR_LAB_ATTESTATION_SOURCE } from "./ai-tutor-boundaries";

/**
 * The versioned Tutor request contract.
 *
 * SCOPE OF THIS EVIDENCE: contract-level proofs over a pure module. They
 * establish that a malformed, credential-bearing, cross-learner or
 * authority-asserting request is refused BEFORE a provider could be reached,
 * and that server-resolved state cannot be supplied by a client. They do not
 * prove live PostgreSQL row level security — note ownership is an input here,
 * and the caller-scoped read that produces it is proven in the API tests.
 */

const FAKE_PROVIDER_KEY = ["sk", "z".repeat(32)].join("-");

const OWN_NOTE = "note-owned-by-caller";
const OTHER_NOTE = "note-owned-by-another-learner";

function input(overrides: Partial<TutorRequestInput> = {}): TutorRequestInput {
  return {
    contractVersion: AI_TUTOR_REQUEST_CONTRACT_VERSION,
    taskType: "explain_concept",
    question: "Why does the trunk link stay down?",
    lesson: {
      courseStableId: "networking-foundations",
      moduleStableId: "module-1",
      missionStableId: "mission-2",
      missionVersion: 3
    },
    position: { stepStableId: "step-4", sceneId: "scene-1" },
    groundingRefs: [{ kind: "lesson_text", segmentStableId: "step-4" }],
    correlationId: "corr-1",
    ...overrides
  };
}

function context(
  overrides: Partial<TutorRequestAssemblyContext> = {}
): TutorRequestAssemblyContext {
  return {
    requestId: "req-1",
    issuedAt: "2026-10-05T10:00:00.000Z",
    noteOwnership: [
      { noteId: OWN_NOTE, ownership: "owned" },
      { noteId: OTHER_NOTE, ownership: "not_owned" }
    ],
    ...overrides
  };
}

function expectRefusal(
  result: ReturnType<typeof assembleTutorRequest>,
  rejection: TutorRequestRejection
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.refusal.rejection).toBe(rejection);
    expect(result.refusal.learnerMessage.length).toBeGreaterThan(10);
  }
}

describe("the contract is versioned and its vocabularies are closed", () => {
  it("stamps the contract version", () => {
    expect(AI_TUTOR_REQUEST_CONTRACT_VERSION).toBe("ai-tutor-request-v1");
  });

  it("names exactly the approved task types", () => {
    expect(AI_TUTOR_TASK_TYPES).toEqual([
      "explain_concept",
      "explain_step",
      "explain_practice_prompt",
      "explain_lab_failure",
      "general_question"
    ]);
    expect(isTutorTaskType("draft_curriculum")).toBe(false);
    expect(isTutorTaskType("explain_concept")).toBe(true);
  });

  it("names exactly the two privacy classes a Tutor request can be", () => {
    expect(AI_TUTOR_PRIVACY_CLASSES).toEqual([
      "lesson_context",
      "learner_private_content"
    ]);
  });

  it("admits exactly one calling engine", () => {
    expect(AI_TUTOR_CALLING_ENGINE).toBe("learning");
  });

  it("gives every rejection a plain-language learner message", () => {
    for (const rejection of TUTOR_REQUEST_REJECTIONS) {
      const message = describeTutorRequestRejection(rejection);

      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/[<>{}]/);
    }
  });
});

describe("a valid request normalizes", () => {
  it("assembles the normalized contract", () => {
    const result = assembleTutorRequest(input(), context());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.request).toEqual({
      contractVersion: "ai-tutor-request-v1",
      requestId: "req-1",
      correlationId: "corr-1",
      callingEngine: "learning",
      taskType: "explain_concept",
      privacyClass: "lesson_context",
      question: "Why does the trunk link stay down?",
      lesson: {
        courseStableId: "networking-foundations",
        moduleStableId: "module-1",
        missionStableId: "mission-2",
        missionVersion: 3
      },
      position: { stepStableId: "step-4", sceneId: "scene-1" },
      groundingRefs: [{ kind: "lesson_text", segmentStableId: "step-4" }],
      noteExcerpts: [],
      labState: { availability: "unavailable", reason: "unknown" },
      presentation: { explanationDepth: "concise", languageRegister: "default" },
      issuedAt: "2026-10-05T10:00:00.000Z"
    });
  });

  it("collapses whitespace in the question", () => {
    const result = assembleTutorRequest(
      input({ question: "  Why   does\nthis fail?  " }),
      context()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.question).toBe("Why does this fail?");
    }
  });

  it("defaults to a concise answer when no preference was sent", () => {
    const result = assembleTutorRequest(input(), context());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.presentation.explanationDepth).toBe("concise");
    }
  });

  it("honours an approved deeper preference", () => {
    const result = assembleTutorRequest(
      input({
        presentation: {
          explanationDepth: "deeper",
          languageRegister: "plain_language"
        }
      }),
      context()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.presentation).toEqual({
        explanationDepth: "deeper",
        languageRegister: "plain_language"
      });
    }
  });

  it("accepts a question with no lesson references at all", () => {
    const result = assembleTutorRequest(
      input({ groundingRefs: [] }),
      context()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.groundingRefs).toEqual([]);
    }
  });
});

describe("a malformed request fails closed", () => {
  it("refuses an unsupported contract version", () => {
    expectRefusal(
      assembleTutorRequest(
        input({ contractVersion: "ai-tutor-request-v0" }),
        context()
      ),
      "contract_version_unsupported"
    );
  });

  it("refuses a non-object input", () => {
    for (const hostile of [null, undefined, "ask", 7]) {
      const result = assembleTutorRequest(
        hostile as unknown as TutorRequestInput,
        context()
      );
      expect(result.ok).toBe(false);
    }
  });

  it("refuses an unsupported task type", () => {
    expectRefusal(
      assembleTutorRequest(input({ taskType: "draft_curriculum" }), context()),
      "task_type_unsupported"
    );
  });

  it("refuses an empty question", () => {
    expectRefusal(
      assembleTutorRequest(input({ question: "   " }), context()),
      "question_missing"
    );
  });

  it("refuses an oversized question", () => {
    expectRefusal(
      assembleTutorRequest(
        input({ question: "a".repeat(TUTOR_QUESTION_MAX_LENGTH + 1) }),
        context()
      ),
      "question_too_long"
    );
  });

  it("refuses a request with no lesson identity", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          lesson: {
            courseStableId: "",
            missionStableId: "mission-2",
            missionVersion: 3
          }
        }),
        context()
      ),
      "lesson_identity_missing"
    );
  });

  it("refuses an invalid mission version", () => {
    for (const version of [0, -1, 1.5, "three", null]) {
      expectRefusal(
        assembleTutorRequest(
          input({
            lesson: {
              courseStableId: "networking-foundations",
              missionStableId: "mission-2",
              missionVersion: version
            }
          }),
          context()
        ),
        "lesson_version_invalid"
      );
    }
  });

  it("refuses a request with no correlation id", () => {
    expectRefusal(
      assembleTutorRequest(input({ correlationId: "  " }), context()),
      "correlation_id_missing"
    );
  });

  it("refuses a request with no request id", () => {
    expectRefusal(
      assembleTutorRequest(input(), context({ requestId: "" })),
      "request_id_missing"
    );
  });

  it("refuses an unapproved context type", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          groundingRefs: [{ kind: "answer_key", segmentStableId: "a1" }]
        }),
        context()
      ),
      "context_type_unsupported"
    );
  });

  /**
   * A client that supplies authored text is trying to become the curriculum.
   * The grounding normalizer refuses it, and that surfaces here as an
   * unsupported context type rather than as silently-ignored input.
   */
  it("refuses a reference that carries its own lesson text", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          groundingRefs: [
            {
              kind: "lesson_text",
              segmentStableId: "step-4",
              text: "VLANs do not exist."
            }
          ]
        }),
        context()
      ),
      "context_type_unsupported"
    );
  });
});

describe("a client cannot assert identity, authority or lab state", () => {
  it("holds the forbidden-input prohibition as data", () => {
    for (const field of [
      "userId",
      "labState",
      "labPassed",
      "masteryGranted",
      "score",
      "privacyClass",
      "provider",
      "model",
      "disclosureState",
      "supportLevelOverride",
      "systemPrompt",
      "lessonText",
      "callingEngine"
    ]) {
      expect(AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS).toContain(field);
    }
  });

  for (const field of [
    "userId",
    "learnerId",
    "labState",
    "labPassed",
    "masteryGranted",
    "score",
    "privacyClass",
    "provider",
    "model",
    "apiKey",
    "accessToken",
    "disclosureState",
    "supportLevelOverride",
    "systemPrompt",
    "lessonText"
  ]) {
    it(`refuses an input asserting ${field}`, () => {
      expectRefusal(
        assembleTutorRequest(
          { ...input(), [field]: "asserted" } as TutorRequestInput,
          context()
        ),
        "forbidden_input_field"
      );
    });
  }

  it("refuses a forbidden field nested inside the lesson identity", () => {
    expectRefusal(
      assembleTutorRequest(
        {
          ...input(),
          lesson: {
            courseStableId: "networking-foundations",
            missionStableId: "mission-2",
            missionVersion: 3,
            userId: "learner-1"
          }
        } as unknown as TutorRequestInput,
        context()
      ),
      "forbidden_input_field"
    );
  });

  it("refuses rather than ignores, so no field silently has no effect", () => {
    const result = assembleTutorRequest(
      { ...input(), model: "gpt-nonexistent" } as TutorRequestInput,
      context()
    );

    expect(result.ok).toBe(false);
  });

  it("detects a forbidden field at any depth", () => {
    expect(containsForbiddenTutorInputField({ a: { b: { score: 1 } } })).toBe(
      true
    );
    expect(containsForbiddenTutorInputField([{ userId: "x" }])).toBe(true);
    expect(containsForbiddenTutorInputField({ MODEL: "x" })).toBe(true);
    expect(containsForbiddenTutorInputField({ question: "ok" })).toBe(false);
  });

  it("derives the privacy class rather than accepting one", () => {
    const result = assembleTutorRequest(
      input({
        noteExcerpts: [
          {
            noteId: OWN_NOTE,
            excerpt: "My own note about trunking.",
            includedByLearnerAction: true
          }
        ]
      }),
      context()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.privacyClass).toBe("learner_private_content");
    }
  });

  it("always stamps the calling engine itself", () => {
    const result = assembleTutorRequest(input(), context());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.callingEngine).toBe("learning");
    }
  });
});

describe("lab state reaches a request only from a deterministic attestation", () => {
  it("is unavailable when no attestation was supplied", () => {
    const result = assembleTutorRequest(input(), context());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.labState).toEqual({
        availability: "unavailable",
        reason: "unknown"
      });
    }
  });

  it("reports a specific unavailable reason when the caller knows one", () => {
    const result = assembleTutorRequest(
      input(),
      context({ labUnavailableReason: "not_connected" })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.labState).toEqual({
        availability: "unavailable",
        reason: "not_connected"
      });
    }
  });

  it("accepts a complete deterministic attestation", () => {
    const result = assembleTutorRequest(
      input(),
      context({
        labStateClaim: {
          source: TUTOR_LAB_ATTESTATION_SOURCE,
          sessionId: "session-1",
          validationRunId: "run-1",
          observedAt: "2026-10-05T09:59:00.000Z"
        }
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.labState.availability).toBe("available");
    }
  });

  it("represents an untrusted claim as unavailable rather than refusing the question", () => {
    const result = assembleTutorRequest(
      input(),
      context({
        labStateClaim: {
          source: "client",
          sessionId: "session-1",
          validationRunId: "run-1",
          observedAt: "2026-10-05T09:59:00.000Z"
        }
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.labState).toEqual({
        availability: "unavailable",
        reason: "not_attested"
      });
    }
  });
});

describe("a note excerpt needs learner action AND caller ownership", () => {
  const ownExcerpt = {
    noteId: OWN_NOTE,
    excerpt: "Trunk ports carry tagged frames.",
    includedByLearnerAction: true
  };

  it("includes the learner's own explicitly-included excerpt", () => {
    const result = assembleTutorRequest(
      input({ noteExcerpts: [ownExcerpt] }),
      context()
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request.noteExcerpts).toEqual([
        {
          noteId: OWN_NOTE,
          excerpt: "Trunk ports carry tagged frames.",
          includedByLearnerAction: true
        }
      ]);
    }
  });

  it("refuses an excerpt the learner did not explicitly include", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          noteExcerpts: [{ ...ownExcerpt, includedByLearnerAction: false }]
        }),
        context()
      ),
      "note_excerpt_missing_learner_action"
    );
  });

  it("refuses an excerpt with the inclusion flag absent entirely", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          noteExcerpts: [{ noteId: OWN_NOTE, excerpt: "text" }]
        }),
        context()
      ),
      "note_excerpt_missing_learner_action"
    );
  });

  /**
   * THE CROSS-LEARNER PROOF. The excerpt is well-formed, the learner explicitly
   * included it, and the note belongs to someone else. It is refused, and the
   * refusal message does not confirm that another learner's note exists.
   */
  it("refuses another learner's note", () => {
    const result = assembleTutorRequest(
      input({
        noteExcerpts: [
          {
            noteId: OTHER_NOTE,
            excerpt: "Another learner's private note.",
            includedByLearnerAction: true
          }
        ]
      }),
      context()
    );

    expectRefusal(result, "cross_learner_reference");
    if (!result.ok) {
      expect(result.refusal.learnerMessage).not.toContain("another learner");
      expect(result.refusal.learnerMessage).not.toContain(OTHER_NOTE);
    }
  });

  it("refuses an excerpt whose ownership could not be determined", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          noteExcerpts: [{ ...ownExcerpt, noteId: "note-unknown" }]
        }),
        context({
          noteOwnership: [
            { noteId: "note-unknown", ownership: "unavailable" }
          ]
        })
      ),
      "note_ownership_unavailable"
    );
  });

  /**
   * A caller that forgot to resolve ownership must not thereby bypass it. An
   * absent decision is treated exactly like an unavailable one.
   */
  it("refuses an excerpt with no ownership decision at all", () => {
    expectRefusal(
      assembleTutorRequest(
        input({ noteExcerpts: [ownExcerpt] }),
        context({ noteOwnership: [] })
      ),
      "note_ownership_unavailable"
    );
  });

  it("gives the same learner message whether the note was another's or unknown", () => {
    expect(describeTutorRequestRejection("cross_learner_reference")).toBe(
      describeTutorRequestRejection("note_ownership_unavailable")
    );
  });

  it("refuses an oversized excerpt", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          noteExcerpts: [
            {
              ...ownExcerpt,
              excerpt: "x".repeat(TUTOR_NOTE_EXCERPT_MAX_LENGTH + 1)
            }
          ]
        }),
        context()
      ),
      "note_excerpt_too_long"
    );
  });

  it("refuses more excerpts than minimum-necessary context allows", () => {
    expectRefusal(
      assembleTutorRequest(
        input({
          noteExcerpts: Array.from(
            { length: TUTOR_MAX_NOTE_EXCERPTS + 1 },
            () => ownExcerpt
          )
        }),
        context()
      ),
      "note_excerpt_limit_exceeded"
    );
  });

  it("refuses a malformed excerpt", () => {
    for (const hostile of [null, "text", 7, []]) {
      const result = assembleTutorRequest(
        input({ noteExcerpts: [hostile] }),
        context()
      );
      expect(result.ok).toBe(false);
    }
  });

  it("admits exactly one ownership outcome", () => {
    expect(mayIncludeInTutorContext({ noteId: "n", ownership: "owned" })).toBe(
      true
    );
    expect(
      mayIncludeInTutorContext({ noteId: "n", ownership: "not_owned" })
    ).toBe(false);
    expect(
      mayIncludeInTutorContext({ noteId: "n", ownership: "unavailable" })
    ).toBe(false);
    expect(mayIncludeInTutorContext(undefined)).toBe(false);
    expect(
      mayIncludeInTutorContext({
        noteId: "n",
        ownership: "probably_owned"
      } as never)
    ).toBe(false);
  });
});

describe("a credential-bearing request is refused, not redacted", () => {
  it("refuses a question containing a provider key", () => {
    const result = assembleTutorRequest(
      input({ question: `Why does ${FAKE_PROVIDER_KEY} not work?` }),
      context()
    );

    expectRefusal(result, "secret_detected");
    if (!result.ok) {
      expect(result.refusal.secretLabels).toContain("provider api key");
      expect(JSON.stringify(result.refusal)).not.toContain(FAKE_PROVIDER_KEY);
    }
  });

  it("refuses a note excerpt containing a credential", () => {
    const result = assembleTutorRequest(
      input({
        noteExcerpts: [
          {
            noteId: OWN_NOTE,
            excerpt: `I saved ${FAKE_PROVIDER_KEY} here.`,
            includedByLearnerAction: true
          }
        ]
      }),
      context()
    );

    expectRefusal(result, "secret_detected");
    if (!result.ok) {
      expect(JSON.stringify(result.refusal)).not.toContain(FAKE_PROVIDER_KEY);
    }
  });

  it("names the kind without echoing the value", () => {
    const result = assembleTutorRequest(
      input({ question: `token: ${"q".repeat(30)}` }),
      context()
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusal.rejection).toBe("secret_detected");
      expect(JSON.stringify(result.refusal)).not.toContain("q".repeat(30));
    }
  });

  it("screens a question before a request is assembled", () => {
    expect(screenTutorQuestion(FAKE_PROVIDER_KEY).detected).toBe(true);
    expect(screenTutorQuestion("Why is the trunk down?").detected).toBe(false);
  });

  it("leaves an ordinary technical question alone", () => {
    const result = assembleTutorRequest(
      input({ question: "What does show vlan brief output mean?" }),
      context()
    );

    expect(result.ok).toBe(true);
  });
});
