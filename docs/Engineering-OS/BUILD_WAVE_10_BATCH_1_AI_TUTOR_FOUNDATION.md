# Build Wave 10 / Batch 1 — AI Tutor Foundation

**Work package:** GitHub issue #62 — `[RECOVERY][AI] Tutor foundation —
grounded lesson context, safe guidance, deterministic boundaries`
**Branch:** `manual/issue-62-ai-tutor-foundation`
**Gate:** `scripts/verify-ai-tutor-foundation.sh` (`npm run gate -- ai-tutor-foundation`)
**Migrations:** NONE EXPECTED — none authored.
**Lifecycle:** implementation complete; pending independent architecture review.

---

## 1. What this batch delivers

The provider-independent AI Tutor foundation: nine modules and nine test
suites that define the contracts the accepted Lovable lesson workspace can
later call, with the non-negotiable product boundaries enforced structurally
rather than by instruction.

| Module | Owns | Governing Feature |
|---|---|---|
| `packages/shared-types/src/ai-tutor-lesson-context.ts` | Lesson identity and position, lesson-workspace session contract, presentation preference, pedagogy prohibitions, accessible rendering contract | `AIGW-011` §14, DEC-059 |
| `packages/shared-types/src/ai-tutor-boundaries.ts` | Authority prohibitions, forbidden-field refusal, trusted lab-state classification, deterministic deferral, note-suggestion contract | DEC-059, `AIGW-011` §5 |
| `packages/shared-types/src/ai-tutor-privacy.ts` | Deterministic secret screening, redaction seam, log projections | `AIGW-005`, `AIGW-008` |
| `packages/shared-types/src/ai-tutor-grounding.ts` | Approved context vocabulary, deterministic bounded selection seam, citation derivation and verification | `AIGW-011` §8, §10 |
| `packages/shared-types/src/ai-tutor-request.ts` | Versioned request contract, fail-closed assembly, note-inclusion gate | `AIGW-001` |
| `packages/shared-types/src/ai-tutor-provider.ts` | Provider-neutral interface, normalized errors, timeout and retry policy, redacted prompt builder | `AIGW-002`, `AIGW-006` |
| `packages/shared-types/src/ai-tutor-response.ts` | Structured response contract, normalization, boundary refusal, honest unavailable and deferral shapes | `AIGW-007` |
| `services/api/src/ai-tutor-local-provider.ts` | Deterministic in-process provider and every normalized failure mode | `AIGW-009` shape, without `AIGW-009`'s network |
| `services/api/src/ai-tutor.ts` | Orchestration, bounded timeout and retry, caller-scoped note-ownership read, operational logging | composition only |

---

## 2. Architectural decisions

### 2.1 Two request types, and that is the security model

`TutorRequestInput` (what a client may send) and `TutorRequest` (what the
platform assembles) are deliberately different shapes. Three things are
therefore impossible for a client to assert:

- **Lesson content.** The input carries stable-id REFERENCES only. A reference
  carrying `text` or `title` is refused outright. Authored content is resolved
  server-side through the grounding seam, so a client cannot invent curriculum
  and have it explained back as though it were the course.
- **Lab state.** The input has no lab-state field at all. Lab state reaches a
  request only through `classifyTutorLabState`, which admits exactly one
  deterministic source marker and fails closed to `unavailable` for everything
  else.
- **Identity and authority.** No learner id, no provider or model override, no
  privacy-class declaration, no support-level override, no disclosure claim.
  `AI_TUTOR_REQUEST_FORBIDDEN_INPUT_FIELDS` holds the prohibition as data and
  assembly REFUSES rather than ignores — ignoring a field that was sent leaves
  the caller believing it took effect.

This is `AIGW-011` §8 applied at the only place it can be enforced: before
anything is selected.

### 2.2 The deterministic boundary is a type, not a prompt

`TutorResponse` has no field that can express a lab verdict, a mastery grant, a
score or a note write. `boundaryFlags` are literal `false`, so a response
claiming authority does not compile.
`normalizeTutorProviderOutput` refuses provider output carrying any forbidden
authority field at any depth, and the gate proves by byte offset that the
refusal runs BEFORE the answer text is read — no part of an
authority-claiming response is salvaged and shown.

Nothing inspects question text to decide whether a learner "asked about lab
correctness". A text heuristic is not a boundary: it fails on the phrasing it
did not anticipate. The guarantee comes from the contract instead.

### 2.3 A grounding seam, not a Search dependency

`TutorGroundingSource` is an interface with one method. The Curriculum Engine
can implement it today; the Search Engine or a future retrieval service could
implement it later. There is no Search type and no Search import anywhere in
the foundation, and the gate asserts that absence.

Selection is precedence, then requested order, then stable id. No scoring, no
relevance, no embeddings, no randomness. A resolved segment whose
`(kind, id)` was not requested is discarded, so a source cannot widen the
context it was asked for.

### 2.4 Unavailable context is never answered as a general question

If a request asked for lesson grounding and the source could not serve it, the
turn returns `context_unavailable` WITHOUT calling a provider. Answering a
lesson question from no lesson content is the "silent gap-filling" `AIGW-011`
§2 names: an ungrounded answer would be indistinguishable from a grounded one.
A request that asked for no grounding is a different case, is served, and is
labelled `general`.

### 2.5 Citations cannot be fabricated

`buildTutorCitations` can only produce citations for segments that were
actually selected. `verifyTutorCitations` drops anything a provider invented —
including a real-looking reference it was never given — and the dropped count
is carried on the response so the event is recordable rather than invisible.

### 2.6 No HTTP route, and no learner-facing UI

This package's acceptance criteria are all "the platform can …", never "the
learner can ask". A route would expose an AI surface before the Gateway's
routing, cost and provider-health policy (`AIGW-003`, `AIGW-004`, `AIGW-006`)
exist. This follows the `SEARCH-001` precedent, which also shipped a complete
contract and projection with no route.

The accepted Lovable lesson workspace remains the canonical learner-facing
presentation surface. §5 of the issue asked for the lesson interaction to be
REPRESENTED, and it is represented as `TutorLessonSession` plus
`TutorRenderingContract`. No component, no markup, no DOM and no stylesheet
was created or modified, and the gate asserts that no file matching `*tutor*`
exists under `apps/web/src`.

### 2.7 One ownership mechanism

Note ownership is resolved through `createUserScopedSupabaseClient`, exactly as
`note-retrieval.ts` does, so PostgreSQL row level security decides which note
rows exist for a caller. There is no service-role path, no caller-supplied
identity and no owner predicate — adding any of them would create a second
ownership mechanism beside the database policy. A failed read yields
`unavailable`, never `not_owned`: the two are different facts, and the contract
refuses the excerpt for either.

### 2.8 A deliberate deviation from the logger's redaction

`logger.ts` redacts any metadata key containing `secret`. The credential KIND
that was blocked is a useful operational signal and is not itself a secret, so
it is logged as `credentialKinds`. The sanitizer is not weakened, and a test
pins the field name so a rename back to `secretLabels` fails rather than
silently destroying the signal.

---

## 3. Security and privacy boundaries

| Boundary | Mechanism | Where it is proven |
|---|---|---|
| Malformed request | closed `TUTOR_REQUEST_REJECTIONS` vocabulary; refusal before any provider call | `ai-tutor-request.test.ts`, `ai-tutor.test.ts` |
| Unsupported context type | closed `TUTOR_GROUNDING_KINDS`; unapproved kind never reaches a source | `ai-tutor-grounding.test.ts` |
| Untrusted lab claim | single attestation source; fail closed to `unavailable` | `ai-tutor-boundaries.test.ts` |
| Cross-learner note reference | caller-scoped read + single inclusion gate; refusal message reveals nothing | `ai-tutor-request.test.ts`, `ai-tutor.test.ts` |
| Credential leakage | deterministic screening over question AND excerpts; request refused; redaction as defence in depth; prompt screened again before transmission | `ai-tutor-privacy.test.ts`, `ai-tutor-provider.test.ts` |
| Log leakage | explicit field-by-field projection; `AI_TUTOR_LOG_FORBIDDEN_FIELDS`; counts instead of content | `ai-tutor-privacy.test.ts`, `ai-tutor.test.ts` |
| Assessment content | excluded by omission from the grounding vocabulary, asserted by `TUTOR_GROUNDING_EXCLUDED_KINDS` | `ai-tutor-grounding.test.ts` |
| Paid provider activation | no SDK, no endpoint, no `process.env`, no dependency added | `ai-tutor-local-provider.test.ts`, gate §11 |

Every prohibition is held AS DATA and asserted by a test; the gate's §14
enumerates the ten lists and fails if any is unasserted.

---

## 4. What this batch does NOT deliver

Stated so no reader infers more than was built:

- **`AIGW-003` model routing and capability policy** — not implemented. There
  is no provider registry, no routing policy and no fallback chain. Fallback
  across providers needs a routing policy this foundation does not define, and
  silently widening privacy class to reach a second provider is exactly what
  `AIGW-006` §6 excludes.
- **`AIGW-004` cost and usage controls** — not implemented. No budget, no
  quota, no rate limit beyond the bounded retry.
- **`AIGW-006` provider health, circuit breaker and fallback** — only the
  bounded timeout, the bounded retry and provider health reporting are here.
  There is no circuit breaker.
- **`AIGW-010` external provider adapters** — not implemented and not
  authorized. No provider is connected.
- **`AIGW-011` curriculum projection** — explicitly *not authorized for
  implementation*. This foundation HONOURS its boundary (server-side
  projection, structural withholding, assessment exclusion, mode separated
  from disclosure) and implements none of it. The grounding seam takes already-
  resolved approved segments; resolving them from authored curriculum under the
  `AIGW-011` projection rules is that Feature's own package.
- **Any learner-facing surface.** No route, no component, no UI.
- **Live PostgreSQL row level security proof.** The repository has no live
  database harness. The note-ownership evidence is caller-scoped, query-level
  and structural.

---

## 5. Verification

`npm run gate -- ai-tutor-foundation` runs sixteen sections, then defers to the
repository toolchain (`typecheck`, `test`, `build`, `security`). Sections 5, 6
and 7 prove ordering by byte offset in comment-stripped source, so a comment
claiming an order cannot satisfy it; §3 asserts that every Tutor source yields
inspectable text, so no absence scan can pass vacuously.

### What the automated evidence establishes

Contract behaviour, fail-closed refusals, bounded retry and timeout, the
deterministic boundary end to end against a provider that genuinely tries to
return a verdict, caller-scoped note ownership against a mock that models what
row level security returns to each caller, and the structural absence of any
provider SDK, endpoint, credential read, route or component.

### What it does not establish

Rendered accessibility, pedagogical quality of any answer, live row level
security enforcement, or any form of product acceptance. Automated
verification is necessary and never sufficient (DEC-047).

---

## 6. Status

`IMPLEMENTED + AUTOMATED VALIDATION PASSED`

`PENDING INDEPENDENT ARCHITECTURE REVIEW`

Rendered Architect/Founder review of any future Tutor surface remains
required, and no part of this package asserts otherwise.
