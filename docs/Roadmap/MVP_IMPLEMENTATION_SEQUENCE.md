# MVP Implementation Sequence

**Project:** Technical Learning Platform  
**Status:** Proposed Implementation Baseline  
**Date:** 2026-08-11

---

# 1. Objective

Translate the approved architecture into a build order that produces a working MVP as early as possible without violating core security, data, and learning boundaries.

The implementation strategy is vertical and dependency-aware:

```text
Foundation
→ Identity
→ Curriculum
→ Learning
→ Assessments
→ Notes
→ Labs
→ Evidence
→ Certificates
→ Search
→ AI
→ Analytics
→ Operations
→ Notifications
→ Hardening
→ MVP Release
```

This is an implementation sequence, not a requirement to finish every Feature in one Engine before touching the next.

---

# 2. Build Wave 0 — Repository and Engineering Foundation

Build first:

- Application workspace/package structure.
- environment/configuration strategy.
- shared types/contracts.
- database migration workflow.
- backend service conventions.
- frontend application shell.
- testing framework.
- CI checks.
- secrets handling.
- basic observability.
- local development bootstrap.

## Exit criteria

A new developer environment can start the application and run tests using documented commands.

---

# 3. Build Wave 1 — Platform Kernel and Authentication

Implement the minimum required Platform Kernel and Authentication features.

Focus:

- configuration.
- error handling.
- audit foundation.
- application settings.
- account registration.
- sign in/sign out.
- session management.
- email verification.
- password recovery.
- Founder/admin MFA.
- trusted identity context.

## Exit criteria

A student can securely create an account, authenticate, and access an authorized application shell.

---

# 4. Build Wave 2 — Curriculum Foundation

Implement:

- stable curriculum IDs.
- Learning Path/Course/Module/Mission hierarchy.
- competency definitions.
- prerequisite definitions.
- publication/version state.
- content asset references.

## Exit criteria

The Founder can define and publish a small real course through governed curriculum data.

---

# 5. Build Wave 3 — Core Learning Experience

Implement:

- progress tracking.
- resume/continue learning.
- prerequisite enforcement.
- competency state.
- recommended next action.
- learning history.
- review/reinforcement state.

## Exit criteria

A student can enroll/access a course, complete Missions, leave, return, and continue from the correct state.

---

# 6. Build Wave 4 — Assessments and Test-Out

Implement the deterministic assessment path required by Learning Engine and Evidence Engine.

Focus:

- question/assessment representation.
- attempts.
- deterministic scoring.
- readiness/test-out.
- technical interruption handling.
- competency mapping.

## Exit criteria

A student can complete an assessment and receive deterministic, persisted results without AI controlling the score.

---

# 7. Build Wave 5 — Knowledge and Notes

Implement:

- student notes workspace.
- technical content blocks.
- learning-context links.
- tags.
- note retrieval/search.
- bookmarks.
- export baseline.

AI-assisted notes can remain disabled until AI Gateway foundation exists.

## Exit criteria

Students can maintain private technical notes linked to learning context.

---

# 8. Build Wave 6 — Lab Engine MVP

Implementation order:

1. Lab Definition Model
2. Provider Interface
3. Session Lifecycle
4. Mock Provider
5. Deterministic Validation
6. Isolation/Safety
7. Capacity/Provisioning
8. Access Delivery
9. Reset/Cleanup
10. Health/Recovery
11. Container Provider where useful
12. Proxmox Provider

## Important rule

Build and test the **Mock Provider before Proxmox integration**.

## Exit criteria

A student can launch, use, validate, reset, and terminate at least one real practical lab through the LMS without direct Proxmox administrative access.

---

# 9. Build Wave 7 — Evidence

Implement:

- canonical Evidence Record.
- provenance.
- competency evidence linking.
- lab validation evidence.
- assessment evidence.
- correction history.
- private evidence portfolio.

## Exit criteria

A successful assessment or lab produces durable, traceable competency evidence.

---

# 10. Build Wave 8 — Certificates

Implement:

- certificate definitions.
- eligibility rules.
- deterministic issuance.
- lifecycle.
- verification.
- student portfolio.
- export.
- correction/revocation.
- basic accessible branding.

## Exit criteria

A student who satisfies evidence requirements receives a verifiable certificate automatically.

---

# 11. Build Wave 9 — Search

Start with deterministic baseline search:

- searchable curriculum.
- permission-aware retrieval.
- technical query normalization.
- filters.
- personal notes integration.
- indexing freshness.
- fallback search/navigation.

## Exit criteria

Students can find authorized curriculum and their own notes without AI.

The automated Search Engine completion gate passes, **and** the Search Engine
Human UAT (§15d) is completed with every blocking finding resolved, before
Search receives final product acceptance.

---

# 12. Build Wave 10 — AI Gateway and AI Features

Implementation order:

1. AI Request Contract.
2. Mock AI Provider.
3. Provider Interface.
4. Routing policy.
5. privacy/redaction.
6. cost controls.
7. health/fallback.
8. response normalization.
9. usage metadata.
10. Local provider adapter.
11. External provider adapter.

Then enable selected AI product features.

## Exit criteria

At least one local or hosted provider can safely serve an approved learning-assistance workflow through the Gateway.

---

# 13. Build Wave 11 — Analytics

Implement only decision-useful MVP metrics:

- learning outcomes.
- curriculum review signals.
- lab/assessment reliability.
- AI cost/usage.
- Founder dashboard.
- privacy aggregation.
- versioned KPI definitions.

## Exit criteria

Founder can see whether students are learning, where systems fail, and where cost is growing without raw-surveillance dashboards.

---

# 14. Build Wave 12 — Operations and Notifications

Operations:

- incident model.
- bounded remediation.
- Founder operations queue.
- dependency health.
- degraded mode.
- runbooks.
- escalation.

Notifications:

- request contract.
- in-app.
- email.
- preferences.
- retry/dedup.
- operational alert delivery.
- history/read state.

## Exit criteria

Routine failures recover or degrade safely, important unresolved issues surface once, and users receive appropriate notifications.

---

# 15. Build Wave 13 — Security, Reliability, and Accessibility Hardening

Before MVP release:

- authorization review.
- tenant/user data-isolation tests.
- secret scanning.
- abuse/rate-limit tests.
- destructive-action tests.
- lab isolation tests.
- backup/recovery validation.
- accessibility audit.
- mobile usability review.
- performance/load baseline.
- dependency failure exercises.
- logging/privacy review.

---

# 15b. Cross-Engine Batch — Course Completion Credentials

This is an approved MVP requirement that spans three engines, so it is
sequenced as its own batch rather than inside any single build wave.

It must be completed before MVP release. It must **not** be implemented during
CERT-005 or mixed into any other Certificate Engine feature.

Governing decisions: **DEC-029 through DEC-035**.

Implement:

- authoritative server-owned course-completion truth in the Learning Engine.
- a `course_completion` canonical Evidence source type and the adapter that
  converts the Learning Engine completion fact into Evidence.
- `certificateKind` (`completion` | `competency`) as a material Certificate
  Definition field, frozen on publication.
- a revised CERT-001 publication rule that permits a completion certificate
  while keeping a requirement-free certificate unpublishable.

Do not implement:

- separate completion and competency certificate engines.
- hybrid or additional credential kinds.
- any change that lets the frontend assert course completion.

## Exit criteria

A completion certificate and a competency certificate can each be defined,
evaluated and issued through the single existing deterministic pipeline, and a
completion credential never implies demonstrated competency.

---

# 15c. Pre-MVP Legacy Architecture Assurance Audit

Before the MVP Release Gate can pass, the repository must receive a
comprehensive assurance audit of implementation that predates the current
Claude Code verification workflow.

**This is not authorization to rebuild earlier engines.** No engine is
rewritten merely because it is old. The current repository is the authority,
and only genuine findings become remediation work items.

## Purpose

Verify that earlier committed implementation still satisfies:

- approved Feature Registry specifications.
- current architecture and ownership boundaries.
- authentication and authorization requirements.
- server-side authority.
- deterministic truth rules.
- historical and version truth.
- RLS and database security.
- cross-user isolation.
- fail-closed behaviour.
- previous-wave invariants.
- current repository conventions.

## Scope

As applicable: Platform Kernel · Authentication · Curriculum · Learning ·
Assessment and Test-Out · Knowledge and Notes · Labs · Evidence · Search ·
AI Gateway and AI Features · Analytics · Operations · and any other
implementation completed before the stricter verification workflow became
standard.

## The audit must specifically look for

- verifier checks that do not actually bite.
- stale verifiers that inspect superseded implementations.
- authorization bypasses.
- client-side authority over deterministic facts.
- migration or schema drift.
- duplicated sources of truth.
- fail-open behaviour.
- incomplete negative tests.
- hidden TODO, stub or placeholder behaviour.
- undocumented architecture drift.
- unfinished integration.
- discrepancies between the Feature Registry, roadmap/status documents, and
  code.

## Recorded items awaiting this audit

Findings discovered during later build waves that are deliberately **not**
repaired in the batch that found them, so the repair is not made silently
inside an unrelated feature.

- **CERT-006 and CERT-007 colour-class verifier matching.** Their
  green/red/amber checks are unbounded, so they are less precise than the
  word-bounded CERT-009 equivalent and could produce a false positive against a
  class name that merely contains a colour word. They pass today only because
  the affected views contain no colliding class. Discovered during CERT-009;
  not a CERT-009 blocker; must not be silently repaired inside another batch.

- **CERT-009 rendered colour contrast.** Contrast is not runtime or browser
  proven, because the repository has no browser/DOM accessibility harness. No
  WCAG contrast conformance is claimed. Explicit contrast validation belongs to
  the pre-MVP accessibility and assurance work.

- **Curriculum published-version reader inconsistency.** Multiple
  simultaneously published versions of one curriculum `stable_id` are
  structurally possible: the only constraint is `unique (stable_id, version)`,
  and `curriculum_publish_learning_path_tree` never retires a predecessor. The
  two existing readers then disagree — `getPublishedLearningPathTree(stableId)`
  resolves to the highest published version, while `listPublishedLearningPaths()`
  returns every published version. **CURR-006 owns authoritative supersession
  and lineage behaviour and is specified but not implemented**; no service code
  references `curriculum_version_lineage`.

  SEARCH-002 temporarily mirrors the detail-reader behaviour for learner-facing
  search by selecting the highest published version. That is **read resolution
  only** — it establishes no supersession truth, retires nothing and writes
  nothing. **Curriculum itself was not changed**: neither reader was modified,
  and no publication schema or migration was touched.

  Discovered during SEARCH-002; not a SEARCH-002 blocker. The Curriculum reader
  inconsistency must be reconciled during the pre-MVP Curriculum and
  architecture assurance work, and Search must defer to CURR-006 once
  authoritative current-version semantics exist.

## Exit criteria

The audit has run across the applicable scope, and every release-blocking
finding is either remediated or explicitly resolved with a recorded decision.

---

# 15d. Human Acceptance Testing (UAT)

Automated verification does not equal final product acceptance. The engineering
standard is recorded in `docs/Engineering-OS/Engineering-OS.md` section 6; this
section defines the MVP-scoped checkpoints that enforce it.

**This adds a gate. It removes nothing.** Every existing automated gate remains
mandatory and must still pass.

## Engine-level checkpoint

Major learner-facing engines pass through:

```
feature implementation (normal engineering workflow)
        ↓
automated engine completion gate
        ↓
Founder / Human browser UAT
        ↓
blocking findings resolved
        ↓
engine final product acceptance
```

UAT exercises the **running application in a browser**. Reading source, unit
tests, verifier output, test-generated screenshots or implementation reports does
not satisfy it.

## Findings classification

Every finding is classified as:

- **Blocking** — must be resolved before the engine or MVP is accepted.
- **Non-blocking** — recorded and scheduled.
- **Not a defect** — recorded with the reason.

Material defects **return through the normal scoped
implementation/review/test/commit workflow**. They are not silently fixed during
the review session.

A failed UAT **may block acceptance even when CI is green**.

## Search Engine UAT

Search follows this sequence. It has **not** occurred and cannot occur yet —
Search is incomplete.

```
SEARCH-001 → SEARCH-008 implementation
        ↓
automated Search Engine completion gate
        ↓
Founder / Human browser UAT
        ↓
blocking findings resolved
        ↓
Search Engine final product acceptance
```

The Search UAT should exercise, as applicable to what is implemented at that
time: realistic learner searches · filtering and clearing filters · technical
terminology and command-like tokens · approved acronyms and aliases · typo
recovery **once SEARCH-005B exists** · result ordering · empty-result recovery ·
navigation from a result to its source · authorization-sensitive behaviour where
testable · keyboard interaction · accessibility behaviour observable in the
browser · and failure and recovery states.

## MVP release checkpoint

```
automated MVP completion / assurance
        ↓
real-environment / integration verification where required
        ↓
Founder / Human end-to-end UAT across the learner journey
        ↓
blocking findings resolved
        ↓
Founder final MVP acceptance
```

The end-to-end UAT covers the applicable implemented workflows: sign-in and
authentication · learner navigation · finding curriculum · studying and learning
flows · labs · assessments · progress · certificates where applicable · notes
where applicable · Search · keyboard navigation · visible accessibility
behaviour · responsive and browser behaviour · and loading, error, empty and
recovery states.

## Recorded limitations must be dispositioned, not inherited

Limitations recorded during implementation — no DOM or browser harness, no live
PostgreSQL or RLS harness, mocked authorization or database behaviour, and any
other explicitly recorded non-executable acceptance criterion — **must not
silently become permanent accepted limitations**.

Before MVP production acceptance each material limitation receives exactly one
disposition:

- **A. Automated** — replaced by executable automated verification.
- **B. Verified** — verified through human, integration or UAT testing.
- **C. Accepted** — explicitly accepted by the Founder as a documented residual
  limitation.

Items already recorded in section 15c are dispositioned under this rule.

## Exit criteria

Each applicable engine has completed its Human UAT with all blocking findings
resolved, the end-to-end MVP UAT has been performed, and every material recorded
limitation carries an A, B or C disposition.

---

# 15e. MVP Connected Learning Experience

Approved by DEC-049.

The build waves deliver **engines**. No wave delivers the educational product
those engines exist to serve, yet section 16 requires at least one publishable
course and at least one practical lab. This section records that work.

## What the MVP must prove

One **connected** learning experience — not a catalog:

```text
01 Networking Foundations
02 Router-on-a-Stick / Build the Network
03 Linux Fundamentals
04 Windows Fundamentals
05 Security Fundamentals / Secure the Environment
06 Integrated Challenge
```

> **Amended by DEC-053.** This section previously recorded a five-course path
> beginning with Router-on-a-Stick. Networking Foundations was inserted ahead of
> it after the BEGINNER-COMPLETE-1 audit. The superseded list is retained in
> DEC-049 as the historical record; only the ordering changed, and nothing else
> in this section is affected.

Networking Foundations **develops** the reusable foundational `net.*`
competencies. Router-on-a-Stick is the substantive networking course and
**reinforces** those foundations in context rather than developing them. Linux
and Windows are focused hands-on experiences. Security intentionally integrates
the earlier domains. The Integrated Challenge combines competencies without
announcing which technology is being exercised.

**The connection between experiences is the deliverable.** Later experiences must
require reuse of competencies already demonstrated rather than allowing them to
lapse, and must reinforce contextually rather than by quiz (`Learning-OS.md` §21).

Proxmox may execute applicable labs as an infrastructure provider beneath the Lab
Engine abstraction. It is not a student course and grants no student
administrative access.

## Boundaries

- Detailed lesson plans, module breakdowns and completion-time estimates are
  **not** approved here and require separate Founder authorization.
- No catalog padding. Content exists because the connected experience needs it.
- Deferred scope in `NOT_NOW.md` is binding and is not reopened by this section.

## This work unblocks Search UAT

Founder Search Human UAT (§15d) cannot produce meaningful findings against an
empty corpus. `CURRENT_BUILD_STATUS.md` records the outstanding prerequisite:
no repository-seeded curriculum exists, so Search UAT cannot yet be performed.

Publishing enough of the connected experience to search — real learning paths,
courses, missions and competencies with genuine technical titles and
descriptions — satisfies that prerequisite. **Search UAT remains pending until
then, and this section does not grant it.**

## Reuse is a build requirement, not only a content requirement

Per DEC-049, cross-course competency reinforcement is MVP scope. `LEARN-008`
section 8.1 records that the competency and review-state substrate is already
course-agnostic, and that three gaps remain: curriculum cannot yet express
whether a mission **teaches** or **reuses** a competency, the approved
curriculum-defined reinforcement checkpoint trigger has no writer, and no learner
surface communicates reuse. Each needs its own authorization; none reopens the
completed Wave 3 Learning Engine.

**Gap 1 now has an approved model.** DEC-055 approves
`mission_competencies.relationship` with the values `develops` and `reinforces`,
and explicitly declines to add `requires` — `learning_prerequisite_rules` remains
the sole prerequisite mechanism. The migration itself remains a Founder gate and
is not yet authorized. Gaps 2 and 3 are unchanged.

## Sequencing note — not a binding requirement

The next recommended build is the **Router-on-a-Stick end-to-end vertical slice**,
because every engine it needs already exists and it is the first time the core
loop runs together.

Beyond that, sequencing is deliberately **left open**:

- AI Gateway and tutor sequencing is reconsidered once a functional
  learning-and-lab loop exists.
- Introducing the tutor **before** Linux and Windows are complete may be
  valuable, so the MVP can test AI-assisted active learning early.
- Nothing in this section makes the tutor a prerequisite for, or a successor to,
  any particular experience.

**Deterministic validation remains independent of AI under every sequencing
choice.** The validator owns factual pass/fail; the tutor may only explain it.

## Signature learning completeness — DEC-058

> **Simulation teaches the mental model. The real lab confirms the mental model.**

For an applicable hands-on technical path, real-environment confirmation is part
of the target experience, not optional polish. An authored teaching simulation
constructs the mental model and produces **no competency evidence**; the
deterministic validator remains the authority for success and failure.

**A hands-on path is not declared fully SIGNATURE-LEARNING complete solely
because an authored simulation exists** when real-environment confirmation is
applicable to the competency.

### WP-K — Live-Lab Packet Journey Adapter

Recorded here as a named future work item so it is not carried as an indefinite
"later". **Not authorized for implementation.**

**Purpose.** Connect authoritative Lab Engine observations to the shared
`ObservationModel` established by the teaching-mode interaction work, so the same
renderer serves both modes.

**Depends on** the interaction/observation seam being built, **and** on a real
applicable lab provider implementing the deterministic probes. WP-K cannot start
before that provider exists.

**Constraints.** It does not independently compute correctness; it fails closed
to "state unavailable"; it never becomes a second forwarding, routing or VLAN
simulator; it never becomes the competency validator. If the seam is built
correctly it should require **no redesign of the renderer**. It may require a
future Founder-approved `LabProvider` contract extension, decided against real
observation requirements rather than anticipated now.

**Significance.** WP-K is what eventually makes the applicable Router-on-a-Stick
experience fully SIGNATURE-LEARNING complete, through:

```text
simulation → real environment → authoritative observation
→ learner remediation → deterministic confirmation
```

## Exit criteria

At least one experience in the connected path is publishable and searchable, has
at least one practical lab with deterministic validation, produces evidence
against approved competencies, and demonstrates at least one instance of a later
experience requiring reuse of an earlier competency.

---

# 16. MVP Release Gate

MVP release requires:

- [ ] secure student account flow.
- [ ] at least one publishable course, authored as part of the connected
      learning experience approved in §15e (DEC-049).
- [ ] durable progress.
- [ ] deterministic assessment.
- [ ] at least one practical lab.
- [ ] evidence generated from assessment/lab.
- [ ] evidence-backed certificate.
- [ ] completion and competency credentials are distinct (DEC-029 to DEC-035).
- [ ] private notes.
- [ ] baseline search.
- [ ] at least one approved AI-assisted workflow.
- [ ] Founder operational visibility.
- [ ] email/in-app notifications for required flows.
- [ ] security/accessibility/reliability checks passed.
- [ ] no critical unresolved architecture conflicts.
- [ ] pre-Claude-Code / legacy implementation assurance audit passes, with all
      release-blocking findings remediated or explicitly resolved (§15c).
- [ ] Founder/Human end-to-end browser UAT performed, every blocking finding
      resolved, and every material recorded limitation dispositioned as
      automated, verified or explicitly accepted (§15d).

---

# 17. Scope Discipline

Do not block MVP on:

- enterprise multi-tenancy.
- marketplace/community features.
- advanced public portfolios.
- complex gamification.
- mobile native applications.
- many AI providers.
- many lab providers.
- advanced employer verification.
- advanced analytics.
- large-scale organization administration.

Those may be added after the core learning loop proves valuable.
