# Build Wave 2 — Batch 3 Full Curriculum Authoring

**Status:** Implementation baseline  
**Date:** 2026-08-11

## Implemented

Founder/admin authoring now covers:

- learning paths;
- courses;
- modules;
- missions;
- competencies;
- competency prerequisite relationships;
- mission-to-competency mappings.

## Stable Versions

Each authoring object receives a stable ID, independent integer version, and draft publication state.

## Publication Validation

A learning path cannot publish unless:

- the learning path has a title;
- at least one course exists;
- each course has a title and at least one module;
- each module has a title and at least one mission;
- each mission has a title;
- each mission maps to at least one required competency.

## Full-Tree Publication

After validation passes, publication promotes the learning path, child courses, modules, missions, and referenced competencies together so student RLS sees a coherent published tree.

## Security

Every curriculum write endpoint remains protected by trusted identity, Founder/admin role, verified email, and AAL2 MFA.

## Next Batch

Wave 2 Batch 4 should implement content asset references, prerequisite-cycle validation, effort/course sizing aggregation, publication quality checklist, migration/version behavior, and Curriculum Engine completion-review preparation.
