# Build Wave 3 — Batch 2 Resume and Prerequisite Foundation

**Features:** LEARN-002 and LEARN-004  
**Date:** 2026-08-11

## Resume

Deterministic order:

1. valid in-progress mission;
2. next required mission after completed work;
3. first incomplete required mission;
4. approved start for a new learner;
5. completed-path state.

If a previous target was retired or superseded, the engine recalculates a valid current target and preserves historical progress.

Time away never changes student standing.

## Prerequisites

Implemented:

- prerequisite rule representation;
- deterministic content-completion checks;
- blocked-state explanations;
- temporary-unavailable state;
- mission start/completion enforcement;
- authoritative integration bridge for competency/readiness/equivalent satisfaction;
- tests for satisfied, unsatisfied, authoritative satisfaction, and unavailable states.

The browser cannot declare a prerequisite satisfied.

## Scope boundary

This batch does not implement assessment scoring, evidence validation, or competency truth. Those remain owned by later approved engine work.

## Next

Wave 3 Batch 3: LEARN-003 Competency State and Advancement.
