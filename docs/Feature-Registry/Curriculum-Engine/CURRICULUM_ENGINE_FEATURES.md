# Curriculum Engine Features

**Platform Engine:** Curriculum Engine  
**Status:** Approved

---

# Purpose

The Curriculum Engine defines the structure, order, relationships, and versioning of educational content.

It owns what students are expected to learn and how that learning is organized.

The Learning Engine owns each student's progress through the curriculum. The Curriculum Engine owns the curriculum itself.

---

# Engine Responsibilities

The Curriculum Engine owns:

- Learning Paths.
- Courses.
- Modules.
- Missions.
- Lessons and instructional units.
- Activities and assessments.
- Competency definitions.
- Prerequisite declarations.
- Curriculum sequencing.
- Curriculum versioning.
- Publication state.
- Content metadata.
- Estimated learner effort.
- Course-update compatibility rules.

---

# Non-Responsibilities

The Curriculum Engine does not own:

- Student progress.
- Authentication.
- Notes.
- Lab infrastructure.
- AI provider routing.
- Evidence storage.
- Certificate issuance.
- Founder analytics.
- Notifications.

Other Engines consume curriculum definitions through documented interfaces.

---

# Design Principles

Curriculum must:

- Respect student time.
- Be structured and guided by default.
- Allow competency-based test-out where approved.
- Start from fundamentals before advanced work.
- Connect lessons to real technical work.
- Avoid unnecessarily long courses.
- Favor smaller complete learning units.
- Make prerequisites explicit.
- Separate curriculum content from platform code.
- Support updates without destroying historical student progress.
- Remain reusable across future technical domains.

---

# Standard Curriculum Hierarchy

```text
Learning Path
└── Course
    └── Module
        └── Mission
            ├── Context
            ├── Lesson
            ├── Demonstration
            ├── Activity
            ├── Assessment
            ├── Lab Reference
            ├── Reflection
            └── Competency Requirements
```

Not every Mission requires every child type, but every item must have a defined purpose.

---

# Current MVP Features

| Feature ID | Feature | Level | Status |
|---|---|---|---|
| CURR-001 | Curriculum Hierarchy and Stable IDs | Core | Specified |
| CURR-002 | Structured Learning Path Definition | Core | Specified |
| CURR-003 | Course, Module, and Mission Definition | Core | Specified |
| CURR-004 | Competency and Prerequisite Definitions | Core | Approved |
| CURR-005 | Curriculum Publication Workflow | Core | Approved |
| CURR-006 | Curriculum Versioning and Migration Rules | Core | Approved |
| CURR-007 | Content Asset References | Essential | Approved |
| CURR-008 | Estimated Effort and Course Sizing | Essential | Approved |
| CURR-009 | Curriculum Quality Checklist | Essential | Approved |

---

# Feature Summary

## CURR-001 — Curriculum Hierarchy and Stable IDs

Defines permanent identifiers and relationships for Learning Paths, Courses, Modules, Missions, and supported educational units.

## CURR-002 — Structured Learning Path Definition

Defines ordered learning journeys and how courses connect into recommended technical progression.

## CURR-003 — Course, Module, and Mission Definition

Defines the core reusable learning units that contain instructional and practical experiences.

## CURR-004 — Competency and Prerequisite Definitions

Defines what students must be able to demonstrate and what prerequisite relationships apply.

## CURR-005 — Curriculum Publication Workflow

Separates draft curriculum from student-visible published curriculum.

## CURR-006 — Curriculum Versioning and Migration Rules

Allows courses to evolve without corrupting student history or forcing unnecessary repetition.

## CURR-007 — Content Asset References

Connects Missions to videos, text, diagrams, labs, files, AI-generated assets, and other approved content.

## CURR-008 — Estimated Effort and Course Sizing

Keeps learning units manageable and avoids excessively long, draining courses.

## CURR-009 — Curriculum Quality Checklist

Ensures every publishable curriculum unit meets learning, accessibility, security, and clarity standards.

---

# Dependencies

The Curriculum Engine depends on:

- Platform Kernel.
- Authentication Identity Context for administrative publication actions.

It integrates closely with:

- Learning Engine.
- Lab Engine.
- Evidence Engine.
- AI Orchestration Engine.
- Search Engine.
- Certificate Engine.

---

# Next Feature

`CURR-001 — Curriculum Hierarchy and Stable IDs`
