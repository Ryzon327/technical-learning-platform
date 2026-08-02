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

# Future Decisions

Future decisions will continue using this numbering scheme.

Once a decision becomes **Locked**, it should only be changed by creating a new decision that explicitly supersedes it.

Previous decisions remain part of the permanent project history.

