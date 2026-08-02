# Feature Catalog

**Project:** Technical Learning Platform

**Purpose:**
The Feature Catalog is the authoritative inventory of all approved Features within the Technical Learning Platform.

Detailed Feature specifications are maintained in each Platform Engine's Feature file.

This document provides:

* A single inventory of approved Features.
* Feature ownership.
* Lifecycle visibility.
* Product scope.
* High-level implementation planning.
* Navigation to detailed Feature records.

The Feature Catalog is governed by:

* Platform Blueprint
* Feature Registry Specification
* Product Operating System
* Engineering Operating System

---

# Current MVP Status

Current Phase:

**Phase 2 — Product Construction**

Current Objective:

Define the complete MVP Feature Set before implementation begins.

Repository Status:

✅ Repository Frozen

Architecture Status:

✅ Approved

Engine Architecture:

✅ Approved

---

# Platform Engine Inventory

The Technical Learning Platform currently consists of the following Platform Engines.

| Engine                   | Status   | Feature File                           |
| ------------------------ | -------- | -------------------------------------- |
| Platform Kernel          | Approved | PLATFORM_KERNEL_FEATURES.md            |
| Authentication Engine    | Approved | AUTHENTICATION_FEATURES.md             |
| Learning Engine          | Approved | LEARNING_ENGINE_FEATURES.md            |
| Curriculum Engine        | Approved | CURRICULUM_ENGINE_FEATURES.md          |
| Knowledge & Notes Engine | Approved | KNOWLEDGE_AND_NOTES_ENGINE_FEATURES.md |
| Lab Engine               | Approved | LAB_ENGINE_FEATURES.md                 |
| Evidence Engine          | Approved | EVIDENCE_ENGINE_FEATURES.md            |
| Certificate Engine       | Approved | CERTIFICATE_ENGINE_FEATURES.md         |
| Search Engine            | Approved | SEARCH_ENGINE_FEATURES.md              |
| Analytics Engine         | Approved | ANALYTICS_ENGINE_FEATURES.md           |
| Operations Engine        | Approved | OPERATIONS_ENGINE_FEATURES.md          |
| Notification Engine      | Approved | NOTIFICATION_ENGINE_FEATURES.md        |
| AI Orchestration Engine  | Approved | AI_ORCHESTRATION_ENGINE_FEATURES.md    |

---

# Feature Status Definitions

| Status     | Meaning                               |
| ---------- | ------------------------------------- |
| Approved   | Founder approved the Feature concept. |
| Specified  | Feature documentation is complete.    |
| Planned    | Scheduled for implementation.         |
| Building   | Currently being implemented.          |
| Testing    | Under validation.                     |
| Production | Released and operational.             |
| Optimizing | Being improved after release.         |
| Deprecated | Scheduled for removal.                |
| Retired    | No longer active.                     |

---

# Initial MVP Scope

The MVP focuses on helping students learn technical skills through structured learning, practical labs, AI guidance, and competency validation.

The MVP includes:

* Student authentication
* Student onboarding
* Learning progression
* Structured curriculum
* Interactive note taking
* AI mentor assistance
* Practical lab delivery
* Lab validation
* Competency evidence
* Certificates
* Founder dashboard
* Platform operations
* Search
* Notifications
* Analytics

The MVP intentionally excludes deferred capabilities documented in `NOT_NOW.md`.

---

# Feature Catalog

The detailed Feature inventory will be maintained inside each Platform Engine.

This document serves as the navigation layer for those Feature inventories.

As Features are approved, they will be added below.

| Feature ID          | Feature Name | Engine | Level | Status |
| ------------------- | ------------ | ------ | ----- | ------ |
| *(To be populated)* |              |        |       |        |

---

# Product Scope Rules

Every Feature included in this catalog must:

* Have a permanent Feature ID.
* Have one owning Engine.
* Have one Product Owner.
* Use the Feature Template.
* Exist within approved MVP scope.
* Be traceable to the Roadmap.
* Be traceable to a Milestone.

---

# Deferred Features

Features outside the MVP are not tracked here.

Deferred Features belong in:

`docs/Project/NOT_NOW.md`

Examples include:

* Additional learning domains
* Enterprise management
* Instructor-led cohorts
* Career simulation
* AI coworkers
* Recruiting platform
* Business management platform
* Financial planning platform
* Health platform integration

---

# Relationship to Other Documents

Feature Registry Specification

↓

Feature Template

↓

Feature Catalog

↓

Engine Feature Files

↓

Roadmap

↓

Milestones

↓

Implementation

---

# Maintenance Rules

Whenever a Feature is approved:

1. Create the detailed Feature record in the appropriate Engine.
2. Add the Feature to this catalog.
3. Assign a permanent Feature ID.
4. Update the Roadmap if required.
5. Update Milestones if required.
6. Update Current Build Status if implementation begins.

The Feature Catalog should always reflect the current approved product scope.

---

# Next Artifact

The next step is to populate each Platform Engine's Feature file with the approved MVP Features.

Implementation does not begin until the initial MVP Feature inventory has been defined.

