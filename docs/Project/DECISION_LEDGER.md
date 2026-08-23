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

# Future Decisions

Future decisions will continue using this numbering scheme.

Once a decision becomes **Locked**, it should only be changed by creating a new decision that explicitly supersedes it.

Previous decisions remain part of the permanent project history.

