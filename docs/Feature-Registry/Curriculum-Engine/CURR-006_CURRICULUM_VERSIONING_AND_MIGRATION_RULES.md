# CURR-006 — Curriculum Versioning and Migration Rules

**Feature ID:** CURR-006  
**Feature Name:** Curriculum Versioning and Migration Rules  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Curriculum Versioning and Migration Rules allow published learning content to evolve while preserving student history, competency evidence, and prior completion.

---

# 2. Problem Statement

Technical education changes constantly.

Courses may need updates because of:

- software releases.
- security changes.
- improved explanations.
- new lab steps.
- retired technology.
- accessibility improvements.
- corrected errors.

Without versioning, updates may invalidate student history or force unnecessary repetition.

---

# 3. Student Value

Students keep legitimate progress when a course changes and are only required to revisit material when the change affects required competency.

---

# 4. Founder Value

The Founder can improve courses continuously without manually repairing every student's record.

---

# 5. Included Scope

- Curriculum version identifier.
- published version history.
- change classification.
- compatibility rules.
- supersession relationships.
- migration guidance.
- progress-preservation rules.
- competency-impact markers.
- retired-content behavior.

---

# 6. Explicitly Excluded Scope

- automatic code migrations.
- arbitrary rewrites of historical evidence.
- silent deletion of old versions.
- forced full-course restarts after every update.

---

# 7. Dependencies

## Depends On

- CURR-001
- CURR-005
- LEARN-001 — Learning Progress Tracking
- LEARN-003 — Competency State and Advancement

---

# 8. Change Classes

Recommended classes:

## Editorial

Wording, formatting, typo, accessibility metadata.

Expected effect: no progress reset.

## Minor Instructional

Improved explanation or additional optional practice.

Expected effect: no automatic progress reset.

## Material Competency Change

Required knowledge, procedure, assessment, or lab changes meaningfully.

Expected effect: targeted review or revalidation may be required.

## Structural Change

Module/Mission organization changes.

Expected effect: migration mapping required.

## Retirement

Content is no longer valid or supported.

Expected effect: supersession or historical preservation required.

---

# 9. Migration Principle

The platform should preserve earned achievement unless there is a clear educational reason not to.

Changes should target only affected competencies or Missions.

---

# 10. Security and Integrity

Historical completion and evidence must not be rewritten silently.

Administrative migrations must be auditable.

---

# 11. Accessibility Requirements

Version-change messaging shown to students must:

- clearly explain what changed.
- distinguish required review from optional review.
- avoid alarmist wording.
- support assistive technology.

---

# 12. AI Usage

AI may:

- summarize version differences.
- propose migration mappings.
- identify potentially affected competencies.

AI may not automatically invalidate student completion.

---

# 13. Failure Behavior

If migration mapping is ambiguous:

- preserve historical state.
- flag the curriculum for Founder review.
- do not force student regression automatically.

---

# 14. Acceptance Criteria

## Founder can

- publish a new curriculum version.
- classify the change.
- define migration behavior.
- preserve historical versions.
- identify affected students where needed.

## Platform can

- retain historical references.
- map superseded curriculum.
- preserve unaffected progress.
- trigger targeted review only when approved.

---

# 15. Definition of Done

CURR-006 is complete when:

- version identifiers exist.
- change classes exist.
- published history is retained.
- migration mappings are supported.
- progress-preservation rules exist.
- ambiguous migrations fail safely.
- tests pass.
- Founder approval is recorded.

---

# 16. Success Metrics

- Course updates do not erase legitimate student progress.
- revalidation is targeted.
- historical evidence remains understandable.
- Founder can update technical content frequently without large manual cleanup.

---

# 17. Implementation References

**Recommended Milestone:** `CURR-M6 — Curriculum Versioning Foundation`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 18. Future Extensions

- automated dependency impact reports.
- bulk migration previews.
- long-term curriculum archival.

Not part of the MVP.

---

# 19. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# 20. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`CURR-007 — Content Asset References`
