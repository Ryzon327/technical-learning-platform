---

# Company Terminology

To maintain consistency across documentation, software, AI agents, and future contributors, the following terms have fixed meanings within this company.

These definitions are authoritative and should be used consistently throughout the project.

---

## Company Operating Systems

The term **Company Operating Systems** refers to the organizational operating manuals that define how the company functions.

They are **not** computer operating systems such as Windows, Linux, or macOS.

The Company Operating Systems are:

- Product Operating System
- Engineering Operating System
- Learning Operating System
- Platform Operating System
- Founder Operating System

Together, these documents define:

- Responsibilities
- Ownership
- Standards
- Interfaces
- Daily practices
- Decision authority
- Long-term governance

Every major business decision and implementation should trace back to one of these Operating Systems.

---

## Platform Engines

A **Platform Engine** is a modular software subsystem responsible for one clearly defined capability.

Each Engine owns exactly one area of responsibility.

Examples include:

- Platform Kernel
- Authentication Engine
- Learning Engine
- Curriculum Engine
- Knowledge & Notes Engine
- Lab Engine
- Evidence Engine
- Certificate Engine
- Search Engine
- Analytics Engine
- Operations Engine
- Notification Engine
- AI Orchestration Engine

Engines communicate through documented interfaces.

No Engine directly depends on another Engine's internal implementation.

---

## Features

A Feature is a specific capability delivered by one Platform Engine.

Each Feature has:

- One owner
- One Engine
- One lifecycle
- One source of truth

Features are documented in the Feature Registry.

---

## Milestones

A Milestone is the smallest complete unit of work that delivers meaningful value.

Every Milestone should:

- Be independently testable
- Be independently deployable when practical
- Produce measurable progress

Implementation proceeds one Milestone at a time.

---

## Tasks

Tasks are individual implementation steps required to complete a Milestone.

Tasks should be:

- Small
- Clear
- Actionable
- Easy to review

Tasks are implementation details, not planning artifacts.

---

## Competency

Competency is demonstrated capability.

Competency is never assumed based solely on:

- Time spent
- Videos watched
- Lessons completed

Students demonstrate competency through practical work and validated evidence.

---

## Evidence

Evidence is proof that a student has demonstrated competency.

Examples include:

- Completed labs
- Practical assessments
- Technical explanations
- Challenge exercises
- Capstone projects

Evidence supports meaningful certification.

---

## AI Agents

AI Agents are specialized assistants responsible for one domain of expertise.

Examples include:

- Platform Engineer
- Learning Advisor
- Product Advisor
- Security Advisor
- Business Advisor
- Finance Advisor

AI Agents assist the founder but do not redefine company direction.

---

## Founder

The Founder is the final decision-maker for:

- Vision
- Product direction
- Strategic priorities
- Business operations

The Founder delegates implementation—not ownership.

---

## Repository Freeze

The repository structure is considered stable.

Future work should:

- Add new content
- Extend existing systems
- Improve implementation

Future work should not:

- Reorganize the repository
- Rename major architectural components
- Introduce new top-level structures

without explicit founder approval.

This protects long-term maintainability and minimizes unnecessary architectural drift.

<!-- BEGIN MVP IMPLEMENTATION TRANSITION -->
# MVP Implementation Transition

## Architecture Freeze

- `docs/Project/ARCHITECTURE_FREEZE_RECORD.md`
- `docs/Project/FEATURE_REGISTRY_RECONCILIATION.md`
- `docs/Project/MVP_ARCHITECTURE_FREEZE_CHECKLIST.md`

## Implementation Planning

- `docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md`
- `docs/Roadmap/ROADMAP.md`
- `docs/Roadmap/MILESTONE_CATALOG.md`
- `docs/Roadmap/RELEASE_PLAN.md`

## Active Feature Registry Engines

- Platform Kernel
- Authentication Engine
- Learning Engine
- Curriculum Engine
- Knowledge and Notes Engine
- Lab Engine
- Evidence Engine
- Certificate Engine
- Search Engine
- AI Gateway
- Analytics Engine
- Operations Engine
- Notification Engine

The retired empty AI Orchestration Engine is not part of the active MVP architecture.
<!-- END MVP IMPLEMENTATION TRANSITION -->
