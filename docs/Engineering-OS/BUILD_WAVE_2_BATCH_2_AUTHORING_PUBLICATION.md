# Build Wave 2 — Batch 2 Curriculum Authoring and Publication

**Status:** Implementation baseline  
**Date:** 2026-08-11

## Implemented

- Founder/admin-only learning-path draft creation;
- automatic next-version assignment per stable ID;
- draft-only editing;
- bounded JSON request body parsing;
- explicit publication transition rules;
- deterministic publication validation;
- publication event history;
- publication blocked when validation fails;
- admin API routes for:
  - draft creation;
  - draft update;
  - validation;
  - publication-state transition;
- unauthenticated authoring/publication smoke checks.

## Publication state machine

Allowed transitions:

- draft → review
- draft → retired
- review → draft
- review → published
- review → retired
- published → retired
- retired → draft

Direct `draft → published` is intentionally forbidden.

## Initial publication validation

A learning path cannot publish unless:

- the learning-path title exists;
- at least one course exists;
- every course contains at least one module;
- every module contains at least one mission.

Additional validation will grow as later Curriculum features are implemented.

## Authoring security boundary

All write operations are server-side.

Every authoring/publication route requires:

- valid authenticated identity;
- Founder/admin role;
- verified email;
- AAL2 MFA.

The browser never receives service-role credentials.

## Version rule

Creating a draft for an existing stable ID creates the next integer version.

Published versions are not edited in place.

## Publication history

Every learning-path state transition records:

- node identity;
- stable ID;
- version;
- previous state;
- next state;
- acting user;
- optional reason;
- timestamp.

## Next batch

Wave 2 Batch 3 should expand authoring from learning paths into:

- courses;
- modules;
- missions;
- competencies;
- prerequisites;
- mission competency mappings;

and then strengthen whole-tree publication validation.
