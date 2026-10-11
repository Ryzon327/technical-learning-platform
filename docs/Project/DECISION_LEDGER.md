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

Approved — course list amended by DEC-053

> **Amendment notice.** DEC-053 inserts **Networking Foundations** ahead of
> Router-on-a-Stick in the connected MVP path. Only the five-course list in this
> decision is superseded. Everything else DEC-049 approved — the learn-by-doing
> default, the instructional lifecycle, cross-course reinforcement as MVP scope,
> contextual rather than quiz-shaped reinforcement, labs as a core instructional
> mechanism, provider neutrality, and the AI authority boundaries — remains in
> force and is unchanged. The list below is retained as the historical record.

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

## DEC-051

**Category**

Engineering

**Title**

The GitHub Handoff Workflow Is Active

**Status**

Approved

**Decision**

DEC-050 approved the direction. This activates it.

**Ordinary feature-branch Git and GitHub operations are pre-authorized** for an
architect-approved work package. Within that scope Claude Code creates the
feature branch, edits in-scope files, runs validation, stages specific paths,
creates Founder-attributed commits, pushes the feature branch, opens and updates
the pull request, publishes evidence there, reads CI, and corrects ordinary
in-scope failures on the same branch — **without Founder relay between steps**.

**Internal work-package checkpoints no longer stop for the Founder.** The
milestone model is now three states: an internal checkpoint validates and
continues; implementation completion opens or updates the pull request and waits
for CI and architecture review through GitHub; a Founder gate stops only when a
consequential approval or Human UAT is genuinely required.

**Merge to `main` remains Founder-controlled.** `main` is branch-protected:
pull requests required, the `verify` status check required, force pushes and
branch deletion disabled, conversation resolution required. `enforce_admins` is
deliberately `false` and `required_approving_review_count` is `0` because this is
a single-maintainer repository — GitHub does not permit self-approval, so any
higher count would permanently block every merge.

**Every consequential Founder gate from DEC-048 is unchanged**: migration
execution, deployment, destructive operations, history rewriting, secrets,
dependency changes, material architecture or scope changes, provider and
infrastructure consequences, Human UAT, and subjective product acceptance.

**AI attribution remains prohibited.** Commits carry the Founder's identity only.

**Direct push to `main` is not the implementation workflow.** WORKFLOW-
MODERNIZATION-2 included exactly one architect-authorized bootstrap push
(`555cce5`) to place the templates and governance on `main` before protection was
activated. Implementation work uses a feature branch and a pull request.

**Rationale**

DEC-048 already stopped autonomy at consequence rather than at cadence, but the
handoff itself was still manual: the Founder relayed work packages, reports,
validation evidence and architecture corrections between two AI systems by hand.
That is effort without judgement. Moving the handoff into GitHub removes the
relay without removing a single gate, because GitHub already holds the code, the
CI and the history.

**Alternatives Considered**

Leaving commit and push as per-task approvals was rejected: it made the Founder a
message bus for work they had already approved, and the approval added no
information beyond the work package itself.

Requiring one approving review on the pull request was rejected as unusable — a
sole maintainer cannot approve their own pull request, so it would block every
merge rather than add scrutiny.

**Impact**

Governance and repository configuration.

* `CLAUDE.md` — Change Control rewritten around the work-package model, with the
  pre-authorized cycle, the never-independently list, and milestone semantics.
* `docs/Project/MASTER_BUILD_PROMPT.md` section 19 — the manual
  `git add`/`commit`/`push` instruction is superseded; the Founder's Git role is
  review and merge.
* `.claude/settings.json` — narrowly widened for feature-branch work. Every
  previous deny is preserved and new denies were added for pushing to `main`,
  branch deletion, `git add .`, `gh pr merge`, mutating `gh api` verbs and
  secrets.

**Known limitation, recorded rather than papered over.** Claude Code permission
rules match command strings, so a feature-branch-only push rule cannot be
expressed exhaustively — the allow-list permits `wp/` branches and the deny-list
names the known `main` push forms, but string matching can be evaded by an
unanticipated spelling. This is defence in depth, consistent with
`Engineering-OS.md` section 7. Branch protection is a second layer, though with
`enforce_admins: false` it does not hard-block an administrator's direct push.
**Governance remains the actual control.**

`.claude/settings.local.json` is untracked and machine-local, and currently
carries broader grants than this decision intends. It is outside this decision's
authority to alter and is flagged for Founder review.

No application code, schema, migration or dependency changed. 36 migrations,
none executed.

**Related Documents**

`docs/Project/DECISION_LEDGER.md` DEC-047, DEC-048, DEC-050 ·
`CLAUDE.md` Change Control ·
`docs/Engineering-OS/Engineering-OS.md` section 7 ·
`docs/Project/MASTER_BUILD_PROMPT.md` section 19 ·
`.github/ISSUE_TEMPLATE/work-package.md` · `.github/pull_request_template.md`

---

## DEC-052

**Category**

Engineering

**Title**

Command Shape Is a Requirement, and Autonomy Is Verified by a Committed Test

**Status**

Approved

**Decision**

**The command-shape rule is mandatory, not advice.** When a safe operation has
an allowed simple command form, Claude Code must use that form. Wrapping an
allowed command in `| head`, `| tail`, `| grep`, `2>&1`, `> logfile`, `;`, `&&`,
`||`, a shell loop, a command substitution or a subshell **to shorten, format,
collate or monitor output is prohibited.** Claude Code reads full command output
directly; shell formatting for its own convenience is never a justification.

**One permission rule covers the whole verifier namespace.** `npm run gate --
<name>` resolves `scripts/verify-<name>.sh` and nothing else. Adding a verifier
therefore never requires a new permission rule, and per-verifier rules are
prohibited.

**Verifiers never require `chmod`.** Every caller invokes them as
`bash <script>`, so the execute bit is not load-bearing. Verifiers must test
`[ -f … ]`, never `[ -x … ]`.

**CI is watched with `gh pr checks <PR> --watch`.** Shell polling loops are
prohibited.

**Executing arbitrary scratchpad scripts is not part of the autonomous path.**
It needs an absolute path that no repository-relative rule can match, and that
is deliberate.

**`.claude/settings.local.json` must never be what makes the workflow function.**
Autonomy rests on committed configuration so it survives a fresh clone.

**Every consequential Founder gate is unchanged.** The deny list is unchanged at
63 rules, and `scripts/verify-autonomy.sh` fails if any required boundary is
removed or if an over-broad allow rule is introduced.

**Rationale**

DEV-FLOW-1 stated the command-shape practice as guidance and asserted a "100%
correct" permission matrix from an uncommitted scratchpad script. ROAS-2 then
produced at least twelve routine approval prompts. Both failures share a cause:
a claim that nothing could contradict. The matrix was never re-run, and the
guidance carried no consequence for ignoring it.

The correction is to make the policy a prohibition and the claim a committed,
CI-selected test.

**Honesty about what is not knowable.** Claude Code's matching behaviour for a
rule whose prefix ends *mid-token* — `Bash(bash scripts/:*)`,
`Bash(git push -u origin wp/:*)` — is not observable from inside this
repository. DEV-FLOW-2 does not guess. Commands are classified under both a raw
string-prefix reading and a whole-word reading, and any command that depends on
the former is reported as `PREFIX-DEPENDENT` rather than claimed as solved. The
high-frequency operation, running verifiers, was moved onto a form that is
robust under either reading.

**Alternatives Considered**

Broadening `Bash(git push -u origin:*)` to make feature-branch push robust under
both readings was rejected: it would permit pushing any non-`main` branch to
reduce a prompt that occurs once per work package, and the Founder scoped pushes
to `wp/*`.

Adding machine-local "don't ask again" entries was rejected outright. It hides a
gap rather than closing it, and it does not survive a fresh clone.

Adding a per-verifier allow rule for each new gate was rejected as unbounded —
it is the pattern that produced five stale absolute-path entries in
`settings.local.json`.

**Impact**

Governance, permissions and verification tooling.

* `CLAUDE.md` — the command-shape section is now a prohibition with explicit
  wrong/right pairs, plus verifier, CI-monitoring, scratchpad and machine-local
  settings policy.
* `scripts/run-gate.sh` — new namespace-safe entry point; containment is
  executed, not asserted in prose.
* `scripts/verify-autonomy.sh` — new committed acceptance test, selected by CI
  whenever permissions, policy or the entry point change.
* `scripts/ci-select-gates.sh` — accepts paths as arguments; the CI stdin path
  is byte-identical.
* `scripts/verify-lab-engine-completion.sh`,
  `scripts/verify-certificate-engine-completion.sh` — `[ -x ]` replaced by
  `[ -f ]`, which also removes a latent bug where a lost mode bit would silently
  skip four Wave 6 verifiers while the gate still reported success.
* `.claude/settings.json` — one rule added, `Bash(npm run gate:*)`. No deny rule
  changed.
* `package.json` — one `scripts` entry. No dependency added; the lockfile is
  unchanged.

**Known limitation, recorded rather than papered over.** This test proves
classification, not lived experience. It cannot observe whether Claude Code
actually prompted. The real acceptance signal is the next work package
completing without Founder clicks, and DEV-FLOW-2 does not claim that signal in
advance.

No application code, schema, migration or dependency changed. 36 migrations,
none executed.

**Related Documents**

`docs/Project/DECISION_LEDGER.md` DEC-047, DEC-048, DEC-050, DEC-051 ·
`CLAUDE.md` Change Control — Mandatory Command Shape, Running verifiers,
CI monitoring, Scratchpad scripts, Machine-local settings ·
`docs/Engineering-OS/Engineering-OS.md` section 7 ·
`.claude/settings.json` · `package.json` ·
`scripts/run-gate.sh` · `scripts/verify-autonomy.sh` ·
`scripts/ci-select-gates.sh` · `.github/workflows/ci.yml`

---

## DEC-053

**Category**

Product

**Title**

Networking Foundations Enters the Connected MVP Path Ahead of Router-on-a-Stick

**Status**

Approved

**Decision**

The connected MVP learning path, working title **IT & Cybersecurity Foundations**,
is amended to:

```text
01 Networking Foundations                  (develops foundational net.* competencies)
02 Router-on-a-Stick / Build the Network   (applies and reinforces them)
03 Linux Fundamentals                      (focused, reuses networking)
04 Windows Fundamentals                    (focused, reinforces networking)
05 Security Fundamentals                   (integrates prior learning)
06 Integrated Challenge                    (combines competencies, unannounced)
```

**Networking Foundations develops** the reusable foundational `net.*`
competencies. **Router-on-a-Stick and later applicable courses reinforce and
reuse** competencies already developed rather than claiming to develop them for
the first time.

This **amends the five-course list in DEC-049** and nothing else in it.

---

**Amended — the two-course Networking Foundations learning path.**

DEC-053 is **Approved** rather than Locked, so it is extended in place; the
ledger's convention reserves a superseding decision for a Locked entry. The
course sequence above is unchanged. What is added is the boundary between courses
01 and 02, which DEC-053 established but never drew.

Networking Foundations must grow a hands-on portion under DEC-062. Without a
recorded boundary, that work would overlap Router-on-a-Stick, which is already
authored and gated. The Architect ruling is:

1. **Networking Foundations remains Course 01.**
2. **Router-on-a-Stick / Build the Network remains Course 02.** It is neither
   merged nor retired.
3. The two courses together form the progressive **Networking Foundations
   learning path**:

   ```text
   COURSE 01  UNDERSTAND → OPERATE → ADDRESS → VERIFY → SAVE
              → PROVE FOUNDATIONAL STATE

   COURSE 02  BUILD → SEGMENT → TRUNK → ROUTE → MANAGE → SERVE → REBUILD
              → CONNECT → OSPF → TROUBLESHOOT → SAVE → PROVE THE NETWORK
   ```

4. **Course 01 is expanded only enough** to establish conceptual network
   behaviour, CLI operation, practical addressing and subnetting, inspection and
   verification, bounded configuration, and configuration persistence.
5. **Course 02 retains ownership** of VLANs, access-port segmentation, trunks and
   802.1Q, Router-on-a-Stick, and practical network construction and
   troubleshooting. Course 01 does not acquire those competencies.
6. **Course 02 is approved for future Architect-authored expansion** to secure
   management and SSH, foundational services, a second ROAS site, router transit
   and static routing, foundational single-area OSPF, operational networking, and
   a two-site capstone.
7. **Existing Router-on-a-Stick curriculum, competencies, gates and work are
   preserved and extended, never retired.**
8. **This amendment authorizes no practical implementation.** Each area is built
   under its own approved work package.

The scope of each course, the two-site target, the OSPF boundary, the evidence
doctrine, the assistance gradient and the configuration-persistence competency
are recorded in **`CURR-012`**, which is the operative document. The validator
contract is in `LAB-008`; the Learn/Do/Prove infrastructure mapping in `LAB-012`.

Nothing in this amendment alters DEC-062, DEC-049's cross-course reinforcement
requirement, or the competency ownership `WP_J_CROSS_COURSE_TRANSITION.md`
records as pending.

---

**Rationale**

The BEGINNER-COMPLETE-1 audit established that Router-on-a-Stick begins above the
floor the Zero-Assumption Learning Gate sets. Its Mission 1 requires IPv4 address
structure, prefix length as a comparable quantity, subnet membership, device
roles and the default-gateway relationship, and teaches none of them — while the
practice placed at that mission tests a generalisation the instruction never
supplies. The teaching in Missions 2 through 6 is sound; the floor beneath it is
missing.

Four structural options were evaluated. Expanding Mission 1 and adding a module
inside Router-on-a-Stick were both rejected because foundations authored inside
one course cannot be referenced by Linux, Windows, Security or Cloud, so the same
material would be re-authored per course — the outcome DEC-049's cross-course
reinforcement requirement exists to prevent. A separate reusable course was
necessary but not sufficient on its own, because pure separation loses the
contextual reinforcement `Learning-OS.md` section 21.2 requires. The approved
hybrid authors foundations **once**, as a reusable course developing
domain-scoped competencies, and has Router-on-a-Stick apply them in context.

**This also resolves a conflict that was flagged rather than repaired.**
`PLATFORM_BLUEPRINT.md` section 6.1 already records the guided progression as
Computer Foundations → Networking Foundations → Windows and Linux Foundations,
and `LEARN-004` section 2 already records that "Router-on-a-stick assumes basic
switching and VLAN knowledge". DEC-049 nonetheless placed Router-on-a-Stick at
the entry point. The Blueprint needs no change; this decision brings the MVP path
into agreement with it.

**Alternatives Considered**

Expanding Mission 1 — rejected: eleven required foundations do not fit a
45-minute mission whose current job is a good one, and nothing produced would be
reusable.

A foundations module inside Router-on-a-Stick — rejected for reuse and for
ownership: a later course would have to reference a module inside a networking
course to declare a networking prerequisite, and Router-on-a-Stick would become
the owner of platform-wide foundations. Retained as the fallback if the MVP
cannot absorb an additional course.

Leaving the path unchanged and lowering the difficulty of Missions 6 and 7 —
rejected outright. The answer to a course being too hard for beginners is to
build the steps below it, never to reduce the competency it proves.

**Impact**

Product scope and documentation. No implementation code, schema, migration or
dependency changed by this decision.

* `docs/Product-OS/Product-OS.md` — MVP Learning Paths corrected to six entries.
* `docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md` section 15e — corrected, with the
  superseded list retained as history.
* `docs/Project/DECISION_LEDGER.md` — DEC-049 carries an amendment notice.

Detailed lesson plans, module breakdowns and completion-time estimates remain
**not approved** and require separate authorization, exactly as DEC-049 stated.

`NOT_NOW.md` is not reopened. Networking Foundations is a prerequisite course
inside the already-approved connected experience, not catalog expansion.

**Related Documents**

`docs/Project/DECISION_LEDGER.md` DEC-049 ·
`docs/Product-OS/Product-OS.md` MVP Learning Paths ·
`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md` section 15e ·
`docs/Project/PLATFORM_BLUEPRINT.md` section 6.1 ·
`docs/Feature-Registry/Learning-Engine/LEARN-004_PREREQUISITE_ENFORCEMENT.md`

---

## DEC-054

**Category**

Architecture

**Title**

Instructional Steps Are Content Beneath a Mission, Not a Curriculum Node

**Status**

Approved

**Decision**

The curriculum hierarchy is:

```text
Course → Module → Mission → ordered instructional steps
```

**Mission remains the authoritative unit** for learner progress, resume and
navigation, prerequisite evaluation, competency relationship, lab association and
completion.

**Instructional steps are content beneath a mission.** They are not curriculum
nodes, and they do not independently own publication state, version, learner
progress, competency, prerequisite, completion, evidence or supersession. A step
publishes with its mission, versions with its mission, and is read only when its
mission is published.

The approved step-type vocabulary is closed at **seven**:

`concept` · `diagram` · `command` · `prediction` · `interaction` · `practice` ·
`reference`

Semantic boundaries that are part of this decision:

* An **example** is `concept` content. A type that changes no rendering,
  accessibility, validation or projection behaviour is decoration.
* **`command`** carries a displayed command and/or displayed output. They are one
  instructional unit and are not split across two steps.
* **`checkpoint`** is not an instructional-step type. The curriculum-defined
  reinforcement checkpoint recorded in `LEARN-008` is a **Learning Engine**
  trigger; placing it in curriculum content would put a Learning Engine concept
  in a Curriculum Engine table and pre-empt an unauthorized design.
* **`practice`** points at an assessment by stable id and never duplicates
  assessment content.
* **`reference`** is optional enrichment. It **may never carry prerequisite
  instruction required to satisfy BEGINNER-COMPLETE-1.** If a learner must read
  it to proceed, it is a `concept`.

**A Lesson curriculum node is rejected for now.** It may be reconsidered only if a
future requirement genuinely needs an independently addressable instructional
unit — independent lesson progress, or cross-course lesson reuse.

---

**Amended — the vocabulary is closed at eight (WP-NF-NT1).**

DEC-054 is **Approved** rather than Locked, so it is extended in place; the
ledger's convention reserves a superseding decision for a Locked entry. Nothing
above changes: a step is still content beneath a mission, still owns no
publication state, version, progress, competency, prerequisite, completion or
evidence, and a Lesson node is still rejected.

An eighth type is added:

`concept` · `diagram` · `command` · `prediction` · `interaction` · `practice` ·
**`near_transfer`** · `reference`

**`near_transfer`** asks the learner to apply a concept they have just been
taught to a **different but structurally related situation**, inline, before the
mission's closing handoff. It carries its own scenario, its own deterministic
questions, and an authored explanation for each.

It qualifies under this decision's own test. DEC-054 admits a type that changes
rendering, accessibility, validation or projection behaviour, and rejects one
that changes none of them as decoration. A near-transfer check changes all four:
a new interactive renderer, fieldset-and-live-region semantics, a full payload
contract in `near-transfer.ts`, and an answer-bearing projection that separates
the answer from the question.

**Why it is not one of the seven.** It is not `practice`: practice points at an
assessment by stable id, is optional, and carries a standing promise that it is
not recorded and does not complete the mission — while a near-transfer check is
required instruction inside the mission, and is not an assessment at all. It is
not `prediction`: that step type is read-only and resolves nothing. It is not
`interaction`: the interaction registry is closed at `packet_journey`, and a
transfer question is not a journey.

**What it must never become.** It produces no score, no percentage, no points, no
attempt history, no evidence and no competency state, and it never blocks a
learner for answering incorrectly — the requirement is engagement and feedback,
not a passing mark. **Architect Decision 4 is untouched**: this publishes no
`AssessmentDefinition`, records no attempt, and adds no assessment API write.

**Amended, Mission 1 closeout — required means FINISHED, not merely answered.**
The decision is Approved rather than Locked, so it is extended in place; the
ledger's convention reserves a superseding decision for a Locked entry. Nothing
above changes.

Where a near-transfer check is **required**, the mission's completion action
waits for the activity to be **finished** — every question attempted *and* its
authored feedback read past — rather than for the answers alone. Rendered UAT
found a learner able to mark a mission complete while the final verdict and
explanation were still on screen, with the closing instruction still withheld
behind the same button. Reading the authored feedback is part of the
instruction, so the two now wait on the same event.

**Correctness is still not a gate**, and the clause above is unchanged by this:
what is counted is feedback dismissed, never answers right. A learner who
answered every question wrongly finishes exactly as one who answered them all
correctly does, and one button press is all that stands between any learner and
the next step. No score, percentage, attempt history, evidence or competency
state is introduced. Recorded in `CURR-010` revision 1.3.

The five-way pedagogical distinction — prediction, knowledge check,
near-transfer, practice, mastery — is recorded **once**, in `CURR-010` §8.2,
directly beneath the step-type table it disambiguates. Four of the five live in
or beside a step, so the vocabulary specification is the smaller and more
correct home than the quality checklist, which references near-transfer only as
a Tier 3 doctrine dimension and is not where a reader looks to find out what a
step type is.

**Rationale**

`student_learning_progress.node_type` is constrained to
`('learning_path','course','module','mission')`, and both `record_mission_progress`
and the progress aggregation function key on `node_type = 'mission'`. A Lesson
node would change two check constraints, two PL/pgSQL functions, the published
tree contract, `CurriculumNodeType`, `SEARCH_CONTENT_TYPES`, resume and
next-action — reopening the completed Wave 3 Learning Engine to gain an
instructional capability that steps provide without touching any of it.

Steps sit below the progress grain, so they require none of that. Verified
further: `curriculum_publish_learning_path_tree()` publishes by updating
`publication_state` on the five node tables. A step table carrying no
`publication_state` inherits publication through the same RLS pattern
`curriculum_assets` already uses, and the cascade function needs no change.

The vocabulary is held closed because a closed set is what makes typed rendering,
server-side projection and publication-blocking accessibility validation
tractable. Every additional type multiplies four contracts.

**Alternatives Considered**

Enriching the mission with further named columns (`professional_context`,
`activities`, …) — rejected: fixed named fields cannot express *repeated*
teach → predict → observe cycles, which is the approved instructional model, and
the pattern ends in many nullable columns by the fourth course.

Reusing `student_note_blocks` — rejected. It is the correct **shape** precedent,
and its shape is deliberately mirrored, but it is Knowledge Engine property
scoped to a learner's private notes. Sharing the table would violate
one-concept-one-owner and place private and published content under one RLS
policy set.

**Impact**

Architecture and documentation. No schema change is authorized by this decision.
`CURR-010 — Mission Instructional Steps` records the Feature.

**Related Documents**

`docs/Feature-Registry/Curriculum-Engine/CURR-010_MISSION_INSTRUCTIONAL_STEPS.md` ·
`docs/Feature-Registry/Curriculum-Engine/CURR-003_COURSE_MODULE_AND_MISSION_DEFINITION.md` ·
`docs/Feature-Registry/Learning-Engine/LEARN-008_REVIEW_AND_REINFORCEMENT_STATE.md` ·
`docs/Project/DECISION_LEDGER.md` DEC-053, DEC-056

---

## DEC-055

**Category**

Architecture

**Title**

A Mission Develops or Reinforces a Competency; Prerequisites Stay in learning_prerequisite_rules

**Status**

Approved

**Decision**

`mission_competencies` gains one semantic distinction:

| relationship | meaning |
|---|---|
| `develops` | this mission is accountable for teaching and developing the competency |
| `reinforces` | the learner developed it elsewhere; this mission deliberately applies and reuses it in another context |

**`requires` is deliberately NOT added.** `learning_prerequisite_rules` remains
the sole authoritative prerequisite mechanism.

The two questions have two owners:

* `mission_competencies` answers **"what does this mission do with this
  competency?"**
* `learning_prerequisite_rules` answers **"what must already be true before the
  learner enters this mission?"**

The existing `required` flag keeps its current meaning — required versus
supporting within the mission — and is orthogonal to `relationship`. A mission
can reinforce a competency that is nonetheless required to complete it.

**Rationale**

This closes the first of the three gaps recorded in DEC-049 and `LEARN-008`
section 8.1: curriculum cannot yet express whether a mission teaches or reuses a
competency.

It is also the direct cause of a real learner-facing defect. Practice placement
derives "developed at" from the first mission listing a competency as required,
so a practice check exercising IPv4 addressing is placed at Router-on-a-Stick
Mission 1 — a mission that applies addressing rather than teaching it. The
placement machinery is correct; its input is untrue. With `relationship`, the
derivation reads *first mission that **develops** it*, and the same machinery
produces the right answer unchanged.

Without this distinction DEC-053's central promise — that Router-on-a-Stick
reinforces rather than teaches the foundations — is expressible only in prose,
never in data.

**A `requires` value was specifically considered and rejected.**
`learning_prerequisite_rules` already carries four satisfaction types, a
mandatory learner-facing explanation, server-side evaluation, a fail-safe
`temporarily_unavailable` state, and a closed test-out loop through
`learning_requirement_satisfactions`. A `requires` value in `mission_competencies`
would be a second, weaker prerequisite mechanism with none of that — and the
weaker one would win by being closer to hand. One owner per concept.

**Alternatives Considered**

A three-value vocabulary including `requires` — rejected, above.

Inferring the relationship from mission ordering — rejected: ordering says where
a competency first appears, not whether the mission is accountable for teaching
it. That inference is exactly the error being corrected.

**Impact**

Requires one additive column with a preserving default, which keeps every
existing row's current meaning. **The migration is a Founder gate and is not
authorized by this decision.** Backfill is then a content decision per mission,
not a data conversion.

Extends `CURR-004 — Competency and Prerequisite Definitions`.

**Related Documents**

`docs/Feature-Registry/Curriculum-Engine/CURR-004_COMPETENCY_AND_PREREQUISITE_DEFINITIONS.md` ·
`docs/Feature-Registry/Learning-Engine/LEARN-004_PREREQUISITE_ENFORCEMENT.md` ·
`docs/Feature-Registry/Learning-Engine/LEARN-008_REVIEW_AND_REINFORCEMENT_STATE.md` ·
`docs/Project/DECISION_LEDGER.md` DEC-049, DEC-053

---

## DEC-056

**Category**

Architecture

**Title**

Curriculum Is Authored as Data Outside the Application Bundle

**Status**

Approved

**Decision**

Curriculum instructional content is **repository-authored data outside the
application bundle**. The initial authoring format is **JSON**.

```text
repository-authored JSON
→ shared schema validation
→ BEGINNER-COMPLETE / structural validation
→ CI
→ controlled publication command
→ curriculum tables
→ published learner read model
```

**The application owns HOW content renders. Curriculum data owns WHAT is taught.**

Compiled TypeScript curriculum constants are **not** the long-term authoring
model. No CMS is built now, and Router-on-a-Stick content is **not** migrated by
this decision.

**Rationale**

`CURR-003` section 16 already records the success metric *"Curriculum can be
created without modifying application code."* The Router-on-a-Stick course
currently violates it: the whole course is a TypeScript module compiled into the
web bundle, so authoring a course means changing application code and shipping a
new build.

JSON was chosen over the alternatives on specific grounds. YAML was rejected
despite being pleasanter to hand-write: significant whitespace and implicit
typing make silent misparse its failure mode, which is the wrong risk for content
a non-developer edits. Database-native authoring was rejected for now — it has no
review workflow, no diffs and no version control, and it needs the CMS this
decision declines to build. TypeScript data files are what we are moving away
from.

JSON gives schema validation, line-oriented diffs an architect can review, full
version history, and an inert substrate a future authoring tool can read and
write.

**One weakness is recorded rather than glossed over:** editing JSON is not a good
authoring experience for a non-developer. It is acceptable for the first courses
because edits are small and reviewable and the alternative is building a CMS now.
**Authoring tooling over this substrate is a genuine future requirement, not an
optional nicety.**

**Alternatives Considered**

YAML, TypeScript data files, database-native authoring — each rejected above.
Reusing an existing repository pattern was examined: `supabase/migrations` is
schema, not content, and `scripts/` is validation, not content. Neither fits.

**Impact**

Establishes a `content/` authoring location and a generalised publication
command. The command must reuse the safety posture already proven by
`services/api/src/admin/publish-roas-curriculum.ts` — dry run by default, an
exact-match confirmation naming the target project, unconditional refusal of
production, writes only through existing `curriculum-admin` operations, and
idempotency by stable-id lookup.

**The publication command must never contain course content.** It reads a file
path.

No implementation is authorized by this decision.

**Related Documents**

`docs/Feature-Registry/Curriculum-Engine/CURR-003_COURSE_MODULE_AND_MISSION_DEFINITION.md` section 16 ·
`docs/Feature-Registry/Curriculum-Engine/CURR-010_MISSION_INSTRUCTIONAL_STEPS.md` ·
`services/api/src/admin/publish-roas-curriculum.ts` ·
`docs/Project/DECISION_LEDGER.md` DEC-054

---

## DEC-057

**Category**

Product

**Title**

Instructional Quality Has Three Tiers, and Human UAT Is the Authority

**Status**

Approved

**Decision**

Curriculum instructional quality is governed in three tiers with three different
authorities.

**Tier 1 — Hard structural validation.** Objective, machine-verifiable invariants
**may block publication**. Examples: invalid step type; invalid payload for its
type; unresolved required reference; missing required accessibility alternative;
duplicate or invalid position; unregistered interaction type; structurally
prohibited content.

> **Clarification — what "structurally prohibited content" means.** It refers to
> prohibited content *structures* and prohibited execution or rendering
> *behaviour*: an executable authored payload, executable authored markup, or a
> field requesting an unsupported raw-markup interpretation.
>
> **It must never mean rejecting legitimate instructional plain text because that
> text resembles HTML, JavaScript, shell syntax, configuration syntax, a security
> payload example, or other code.** The platform has to be able to teach those
> subjects.
>
> The governing security rule is: authored plain-text and code-bearing fields are
> **inert**; renderers **escape** authored content; **no raw-HTML or
> markup-interpreting instructional rendering mode exists**; executable authored
> payloads and markup are prohibited; **code-looking instructional strings are
> valid content**; and **structural validation must not use HTML or script
> keyword or pattern matching as a proxy for safety.**
>
> This clarifies an example in Tier 1. It does not alter the approved three-tier
> quality-authority model. See `CURR-010` section 10.

**Tier 2 — Advisory instructional signals.** Automation **may flag** suspicious
instructional patterns for human review. These signals **never automatically fail
and never automatically approve** instruction.

**Tier 3 — Human instructional UAT.** A human reviewer is the **final authority
on pedagogical sufficiency**. A mission may pass every automated check and still
fail instructional UAT.

**No arbitrary numeric pedagogy threshold is authorized.** A rule such as "no
more than three prose blocks" must not be introduced for automation convenience.
Where a Tier 2 signal needs a comparison point, it is derived from the
distribution of already-published, human-approved missions — never chosen.

**BEGINNER-COMPLETE-1 remains a human-authoritative curriculum quality
requirement, supported and not replaced by automation.**

A signal may be promoted from Tier 2 to Tier 1 only when it can be restated as an
objective invariant requiring no pedagogical judgement. "Alt text is missing" is
objective. "Alt text is inadequate" is not, and stays in Tier 2 permanently.

**Rationale**

Automation can prove that a term was defined before it was used. It cannot judge
whether the definition worked. The BEGINNER-COMPLETE-1 audit found its central
defect — a practice question testing a generalisation the instruction had only
demonstrated once, on different values — in a mission that satisfied every
structural invariant the repository could express. No automated check would have
graded it.

Recording the tiers separately prevents the two failure modes that follow from
conflating them: a green pipeline being read as pedagogical approval, and an
invented numeric threshold becoming a de facto curriculum standard nobody
approved.

**Alternatives Considered**

A single pass/fail publication gate — rejected: it forces every judgement into
one of two wrong shapes, either blocking on advisory concerns or ignoring them.

Scoring instructional quality numerically — rejected: a score implies a
measurement the platform cannot make and would be optimised against.

**Impact**

Extends `CURR-009 — Curriculum Quality Checklist`, which already distinguishes
automated checks from required human review and already blocks publication on a
required failure. No new mechanism is introduced.

**Related Documents**

`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` ·
`docs/Feature-Registry/Curriculum-Engine/CURR-010_MISSION_INSTRUCTIONAL_STEPS.md` ·
`docs/Project/DECISION_LEDGER.md` DEC-053

---

## DEC-058

**Category**

Product

**Title**

Simulation Teaches the Mental Model; the Real Lab Confirms It

**Status**

Approved

**Decision**

The approved signature learning progression is:

```text
TEACH A LITTLE → INTERACT → PREDICT → OBSERVE → CONFIGURE
→ OBSERVE CONSEQUENCE → TROUBLESHOOT → REPAIR → CONFIRM → REUSE → PROVE
```

The governing principle is recorded verbatim:

> **Simulation teaches the mental model. The real lab confirms the mental model.**

For applicable hands-on technical learning paths:

* teaching simulation constructs the mental model;
* the real environment eventually confirms it;
* **authored simulation produces no competency evidence**;
* live visualization may render authoritative observations but **never invents
  them**;
* **visualization never becomes a second validator**;
* deterministic validation remains the authority for competency success and
  failure.

**A hands-on technical path must not be declared fully SIGNATURE-LEARNING
complete solely because an authored simulation exists** when real-environment
confirmation is applicable to the competency.

**Packet Journey** is the first implementation of this interaction architecture,
in two modes.

**A. Teaching mode.** Driven by authored curriculum and **clearly identified on
screen as instructional simulation**. It may visualize topology, interfaces,
links, addresses, subnets, VLANs, traffic movement, learner predictions, authored
faults, allowed learner actions and authored consequences. It does not represent
a live environment, does not independently compute networking truth, and produces
no competency evidence.

**B. Live lab confirmation / diagnostic mode.** Future. Driven **only** by
authoritative Lab Engine observations. It renders authoritative observations,
never fabricates plausible state, **fails closed to "state unavailable"** when
authoritative state cannot be read, never becomes a second forwarding, routing or
VLAN simulator, and never becomes the competency validator.

**The observation-model seam is a required design constraint.** The renderer
consumes a shared `ObservationModel` and never authored parameters directly:

```text
teaching mode:  authored curriculum      → projection → ObservationModel → renderer
future live:    Lab Engine observations  → projection → ObservationModel → renderer
```

The renderer must contain **no independent forwarding, routing, VLAN or
competency-success model** in either mode.

**Rationale**

Router-on-a-Stick today instructs learners to configure devices in an environment
that does not exist. Simulation is what makes cause-and-effect learning possible
before a lab provider exists, and it is genuinely valuable — but a mental model
that has never met a real device is not competency, which is why simulation is
explicitly barred from producing evidence.

The seam exists for one reason: it is the difference between live mode being an
adapter and live mode being a rewrite of the instructional content model and the
renderer. Building teaching mode against the shared observation model costs
almost nothing now and preserves the option.

The fail-closed rule is the same honesty rule the learner surface already
follows elsewhere — an unknown state is displayed as unknown, never as a
comfortable default.

**Alternatives Considered**

Treating live diagnostic mode as optional distant polish — rejected by the
Founder. For applicable hands-on paths, real-environment confirmation is part of
the target experience.

Letting the visualization compute forwarding so it could work without a lab —
rejected outright. A second implementation of "does this network work" is a
second answer, and the deterministic validator must remain the only one.

**Impact**

Architecture and documentation. `CURR-011 — Instructional Interaction Contract`
records the Feature. **No live-mode implementation, no Proxmox and no
`LabProvider` contract change is authorized by this decision.**

`WP-K — Live-Lab Packet Journey Adapter` is recorded as the future work item that
eventually makes the applicable Router-on-a-Stick experience fully
SIGNATURE-LEARNING complete.

**Related Documents**

`docs/Feature-Registry/Curriculum-Engine/CURR-011_INSTRUCTIONAL_INTERACTION_CONTRACT.md` ·
`docs/Feature-Registry/Lab-Engine/LAB-008_DETERMINISTIC_LAB_VALIDATION.md` ·
`docs/Learning-OS/Learning-OS.md` sections 15.1–15.3 ·
`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md` section 15e ·
`docs/Project/DECISION_LEDGER.md` DEC-049, DEC-059

---

## DEC-059

**Category**

Product

**Title**

Progressive Support, PROVE IT, and the AI Visibility Boundary

**Status**

Approved

**Decision**

Instructional support is withdrawn progressively:

```text
SHOW ME → HELP ME → ASK ME → CHALLENGE ME → PROVE IT
```

| Level | Available | Withheld |
|---|---|---|
| SHOW ME | demonstration, narration, explanation, expected path visible | — |
| HELP ME | guidance on what to inspect, graduated hints | — |
| ASK ME | learner predicts or explains; inspection available | expected result until commitment |
| CHALLENGE ME | problem, environment, limited assistance | answer-revealing information |
| PROVE IT | see below | see below |

**PROVE IT withholds instructional assistance. It does not withhold the
environment required to demonstrate competency.**

During PROVE IT the learner **retains**: the actual environment; the objective;
legitimate operational tools; their own observations; accessibility
accommodations; and narration of non-answer-revealing material.

During PROVE IT the platform **withholds**: instructional clues; the expected
path; authored fault disclosure; answer-revealing visualization; AI tutoring;
hints; and solution-revealing instructional simulation.

**A support level must never become an authority for lab availability.** Lab
availability is owned by the Lab Engine and the mission's lab contract.
**Deterministic validation determines success.**

**AI visibility boundary.** AI may eventually teach and explain approved authored
curriculum. AI does not become curriculum authority. Protected information is
**structurally withheld server-side** — not sent — rather than relying on prompts
instructing a model not to reveal it. **Assessment answers are never routed into
AI context.** During protected demonstration and PROVE IT, AI tutoring and hints
are unavailable and answer-revealing instructional content is not sent.

**Accessibility and narration are separate from tutoring**, and must remain
separate code paths with separate authorization. Reading an objective aloud is an
accommodation. Explaining what is wrong during evaluation is tutoring.

**Rationale**

An earlier draft of this contract stated that PROVE IT "withholds the interaction
entirely". That was too broad and is corrected here: withholding the environment
would prevent the demonstration rather than protect it. The distinction that
matters is between *assistance* and *the means of demonstrating*.

Structural withholding is required because a prompt instruction is not a security
boundary. `assessment_questions` already has no authenticated SELECT policy;
routing assessment content into AI context would defeat that control rather than
respect it.

Accessibility is separated from tutoring because accessibility must work with the
AI Gateway switched off — which it currently is. Making a screen-reader path
depend on a non-deterministic, unimplemented, potentially unavailable system
would let accessibility degrade silently.

**Alternatives Considered**

Enforcing withholding in the client — rejected. The client is never the security
boundary; a hidden control the browser still holds is not withheld.

Instructing the model not to reveal protected content — rejected as the primary
mechanism for the same reason. It may be a defence in depth; it is not the
boundary.

**Impact**

Architecture and documentation. `AIGW-011 — Curriculum Projection and
Protected-Content Withholding` records the Feature. **No AI Gateway
implementation is authorized by this decision.**

**Related Documents**

`docs/Feature-Registry/AI-Gateway/AIGW-011_CURRICULUM_PROJECTION_AND_PROTECTED_CONTENT.md` ·
`docs/Feature-Registry/AI-Gateway/AIGW-001_AI_REQUEST_CONTRACT.md` ·
`docs/Feature-Registry/AI-Gateway/AIGW-005_PRIVACY_REDACTION_AND_SECRET_SCREENING.md` ·
`docs/Feature-Registry/Learning-Engine/LEARN-005_READINESS_ASSESSMENT_AND_TEST_OUT.md` ·
`docs/Project/DECISION_LEDGER.md` DEC-049, DEC-058

---

## DEC-060

**Category**

Product

**Title**

Curriculum Doctrine as Project Law

**Status**

Approved

**Decision**

The Founder has established a project-wide **Curriculum Doctrine**. It is
recorded in full as `docs/Learning-OS/Learning-OS.md` sections 23 through 33,
which is its **single canonical home**. It is not restated here, and it must not
be duplicated into other documents; every other document points to it.

The doctrine is **PROJECT LAW**. It binds curriculum, competency, assessment,
certification alignment and AI-instructor behaviour across the whole product —
not one course, not one work package, and not only work authored after this
decision.

Learning-OS sections 1 through 22 continue to evolve under the ordinary revision
policy in section 22. **Sections 23 through 33 carry a stricter rule: they may
be changed only by explicit Founder direction.** Neither ChatGPT nor Claude Code
may amend, reinterpret, narrow, extend or "improve" them.

The load-bearing consequences, each stated in the doctrine itself:

1. **Certification knowledge and real-world competency are co-equal outcomes**
   (§25.1). Neither may be sacrificed for the other. The product must not
   produce paper-qualified graduates who cannot perform (§25.2).
2. **Readiness is dual-gated** (§25.3): certification-exam readiness and
   demonstrated practical competency are separate gates, and both must be
   satisfied.
3. **A certification blueprint is an internal coverage map, never a learner-
   facing table of contents** (§28.1). Domain labels and objective codes are
   traceability metadata; they do not structure the learner's course.
4. **Experience precedes abstraction** (§26.2), reuse and retention are
   deliberately authored rather than hoped for (§26.3, §27), and near-transfer
   is required before a unit is considered taught (§26.5).
5. **The learner does not design their own education** (§24). Sequencing is an
   instructional-design responsibility.
6. **AI is not an answer machine** (§30.1), and the curriculum authority
   boundary in §30.2 governs curriculum work: Claude Code implements, and never
   invents doctrine, pedagogy, sequencing, competency requirements or readiness
   thresholds.
7. **Completion is not compliance** (§23.2). Passing tests, typecheck, build and
   gates does not make a curriculum unit complete if it materially violates the
   doctrine.

Doctrine compliance therefore becomes a **required review dimension** for
curriculum work, recorded in `CURR-009 — Curriculum Quality Checklist` section
12. It is assessed within the existing three-tier instructional quality
authority (DEC-057) and **does not alter those tiers**: only objectively
machine-verifiable doctrine requirements may sit in Tier 1; suspected concerns
are Tier 2 advisory and never auto-pass or auto-fail; every requirement
involving educational judgement is Tier 3 human authority. Consistent with
DEC-057 and doctrine §29.5, **no arbitrary numeric readiness or pedagogy
threshold is authorized**, and no pattern-matching gate may be treated as
proving doctrine compliance.

**What this decision does NOT authorize**

* It does **not** authorize implementation of any future track, pathway or
  certification named in doctrine §31. Those are **recorded, not authorized**,
  and remain governed by `docs/Project/NOT_NOW.md`.
* It does **not** reopen, restart, invalidate or require rework of the four
  published Router-on-a-Stick modules (`ros-mod1-read-the-network` through
  `ros-mod4-diagnose-and-prove`), or of any completed build wave or engine. They
  were reviewed against this doctrine at the time it was recorded; the findings
  are advisory and are carried as future authoring input, not as rework.
* It does **not** expand MVP scope, change the active engine set, or alter any
  frozen architecture invariant.
* It does **not** create a new automated gate, threshold or numeric score.

**Architecture review outcome — three items deferred to future work packages**

The independent architecture review accepted this decision and the accompanying
Router-on-a-Stick doctrine review. Three items were returned, ruled on, and are
recorded here so they survive as citable requirements rather than as review
conversation. **None of the three is authorized for implementation by DEC-060.**

1. **Dual-gate certification enforcement.** For certification-aligned programmes
   the academy must eventually **structurally prohibit** a READY or complete
   status unless the certification-knowledge gate **and** the real-world
   competency gate are **independently** satisfied — plus any transfer or
   retention gate the approved curriculum architecture requires. The model is
   **independent mandatory gates, never compensating scores**: a strong gate must
   never lift a failing one, and an average must never produce READY. The
   structural invariant that both approved gates exist and independently pass may
   later become a Tier 1 machine-enforced check **where objectively verifiable**.
   The educational definition of *sufficient* readiness and *sufficient*
   competency remains Founder / curriculum-architect authority. Claude Code must
   not invent readiness percentages or competency thresholds, must not decide
   pedagogical sufficiency, and must not create a numeric threshold merely to
   automate this doctrine (doctrine §25.3, §29.5; DEC-057). Today Router-on-a-
   Stick satisfies the practical gate through deterministic lab validation and
   declares no certification-knowledge gate — its knowledge checks are practice
   and produce no evidence, which is correct for its current scope.
2. **Certification objective → competency traceability.** A future
   certification-aligned architecture must support version-aware mapping from
   certification → exam version → objective → academy competency → curriculum
   coverage and evidence (doctrine §28.2, §28.3). For Foundations this must let
   Security+ objectives map **invisibly** onto competencies already developed in
   Router-on-a-Stick, Linux, Windows and Security, which is one mechanism
   producing the intended "I already did this" recognition (doctrine §27.1). The
   mapping is **internal traceability infrastructure**: it must never cause
   learner-facing curriculum to be organised around certification domains,
   objective numbers, certification badges or vendor table-of-contents structure
   (doctrine §28.1, NON-NEGOTIABLE). The existing reusable `net.*` competency
   identities are the intended attachment points, so a future mapping can be
   added without modifying the learner-facing Router-on-a-Stick experience.
   Implementation requires a **separately approved architecture work package**
   before Security+ integration is built.
3. **Mission 7 near-transfer review.** The Router-on-a-Stick doctrine review
   observed that Mission 7, the summative demonstration, rebuilds the same
   topology and addresses used throughout the earlier missions, which is
   same-context repetition rather than near-transfer (doctrine §26.5). This is
   **recorded, not adjudicated.** It is not automatically a violation: Mission 6
   already carries meaningful transfer and fault-isolation evidence, and Mission
   7 may serve a distinct summative and integration purpose. Whether the final
   demonstration requires a novel context is **Tier 3 educational judgement** and
   belongs to a future curriculum review. **Mission 7 must not be modified or
   redesigned on the strength of this observation alone.**

**Rationale**

The doctrine already governed the Founder's decisions, but it existed only in
conversation. Anything that lives only in conversation is re-litigated, drifts,
or is silently replaced by an AI system's own default curriculum philosophy at
the moment the original reasoning is no longer in context.

Recording it as version-controlled project law makes it discoverable, citable,
diffable and enforceable. It also gives review a stable reference: a curriculum
unit can now be said to violate a specific numbered law rather than to feel
wrong.

Placing it in Learning-OS rather than in a new document keeps curriculum
authority in one place, alongside the instructional standards it governs.

**Alternatives Considered**

*A new standalone doctrine document.* Rejected: it would create a second
curriculum authority competing with Learning-OS, and the two would diverge.

*Distributing the doctrine across the documents it affects.* Rejected: it would
have no canonical text, and partial copies would drift.

*Encoding the doctrine as automated verifier checks.* Rejected, and prohibited
by DEC-057 and doctrine §29.5. Most of the doctrine is educational judgement.
Mechanising it would produce a gate that passes bad curriculum and fails good
curriculum while appearing authoritative.

*Recording it as advisory guidance.* Rejected by the Founder. Advisory guidance
is exactly what already failed to bind.

**Impact**

Documentation and governance. `docs/Learning-OS/Learning-OS.md` gains sections
23–33. `CLAUDE.md` and `CURR-009` gain references to it. **No code, schema,
migration, dependency, provider, infrastructure or curriculum-content change is
authorized by this decision.**

**Related Documents**

`docs/Learning-OS/Learning-OS.md` §23–§33 ·
`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` ·
`docs/Project/NOT_NOW.md` ·
`CLAUDE.md` ·
`docs/Project/DECISION_LEDGER.md` DEC-057, DEC-058, DEC-059

---

## DEC-061

**Category**

Architecture

**Title**

Staged Authoring Completes into an Explicit Mission-Authority Declaration

**Status**

Approved

**Decision**

**Problem.** WP-J enforced an invariant it called STAGED AUTHORING:

> Instruction appears in exactly the missions a slice was approved to author,
> and in no other mission.

It was implemented positionally. `scripts/verify-wpj.sh` split the curriculum
document at the **next unauthored mission's** `stableId` and proved that no
instructional content appeared past the split, and five per-mission gates each
asserted that their own anchor was gone and that a **later** anchor still
existed. The boundary moved forward exactly once per approved slice, and it
survived three moves without going stale.

That mechanism cannot represent the terminal state. Mission 8 is the last
approved mission of Networking Foundations, so authoring it leaves no Mission 9
to anchor against. The split would have nothing to protect and all five prior
mission gates would fail at once, on the one slice where nothing was actually
wrong.

**Decision.** The staged-authoring invariant is **completed, not retired**. The
positional anchor is replaced by an explicit declaration of mission authority at
`scripts/lib/wpj-missions.txt`, read through the shared helper
`scripts/lib/wpj-mission-authority.sh`. The declaration records, per mission:
approved order, exact `stableId`, and `authored` or `unauthored`.

The course has **two legitimate states**, and the state is **derived** from the
declaration rather than declared beside it:

* **STAGED** — at least one approved mission is `unauthored`. Declared
  unauthored missions must carry an empty step array, and no instructional
  content of any kind may appear in the region of the document they occupy. This
  is the positional split, unchanged in what it proves; only the anchor's source
  changed.
* **FULLY_AUTHORED** — every approved mission is `authored`. There is no
  unauthored region left, so that protection **retires itself** rather than
  being deleted. What remains enforced is that exactly the approved missions
  exist, in the approved order, each carrying its own instruction and no other
  mission's.

**FULLY_AUTHORED means structurally authored, and nothing more.** It does **not**
mean the course is doctrine-approved, Founder-UAT-approved, publishable,
migrated, certification-mapped, or that any learner has demonstrated anything.
Doctrine §23.2 is explicit that passing checks is not completion. **Tier 3
human authority under CURR-009 §14a remains required** for doctrine compliance
and for instructional quality, and Founder UAT remains required before the
course can be considered complete in any sense a learner would recognise. No
gate may pre-empt either. The verifiers say so in their own output.

Per-mission gates no longer encode any opinion about whether a later mission
exists. A mission gate owns its mission: it asserts that the declaration lists
that mission as authored, and that the mission's steps appear under it and
nowhere else. The top-level `verify-wpj.sh` owns the course's authoring state and
is the only place that decides it.

**Rationale**

The anchor was never the invariant. It was one way of expressing the invariant
while an unauthored tail happened to exist, and the tail was a property of the
course's progress rather than of the rule. Naming the rule directly is what turns
the last boundary move into a state transition instead of a demolition.

Six places previously held one fact — the course gate's anchor variable and five
per-mission assertions about which mission came next. That coupling is why a
single boundary move touched six files, and why the terminal move would have
broken five gates simultaneously. One declaration, read by one helper, removes
the coupling without weakening anything.

A declaration file is also more reviewable than a variable name. Moving a
mission from `unauthored` to `authored` is one word, in the diff, beside the
mission it describes. `scripts/lib/wpj-concept-ledger.txt` already established
that this repository trusts a reviewed declaration for exactly this kind of
ordering authority.

**Alternatives Considered**

*Invent a Mission 9 to anchor against* — rejected. A fictional mission in a
production curriculum document to keep a verifier's mechanism alive is a lie in
the artefact that the artefact exists to be trusted for.

*Delete the positional split once the course is fully authored* — rejected. It
would remove the protection rather than complete it, leave the invariant
unavailable to the next course that needs staged authoring, and teach a future
maintainer that the rule stopped applying.

*Anchor to the end of the missions array, or to the top-level key that follows
it* — rejected as the primary mechanism. It depends on JSON key order in the
serialized file, which no contract enforces, and it silently changes what the
check means from "later missions are unauthored" to "nothing follows the
missions" while looking like the same check.

*Rely on the parsed allowlist alone* — rejected as sufficient on its own. The
allowlist in `services/api/src/networking-foundations.test.ts` is stronger than
the text split for the step question and now reads the declaration, but it
cannot see forbidden content in shapes the parser drops. Both halves are kept.

*Treat "all missions contain steps" as course completion* — rejected, and
explicitly forbidden. That is the conflation doctrine §23.2 names.

**Impact**

`scripts/lib/wpj-missions.txt` and `scripts/lib/wpj-mission-authority.sh` are
added. `scripts/verify-wpj.sh` derives its authoring state from them and
implements both branches. `scripts/verify-wpj-m3.sh` through
`scripts/verify-wpj-m7.sh` drop their later-anchor assertions and assert mission
ownership instead. `services/api/src/networking-foundations.test.ts` reads the
declaration rather than restating it, and
`services/api/src/networking-foundations-module1.test.ts` and the per-mission
suites drop their course-wide authoring lists.

No curriculum content outside Mission 8 changes. No contract, dependency,
migration or presentation code changes. Publication, the five pending
migrations, the T1 cross-course transition and certification mapping are all
untouched and remain open.

**What this decision does NOT authorize**

* It does **not** authorize a ninth mission, in this course or by any route.
* It does **not** declare Networking Foundations complete, approved, publishable
  or ready in any sense beyond the structural one defined above.
* It does **not** create a course-completion governance system. The only
  course-level assertion added is the structural one the transition requires.
* It does **not** alter DEC-057's three-tier authority or DEC-060's doctrine
  compliance requirement, and it introduces no numeric threshold.

**Related Documents**

`scripts/lib/wpj-missions.txt` ·
`scripts/lib/wpj-mission-authority.sh` ·
`scripts/verify-wpj.sh` ·
`docs/Learning-OS/Learning-OS.md` §23.2 ·
`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §12, §14a ·
`docs/Project/DECISION_LEDGER.md` DEC-050, DEC-053, DEC-057, DEC-060

---

## DEC-062

**Category**

Product

**Title**

Hands-On Networking Is Required for Instructional Approval

**Status**

Approved

**Decision**

**Networking Foundations must include real learner command execution and bounded
network configuration.** The learner must physically type approved commands and
perform approved configuration actions against their own isolated environment.

This is a product requirement, not a preference. Three things that currently
exist are explicitly **not sufficient on their own**:

* a packet journey, which is an instructional visualisation of what a learner's
  action causes — valuable, and not a substitute for the action;
* displayed command output, which shows what a machine reported to somebody
  else;
* question-and-answer interaction, which exercises reasoning rather than doing.

The learning cycle the course must eventually support is:

```text
DO → OBSERVE → REASON → VISUALISE → EXPLAIN → APPLY AGAIN
```

not:

```text
READ → ANSWER A QUESTION → READ MORE
```

The terminal and the packet journey are complementary. Neither replaces the
other: the learner types a command and sees real output, and the journey
explains what that output means.

**Consequence for course approval**

Networking Foundations may be **structurally FULLY_AUTHORED** without learner
command execution — DEC-061 defines that state, and it is unchanged.

It must **NOT receive final instructional approval** while its core networking
activities remain read-only simulations. Structural authoring and instructional
approval were already separate under DEC-061 and CURR-009 §14a; this decision
adds a specific, named condition to the second one.

**What the eventual architecture must be**

Whatever implements this must be session-scoped, mission-scoped, command
allowlisted or authored, target-constrained, deterministic, isolated, rate
limited and output-sanitised; it must be compatible with the existing Lab
Engine isolation attestation; the deterministic validator remains authoritative
for correctness; and **no AI decides whether a learner configured anything
correctly.**

**What this decision does NOT authorize**

* It does **not** authorize unrestricted shell access, arbitrary command
  execution, or `sudo` for the learner.
* It does **not** authorize bypassing deterministic validation, and it does not
  make executing a command into evidence of anything. Execution, validation and
  competency evidence remain three separate things.
* It does **not** authorize a terminal that returns pre-authored output while
  presenting itself as live. A mock provider is valid for automated tests; the
  production path must execute against the learner's isolated environment, and
  network state must actually change when an authorized configuration command
  changes it.
* It does **not** alter DEC-060 or DEC-061, or the three-tier authority in
  DEC-057.
* It does **not** authorize any implementation in the work package that records
  it. The architecture is discovered and recommended; it is built under its own
  approved work package.

**Rationale**

The course teaches networking well and a Founder UAT pass confirmed the
information itself is strong. What it does not yet do is let anyone *practise*
networking. A learner finishing Networking Foundations today has watched
authored journeys and read authored output; they have not once configured
anything, and the one failure they met had already been located for them.

Doctrine §25.2 forbids paper-qualified graduates and requires demonstration
wherever professional capability can reasonably be demonstrated. Networking is
a domain where it plainly can. Recording the requirement here makes the gap a
tracked, citable condition on approval rather than an observation in a review
conversation.

**Alternatives Considered**

*Treat hands-on as a later enhancement.* Rejected. It would let the course reach
instructional approval in a state the Founder has ruled insufficient, and an
approved course is far harder to reopen than an unapproved one.

*Satisfy it with a simulated terminal over authored output.* Rejected
explicitly. It would look like the requirement had been met while changing
nothing about what the learner actually does, and the network state would not
move when a learner changed it.

*Give the learner a shell in the lab session.* Rejected. The isolation
attestation exists precisely to keep a student out of the provider and the
management plane, and an unconstrained shell is the fastest way to lose it.

**Impact**

`CURR-009 — Curriculum Quality Checklist` section 12 records the approval
condition, so it is consulted wherever a curriculum unit is reviewed. No gate,
threshold or numeric score is introduced, and no existing verifier changes
meaning. Networking Foundations remains structurally FULLY_AUTHORED and remains
unapproved instructionally.

**Related Documents**

`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §12, §14a ·
`docs/Learning-OS/Learning-OS.md` §24, §25.2, §26 ·
`packages/shared-types/src/labs.ts` ·
`docs/Project/DECISION_LEDGER.md` DEC-053, DEC-057, DEC-059, DEC-060, DEC-061

---

## DEC-063

**Category**

Product

**Title**

Guide the Learner — Instruction Must Not Have to Be Reconstructed

**Status**

Approved

**Decision**

**A learner must never have to reconstruct the lesson** from scattered text,
diagrams, earlier answers or assumptions. Instruction leads; the learner
follows and does.

The course-wide instructional rhythm is:

```text
CONTEXT / STORY → OBJECTIVE → DO / PREDICT / ANSWER → OBSERVE → REASON
  → EXPLAIN → APPLY
```

The requirements this binds, each of which is a Founder UAT finding:

1. **A short scenario before the mission.** Where am I, what is happening, what
   am I trying to accomplish, why does it matter — then into the activity.
   Orientation, typically a few sentences, never a second source of reading.
2. **A stated objective.** The learner knows what they are trying to
   accomplish before they are asked to do anything.
3. **The activity arrives quickly.** Story, then objective, then doing. Not
   story, then theory, then questions, then eventually the activity.
4. **Necessary context precedes the task.** A learner should not reasonably be
   able to ask "sending what?", "from where?", "to where?", "where is it now?"
   or "what am I deciding?" — and the answers are given where they are needed,
   not as a fixed template of boxes.
5. **A question names exactly what is being decided.**
6. **Predictions and knowledge checks are different interactions.** A
   prediction is resolved by comparison — what you predicted, what actually
   happened, why — and is **never graded**, because a prediction carries no
   authored answer key. A knowledge check tests something already taught and
   **must** resolve correctness explicitly: the answer, whether it was right,
   the correct answer, and why. "Recorded" alone is not adequate for either.
   *(**Amended by DEC-067 principle 8**: the "never graded" clause no longer
   holds. Where the learner could reason the answer out, a prediction resolves
   explicitly. The distinction between the two interactions stands.)*
7. **Transitions connect one step to the next**: what you just saw, what it
   means, what happens or what you do next.
8. **Diagram, text and motion describe the same state.** If the words say the
   traffic is still at its source, nothing in the picture or the animation may
   imply it has arrived somewhere. **Started at is not reached at**, and an
   originating device is not a recipient of its own traffic.
9. **Simplified beginner language may reduce vocabulary. It may not create a
   false model** that has to be unlearned. Plain words are permitted where the
   course later names the real unit and connects the two.
10. **Deeper explanation uses progressive disclosure** where that keeps the
    primary path concise. The central teaching is never what gets hidden.
11. **Hands-on command execution remains mandatory under DEC-062.** Guidance
    improves what surrounds the doing; it does not substitute for it, and this
    decision does not soften that condition on final approval.

**Rationale**

Founder UAT found the course understandable but effortful, and the effort was
not the networking. The learner was assembling the lesson: a mission opened by
continuing the previous one rather than by putting them in a situation; the
active question sat below the material explaining the last one; an answer was
"recorded" without ever being resolved; and the event headline told a learner
that traffic had "reached" the machine that had just created it.

That last one is the clearest case. It is not a simplification but a false
statement, and a beginner who accepts it has learned that a sender receives its
own traffic — exactly the model §26 says must not need unlearning.

**Alternatives Considered**

*Rely on the AI tutor to fill the gaps.* Rejected. The base course must work
without it; a tutor that is required to decode the lesson is a lesson that does
not teach.

*Add narration so there is less to read.* Deferred rather than rejected —
optional read-aloud remains a desirable future capability — but it would have
treated the symptom. The reading was hard to follow because it was
unstructured, not merely because there was a lot of it.

*Grade predictions so the learner knows if they were right.* Rejected. A
prediction has no authored correct option and CURR-011 forbids adding one: an
answer key in curriculum content is an assessment answer. The comparison
against what actually happened is the feedback. A **knowledge check** is the
interaction that resolves correctness, and it is a different thing.

**Impact**

Applies to every curriculum unit, assessed under the three-tier authority in
CURR-009 §14a. No gate, threshold or numeric score is introduced, and no
existing decision changes meaning: DEC-057, DEC-058, DEC-060, DEC-061 and
DEC-062 all stand as written.

**What this decision does NOT authorize**

* It does **not** add a correct-answer field to `PacketJourneyPrediction`, or
  any answer key to authored interaction content. A knowledge check with
  authored correctness is a separate interaction and needs its own approval.
* It does **not** relax DEC-062. Networking Foundations still may not reach
  final instructional approval while its core activities are read-only.
* It does **not** authorize narration, video, or an AI-tutor dependency.

**Related Documents**

`docs/Learning-OS/Learning-OS.md` §24, §26.2, §26.3, §27 ·
`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §12, §14a ·
`docs/Feature-Registry/Curriculum-Engine/CURR-011_INSTRUCTIONAL_INTERACTION_CONTRACT.md` ·
`docs/Project/DECISION_LEDGER.md` DEC-057, DEC-058, DEC-060, DEC-061, DEC-062

---

## DEC-064

**Category**

Architecture

**Title**

Three Instructional Mechanisms — Predict, Confirm, Perform

**Status**

Approved

**Decision**

The course has **three distinct instructional mechanisms**. They are not
interchangeable and none substitutes for another.

**1. PREDICTION — exploratory.**

> **Amended by DEC-067 principle 8.** The paragraph below is kept as written,
> because a ledger records what was decided and when. Its final clause no
> longer holds: `PacketJourneyPrediction` carries an **optional**
> `correctOption`, and a prediction whose answer the learner *could* reason
> out is resolved explicitly rather than by comparison alone. The rest of this
> section — that a prediction precedes observation, gates the reveal, produces
> no score, and is never confused with a knowledge check — is unchanged.
> DEC-067 principle 8 is the operative text; `CURR-009` §12 carries it.

Asks "what do you think will happen?" *before* the learner can know. It
precedes an observation, it gates the reveal, and it is **never graded**:
`PacketJourneyPrediction` carries no correct option and must not acquire one.
After the observation it is resolved by **comparison** —

```text
YOUR PREDICTION → WHAT ACTUALLY HAPPENED → WHY
```

Grading a guess made before the evidence would punish a learner for doing
exactly what was asked. The observation is the answer.

**2. KNOWLEDGE CHECK — confirmation of understanding.**

Asks "based on what you have already been shown, which answer is correct?"
*after* the teaching. It has **authored deterministic correctness** and
resolves explicitly —

```text
YOUR ANSWER → RESULT (Correct / Not correct) → CORRECT ANSWER → WHY
```

Implemented as `PacketJourneyKnowledgeCheck`, a **separate type** carrying
`prompt`, `options`, `correctOption` and `explanation`. `correctOption` must be
one of `options`; validation refuses the document otherwise. Correctness is a
comparison against the authored option and nothing else — **no inference, no
AI, no score, no streak, and no evidence.** It does not gate the journey.

The correct answer is exposed whichever way the learner answered, and the
explanation is shown both times, because the reason is the teaching. "Recorded"
is not an adequate response to either instrument.

**3. HANDS-ON PERFORMANCE — doing the work.**

Separate from both, and **not replaceable by either**. Under DEC-062 the
learner must eventually type real commands and perform bounded network
configuration. A prediction is a guess, a knowledge check is a comprehension
check, and neither is evidence that anyone can configure anything.

**Where knowledge checks may be used**

Only where the learner has already been taught or shown enough that there is a
defensible correct answer, and where confirming understanding improves the
lesson. **The course must not become read → answer → read → answer.** Questions
support learning; they are not the product.

**Rationale**

Founder UAT found that a committed answer said "recorded" and nothing more, so
a learner could not tell whether they had understood. Adding correctness to
predictions would have been the small change and the wrong one: it would make
every exploratory guess gradable, which is the opposite of predict-then-observe.

The two instruments answer different questions at different moments, so they are
two types. Keeping them apart is what lets a prediction stay safe to be wrong in
and a knowledge check actually resolve.

**Alternatives Considered**

*Add `correctOption` to `PacketJourneyPrediction`.* Rejected, and explicitly
forbidden: it collapses the distinction and grades guesses by omission.

*A general assessment engine.* Rejected as scope. Assessment already exists as
its own engine with its own evidence semantics; this is instruction confirming
itself, and it produces nothing.

*Let the AI tutor say whether an answer was right.* Rejected. Correctness is
authored and deterministic, for the same reason lab validation is.

**Impact**

`PacketJourneyKnowledgeCheck` is added to the interaction contract and to the
learner projection, where it is answer-bearing and belongs to the teaching
support levels. Journey view state gains `answeredChecks`, recorded once per
stage. Two knowledge checks are authored in Networking Foundations — Mission 4's
remote journey and Mission 8's stop — and no others.

Nothing about evidence, competency or certification changes. DEC-057, DEC-058,
DEC-060, DEC-061, DEC-062 and DEC-063 all stand as written.

**What this decision does NOT authorize**

* It does **not** grade predictions, now or later.
* It does **not** create an assessment surface, produce evidence, or record a
  result anywhere that outlives the component.
* It does **not** relax DEC-062. Hands-on typed command execution remains
  mandatory before Networking Foundations can reach final instructional
  approval, and remains unimplemented.
* It does **not** authorize filling the course with quizzes.

**Related Documents**

`packages/shared-types/src/instruction-interaction.ts` ·
`docs/Feature-Registry/Curriculum-Engine/CURR-011_INSTRUCTIONAL_INTERACTION_CONTRACT.md` ·
`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §12, §14a ·
`docs/Project/DECISION_LEDGER.md` DEC-057, DEC-058, DEC-062, DEC-063

---

## DEC-065

**Category**

Product

**Title**

One Instructional Beat at a Time

**Status**

Approved

**Decision**

The primary learner experience presents **one instructional idea, decision,
result or explanation at a time**.

The workspace is split:

* **LEFT — the network.** The topology is persistent and is never remounted
  between beats. It is the thing the learner is reasoning about, and taking it
  away costs them the mental map the whole lesson depends on. Device names,
  authorised addressing, switch ports, router interfaces, network labels,
  the active path, the traffic marker and authored device facts all stay.
* **RIGHT — the instructor pane.** Exactly one **beat**: a situation, an
  objective, a question, a prediction, a knowledge check, feedback, an
  observation, an explanation, a next task — or, later, a terminal.

**What a beat is.** One instructional moment, with a heading, its own short
body, an optional deeper explanation behind a disclosure, and at most one
control. Beats are **derived** from the journey's existing state rather than
stored, so there is no second progression engine and the pane can never
describe a state the journey has left.

**Advancing is intentional.** Continue walks the beats already available at the
current state — that is reading. The authored advance control is what moves the
network, and it appears only on the last beat, so pressing it always changes
the picture. **Never more than one actionable beat at a time.**

**Answers resolve before the next task.** Submitting moves the pane forward to
the feedback beat in place. Focus goes to the new beat's heading. **The learner
is never scrolled backward and never has to hunt for what changed.**

**Prior information stays reviewable but secondary.** A Previous control walks
back through the current state's beats, and the full account remains behind a
closed disclosure. Neither competes with the current beat.

**Observation and explanation do not compete.** When motion is the beat, the
topology is the focus and the pane says little — "watch where it goes" — rather
than narrating alongside it.

**The shell is not a quiz.** The beat vocabulary is instructional moments, not
question types. A course of nothing but multiple choice would satisfy the
letter of this decision and violate its purpose.

**It must remain able to host a terminal.** Under DEC-062 the learner will
eventually type real commands; a terminal is another beat kind, and nothing in
this shell may be shaped so that it cannot be one.

**Rationale**

The five named regions of DEC-063 were a real improvement on the original
stream and still put the question, the answer, the observation, the reason and
the next control on screen together. The learner was reading a dashboard of
lesson state rather than following a lesson — and the cognitive load that
removed was not the networking.

Splitting the workspace answers both halves at once. The picture is what
persists, because it is the subject; the instruction is what advances, because
it is the thread.

**Alternatives Considered**

*Keep the five regions and collapse the inactive ones.* Rejected. It leaves the
learner deciding what to attend to, which is the work this removes.

*Show one region at a time in the same single column.* Rejected: the topology
would leave the screen whenever instruction appeared, and losing the picture
mid-question is the worse failure.

*Store an explicit beat sequence per mission.* Rejected as a second source of
truth. A derived sequence cannot disagree with the journey; a stored one will.

**Impact**

`resolveJourneyBeats` and `activeJourneyBeat` are added to the journey
presentation as pure functions. `PacketJourney` renders a persistent workspace
and a single-beat instructor pane. One piece of component state is added — how
far the learner has read at the current journey state — reset by the change
token the journey already carries. No curriculum content changes, no contract
changes, and no evidence, competency or certification semantics change.

This supersedes the five-region layout recorded in DEC-063's impact. **Every
requirement of DEC-063 stands**: guidance, stated objectives, resolved answers,
connected transitions, and diagram, text and motion describing the same state.
This decides where those things are shown, not whether.

**What this decision does NOT authorize**

* It does **not** relax DEC-062. Hands-on typed command execution remains
  required before Networking Foundations can reach final instructional
  approval, and remains unimplemented.
* It does **not** change the prediction / knowledge-check distinction in
  DEC-064.
* It does **not** authorize hiding required teaching behind a disclosure. Only
  optional depth may sit there.

**Related Documents**

`apps/web/src/learning/packet-journey-presentation.ts` ·
`apps/web/src/learning/PacketJourney.tsx` ·
`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §12, §14a ·
`docs/Project/DECISION_LEDGER.md` DEC-062, DEC-063, DEC-064

---

## DEC-066

**Category**

Product / Architecture

**Title**

One Journey State, One Truth Across Every Surface

**Status**

Approved

**Decision**

Every observable state of a guided journey has **one truth**, and every surface
that describes that state must agree with it.

The surfaces bound by this rule are:

* the topology marker's position and the link it is travelling;
* the device state and its caption;
* the instructional heading;
* the instructional body;
* the Quick Reference "Now at" and current-leg rows;
* the context-sensitive Current Network Details;
* the accessible announcement and the full text account.

None of them may disagree about whether data has **not been sent**, is
**travelling**, has **arrived**, is **being examined**, is **being forwarded**,
has **stopped**, or has **been delivered**.

Two consequences follow, and both are binding:

1. **Narration may not run ahead of motion.** If the marker is travelling from
   PC-A to Switch-1, no surface may speak as though Switch-1 has already
   forwarded it. A device's forwarding decision belongs to the stage whose
   motion shows that forwarding.
2. **There is exactly one progression engine.** Presentation is derived from
   the canonical journey state — `buildPacketJourneyObservationModel`, then
   `buildPacketJourneyView`, then `resolveJourneyBeats`. A second source of
   "where are we" is prohibited, because two engines is how surfaces come to
   disagree in the first place.

**Related: one owner for actionable question text.** A learner reads a
prediction or knowledge-check prompt **once**, immediately before the answer
choices. The `<legend>` of the choice group owns it; no beat body, narration or
adjacent region may restate it. Context may precede a question only when it adds
information the question does not.

**Rationale**

Founder UAT on Mission 6 read a pane that said Switch-1 had forwarded a frame
to Router-1 while the marker was still travelling from PC-A to Switch-1, and
read the same question twice in a row before answering it once. Both were
presentation describing a state the network was not in.

Neither was a rendering bug. Both were authored or composed text that had no
obligation to agree with anything. This decision creates that obligation and
names the surfaces it binds, so a future beat, row or panel is written against
a stated rule rather than against whatever the nearest existing code did.

The prohibition on a second progression engine is the load-bearing half. Any
surface that computes its own idea of progress will eventually disagree with the
one the marker is drawn from, and the learner is the one who finds out.

**Consequences**

* Authoring a stage that both arrives somewhere and forwards onward is a
  defect: the forwarding belongs to the next stage, which is the one that shows
  it.
* A new presentation surface derives its state from the view, never from
  learner state or its own counter.
* Regression coverage asserts agreement between surfaces rather than the
  wording of any one of them.
* It does **not** forbid a surface from saying less than another. Silence is
  not disagreement; a contradictory claim is.

**Related Documents**

`apps/web/src/learning/packet-journey-presentation.ts` ·
`apps/web/src/learning/PacketJourney.tsx` ·
`apps/web/src/learning/topology-layout.ts` ·
`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §12, §14a ·
`docs/Project/DECISION_LEDGER.md` DEC-058, DEC-063, DEC-064, DEC-065

---

## DEC-067

**Category**

Product / Curriculum

**Title**

Technical Writing Law — Reduce Ambiguity, Not Rigor

**Status**

Approved

**Decision**

**Technical prose must reduce linguistic ambiguity, not technical rigor.**

Learner-facing prose uses explicit subjects, actions and objects. When several
devices, addresses, interfaces, networks, packets, frames, commands, results or
settings are in context, the specific object is named wherever a pronoun or a
vague reference could reasonably have more than one referent.

> Router-1 forwards the packet through its second connection.

not

> Router-1 forwards it.

Clarity may **not** be achieved by removing necessary terminology,
oversimplifying the concept, talking down to the learner, excessive
hand-holding, or replacing precise terminology with vague everyday language.

**Amended, Mission 8 pre-workspace pass.** The decision was Approved rather than
Locked, so it is extended in place rather than superseded; the ledger's
convention reserves a superseding decision for a Locked entry. The original rule
above is unchanged. Six principles are added, and the operative text for all of
them is `CURR-009` §12:

1. **Concrete before abstract.** When teaching reasoning from technical
   evidence, order it: observable event → what the event establishes → what it
   does **not** establish → the broader principle or next reasoning step. A
   beginner must not decode an abstraction before meeting the event that gives
   it meaning.
2. **One primary instructional job per paragraph** — teach, establish,
   reactivate, compare, qualify or transition, not several at once.
3. **Reactivate; do not re-teach.** Briefly surface exactly the established fact
   the present reasoning needs, rather than reproducing the earlier lesson.
4. **Do not prematurely reveal the diagnosis.** Where an activity exists so the
   learner can derive an answer, nothing before it may narrow the problem to one
   device, one setting, one correction or one fault class before the evidence
   supports that narrowing. This binds every reachable surface, including a
   mission description rendered on a fallback path.
5. **Repetition requires a new instructional purpose** — reactivation, standing
   context, comparison or post-activity consolidation. DEC-066 carries the
   presentation half of this rule.
6. **Beginner does not mean non-technical.** Use the correct term once the
   learner has it, or when it is being taught.

**Amended again, Mission 1 technical-writing repair.** Two additions, both
operative in `CURR-009` §12:

7. **Technical terms are earned, then used.** Plain English introduces a role
   the course has not yet named. Once the term is taught, the course uses it and
   does not retreat to an invented substitute — *network* does not become
   "group", *MAC address* does not become "factory identity".
8. **An objective answer resolves explicitly.** Where a learner response has an
   objectively correct answer, the learner commits first and is then told
   plainly whether they were right, what was expected if they were not, and why
   — in words, never by colour, and with no praise, points, streaks or scores.
   Where the learner cannot yet know, the response stays ungraded and resolves
   by comparison. This supersedes DEC-063's original statement that a prediction
   is never graded; `CURR-009` §12 carries the amended text.

The standard is **clear technical-author prose for an adult beginner**: enough
context to understand the technical relationship without assuming the learner
remembers every sentence of a previous mission, and without re-explaining what
the unit has already established.

The full rule, its worked example, its tier placement and the surfaces it binds
are recorded in `CURR-009` §12, *Technical writing (DEC-067)*, which is the
operative text.

**Rationale**

Founder review found the same defect in Mission 6 and Mission 8, which makes it
a course-wide authoring weakness rather than a copy edit. The Mission 6 example
was:

> A workstation on one network needs to reach a system on another. Router-1 is
> holding its traffic, addressed to a machine Router-1 is not, in a group
> Router-1 is not in.

Every fact in that sentence is correct. A beginner still has to hold three
unnamed referents in mind to extract any of them, and the difficulty is entirely
in the writing rather than in the networking.

The second half of the law exists because the obvious fix is worse than the
defect. Prose can always be made easier by deleting the technical content, and a
rule that only said "be clearer" would license exactly that.

**Consequences**

* This is a **Tier 3** review dimension. Whether a referent is resolvable is a
  judgement about a particular reader and a particular sentence; no pattern
  engine may auto-pass it, and no numeric ambiguity threshold may be invented to
  automate it (doctrine §29.5). The same holds for every added principle:
  automated checks may enforce ordering, required content, stable identity,
  banned vocabulary and disclosure of a named value, and may **not** be built
  into a semantic or paraphrase detector standing in for human judgement.
* Tier 1 may pin narrow, objectively checkable instances. Tier 2 may flag
  suspected ambiguity for human attention.
* It binds every learner-facing surface, including the text equivalent, which is
  the only prose some learners receive.
* It does **not** authorize rewriting curriculum for style alone. Content edits
  under this decision are scoped by the work package that carries them.

**Related Documents**

`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §12, §14a ·
`docs/Learning-OS/Learning-OS.md` §23–§33 ·
`content/curriculum/networking-foundations.json` ·
`docs/Project/DECISION_LEDGER.md` DEC-057, DEC-060, DEC-063, DEC-066

---

## DEC-068

**Category**

Product / Process

**Title**

Independent Rendered-Product QA: Three Kinds of Confidence, Three Owners

**Status**

Approved

**Decision**

Three different things have been treated as one, and they are now separated
project-wide, for all substantial learner-facing product work and not only for
Networking Foundations:

1. **Implementation and automated engineering validation** — owned by Claude
   Code.
2. **Independent rendered-product and learner-experience review** — owned by
   ChatGPT.
3. **Final product acceptance and UAT authority** — owned by the Founder.

**The governing principle.**

> Automated validation establishes **mechanical confidence**.
> Human rendered review establishes **learner-experience confidence**.
> Founder UAT owns **final product acceptance**.

A passing unit test, integration test, verifier, mutation check, schema
validator, typecheck, build, security scan, source-level accessibility
assertion or CI job does **not**, on its own, establish that the rendered
learner experience is approved.

**What each role owns.**

**The Founder** owns final product authority, final scope and change-control
authority, final learner-experience and UAT authority, and final acceptance of
whether the product meets the intended vision.

**ChatGPT** owns instructional architecture and — unless the Founder explicitly
changes that authority — sole substantive learner-facing curriculum authorship.
It additionally owns **independent review of the rendered product**: functional
flow, UI/UX, novice usability, learner-experience QA, technical-writing
integration, interaction and state, visual consistency, and accessibility and
usability judged from rendered evidence. It reviews real rendered evidence —
Founder videos, screenshots, rendered pages, interaction walkthroughs — and may
identify defects the Founder did not report. **It does not replace Founder
UAT.**

**Claude Code** owns implementation engineering, repository investigation,
schema implementation, automated test creation and maintenance, typechecking,
builds, verifier and gate execution, security checks, mechanically testable
accessibility protections, regression validation, mutation checks where
appropriate, and accurate implementation reporting.

**Claude Code does not independently approve** rendered UI quality, UX quality,
the learner experience, instructional quality, visual quality, rendered
accessibility, or final product acceptance.

**Observed versus inferred.**

Claude Code must distinguish what it **observed** from what it **computed,
inferred or expects**. Geometry read out of layout code may be reported as
*"the layout algorithm computes…"* or *"the implementation is expected to
render…"*. It may not be reported as *"the topology visually appears…"* unless
a rendered surface was actually inspected through an authorized rendered or
browser mechanism.

Semantic HTML in source does not prove real browser focus order, visual focus
quality, screen-reader usability, zoom or reflow behaviour, responsive
readability, or theme contrast in actual rendering. Tests may be described as
proving properties of the implementation. They may not be described as proving
human-perceived quality that they do not reach.

**No self-approval.** Final-report language such as "UI approved", "UX
approved", "learner experience approved", "accessibility approved", "looks
correct", "reads well", "visually clear", "professional" or "intuitive" is
prohibited on the strength of source inspection or automated tests alone. The
accurate report is: *"Implemented and automated validation passed. Rendered
Architect/Founder UAT remains required."*

**What independent human rendered review may evaluate.** Functional behaviour ·
novice usability · interaction semantics · visual hierarchy and consistency ·
visual/text synchronization · technical-writing integration across every
learner-facing surface carrying substantive instructional meaning · disclosure
and answer boundaries · feedback quality · progression and counters ·
accessibility and usability · responsive and theme quality · regression across
shared learner-facing components.

**Curriculum authorship is unchanged by this decision.** ChatGPT authors
substantive learner-facing curriculum; Claude Code does not independently
author, rewrite, simplify, expand, polish or substitute it, and reports
conflicts rather than silently changing it.

**Rationale**

Implementation-agent testing had become the only signal on rendered work, and
it is the wrong instrument for the question. Several defects found in Founder
video UAT — a control labelled for an action it did not perform, a state
described as repaired when nothing had been, a counter reporting internal
presentation beats rather than journey stages, a fact a learner had to reason
from living only in prose — were invisible to every passing gate, because each
gate was mechanically correct about something else.

The correction is not more tests. It is naming what tests can and cannot
establish, and giving the part they cannot reach an owner.

The observed-versus-inferred rule exists because the failure is quiet. An
implementation report that describes computed geometry in the language of
appearance reads exactly like an eyewitness account, and a reviewer has no way
to tell the difference. Stating which is which costs a clause and preserves the
reviewer's ability to know what has actually been seen.

This extends DEC-057, which established that instructional quality has three
tiers and that human UAT is the authority for the top one, from curriculum to
the rendered product as a whole. It is consistent with DEC-027 (Locked):
Claude implements approved work and does not redefine the product.

**Consequences**

* Reports for substantial learner-facing work carry two separate sections —
  **AUTOMATED VALIDATION** (what was mechanically tested, and what that
  establishes) and **HUMAN UAT REQUIRED** (the rendered properties still
  awaiting inspection). They are not merged into one claim of approval.
* Such work also carries a short targeted UAT path: exact product, course and
  mission location; starting state; the actions to perform; an intentionally
  incorrect path where relevant; state transitions worth observing; known
  implementation-risk areas; and completion behaviour worth checking.
* **UAT instructions describe what to exercise, never what to conclude.**
  Steering language — "confirm this looks good", "this should feel intuitive",
  "if you cannot understand this, that is a defect", "verify this is visually
  clear" — is prohibited. Neutral instructions replace it: "view the topology
  at a narrow viewport"; "answer Question 3 using the topology before reading
  the descriptive text"; "observe the disabled completion control before the
  final required question"; "reload after mission completion and observe the
  resulting state." The judgement belongs to the Architect and the Founder.
* A defect found in rendered UAT is classified before it is fixed —
  curriculum/content, technical writing, functional interaction, UI/visual,
  UX/usability, accessibility, state/progression, architecture, or regression.
  A UI defect is not solved by rewriting curriculum, and a curriculum defect is
  not solved by redesigning UI, unless the Architect authorizes that solution.
* Where a defect has a mechanically testable invariant, a durable automated
  regression guard is added. Semantic and rendered judgement stays human-owned.
* `IMPLEMENTED + AUTOMATED VALIDATION PASSED` is the most Claude Code may
  report. It is not `FOUNDER/ARCHITECT UAT APPROVED`, and no substantial
  learner-facing mission receives final instructional approval from
  implementation-agent testing.
* This decision changes no engine, schema, curriculum document or test. It
  changes what a report may claim and who decides what.

**Related Documents**

`CLAUDE.md` — Authority Model, Verification Requirements, Completion Report ·
`docs/Project/DECISION_LEDGER.md` DEC-027 (Locked), DEC-048, DEC-057, DEC-067 ·
`docs/Feature-Registry/Curriculum-Engine/CURR-009_CURRICULUM_QUALITY_CHECKLIST.md` §14a

---

# Convergence Decisions — WP-003 Review

The four entries below record the Founder's convergence decisions of
2026-10-09, taken in review of WP-003 (its report,
`reports/WP-003-tlp-lovable-comparison.md`, is not held in this repository) and
recorded by WP-005 on 2026-10-10. Each supersedes nothing. Where an entry
touches wording elsewhere in the repository, the relationship is stated in the
entry rather than reconciled silently.

---

## DEC-069

**Category**

Architecture

**Title**

The Canonical Repository Is the Single Source of Truth; Lovable Is a Design Sandbox

**Status**

Approved

**Date**

2026-10-10

**Source**

Founder decision, WP-003 review

**Decision**

The canonical repository is the single source of truth. Lovable
(`learning-foundation`) is a design sandbox and is never synced into the
canonical repository.

**Supersedes**

Nothing.

**Impact**

`PLATFORM_BLUEPRINT.md` §17.5 lists "Lovable development" as a stage of the
development progression. This decision does not edit the Blueprint; whether
that wording should be reconciled with this decision is flagged for
Founder/architect direction rather than changed here.

**Related Documents**

WP-003 report (not held in this repository) · `docs/Project/PLATFORM_BLUEPRINT.md`
§17.5 · `docs/Project/DECISION_LEDGER.md` DEC-008, DEC-028

---

## DEC-070

**Category**

Architecture

**Title**

Keep the Canonical Stack; Port Lovable's Design, Not Its Framework

**Status**

Approved

**Date**

2026-10-10

**Source**

Founder decision, WP-003 review

**Decision**

The canonical stack is kept. What is taken from Lovable is its design, not its
framework, code or dependencies.

**Supersedes**

Nothing.

**Impact**

Design-port work packages port design only. No Lovable framework, code or
dependency enters the canonical repository by this decision.

**Related Documents**

WP-003 report (not held in this repository) · `docs/Project/DECISION_LEDGER.md`
DEC-069

---

## DEC-071

**Category**

Product / Search

**Title**

Search Alias Data Is Seeded from Lovable's Acronym Groups and Reviewed in Three Steps

**Status**

Approved

**Date**

2026-10-10

**Source**

Founder decision, WP-003 review

**Decision**

The search alias data is seeded from Lovable's 14 acronym groups and expanded
to cover the acronyms in course content. Claude proposes the data, Codex
reviews it, and the Founder spot-checks it.

**Supersedes**

Nothing. The existing AD / Active Directory alias (SEARCH-005 §2) is preserved
in the data set.

**Impact**

WP-005 implements the proposal as a checked-in data file,
`services/api/data/search-acronym-aliases.json`, which records its review
state. Codex review and the Founder spot-check are recorded there as pending
until they occur.

**Related Documents**

`docs/Project/DECISION_LEDGER.md` DEC-046 ·
`docs/Feature-Registry/Search-Engine/SEARCH-005_TECHNICAL_QUERY_NORMALIZATION_AND_TYPO_TOLERANCE.md` ·
`services/api/data/search-acronym-aliases.json`

---

## DEC-072

**Category**

Product / Curriculum

**Title**

DHCP Content Is a Later Content Work Package

**Status**

Approved

**Date**

2026-10-10

**Source**

Founder decision, WP-003 review

**Decision**

No lesson currently covers DHCP. DHCP content is delivered by a later content
work package, not by search work.

**Supersedes**

Nothing.

**Impact**

Until that work package exists, searching for DHCP returns the existing
empty-results state with the published-curriculum list. Curriculum authorship
is unchanged: substantive learner-facing curriculum remains authored as the
Authority Model records.

**Related Documents**

WP-003 report (not held in this repository) · `docs/Project/PLATFORM_BLUEPRINT.md`
§12 · `CLAUDE.md` Authority Model

---

# Future Decisions

Future decisions will continue using this numbering scheme.

Once a decision becomes **Locked**, it should only be changed by creating a new decision that explicitly supersedes it.

Previous decisions remain part of the permanent project history.
