# LEARN-008 — Review and Reinforcement State

**Feature ID:** LEARN-008  
**Feature Name:** Review and Reinforcement State  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Learning Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Review and Reinforcement State identifies competencies or concepts that may benefit from additional practice while respecting the student's time and autonomy.

It replaces streak-based pressure with useful, evidence-based reinforcement.

---

# 2. Problem Statement

Students can understand a topic once and later need reinforcement.

Traditional platforms often use generic reminders or engagement mechanics instead of meaningful learning signals.

---

# 3. Student Value

Students receive:

- Focused review suggestions.
- explanations for why review may help.
- optional reinforcement where appropriate.
- no guilt for time away.
- no streak loss.
- no unnecessary repetition of mastered material.

---

# 4. Founder Value

The platform supports retention automatically and surfaces aggregate areas where curriculum may need improvement.

---

# 5. Included Scope

- Needs-review state.
- evidence-based review triggers.
- optional reinforcement recommendation.
- competency-linked review.
- review completion tracking.
- deterministic core logic.
- AI explanation support.

---

# 6. Explicitly Excluded Scope

- daily streaks.
- shame-based reminders.
- arbitrary spaced repetition for every item.
- forced review unrelated to competency.
- AI-only weakness classification.
- engagement notifications for their own sake.

---

# 7. Dependencies

## Depends On

- LEARN-003 — Competency State and Advancement
- LEARN-007 — Learning History
- Evidence Engine

## Integrates With

- LEARN-006 — Recommended Next Action
- AI Mentor
- Analytics Engine

---

# 8. Review Triggers

Approved triggers may include:

- Failed or partial competency evidence.
- repeated errors in deterministic practice.
- student-requested review.
- curriculum-defined reinforcement checkpoints.
- future validated retention models.

Time away alone must not automatically label a student weak.

## 8.1 Cross-course competency reuse is MVP scope

Per **DEC-049**, a competency demonstrated in one learning experience must be
capable of intentionally reappearing in a later one. Reuse across courses is
**MVP product scope**, not a future extension.

This section records the accurate state of that capability. It does **not**
change this Feature's acceptance criteria or Definition of Done, and it does not
reopen the completed Wave 3 implementation.

### Already supported by the implemented Feature

Cross-course reuse is not blocked by the review model, because the model was
never course-scoped:

- `student_review_state` is unique on `(user_id, competency_stable_id)`. It has
  no course, module or path column.
- `student_competency_state` is likewise keyed on the competency stable id and
  curriculum version, not on where the competency was earned.
- `listReviewState` and `listStudentCompetencyState` return **all** of a
  learner's competencies regardless of which course produced them.
- `mission_competencies` links any mission to any competency, so a mission in a
  later course may already reference a competency introduced in an earlier one.

A competency demonstrated in a networking course is therefore already visible,
already carries review state, and is already referenceable from a later Linux,
Windows or Security mission.

### Required by MVP product scope

Later learning experiences must **require practical reuse** of applicable prior
competencies rather than reteaching them, and reinforcement must be contextual —
expressed as part of the new task rather than as a repeated quiz. See
`docs/Learning-OS/Learning-OS.md` section 21.

Existing guardrails are unchanged and continue to apply: reuse must never become
streaks, guilt, inactivity penalties, or forced repetition of mastered material.

### Remaining MVP work — not yet implemented

Stated plainly so this Feature is not read as already satisfying the ruling:

1. **Reinforcement intent is not yet expressible in curriculum.**
   `mission_competencies` carries only `required`. It cannot distinguish a
   mission that **teaches** a competency from one that **reuses** an already
   demonstrated competency. Adding that distinction is a small Curriculum Engine
   extension and would require a migration, so it needs separate Founder
   authorization.

2. **The curriculum-defined reinforcement checkpoint trigger has no writer.**
   Section 8 approves the trigger, but review state is currently written only
   from the readiness/test-out path. No implementation writes review state from a
   curriculum checkpoint.

3. **No learner-facing surfacing of reuse.** Nothing yet tells a learner that the
   task in front of them draws on a competency they already proved.

4. **The connected curriculum does not exist.** Reuse cannot be demonstrated
   until the experiences that reuse each other are authored
   (`MVP_IMPLEMENTATION_SEQUENCE.md` section 15e).

Items 1 through 3 are Learning and Curriculum Engine work owned by the MVP
connected-learning effort. Item 4 is content authoring.

---

# 9. Accessibility Requirements

Review suggestions must:

- explain why they appear.
- support keyboard navigation.
- not use alarming color-only indicators.
- avoid negative labels such as “bad student.”
- distinguish optional review from required prerequisite work.

---

# 10. AI Usage

AI may:

- explain a review recommendation.
- suggest practice.
- personalize examples using approved context.

AI may not:

- mark competency weak without deterministic evidence.
- create punitive reminders.
- modify competency truth.

---

# 11. Failure Behavior

If review-state calculation fails:

- do not block progression unless a separate prerequisite rule requires it.
- omit the optional review recommendation.
- preserve authoritative competency state.

---

# 12. Acceptance Criteria

## Student can

- see when review is recommended.
- understand why.
- choose optional review where allowed.
- complete reinforcement and see updated state.
- remain free from streak or inactivity penalties.

## Platform can

- derive review state from approved evidence.
- distinguish required remediation from optional reinforcement.
- avoid using time-away alone as weakness evidence.

---

# 13. Definition of Done

LEARN-008 is complete when:

- review-state model exists.
- approved triggers are deterministic.
- optional versus required review is clear.
- AI cannot alter review truth.
- accessibility checks pass.
- tests cover review and no-review states.
- Founder approval is recorded.

---

# 14. Success Metrics

- Review suggestions correlate with real learning needs.
- students are not pressured by inactivity.
- unnecessary repetition decreases.
- retention support improves without gamification.

---

# 15. Implementation References

**Recommended Milestone:** `LEARN-M8 — Review and Reinforcement State`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 16. Future Extensions

- validated spaced-retrieval models.
- confidence calibration.
- adaptive reinforcement scheduling.

Not part of the initial MVP.

**Cross-course competency reinforcement was removed from this list by DEC-049.**
It is now MVP product scope and is recorded in section 8.1. What remains deferred
here is *automatic and adaptive* reinforcement scheduling — deciding on the
learner's behalf when a competency should recur. Curriculum-authored reuse, which
is what the MVP requires, is not deferred.

---

# 17. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# 18. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |
| 1.1 | 2026-08-25 | Cross-course competency reinforcement moved from Future Extensions into MVP scope per DEC-049. Added section 8.1 recording what the implemented Feature already supports, what MVP product scope now requires, and what implementation work genuinely remains. Included Scope, Acceptance Criteria and Definition of Done are unchanged, and the completed Wave 3 implementation is not reopened. |

---

# Learning Engine Specification Status

After Founder approval of LEARN-004 through LEARN-008, all initial Learning Engine Features are specified.

Next Engine:

`Curriculum Engine`
