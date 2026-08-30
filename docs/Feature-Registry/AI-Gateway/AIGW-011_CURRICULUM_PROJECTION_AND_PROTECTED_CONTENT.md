# AIGW-011 — Curriculum Projection and Protected-Content Withholding

- **Feature ID:** AIGW-011
- **Feature Name:** Curriculum Projection and Protected-Content Withholding
- **Feature Level:** Level 1 — Core
- **Lifecycle Status:** Specified
- **Owning Platform Engine:** AI Gateway
- **Governing Company Operating System:** Platform Operating System
- **Product Owner:** Founder

---

# 1. Feature Summary

Curriculum Projection and Protected-Content Withholding defines **what authored
curriculum an AI request may contain**, and guarantees that protected
instructional content is **removed before AI context is constructed** rather than
sent with an instruction not to reveal it.

It is the boundary that lets a future AI Instructor change **how** approved
material is explained without ever becoming an authority over **what** is taught,
and without any instructional mode becoming a route to protected content.

This Feature specifies a projection contract. **It implements no AI Gateway
capability and connects no provider.**

---

# 2. Problem Statement

A future AI Instructor needs curriculum context to teach. Four things go wrong if
that context is assembled carelessly.

**Duplicated curriculum.** Hand-written lesson prompts become a second copy of
the course that drifts from the authored source. The curriculum stops being the
single source of truth for what is taught.

**Prompt-based secrecy.** Sending an authored fault, an expected path or an
assessment answer key and instructing the model not to reveal it is not a
boundary. The content is in the context; the instruction is a request. The
existing assessment security posture — `assessment_questions` has no
authenticated `SELECT` policy — would be defeated by a tutoring path that
retrieves the same material server-side.

**Mode mistaken for authority.** If a pedagogical mode such as review is treated
as an authorization state, then anything able to claim that mode can obtain
solutions. A mode describes what kind of help is being asked for. It is not
permission to receive protected content.

**Silent gap-filling.** A model that can explain a foundation the curriculum
never taught makes BEGINNER-COMPLETE-1 unverifiable. The gate judges authored
content; an AI that papers over a missing prerequisite hides exactly the defect
the gate exists to find.

---

# 3. Student Value

Students can eventually ask for the same approved material explained differently,
with examples, questions or a short refresher — without the platform quietly
handing them answers they are supposed to work out, and without the course
becoming whatever the model happens to say.

---

# 4. Founder Value

One projection contract governs every AI teaching capability. Protected content
is protected structurally, so neither a prompt-engineering mistake nor a
mislabelled instructional mode can expose an answer key, an authored fault or a
demonstration solution.

---

# 5. Curriculum Authority

- **Structured authored curriculum is authoritative for WHAT is taught.**
- **AI consumes an authorized projection of that curriculum to change HOW
  approved material is explained.**
- **AI does not become curriculum authority.**

AI may **not**:

- invent required curriculum;
- substitute for missing prerequisite instruction;
- manufacture competency;
- override or reinterpret deterministic validation.

**A concept absent from the authored curriculum is absent from the course.** The
BEGINNER-COMPLETE-1 gate judges authored content only, and an AI's ability to
explain a missing foundation must never be treated as satisfying it.

---

# 6. Included Scope

- The server-side curriculum projection contract for AI requests.
- The separation of instructional mode from disclosure authority.
- Per-step-type projection rules over the `CURR-010` vocabulary.
- Resolution of authoritative protection and disclosure state.
- Structural withholding of protected instructional content.
- The assessment-content exclusion.
- Fail-closed behaviour on any unresolvable authorization input.
- Integration points with the existing AI request, privacy and audit Features.

---

# 7. Explicitly Excluded Scope

- AI Gateway implementation, provider connection or model selection.
- Redefining `CURR-011`'s accessibility contract.
- Duplicating the interaction registry, the interaction parameter contract or the
  `ObservationModel`.
- Any authority over competency, evidence or deterministic validation.
- Any client-side withholding or disclosure mechanism.
- Prompt text, tutoring behaviour or pedagogy, which belong to the future
  AI Instructor capability.
- A general curriculum retrieval API for AI.

---

# 8. Server-Side Projection

**The server owns the projection. The client is not the withholding boundary.**

```text
authored curriculum
  + instructional mode
  + support level
  + authoritative protection/disclosure state
  → server-side projection (this Feature)
  → AIGW-001 request "approved context"
  → AIGW-005 privacy and secret screening
  → provider
```

Rules:

- **The provider and model receive only the content permitted for the current
  instructional context and disclosure state.**
- **Protected content is removed before AI context is constructed.** It is never
  sent accompanied by an instruction not to reveal it.
- A projection is computed from the authored source; it is never assembled from
  client-supplied content.
- The client may request a projection for a step; it may never supply one.

This Feature produces the "Approved context" already named in `AIGW-001`
section 3. It adds no second request mechanism.

---

# 9. Instructional Mode Is Not Disclosure Authority

This is the governing invariant of the Feature.

> **AI mode controls the pedagogical behaviour requested from the AI.**
> **Protection and disclosure state control what content the AI is authorized to
> receive.**
>
> **AI mode must never grant access to protected content.**

Consequences, each binding:

- **A learner being in a review mode does not, by itself, authorize disclosure
  of** expected paths, authored faults, solutions, expected prediction outcomes,
  assessment answers, answer-revealing interaction state, or any other protected
  instructional content.
- **The server resolves disclosure authority from authoritative platform state
  before constructing AI context.** Disclosure is decided per protected field,
  not per mode.
- **The client cannot assert or elevate disclosure permission.** A mode, a flag
  or a claim arriving from the client is an input to pedagogy, never to
  authorization.
- **If disclosure permission for a protected field cannot be established, that
  field remains withheld** — in every mode, including review.

`TEACH`, `GUIDE`, `CHALLENGE` and `REVIEW` are **modes**, not permission levels.
They describe the kind of help being requested. They are ordered by pedagogical
intent, not by privilege, and nothing in this Feature may treat a later mode as
conferring broader access.

---

# 10. Projection Rules by Step Type

Over the closed `CURR-010` vocabulary. Every cell is subject to section 9: where a
cell is conditional, the condition is **authoritative disclosure state**, never
the mode itself.

| Step type | TEACH | GUIDE | CHALLENGE | REVIEW | Protected demonstration |
|---|---|---|---|---|---|
| `concept` | Full | Full | Full | Full | **Withheld** |
| `diagram` | Full, including the authored text alternative | Full | Full | Full | **Withheld** |
| `command` | Full | Full | Full | Full | **Withheld** |
| `prediction` | **Prompt only** | Prompt only | Prompt only | **Prompt only, unless authoritative disclosure state permits the expected outcome** | **Withheld** |
| `interaction` | Setup and affordances only | Setup, affordances, permitted graduated hints | Setup only | **Setup and affordances per the applicable projection; protected fields only where authoritative disclosure state permits** | **Withheld** |
| `practice` | **Reference only** | Reference only | Reference only | **Reference only — no exception** | **Withheld** |
| `reference` | Full | Full | Full | Full | **Withheld** |

Reading the table:

- **Prompt only** — a `prediction` step's authored expected outcome is a separate
  authored field precisely so it can be dropped without dropping the step. It is
  projected **only when authoritative disclosure state permits it for that
  field**, and otherwise remains withheld in every mode.
- **Setup and affordances only** — an `interaction` step's expected path,
  authored fault, solution or review explanation are projected **only when
  authoritative disclosure state permits**, and otherwise remain withheld in
  every mode.
- **Reference only** — a `practice` step contributes its own framing text and the
  fact that a check exists, and never the referenced assessment's content. See
  section 12.
- **Withheld** — during protected demonstration, no instructional content from
  that mission is sent at all. See section 11.
- **Full**, where it appears, denotes step types that carry no protected
  answer or solution field. It is not a mode-based release of protected content.

**The same rule applies to any step type that can carry protected answer or
solution information**, including any type added in future: the protected field
is projected only under authoritative disclosure permission, never because of the
mode.

**Assessment question text, option text and answer keys are excluded from AI
projection at every mode and every disclosure state (section 12). There is no
review exception.**

---

# 11. Protected Demonstration and PROVE IT

During PROVE IT and protected demonstration:

- **AI tutoring and hints are unavailable.**
- **Answer-revealing instructional content is withheld before AI context is
  constructed** — not filtered afterwards, not suppressed by instruction.
- Expected paths, authored faults, solutions, hints, answer-revealing
  visualization state and other protected instructional clues **must not enter AI
  context** when the current support or protection state withholds them.

**What PROVE IT does not withhold.** The following are **not** instructional
clues merely because PROVE IT is active:

- the environment;
- the objective;
- legitimate operational tools;
- the learner's own observations;
- accessibility accommodations.

**PROVE IT withholds assistance, not the environment required to demonstrate
competency** (DEC-059). This Feature governs what reaches an AI provider. It
confers no authority over environment availability, which belongs to the Lab
Engine and the mission's lab contract.

---

# 12. Assessment Content

- **Assessment answers must never be routed into AI context.**
- Question text, option text and answer keys are outside every projection at
  **every instructional mode, every support level and every disclosure state.**
  **There is no review exception and no disclosure state that releases them.**
- A `practice` step projects its own framing text and the existence of a check.
  It never projects the referenced assessment's content.
- **The existing assessment security boundary is preserved, not weakened for
  tutoring convenience.** `assessment_questions` has no authenticated `SELECT`
  policy; a server-side AI path that retrieved the same material would defeat
  that control rather than respect it.
- **No AI path may retrieve protected answer material merely because the
  interface hides it.** Hidden in the UI and excluded from projection are
  different guarantees, and only the second one holds here.

---

# 13. Interaction Contract Boundary

`CURR-011` owns the shared interaction contract, its parameter validation, its
support-level projection and the `ObservationModel`. This Feature **consumes**
that contract and does not restate it.

- AI may receive only the interaction **setup and affordances** permitted by the
  current instructional state.
- AI must **not** receive expected paths, authored faults, solutions or other
  protected interaction state **unless authoritative disclosure state permits
  that specific field**. A review mode alone never permits it.
- **The interaction registry, the parameter contract and the `ObservationModel`
  are not duplicated in the AI Gateway.** A second copy would be a second truth
  and would drift.
- AI never adjudicates an interaction's outcome.

---

# 14. Accessibility and Narration Boundary

**`CURR-011` section 14 owns accessible interaction equivalence. This Feature
references that contract and does not redefine it.**

- **Accessibility must function with the AI Gateway unavailable or disabled.**
- **AI must never be required for the accessible interaction path.**
- **Narration and accessibility are a separate capability and a separate
  authority path from tutoring**, and must remain separate code paths with
  separate authorization.
- Presenting authorized, non-answer-revealing content accessibly is **not** the
  same as explaining or tutoring during evaluation. Reading an objective aloud is
  an accommodation; explaining what is wrong while the learner is being evaluated
  is tutoring.
- Narration renders authoritative authored content. It does not call this
  projection to obtain it.
- **Accessibility never widens disclosure.** An accessible presentation is
  subject to exactly the same protection and disclosure state as any other.

**Rationale.** If a screen-reader path depended on AI, accessibility would depend
on a non-deterministic, currently unimplemented, potentially unavailable system,
and would degrade silently. It must not.

---

# 15. Support Levels

The projection must honour the approved progression:

```text
SHOW ME → HELP ME → ASK ME → CHALLENGE ME → PROVE IT
```

**The server-side projection ensures the AI receives only what the current
support level permits.** The support level is resolved server-side from
authoritative state; it is never taken from the client.

Support-level withholding applies identically regardless of which presentation
the learner is using, consistent with `CURR-011` section 11.

Support level and instructional mode are independent inputs. Neither one may
release a protected field on its own; only authoritative disclosure state can
(section 9).

---

# 16. Fail-Closed Behaviour

**If the platform cannot determine whether content is permitted for AI
projection, protected content is not sent.**

An **unresolvable** value for any required authorization input fails closed. The
required inputs are:

- the instructional mode;
- the support level;
- the protection and disclosure state;
- the step type;
- any other input the contract requires to decide disclosure.

Rules:

- **Unknown or indeterminate authorization state yields no protected
  projection.** It never defaults to a broader AI context.
- **A safe, non-protected projection may remain available while a value is
  unresolved only when the contract can prove that omitting the unresolved value
  cannot broaden disclosure.** Where that cannot be proven, **return no
  projection.**
- **No best-effort projection may be constructed where disclosure is at risk.**
  A partially-authorized context is not an acceptable degradation.
- A projection failure degrades the AI capability. It must never degrade
  accessibility, narration, the learner's access to authored content, or the
  learner's access to the environment.
- Failing closed is the correct outcome and must be reported as a capability
  limitation, never as a content error.

---

# 17. Privacy and Secret Boundary

This Feature **integrates with** the existing AI Gateway privacy architecture and
creates no competing mechanism.

- `AIGW-001` — the projection populates the existing "approved context" field of
  the normalized request. No second request path.
- `AIGW-005` — privacy classification, redaction and secret screening remain in
  force and are **not weakened**. Curriculum projection runs **before** them;
  neither substitutes for the other.
- `AIGW-004` and `AIGW-008` — cost, usage and audit metadata are unchanged.
- Curriculum is published content, identical for every learner. **A projection
  carries no learner PII, no progress record and no evidence.**
- Minimum-necessary context applies: a projection carries the steps relevant to
  the request, not a course.

---

# 18. Failure Behavior

- Unresolvable authorization input → **fail closed**, no protected content sent
  (section 16).
- Projection unavailable → the AI capability is unavailable; authored content,
  narration, accessibility and the environment are unaffected.
- Gateway or provider unavailable → unchanged from `AIGW-006`; no fallback may
  widen the projection.
- **No failure mode may result in protected content being sent.**

---

# 19. Acceptance Criteria

## Platform can

- construct AI context from authored curriculum through one server-side
  projection.
- withhold protected instructional content **before** context construction.
- **decide disclosure per protected field from authoritative state, independently
  of the requested instructional mode.**
- **refuse a client-supplied mode or disclosure claim as a basis for access.**
- exclude assessment question, option and answer content at every mode, support
  level and disclosure state.
- resolve support level and instructional mode server-side.
- fail closed when any required authorization input is unresolvable.
- serve accessibility and narration with the AI Gateway disabled.

## Founder can

- see exactly what a given mode **and disclosure state** permit into AI context.
- disable AI teaching without affecting curriculum, accessibility or labs.

## Student can

- receive alternative explanations of approved material.
- rely on not being handed answers they are meant to work out, in any mode.
- use the accessible path whether or not AI is available.

---

# 20. Definition of Done

AIGW-011 is complete when:

- the server-side projection contract exists over the `CURR-010` step vocabulary.
- **instructional mode and disclosure authority are separate inputs, and mode
  alone can never release a protected field.**
- per-step-type projection rules are implemented and tested.
- protected content is provably removed before context construction.
- assessment content is excluded at every mode, support level and disclosure
  state.
- PROVE IT and protected demonstration withhold instructional assistance while
  leaving environment, objective, tools, observations and accommodations intact.
- any unresolvable authorization input fails closed.
- accessibility and narration are verified to work with the Gateway disabled.
- the interaction registry, parameter contract and `ObservationModel` are
  confirmed **not** duplicated here.
- integration with `AIGW-001` and `AIGW-005` is verified without weakening
  either.
- Founder approval is recorded.

**Tests must prove:**

- **review mode alone cannot release protected content** — the expected outcome,
  expected path, authored fault and solution fields stay withheld in review when
  disclosure state does not permit them;
- **authoritative disclosure state is required before protected review content is
  projected**, and is evaluated per field;
- **a client-supplied review mode or disclosure claim cannot elevate access**;
- **indeterminate disclosure state fails closed**, including when only one
  required input is unresolvable;
- **assessment content remains excluded even when review disclosure is otherwise
  authorized**;
- each projection rule, each withheld case, and the guarantee that **no failure
  mode sends protected content.**

---

# 21. Dependencies

## Depends On

- AIGW-001 — AI Request Contract
- AIGW-005 — Privacy, Redaction, and Secret Screening
- CURR-010 — Mission Instructional Steps
- CURR-011 — Instructional Interaction Contract

## Integrates With

- AIGW-004 — AI Cost and Usage Controls
- AIGW-008 — AI Usage and Audit Metadata
- Learning Engine — support level, instructional mode and disclosure-state
  resolution
- Wave 4 assessment boundary — preserved, never widened

---

# 22. Implementation References

**Recommended Milestone:** `AIGW-M11 — Curriculum Projection`

**Roadmap Phase:** Build Wave 10 — AI Gateway and AI Features

**Not authorized for implementation by WP-A.** This Feature is specified now so
that `CURR-010` and `CURR-011` are built against a known projection boundary, and
so no curriculum content has to be duplicated into hand-written AI prompts later.

---

# 23. Success Metrics

- No AI teaching capability requires curriculum content to be re-authored as a
  prompt.
- Protected content exposure through AI context is structurally impossible rather
  than prompt-dependent or mode-dependent.
- Accessibility remains fully functional with AI disabled.
- Deterministic validation and competency evidence remain untouched by AI.

---

# 24. Founder Approval

- [x] Approved
- [ ] Deferred
- [ ] Rejected

Approved by DEC-059.

---

# 25. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-30 | Initial Feature specification. Server-side projection with structural withholding. Instructional mode is explicitly separated from disclosure authority: no mode, including review, releases a protected field, which is decided per field from authoritative state and never from a client claim. Assessment content is excluded at every mode and disclosure state with no exception. Any unresolvable authorization input fails closed. Accessibility and narration are independent of AI, with `CURR-011` retaining ownership of accessible interaction equivalence. |
