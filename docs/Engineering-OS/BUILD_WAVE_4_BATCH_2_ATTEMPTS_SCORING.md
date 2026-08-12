# Build Wave 4 — Batch 2 Attempts and Deterministic Scoring

**Date:** 2026-08-12

## Purpose

Implement persisted student assessment attempts and deterministic server-side scoring on top of the Wave 4 Batch 1 assessment definition foundation.

## Implemented

- assessment attempt persistence;
- frozen assessment stable ID/version per attempt;
- explicit attempt number;
- attempt-limit enforcement;
- active-attempt resume behavior;
- student answer persistence;
- sanitized question delivery;
- server-only answer-key access;
- deterministic scoring using the approved assessment definition;
- persisted earned points, possible points, percentage, and pass/fail;
- attempt ownership checks;
- terminal state protection;
- explicit `interrupted` state distinct from `failed`;
- protected API routes;
- RLS read ownership.

## API Surface

- `POST /assessments/<stable-id>/attempts`
- `GET /assessment-attempts/<attempt-id>`
- `PUT /assessment-attempts/<attempt-id>/answers`
- `POST /assessment-attempts/<attempt-id>/submit`

## Security Boundary

The browser never receives `correct_option_ids`.

The browser never submits:

- score;
- passing status;
- attempt number;
- assessment version.

Those values are server authoritative.

## Deterministic Scoring

Submission loads the frozen assessment definition and authoritative answer keys, evaluates answers using the shared deterministic scoring contract, then persists the result.

AI has no role in scoring or pass/fail decisions.

## Technical Interruption

The schema reserves an explicit `interrupted` state. This batch does not yet implement the full interruption/recovery workflow; that is completed in Wave 4 Batch 4.

An interrupted state is never equivalent to failed.

## Next

Wave 4 Batch 3 — Readiness/Test-Out integration:

- readiness outcome;
- test-out eligibility/result;
- competency advancement handoff;
- prerequisite satisfaction;
- recommendation/review behavior.
