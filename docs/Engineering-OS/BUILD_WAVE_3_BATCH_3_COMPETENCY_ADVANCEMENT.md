# Build Wave 3 — Batch 3 Competency State and Advancement

**Feature:** LEARN-003  
**Date:** 2026-08-11

## Implemented

- competency states: not_started, developing, demonstrated, needs_review;
- deterministic advancement decision function;
- authoritative evidence-reference contract;
- student-owned competency state;
- evidence reference persistence;
- append-only transition history;
- authenticated read API;
- no authenticated direct write policy;
- administrative correction evidence type;
- review transition support;
- explicit AI non-authority boundary.

## Advancement

Competency does not advance because a browser claims success.

Accepted authoritative evidence drives advancement.

One or more accepted approved evidence references may demonstrate competency under the current MVP rule. Future Evidence Engine policy can strengthen evidence requirements without changing the browser trust boundary.

## Review

A demonstrated competency remains demonstrated unless approved review criteria explicitly move it to `needs_review`.

## Evidence ownership

This batch does not validate Assessment, Lab, Portfolio, or Evidence Engine artifacts. It stores references to authoritative outputs from those future engines.

## Audit

Meaningful competency transitions create immutable history records with reason and source reference.

## Next

Wave 3 Batch 4 should implement LEARN-006 Recommended Next Action, LEARN-007 Learning History, and LEARN-008 Review/Reinforcement state.
