# Build Wave 3 — Batch 1 Learning Progress Foundation

**Feature:** LEARN-001 — Learning Progress Tracking  
**Date:** 2026-08-11  
**Status:** Implementation baseline

## Purpose

Establish authoritative student learning progress before adding resume, prerequisite enforcement, competency advancement, recommendations, or review behavior.

Progress represents meaningful educational state, not page views, streaks, or seat time.

## Implemented

- student-owned progress records;
- progress event history;
- stable curriculum identifier references;
- curriculum-version references;
- deterministic mission states;
- server-authoritative mission start/complete operations;
- idempotent mission completion behavior;
- no completed-to-in-progress regression from a start action;
- path/course/module/mission progress aggregation;
- completion percentage derived from missions;
- authenticated progress API read route;
- authenticated mission start/complete routes;
- RLS ownership enforcement;
- unauthenticated API smoke checks;
- deterministic aggregation tests.

## Student Progress States

The baseline represents the approved LEARN-001 states:

- `not_started`
- `in_progress`
- `completed`
- `competency_demonstrated`
- `needs_review`
- `blocked_by_prerequisite`

Batch 1 actively transitions mission work through `in_progress` and `completed`.

Later Wave 3 batches own competency, prerequisite, and review transitions.

## API Surface

`GET /learning/progress?path=<learning-path-stable-id>`

`POST /learning/missions/<mission-stable-id>/start`

`POST /learning/missions/<mission-stable-id>/complete`

The client does not submit arbitrary progress state or curriculum version.

## Security and Integrity

Progress ownership is enforced by Supabase RLS.

The deterministic database progress function derives authenticated student identity, the published mission, current mission version, and allowed next state.

## Explicitly Not Implemented In Batch 1

- resume target selection;
- prerequisite enforcement;
- competency evaluation;
- readiness/test-out assessment;
- next-action recommendation;
- student-visible learning history UI;
- review/reinforcement calculation;
- AI learning decisions;
- streaks or inactivity penalties.

## Next Batch

Wave 3 Batch 2 should implement LEARN-002 Resume and Continue Learning and LEARN-004 Prerequisite Enforcement, with readiness/test-out hooks but without prematurely implementing the Wave 4 assessment engine.
