# CURR-008 — Estimated Effort and Course Sizing

**Feature ID:** CURR-008  
**Feature Name:** Estimated Effort and Course Sizing  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Estimated Effort and Course Sizing establishes curriculum metadata and quality rules that keep Courses, Modules, and Missions manageable for adult learners.

The platform should avoid building unnecessarily long courses simply because more content can be added.

---

# 2. Problem Statement

Technical courses frequently become 30–50 hour content libraries.

This creates:

- Low completion.
- fatigue.
- difficult updates.
- intimidating course pages.
- large content-production burden.
- slow launch cycles.

---

# 3. Student Value

Students receive shorter, clearly bounded learning units with visible outcomes.

Estimated effort is informational, not a deadline.

---

# 4. Founder Value

Smaller course units:

- Launch faster.
- Update more easily.
- reduce content production bottlenecks.
- allow focused pricing and packaging later.
- make course quality easier to manage.

---

# 5. Included Scope

- Estimated effort for Course.
- estimated effort for Module.
- estimated effort for Mission.
- content-size warnings.
- lab effort estimate.
- distinction between active practice and passive instruction.
- non-binding student-facing estimates.
- curriculum quality checks for oversized units.

---

# 6. Explicitly Excluded Scope

- forced completion times.
- countdown timers.
- penalties for slow learning.
- time-based competency.
- cohort deadlines.
- surveillance of actual time unless required for basic operational metrics.

---

# 7. Sizing Principles

Preferred design:

- Mission: small, complete objective.
- Module: coherent collection of Missions.
- Course: focused capability area.
- Learning Path: broader career or technical progression.

Avoid using Course as a container for an entire career field.

---

# 8. Effort Metadata

Effort may distinguish:

- Learn/Read/Watch.
- Guided Practice.
- Lab.
- Assessment.
- Optional Review.

This helps students plan realistically.

---

# 9. Dependencies

## Depends On

- CURR-003 — Course, Module, and Mission Definition

## Integrates With

- Curriculum Quality Checklist.
- Student dashboard.
- Founder curriculum planning.

---

# 10. Accessibility and Equity

Effort estimates must not become accessibility barriers.

Students who require more time must not be penalized.

The platform should label estimates as approximate.

---

# 11. AI Usage

AI may:

- estimate draft content effort.
- flag unusually large Missions.
- recommend splitting oversized curriculum.

AI may not force a time limit based on estimates.

---

# 12. Failure Behavior

Missing estimates should create a curriculum-quality warning, not block student progress in already published content.

---

# 13. Acceptance Criteria

## Founder can

- see estimated Course/Module/Mission effort.
- identify oversized units.
- split content before publication where appropriate.

## Student can

- see approximate effort without interpreting it as a deadline.
- understand which activities are likely to require hands-on time.

---

# 14. Definition of Done

CURR-008 is complete when:

- effort metadata exists.
- estimated effort can be aggregated.
- quality warnings exist for missing or extreme values.
- estimates are labeled non-binding.
- no time-based penalties are introduced.
- Founder approval is recorded.

---

# 15. Success Metrics

- Fewer monolithic Courses.
- clearer expectations for learners.
- easier course maintenance.
- reduced Founder content-production burden.
- course launch cycles remain manageable.

---

# 16. Implementation References

**Recommended Milestone:** `CURR-M8 — Effort and Sizing Metadata`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 17. Future Extensions

- Student schedule planning.
- personalized effort estimates.
- team training planning.

Not part of the MVP.

---

# 18. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# 19. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`CURR-009 — Curriculum Quality Checklist`
