# Learning Engine Features

**Platform Engine:** Learning Engine  
**Status:** Approved

---

# Purpose

The Learning Engine manages how a student progresses through learning over time.

It does not own course content itself. The Curriculum Engine owns learning paths, courses, modules, missions, lessons, and assessments.

The Learning Engine owns the student's relationship to that curriculum:

- Progress
- Completion
- Competency state
- Mastery state
- Readiness
- Recommended next action
- Learning history
- Resume state

---

# Engine Responsibilities

The Learning Engine owns:

- Learning progress tracking.
- Mission completion state.
- Competency state.
- Mastery/readiness state.
- Resume position.
- Learning history.
- Prerequisite enforcement.
- Competency-based advancement.
- Recommended next learning action.
- Student-controlled pacing.
- Review recommendations based on evidence.

---

# Non-Responsibilities

The Learning Engine does not own:

- Course content.
- Lessons.
- Videos.
- Labs.
- Notes.
- Authentication.
- Certificates.
- AI provider routing.
- Founder analytics.
- Curriculum publication.

Those responsibilities belong to their respective Engines.

---

# Design Principles

The Learning Engine must:

- Respect student time.
- Preserve progress.
- Avoid artificial streaks.
- Avoid guilt-based engagement.
- Support competency-based advancement.
- Keep standards consistent.
- Explain why a student is blocked.
- Allow qualified students to prove prior knowledge.
- Prefer meaningful next actions over endless dashboards.
- Remain deterministic for completion and competency decisions.

AI may advise, but it does not decide mastery.

---

# Current MVP Features

| Feature ID | Feature | Level | Status |
|---|---|---|---|
| LEARN-001 | Learning Progress Tracking | Core | Specified |
| LEARN-002 | Resume and Continue Learning | Core | Specified |
| LEARN-003 | Competency State and Advancement | Core | Specified |
| LEARN-004 | Prerequisite Enforcement | Core | Approved |
| LEARN-005 | Readiness Assessment and Test-Out | Core | Approved |
| LEARN-006 | Recommended Next Action | Essential | Approved |
| LEARN-007 | Learning History | Essential | Approved |
| LEARN-008 | Review and Reinforcement State | Essential | Approved |

---

# Feature Summary

## LEARN-001 — Learning Progress Tracking

Records the student's progress through learning paths, courses, modules, missions, and approved completion requirements.

## LEARN-002 — Resume and Continue Learning

Returns the student to the most relevant place in their learning journey without forcing them to remember where they stopped.

## LEARN-003 — Competency State and Advancement

Tracks demonstrated capability and allows advancement based on evidence rather than only content completion.

## LEARN-004 — Prerequisite Enforcement

Ensures students follow required technical dependencies while clearly explaining why prerequisites exist.

## LEARN-005 — Readiness Assessment and Test-Out

Allows students to prove existing knowledge or skill and avoid repeating material they already know.

## LEARN-006 — Recommended Next Action

Determines the single most useful next learning action based on approved curriculum state and demonstrated capability.

## LEARN-007 — Learning History

Maintains an understandable timeline of completed, attempted, resumed, and validated learning activity.

## LEARN-008 — Review and Reinforcement State

Tracks concepts that may benefit from review without using guilt, streaks, or punitive reminders.

---

# Dependencies

The Learning Engine depends on:

- Authentication Identity Context.
- Platform Kernel.
- Curriculum Engine definitions once implemented.

It integrates with:

- Lab Engine.
- Evidence Engine.
- Knowledge & Notes Engine.
- AI Orchestration Engine.
- Certificate Engine.
- Analytics Engine.

---

# Next Feature

`LEARN-001 — Learning Progress Tracking`
