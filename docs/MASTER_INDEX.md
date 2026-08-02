# MASTER_INDEX

**Technical Learning Platform**
**Company Operating System Index**
**Version:** 1.0

---

# Purpose

This document is the navigation system for the Technical Learning Platform.

It defines:

* How the company is organized.
* Where documentation lives.
* Which Operating System owns each responsibility.
* Which documents are authoritative.
* Which AI agents use which manuals.
* The required reading order for humans and AI.

This document should be the first document read by every new contributor.

---

# Company Mission

Build competent, confident, and employable technical professionals through immersive, practical, and accessible technical education.

The company values:

* Respecting the student's time.
* Teaching practical skills.
* Encouraging lifelong learning.
* Reducing founder workload through automation.
* Building maintainable systems.
* Creating long-term value over short-term novelty.

---

# Company Constitution

The constitutional authority for the company is:

`PLATFORM_BLUEPRINT.md`

The Blueprint defines:

* Vision
* Principles
* Boundaries
* Product philosophy
* Learning philosophy
* Architecture
* Non-negotiable rules

No Operating System may contradict the Blueprint.

---

# Company Operating Systems

The company is organized into five Operating Systems.

Each Operating System owns one major area of responsibility.

## Product Operating System

**Mission**

Define what the company builds.

**Owns**

* Product Vision
* Product Boundaries
* Roadmap
* Feature Registry
* Future Register
* Decision Ledger
* Product priorities

**Does Not Own**

* Implementation
* Infrastructure
* Student operations
* Engineering standards

**Primary Audience**

* Founder
* Product Owner
* Claude
* Future Product Managers

---

## Engineering Operating System

**Mission**

Define how the software is built.

**Owns**

* Development workflow
* Coding standards
* Repository standards
* Testing
* Releases
* GitHub workflow
* AI implementation process

**Does Not Own**

* Product decisions
* Business priorities
* Learning philosophy

**Primary Audience**

* Claude
* Platform Engineer
* Developers

---

## Learning Operating System

**Mission**

Define how students learn.

**Owns**

* Learning philosophy
* Course framework
* Mission framework
* Competencies
* Evidence
* AI Mentor behavior
* Study Success Center
* Notes
* Certificates

**Does Not Own**

* Infrastructure
* Engineering
* Founder operations

**Primary Audience**

* Founder
* Curriculum Designers
* AI Mentor

---

## Platform Operating System

**Mission**

Define how the platform operates.

**Owns**

* Platform architecture
* Authentication
* Engines
* Infrastructure
* Monitoring
* Recovery
* Scalability
* Deployment

**Does Not Own**

* Product priorities
* Course design
* Business strategy

**Primary Audience**

* Platform Engineer
* Claude
* Developers

---

## Founder Operating System

**Mission**

Help the founder run the business efficiently.

**Owns**

* Founder Dashboard
* Daily Brief
* Operations
* Project Management
* AI Cost Tracking
* Course Operations
* Platform Health
* Business Metrics
* Approvals

**Does Not Own**

* Product architecture
* Software implementation
* Learning design

**Primary Audience**

* Founder

---

# Core Project Documents

The following documents are required for every implementation session.

## PLATFORM_BLUEPRINT.md

Defines the company's constitutional rules.

Priority: Highest

---

## MASTER_BUILD_PROMPT.md

Defines how Claude behaves.

Priority: Highest

---

## CURRENT_BUILD_STATUS.md

Defines where implementation currently stands.

Updated every milestone.

---

## DECISION_LEDGER.md

Explains why major decisions were made.

Never delete historical decisions.

---

## FEATURE_REGISTRY.md

Master inventory of all approved features.

Every feature belongs to exactly one owning engine.

---

## ROADMAP.md

Defines implementation order.

---

## NOT_NOW.md

Approved future ideas that are intentionally deferred.

Claude must never implement items from this document unless explicitly instructed.

---

# Standard Reading Order

## New Founder

1. MASTER_INDEX.md
2. PLATFORM_BLUEPRINT.md
3. Product OS
4. Founder OS

---

## Claude

1. MASTER_INDEX.md
2. PLATFORM_BLUEPRINT.md
3. MASTER_BUILD_PROMPT.md
4. CURRENT_BUILD_STATUS.md
5. DECISION_LEDGER.md
6. FEATURE_REGISTRY.md
7. Relevant Operating System
8. Relevant source code

---

## New Developer

1. MASTER_INDEX.md
2. PLATFORM_BLUEPRINT.md
3. Engineering OS
4. Platform OS
5. CURRENT_BUILD_STATUS.md

---

## Curriculum Designer

1. MASTER_INDEX.md
2. PLATFORM_BLUEPRINT.md
3. Learning OS
4. Product OS

---

# Standard Vocabulary

To keep documentation consistent, these terms have fixed meanings.

**Engine**

A modular software capability with one clear responsibility.

**Learning Path**

An ordered sequence of courses.

**Course**

A collection of modules focused on one subject.

**Module**

A collection of related missions.

**Mission**

A practical learning objective.

**Lab**

An interactive environment used to complete a mission.

**Competency**

A demonstrated capability validated by the platform.

**Evidence**

Recorded proof of demonstrated competency.

**Founder**

The product owner and final decision-maker.

**Platform Engineer**

The AI responsible for technical operations and implementation guidance.

---

# Repository Overview

```text
technical-learning-platform/

apps/
packages/
services/
content/
labs/
media/
supabase/
infrastructure/
scripts/
tests/
prompts/
docs/

Root project documents
```

Every file and folder must have a clear owner.

---

# Documentation Principles

Documentation should be:

* Clear.
* Accurate.
* Versioned.
* Modular.
* Non-duplicative.
* Easy to navigate.
* Beginner friendly.
* AI friendly.

Each topic has one authoritative home.

---

# Change Management

Changes should follow this order:

1. Founder approval.
2. Update Blueprint if constitutional.
3. Update the appropriate Operating System.
4. Update Decision Ledger if needed.
5. Update Feature Registry if needed.
6. Update Build Status.
7. Implement changes.
8. Commit to GitHub.

---

# Long-Term Vision

This documentation structure is designed to support:

* The LMS.
* Additional technical learning paths.
* Recruitment.
* Staffing.
* Employer services.
* Future AI agents.
* Future employees.
* Future business units.

The goal is to create an organization that scales without losing clarity or requiring repeated architectural discussions.

---

# Document Status

This document is considered foundational.

Future changes should refine navigation rather than redefine the company structure.

When in doubt, start here.

