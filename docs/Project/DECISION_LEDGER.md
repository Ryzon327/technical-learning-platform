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

# Future Decisions

Future decisions will continue using this numbering scheme.

Once a decision becomes **Locked**, it should only be changed by creating a new decision that explicitly supersedes it.

Previous decisions remain part of the permanent project history.

