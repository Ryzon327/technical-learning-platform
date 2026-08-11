# Build Wave 2 — Batch 1 Curriculum Foundation

**Status:** Implementation baseline  
**Date:** 2026-08-11

## Implemented

- curriculum shared contracts;
- stable IDs plus independent integer versions;
- governed publication states;
- hierarchy:
  - learning path;
  - course;
  - module;
  - mission;
- competency model;
- competency prerequisite links;
- mission-to-competency links;
- estimated-effort fields;
- deterministic sibling ordering;
- curriculum updated-at triggers;
- RLS on all curriculum tables;
- authenticated read access only to published curriculum;
- read-only API endpoint for published learning paths;
- read-only API endpoint for a published learning-path tree;
- protected curriculum API requiring trusted authentication.

## Stable ID rule

Database `id` values are row/version identities.

`stable_id` is the durable curriculum identity used to refer to the logical learning object across versions.

The pair `(stable_id, version)` is unique.

## Publication boundary

Students can read only rows whose publication state is `published`.

Draft, review, and retired curriculum are not exposed through student RLS policies.

Founder/admin authoring and publication operations are intentionally not part of this first batch.

## Hierarchy

The initial hierarchy is:

Learning Path
→ Course
→ Module
→ Mission

Competencies are modeled separately and can be linked to missions.

Competencies can depend on prerequisite competencies.

## Next batch

Wave 2 Batch 2 should implement Founder/admin curriculum authoring and deterministic publication workflow, including validation that a curriculum version is publishable before student exposure.
