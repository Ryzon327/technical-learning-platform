# Decision Ledger

**Purpose**

This document records every significant product, architectural, engineering, infrastructure, security, accessibility, and business decision approved by the founder.

The Decision Ledger exists to:

* Preserve architectural intent.
* Prevent repeated debates.
* Reduce AI token usage.
* Maintain consistency across implementation.
* Explain *why* decisions were made.
* Help future contributors understand the platform.

---

# Decision Status

Each decision has one status.

| Status     | Meaning                               |
| ---------- | ------------------------------------- |
| Proposed   | Under discussion                      |
| Approved   | Accepted but not yet implemented      |
| Locked     | Approved and considered authoritative |
| Superseded | Replaced by a newer decision          |
| Deprecated | No longer used                        |

---

# Decision Format

Every decision follows this structure:

* ID
* Category
* Title
* Status
* Date
* Decision
* Rationale
* Alternatives Considered
* Impact
* Related Documents

---

# Product Philosophy

---

## DEC-001

**Category**

Product Philosophy

**Title**

Respect the Student's Time

**Status**

Locked

**Decision**

The platform is self-paced by default.

Students are never punished for taking breaks or learning slowly.

**Rationale**

Adult learners have responsibilities outside the platform.

**Impact**

No mandatory streaks, daily-login pressure, or artificial deadlines.

---

## DEC-002

**Category**

Learning

**Title**

Respect Demonstrated Competency

**Status**

Locked

**Decision**

Students may demonstrate competency to advance instead of repeating content they already know.

**Rationale**

Time should be spent learning new skills, not proving known ones repeatedly.

---

## DEC-003

**Category**

Student Experience

**Title**

Encouragement over Shame

**Status**

Locked

**Decision**

The platform always uses supportive language.

It never attempts to motivate through guilt, comparison, or embarrassment.

---

# Founder Experience

---

## DEC-004

**Category**

Founder Experience

**Title**

Founder Must Not Become the Bottleneck

**Status**

Locked

**Decision**

The platform continuously automates repetitive operational work while preserving founder approval for important decisions.

---

## DEC-005

**Category**

Founder Experience

**Title**

Founder Creates Value

**Status**

Locked

**Decision**

The founder's primary responsibility is creating educational value—not operating infrastructure.

---

## DEC-006

**Category**

Founder Experience

**Title**

Platform Must Become Easier to Operate

**Status**

Locked

**Decision**

Every release should reduce operational burden whenever practical.

---

# Product Architecture

---

## DEC-007

**Category**

Architecture

**Title**

Blueprint is the Source of Truth

**Status**

Locked

**Decision**

`PLATFORM_BLUEPRINT.md` is the authoritative project specification.

Claude must consult it before implementation.

---

## DEC-008

**Category**

Architecture

**Title**

Single Source of Truth

**Status**

Locked

**Decision**

Architecture, roadmap, features, decisions, and build status each have one authoritative document.

Duplicate documentation is avoided.

---

## DEC-009

**Category**

Architecture

**Title**

Modular Engine Architecture

**Status**

Locked

**Decision**

The platform is built from independent engines with clearly defined responsibilities.

---

## DEC-010

**Category**

Architecture

**Title**

Provider Independence

**Status**

Locked

**Decision**

External services are accessed through provider interfaces rather than directly.

Examples include AI providers, storage providers, lab providers, and payment providers.

---

# Learning Model

---

## DEC-011

**Category**

Learning

**Title**

Mission-Based Learning

**Status**

Locked

**Decision**

Learning follows this hierarchy:

Learning Path

↓

Course

↓

Module

↓

Mission

↓

Lab

↓

Validation

↓

Evidence

---

## DEC-012

**Category**

Learning

**Title**

Labs Teach Real Skills

**Status**

Locked

**Decision**

The platform emphasizes realistic technical work rather than passive content consumption.

---

## DEC-013

**Category**

Learning

**Title**

Study Skills are Optional

**Status**

Locked

**Decision**

Study techniques, note-taking, and learning strategies are available but never forced.

---

# AI

---

## DEC-014

**Category**

Artificial Intelligence

**Title**

AI Supports Humans

**Status**

Locked

**Decision**

AI assists students and the founder.

It does not replace human judgment.

---

## DEC-015

**Category**

Artificial Intelligence

**Title**

Three Initial AI Agents

**Status**

Locked

**Decision**

The MVP includes:

* Student AI Mentor
* Platform Engineer
* Founder Analytics

All other agents are future work.

---

## DEC-016

**Category**

Artificial Intelligence

**Title**

AI Guardrails

**Status**

Locked

**Decision**

Every AI agent has:

* Defined responsibilities
* Allowed tools
* Restricted permissions
* Approval boundaries
* Stop conditions

---

# Labs

---

## DEC-017

**Category**

Labs

**Title**

Platform-Provided Labs

**Status**

Locked

**Decision**

Students can complete required work using labs provided by the platform.

External equipment remains optional.

---

## DEC-018

**Category**

Labs

**Title**

Validation is Deterministic

**Status**

Locked

**Decision**

Competency is determined by validation logic rather than AI opinion.

---

## DEC-019

**Category**

Labs

**Title**

Networking Platform

**Status**

Locked

**Decision**

The platform will not distribute Cisco IOS.

Networking education will use original training environments backed by real networking behavior.

---

# Infrastructure

---

## DEC-020

**Category**

Infrastructure

**Title**

R620 Servers are the Initial Lab Platform

**Status**

Locked

**Decision**

The Dell R620 servers are the starting point for lab execution only.

They are not the long-term infrastructure strategy.

---

## DEC-021

**Category**

Infrastructure

**Title**

Separate LMS and Lab Platform

**Status**

Locked

**Decision**

The SaaS application and lab infrastructure remain separate systems connected through controlled APIs.

---

# Security

---

## DEC-022

**Category**

Security

**Title**

Defense in Depth

**Status**

Locked

**Decision**

Student agreements complement technical controls but never replace them.

---

## DEC-023

**Category**

Security

**Title**

Ethical-Hacking Authorization

**Status**

Locked

**Decision**

Offensive-security labs require prerequisite training, agreements, technical isolation, and scoped authorization.

---

# Accessibility

---

## DEC-024

**Category**

Accessibility

**Title**

Accessibility is Foundational

**Status**

Locked

**Decision**

Accessibility is built into engineering from the beginning rather than added later.

---

# MVP

---

## DEC-025

**Category**

Product Scope

**Title**

Complete Learning Experience

**Status**

Locked

**Decision**

The MVP is the smallest complete learning experience, not the smallest amount of software.

---

## DEC-026

**Category**

Product Scope

**Title**

Future Register

**Status**

Locked

**Decision**

Ideas outside the MVP are preserved in `NOT_NOW.md` instead of being implemented immediately.

---

## DEC-027

**Category**

Implementation

**Title**

Claude Implements, Founder Architects

**Status**

Locked

**Decision**

Claude implements approved work.

The founder defines vision and approves significant decisions.

Claude does not redefine the product.

---

# Repository

---

## DEC-028

**Category**

Development

**Title**

GitHub is the Source of Truth

**Status**

Locked

**Decision**

GitHub stores:

* Source code
* Blueprint
* Decisions
* Prompts
* Documentation
* Infrastructure definitions
* Build status

Secrets are never committed.

---

# Credentials

---

## DEC-029

**Category**

Product Architecture

**Title**

Two Distinct Credential Semantics

**Status**

Approved

**Decision**

The platform supports two intentionally different credential claims.

* **completion** — the learner completed the defined training/course requirements.
* **competency** — the learner demonstrated required competency through authoritative Evidence.

A completion credential must not imply competency.

A competency credential must not imply that all instructional content was consumed.

This extends the existing Learning Engine rule that the platform must distinguish completion from competency (LEARN-001).

---

## DEC-030

**Category**

Product Architecture

**Title**

Test-Out Does Not Imply Course Completion

**Status**

Approved

**Decision**

Demonstrated mastery through test-out does not automatically mean course completion.

A learner who proves competency without consuming all required training may satisfy competency-certificate requirements. They do not automatically satisfy completion-certificate requirements.

Learners who demonstrate competency are never required to consume training merely to receive a competency credential.

This resolves a gap: LEARN-005 defines test-out but is silent on course completion.

---

## DEC-031

**Category**

Product Architecture

**Title**

Learning Engine Owns Course Completion Truth

**Status**

Approved

**Decision**

Ownership of the completion chain is fixed:

* **Curriculum Engine** defines course structure.
* **Learning Engine** determines whether the learner actually completed the required training, and owns that authoritative truth.
* **Evidence Engine** converts the authoritative completion fact into canonical Evidence.
* **Certificate Engine** consumes that Evidence.

The frontend is never authoritative for course completion.

---

## DEC-032

**Category**

Product Architecture

**Title**

Dedicated course_completion Evidence Source Type

**Status**

Approved

**Decision**

Course completion uses a dedicated canonical Evidence source type, `course_completion`.

`system_authoritative` must not be overloaded for this purpose, so that Evidence policies can address completion precisely rather than by convention.

The Evidence must originate from trusted server-side Learning Engine truth.

---

## DEC-033

**Category**

Product Architecture

**Title**

certificateKind Is a Material Certificate Definition Field

**Status**

Approved

**Decision**

Certificate Definitions carry a first-class semantic field `certificateKind`, with exactly two values: `completion` and `competency`.

It is semantic, not presentation metadata: it describes what the issued credential asserts, and is therefore frozen as part of a published Certificate Definition's material meaning.

No hybrid or additional kinds are permitted in the MVP without a further architecture decision.

---

## DEC-034

**Category**

Security

**Title**

A Published Certificate Must Never Require Nothing

**Status**

Approved

**Decision**

CERT-001 will no longer universally require a competency for every certificate, but the safety property is preserved:

* **completion** — must require authoritative `course_completion` Evidence through an approved Evidence policy.
* **competency** — must require at least one required competency.

Zero competency requirements together with zero Evidence policies must remain unpublishable.

This safety property must not be weakened.

---

## DEC-035

**Category**

Product Architecture

**Title**

One Certificate Pipeline for Both Credential Kinds

**Status**

Approved

**Decision**

There are never separate completion and competency certificate engines.

Both credential kinds flow through one deterministic pipeline:

authoritative prerequisite truth → canonical Evidence where applicable → CERT-002 deterministic eligibility → CERT-003 deterministic issuance → CERT-004 lifecycle.

CERT-002, CERT-003 and CERT-004 remain credential-kind agnostic except where an explicit semantic validation requirement is genuinely necessary.

---

## DEC-036

**Category**

Product Architecture

**Title**

Certificate Export Is Structured Text, Not a Document

**Status**

Approved

**Decision**

CERT-007 provides:

* an accessible on-screen representation of the export.
* a browser-native JSON download.
* a browser-native Markdown download.

PDF is excluded from CERT-007.

---

## DEC-037

**Category**

Product Architecture

**Title**

CERT-007 May Precede CERT-009

**Status**

Approved

**Decision**

CERT-007 may proceed before CERT-009 for truthful structured portable representations.

CERT-009 retains ownership of branded and presentation-grade credential treatment.

---

## DEC-038

**Category**

Security

**Title**

An Exported Certificate Carries Credential Truth, Not Learner Identity

**Status**

Approved

**Decision**

CERT-007 exports credential truth, not learner identity.

Student display name, email, user ID, internal learner UUID and other learner identity fields remain excluded from the export.

---

## DEC-039

**Category**

Security

**Title**

Share Links Are Designed, Not Minted

**Status**

Approved

**Decision**

CERT-007 contains design-only share-link hooks.

CERT-007 does not mint tokens, create live share URLs, persist share state, add anonymous or public sharing routes, or change RLS or public access.

---

## DEC-040

**Category**

Security

**Title**

A Learner May Read Their Own Correction History, and Nothing More

**Status**

Approved

**Decision**

The owner-scoped student `select` policy on `certificate_correction_events` is retained. CERT-008 requires transparent correction and revocation history, and the policy mirrors the established EVID-006 pattern. That no student interface consumes the policy yet does not make it invalid or dead architecture.

The boundary is:

* a student may `select` only their own correction history.
* a student may not `insert`.
* a student may not `update`.
* a student may not `delete`.
* a student may not execute the privileged correction RPC.
* a student may not revoke, restore, correct or supersede a certificate.
* no cross-user correction history is exposed.
* the privileged workflow remains founder/admin controlled.

A student interface must not be added to CERT-008 merely because the read policy exists.

---

## DEC-041

**Category**

Product Architecture

**Title**

The Holder Name Is Presentation Data, Not Historical Issuance Truth

**Status**

Approved

**Decision**

The authenticated owner's current `display_name` may be shown in CERT-009. It is read-time presentation data, not historical issuance truth.

A later display-name change may change how an older certificate renders. It must never change:

* certificate identity.
* issuance date.
* definition or version.
* competency snapshots.
* verification reference.
* lifecycle status.
* correction history.
* any other frozen certificate truth.

Holder identity remains excluded from CERT-005 public verification and from CERT-007 JSON/Markdown export.

---

## DEC-042

**Category**

Security

**Title**

Certificate Presentation Stays Owner-Private Where Identity Is Present

**Status**

Approved

**Decision**

The student display name and the internal certificate id may appear in the authenticated owner's presentation only.

Neither may be added to CERT-005's public payload.

---

## DEC-043

**Category**

Product Architecture

**Title**

The Printable Certificate Is Semantic HTML, Not a Generated Document

**Status**

Approved

**Decision**

CERT-009 uses semantic HTML and CSS plus browser-native `@media print` as the presentation-grade printable mechanism.

PDF generation is not required for CERT-009, and no PDF dependency is authorized.

---

## DEC-044

**Category**

Security

**Title**

QR Encodes the Existing Verification Destination and Nothing Else

**Status**

Approved

**Decision**

QR is design-only in CERT-009. Any future QR must encode the existing official CERT-005 verification destination and reference.

CERT-009 does not create a QR image, a QR dependency, another token, another verification mechanism, or another public route.

---

## DEC-045

**Category**

Product Architecture

**Title**

Certificate Branding Is Text and CSS Until CURR-007 Exists

**Status**

Approved

**Decision**

CERT-009 may use the existing CERT-001 presentation metadata and a text and CSS brand treatment.

Binary logo and brand-asset infrastructure remains deferred to CURR-007. CERT-009 must not create its own asset registry.

---

## DEC-046

**Category**

Product Architecture

**Title**

SEARCH-005 Does Not Depend On SEARCH-008, and SEARCH-008 Does Not Depend On SEARCH-007

**Status**

Approved

**Decision**

The circular dependency between SEARCH-005 and SEARCH-008 was a Feature Registry
classification defect, not a real architectural constraint. It is corrected as
follows.

SEARCH-005 no longer lists SEARCH-008 under **Depends On**. SEARCH-008 moves to
**Integrates With**, matching the treatment SEARCH-002 already gives SEARCH-005
and SEARCH-008.

SEARCH-008 retains SEARCH-005 under **Depends On**, because tolerance-aware
ranking consumes SEARCH-005 match and query-adjustment metadata.

SEARCH-008 no longer lists SEARCH-007 under **Depends On**. SEARCH-007 moves to
**Integrates With**. Indexing may later optimize ranking at scale but is not
required for its correctness.

Approved sequencing: dependency correction, then SEARCH-005, then SEARCH-008.

SEARCH-005 is split into milestones within the existing approved Feature.
SEARCH-M5A delivers normalization, technical-token and punctuation preservation,
a curated alias and acronym structure, bounded alias expansion, original-query
preservation and fallback, query-adjustment transparency, and exact-before-adjusted
match-class tiering. SEARCH-M5B delivers free-form typo recovery and requires a
separate mechanism ruling. SEARCH-005 is not complete while SEARCH-M5B is
outstanding.

SEARCH-005 is authorized to implement one narrow ordering invariant: exact and
literal matches surface before query-adjusted matches, with the existing
deterministic neutral ordering preserved within each tier. This is match-class
tiering, not relevance ranking. Relevance scores, weights, boosts, popularity,
freshness, competency, Course/Mission context, engagement, click history, AI
ranking, persisted ranking signals and ranking configuration remain SEARCH-008.

SEARCH-005 owns query-adjustment transparency: the original query, the effective
query, the adjustment kind, a learner-visible statement that an adjustment
occurred, and the ability to return to the original literal query. Internal edit
distances, diagnostics, candidate counts, hidden alternatives and algorithm
internals are never exposed. SEARCH-008 later owns empty-result recovery,
refinement suggestions, fallback navigation and provider degradation, and must
consume SEARCH-005 metadata rather than build a second correction system.

SEARCH-003 remains the authorization boundary. Query-side normalization and
curated aliases may run before retrieval, but all expanded candidate retrieval
executes through the caller's RLS-scoped source query, and only authorized
surfaced records may contribute to match classification, ranking, facets, counts,
suggestions or any learner-visible metadata. No alias, correction or suggestion
vocabulary may derive from unauthorized source records.

Per-query match state must not enter `SearchDocument`, which remains
source-derived state. Its existing `keywords` field may not be used as a shortcut
for per-query alias state.

**Rationale**

`FEATURE_REGISTRY_SPEC.md` section 12 prohibits circular dependencies unless
reviewed and justified. Review established that the cycle was a recording error:
the entire body of SEARCH-005 contains no occurrence of rank, relevance, order,
score, weight or sort — the only reference to SEARCH-008 anywhere in the file was
the dependency line itself. The registry already provides the correct vocabulary,
and SEARCH-002 applies it to these same two Features.

For SEARCH-007, no SEARCH-008 acceptance criterion or Definition of Done item
requires an index. Every baseline ranking signal is computable at query time,
`sourceUpdatedAt` already carries freshness, and SEARCH-007 section 6 excludes
search provider administration, so it is not the failing provider described in
SEARCH-008 section 12.

Typo recovery is separated because it affects candidate generation rather than
comparison. A post-filter over a literal `ILIKE` result set can only remove rows
that already matched, so it can never recover a misspelling; implementing it
honestly requires a retrieval-mechanism decision that may carry a migration.

**Alternatives Considered**

Implementing SEARCH-008 first was rejected: it declares two dependencies, one of
which was unimplemented, and section 12 forbids entering Building with an
incomplete required dependency absent an approved mock or adapter. Implementing
both as one coordinated batch was rejected as contrary to section 13's
milestone-sizing requirement, and because it would leave the prohibited cycle
recorded rather than resolved.

**Impact**

Documentation and sequencing only. No implementation code, schema, migration or
dependency changes from this decision.

**Related Documents**

`docs/Feature-Registry/FEATURE_REGISTRY_SPEC.md` sections 12, 13 and 15 ·
`docs/Feature-Registry/Search-Engine/SEARCH-005_TECHNICAL_QUERY_NORMALIZATION_AND_TYPO_TOLERANCE.md` ·
`docs/Feature-Registry/Search-Engine/SEARCH-008_SEARCH_RESULT_RANKING_AND_FALLBACK.md` ·
`docs/Feature-Registry/Search-Engine/SEARCH-007_INDEXING_AND_FRESHNESS_PIPELINE.md` ·
`docs/Engineering-OS/BUILD_WAVE_9_BATCH_3_PERMISSION_AWARE_SEARCH.md` ·
`docs/Engineering-OS/BUILD_WAVE_9_BATCH_4_SEARCH_FILTERS_AND_FACETS.md`

---

## DEC-047

**Category**

Engineering

**Title**

Human Acceptance Testing Is a Mandatory Release Gate

**Status**

Approved

**Decision**

Automated verification does not constitute final product acceptance. Type
checking, linting, unit and integration tests, mutation testing, static
verification, builds, security scans and architecture review remain mandatory,
but they are necessary rather than sufficient.

Major learner-facing engines require Founder/Human Acceptance Testing conducted
against the running application **in a browser** before final product
acceptance. Reviewing source, unit tests, verifier output, test-generated
screenshots or implementation reports does not satisfy this.

Human UAT occurs at meaningful engine or workflow boundaries rather than after
every implementation batch. It is an additional gate, never a replacement for
automated testing, CI, security testing, accessibility automation or
architecture review, and it may block acceptance even when CI is green.

Findings are classified as blocking, non-blocking, or not a defect. Material
defects return through the normal scoped implementation, review, test and commit
workflow rather than being fixed silently during the review.

The Search Engine passes through SEARCH-001 to SEARCH-008 implementation, the
automated Search Engine completion gate, Founder browser UAT, resolution of
blocking findings, and only then Search Engine final product acceptance. The MVP
passes through automated completion and assurance, real-environment or
integration verification where required, an end-to-end Founder UAT across the
learner journey, resolution of blocking findings, and only then final MVP
acceptance.

A security property requiring real infrastructure to verify — row level
security, cross-user isolation, live database behaviour — must not be
represented as proven because mocked or unit tests pass.

Recorded implementation limitations, including the absence of a DOM or browser
harness and the absence of a live PostgreSQL or RLS harness, must not silently
become permanent accepted limitations. Before MVP production acceptance each
material limitation receives exactly one disposition: replaced by executable
automated verification, verified through human or integration or UAT testing, or
explicitly accepted by the Founder as a documented residual limitation.

**Rationale**

Every Search batch to date has recorded honestly that its authorization claims
are query-level rather than live-database proof, and that rendered markup is not
runtime-verified because `apps/web` has no DOM harness. Those disclosures are
accurate, but nothing in the governance previously required them to be resolved
before release — so a green pipeline could have been mistaken for product
acceptance. This closes that gap without weakening any existing gate.

**Alternatives Considered**

Adding a browser test framework such as Playwright or Cypress was not chosen
here: it is an implementation decision with dependency and infrastructure
consequences, and it would not by itself establish the governance requirement.
Creating a separate UAT tracking subsystem was rejected in favour of integrating
into the existing Engineering OS standards, MVP Implementation Sequence and MVP
Release Gate.

**Impact**

Governance and documentation only. No application code, dependency, schema,
migration or feature status changed. No feature was marked complete.

**Related Documents**

`docs/Engineering-OS/Engineering-OS.md` section 6 ·
`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md` sections 11, 15c, 15d and 16 ·
`docs/Roadmap/RELEASE_PLAN.md`

---

## DEC-048

**Category**

Engineering

**Title**

Autonomous Execution Within an Approved Objective

**Status**

Approved

**Decision**

Command-by-command approval of routine Claude Code shell operations is
discontinued. Once the Founder approves an implementation objective, the ordinary
non-destructive engineering work required to accomplish it is pre-authorized, and
the AI must not repeatedly ask whether to proceed with it.

The control model becomes: approved objective, autonomous implementation,
automated verification, fail-closed inventory review, architecture review, commit
authorization, designated Human UAT.

Approval remains mandatory for consequential actions: executing migrations or
mutating persistent data; dependency and toolchain changes; secrets, credentials
and anything weakening a security control; destructive file or database
operations; force push, history rewriting or amending an approved commit;
deployment and production infrastructure; and material architecture or product
scope change. CERT-008's migration remains unexecuted unless separately
authorized.

Commit and push remain boundaries. The default is implement, verify, report, stop
before commit. When commit and push are authorized, the entire safe sequence —
inventory verification, explicit staging, commit, author/committer/attribution
verification, push and synchronization verification — is authorized as one
operation. Force push is never permitted.

An obviously required existing file omitted from an initial inventory may be
included without interrupting the Founder, provided it does not materially expand
architecture or scope, weaken security, add a dependency or execute a migration,
and the final report records it. Material scope expansion still stops.

Mutation testing is pre-authorized to prove test and verifier effectiveness,
subject to controlled application, verified byte-identical restoration, and honest
reporting of any surviving mutation.

Human UAT remains mandatory at the DEC-047 checkpoints. The AI may prepare
runtime instructions, scenarios, fixture requirements and evidence templates, but
may never mark Human UAT passed.

The detailed standard is recorded in `docs/Engineering-OS/Engineering-OS.md`
section 7, which CLAUDE.md references as binding.

**Rationale**

The Founder cannot remain at the workstation approving routine shell commands one
at a time, and repetitive approval was consuming attention without adding
assurance — approving `grep` a hundred times does not make a migration safer. The
assurance that matters is verification evidence, inventory review, architecture
review and Human UAT, all of which are strengthened rather than relaxed here.
This changes who confirms mechanism, not who decides consequence.

**Alternatives Considered**

Blanket permission bypass was rejected: it removes the consequential-action
boundary entirely. A new approval-tracking subsystem was rejected in favour of the
existing Engineering OS standards and this ledger, so no parallel governance
system exists.

**Impact**

Governance, documentation and the project Claude Code permission configuration.
No application code, test, verifier, dependency, schema or migration change.

`.claude/settings.json` now allows routine repository-local inspection, editing,
test, build and verification commands, and **denies** the consequential ones:
`supabase db push` / `db reset` / `migration up` / `migration repair`, `psql`,
`pg_dump`, `pg_restore`, `git push --force` / `-f` / `--force-with-lease`,
`git reset --hard`, `git rebase`, `git commit --amend`, history rewriting,
`rm -rf`, `sudo`, deployment commands, and reading or editing any `.env` file.
`defaultMode` remains `default`, so anything neither allowed nor denied still
prompts. There is no `bypassPermissions`, no `--dangerously-skip-permissions`,
and no blanket `Bash(*)` rule. Dependency commands are deliberately left to
prompt rather than denied, so an authorized dependency change is still possible.

`.claude/settings.local.json` is machine-local and gitignored; ineffective glob
syntax there was removed in favour of correct prefix rules in the tracked file.

**Deny rules are defence in depth, not a sandbox.** They match command strings,
so flag position and shell composition can evade them. Engineering OS section 7
and this decision remain the authoritative boundary even where a pattern could
technically be evaded.

**Related Documents**

`docs/Engineering-OS/Engineering-OS.md` section 7 · `CLAUDE.md` binding documents
and Change Control · `docs/Project/DECISION_LEDGER.md` DEC-047 ·
`.claude/settings.json`

---

## DEC-049

**Category**

Product

**Title**

Learn By Doing Is Platform-Wide, and the MVP Proves One Connected Learning Experience

**Status**

Approved

**Decision**

Learning by doing is the platform's **default** instructional model, not an
enhancement. Video, reading, demonstration and explanation remain available where
they genuinely help, but must never become the default merely because they are
easiest to produce. Every learning experience is designed by asking what the
learner can **do**, not what they have consumed.

The instructional lifecycle is `Learn → Practice → Demonstrate → Reuse → Connect
→ Troubleshoot → Retain`. The first three occur within one experience; reuse,
connection and troubleshooting occur in later experiences using competencies
already demonstrated. **Course completion alone is not evidence of durable
learning.**

Previously demonstrated competencies must intentionally recur in later
experiences rather than lapsing. **Cross-course competency reinforcement is MVP
scope**, not a future extension. Reinforcement is **contextual** — expressed as
part of the new task rather than as a repeated quiz — and the platform does not
reteach an earlier lesson unless the learner needs help. Reinforcement never
becomes pressure: no streaks, no guilt, no inactivity penalties, no forced
repetition of mastered material.

Cross-domain integration is intentional. Networking, operating systems, security,
cloud, databases, applications and infrastructure must not become isolated silos.

The AI tutor supports this model. It may explain differently, give examples,
detect struggle with a previously demonstrated competency, offer graduated hints,
give a short refresher, connect current work to prior learning, help interpret
deterministic lab failures, and ask reflective questions. It may **not** silently
complete the learner's work, replace deterministic validation, manufacture
competency evidence, or decide a lab passed on conversational judgement.

Labs are a core instructional mechanism for subjects that benefit from hands-on
work. The Lab Engine stays provider-neutral; an infrastructure provider such as
Proxmox sits beneath that abstraction, exposes only what the Lab Engine requires,
is never the learning domain model, and never grants students hypervisor or
provider administrative access. Educational continuity does not require
environment continuity: deterministic environments may be recreated from
templates, snapshots or fixtures. What persists is competency evidence,
instructional continuity, reinforcement history where appropriate, and the
conceptual relationship between prior and current work.

A failed lab must return an actionable fact. The validator owns the factual
pass/fail state; the tutor may explain it. Those roles never merge.

The MVP learning product is one **connected** experience, working title
**IT & Cybersecurity Foundations**:

```text
01 Router-on-a-Stick / Build the Network   (substantive networking course)
02 Linux Fundamentals                      (focused, reuses networking)
03 Windows Fundamentals                    (focused, reinforces networking)
04 Security Fundamentals                   (integrates prior learning)
05 Integrated Challenge                    (combines competencies, unannounced)
```

Detailed lesson plans, module breakdowns and completion-time estimates are **not**
approved by this decision and require separate authorization.

**Rationale**

The engines were built before the educational product they exist to serve was
described in this much detail. Without this decision the repository could
reasonably be read as a video LMS with four unrelated courses, labs as optional
extras, Proxmox as the domain model, or course completion as equivalent to
competency. Each of those readings is wrong, and none was previously excluded in
writing.

Recording the connected path also closes a real gap: the MVP Release Gate
(`MVP_IMPLEMENTATION_SEQUENCE.md` §16) requires at least one publishable course
and one practical lab, but no build wave produced curriculum content.

**Alternatives Considered**

Leaving philosophy implicit in the engine contracts was rejected: general
contracts permit this model but do not require it, and a future builder following
the letter of the specifications could deliver a passive content platform without
violating anything.

Expanding the MVP catalog was rejected. Proving one connected experience well is
the point; breadth is the failure mode this decision guards against.

**Impact**

Documentation and product scope only. No implementation code, schema, migration,
dependency or Feature acceptance criterion changed by this decision.

**Cross-course competency reinforcement is MVP scope.** `LEARN-008 — Review and
Reinforcement State` previously recorded it under Future Extensions as "Not part
of the initial MVP." The Founder has ruled that a competency demonstrated in one
experience must be capable of intentionally reappearing in a later one, so the
deferral was removed and the Feature now records the accurate position in its
section 8.1. What remains deferred there is *automatic and adaptive*
reinforcement scheduling, which the MVP does not require.

That correction changed no acceptance criterion, no Definition of Done and no
implementation. The completed Wave 3 Learning Engine is **not** reopened.

Verification established that the substrate is already course-agnostic:
`student_review_state` and `student_competency_state` are keyed on the competency
stable id with no course or path column, the retrieval services return every
competency a learner holds regardless of origin, and `mission_competencies`
already permits a later mission to reference an earlier competency.

Three implementation gaps are recorded honestly rather than assumed away, and
each requires its own authorization:

1. `mission_competencies` carries only `required` and cannot yet distinguish a
   mission that **teaches** a competency from one that **reuses** it. Adding that
   distinction requires a migration.
2. The already-approved "curriculum-defined reinforcement checkpoint" trigger has
   no writer; review state is currently written only from the readiness path.
3. No learner-facing surface tells a learner that current work draws on a
   competency they already proved.

One further item was examined and deliberately not changed:

- `PLATFORM_BLUEPRINT.md` §6.1 illustrates a nine-step long-horizon progression
  ending in Ethical Hacking. It is an example of dependency ordering, not an MVP
  declaration, and was left unchanged. `Product-OS.md` is the authority for MVP
  path scope.

`CURR-002` §18 defers "cross-domain paths". Read alongside the neighbouring
entries — multiple role-based paths, elective branches, employer-specific
variants — that defers path *variants*, not a single path spanning domains. §5
already includes "future extensibility across technical domains" and ordered
course references, so the connected MVP path needs no CURR-002 change. Examined,
no conflict.

`Product-OS.md` previously recorded a different six-course MVP progression that
included a student-facing Proxmox course and Windows Domain work. That record
contradicted this decision and was corrected.

Search Engine acceptance boundaries are unchanged: Human Search UAT remains
pending and final Search product acceptance is not granted.

**Related Documents**

`docs/Learning-OS/Learning-OS.md` sections 3, 4.1, 9.1, 9.2, 15.1–15.3 and 21 ·
`docs/Product-OS/Product-OS.md` Learning Philosophy and MVP Learning Paths ·
`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md` §15e and §16 ·
`docs/Project/NOT_NOW.md` ·
`docs/Feature-Registry/Learning-Engine/LEARN-008_REVIEW_AND_REINFORCEMENT_STATE.md` ·
`docs/Feature-Registry/Lab-Engine/LAB-012_PROXMOX_LAB_PROVIDER.md`

---

## DEC-050

**Category**

Engineering

**Title**

Native GitHub Is the Development Handoff Layer

**Status**

Approved

**Decision**

Native GitHub becomes the shared communication, handoff and source-of-truth layer
between the Founder, the ChatGPT Architect and Claude Code. The mapping is:

| Artefact | Meaning |
|---|---|
| **Issue** | an architect-approved, Founder-sanctioned bounded work package |
| **Feature branch** | Claude Code's implementation workspace |
| **Pull request** | implementation evidence and the architecture-review surface |
| **GitHub Actions** | the automated quality gate |
| **PR review comments** | the architecture correction loop |
| **Merge to `main`** | the approved source-of-truth transition |

One bounded work package normally maps to one issue, one feature branch and one
pull request. Internal implementation checkpoints are **automated**, not Founder
relay points: the Founder is asked to act at consequence, not at cadence.

**No custom orchestration platform is approved or necessary.** Assessment found
no requirement that native GitHub cannot meet, so no orchestration service, agent
platform, LangGraph, message queue, additional database, GitHub App or webhook
infrastructure is authorized for this purpose.

The Founder remains the authority for every consequential gate — migration
execution, deployment, destructive operations, git history rewriting, secrets,
dependency changes, material architecture or scope changes, provider and
infrastructure consequences — and for Human UAT, subjective product acceptance,
and merge to `main`.

**Commits are attributed only to the Founder/user.** Claude, Anthropic, ChatGPT,
OpenAI or any other AI system must never appear as author, committer, co-author
or attribution trailer. The standard is recorded in `Engineering-OS.md` section 7.

**Rationale**

Governance already permitted most of this. `Engineering-OS.md` section 7 (DEC-048)
pre-authorizes ordinary implementation within an approved objective and stops
autonomy at consequence. What remained was a *communication* problem: the Founder
was relaying work packages, implementation reports, validation evidence and
architecture corrections by hand between two AI systems, which is effort without
judgement.

GitHub already holds the code, the CI and the history. Making it hold the handoff
removes the relay without weakening a single gate, and every element of the model
maps onto a primitive the repository already has.

**Alternatives Considered**

A custom orchestration layer was rejected: the assessment found no mandatory
requirement native GitHub fails to meet, and it would add infrastructure to
maintain, secure and reason about for no governance benefit.

Continuing the existing per-slice relay was rejected because it scales with the
number of tasks rather than with their consequence.

**Impact**

Governance and repository configuration. This decision authorizes the direction;
it does not by itself change Claude's commit or push permissions, which remain as
`Engineering-OS.md` section 7 defines them until a later work package changes
them explicitly.

Two Wave 8 commits (`ee726a0`, `8795112`) predate the attribution rule and carry
an AI co-author trailer. They are recorded rather than rewritten: removing them
would require rewriting published history, itself a Founder-gated operation.
Automated attribution checks must therefore judge new commits, not all history.

Branch protection for `main` is **designed but deliberately not applied** by this
decision; it changes repository governance and is proposed separately for Founder
approval.

**Related Documents**

`docs/Engineering-OS/Engineering-OS.md` section 7 ·
`.github/ISSUE_TEMPLATE/work-package.md` ·
`.github/pull_request_template.md` ·
`.github/workflows/ci.yml` ·
`docs/Project/DECISION_LEDGER.md` DEC-047, DEC-048 ·
`CLAUDE.md` Authority Model and Change Control

---

# Future Decisions

Future decisions will continue using this numbering scheme.

Once a decision becomes **Locked**, it should only be changed by creating a new decision that explicitly supersedes it.

Previous decisions remain part of the permanent project history.

