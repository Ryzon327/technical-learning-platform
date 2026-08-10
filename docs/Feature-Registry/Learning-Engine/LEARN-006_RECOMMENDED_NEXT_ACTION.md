# LEARN-006 — Recommended Next Action

**Feature ID:** LEARN-006  
**Feature Name:** Recommended Next Action  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Learning Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Recommended Next Action determines the single most useful next learning action for a student based on approved curriculum order, prerequisites, progress, competency, and review needs.

---

# 2. Problem Statement

Too many choices can create decision fatigue.

Students should not need to manually inspect an entire LMS dashboard to determine what to do next.

---

# 3. Student Value

Students receive one clear recommendation with an explanation.

Examples:

- Continue your current mission.
- Complete a prerequisite.
- Take a readiness assessment.
- Review a weak competency.
- Begin the next mission.

---

# 4. Founder Value

The platform guides students automatically without the Founder personally advising each learner.

---

# 5. Included Scope

- Deterministic next-action selection.
- clear reason for recommendation.
- resume integration.
- prerequisite integration.
- competency integration.
- review integration.
- ability to view broader path without losing the primary recommendation.

---

# 6. Explicitly Excluded Scope

- Manipulative engagement.
- urgency based on inactivity.
- daily streak prompts.
- purely AI-generated progression.
- advertising-based recommendations.
- arbitrary cross-course recommendations.

---

# 7. Dependencies

## Depends On

- LEARN-001
- LEARN-002
- LEARN-003
- LEARN-004
- LEARN-005

## Unlocks

- Simplified student dashboard.
- AI Mentor contextual guidance.
- reduced decision fatigue.

---

# 8. Decision Order

Recommended logic should prefer:

1. Resume valid in-progress work.
2. Complete a blocking prerequisite.
3. Complete required competency work.
4. Take approved readiness assessment where useful.
5. Complete recommended reinforcement.
6. Begin the next required mission.

The exact order may be refined but must remain explainable.

---

# 9. Accessibility Requirements

The recommended action must:

- be clearly labeled.
- be keyboard accessible.
- include text explaining why.
- not rely on urgency colors.
- allow the student to view the full path.

---

# 10. AI Usage

AI may explain the recommendation conversationally.

AI may not override deterministic progression or recommend prohibited content.

---

# 11. Failure Behavior

If recommendation calculation fails:

- fall back to the current valid resume target.
- if unavailable, show the student's structured path.
- do not invent an AI recommendation.

---

# 12. Acceptance Criteria

## Student can

- see one primary next action.
- understand why it is recommended.
- navigate directly to it.
- view the broader path when desired.

## Platform can

- calculate the recommendation deterministically.
- respect prerequisites and competency.
- avoid recommending completed or retired content.
- fall back safely.

---

# 13. Definition of Done

LEARN-006 is complete when:

- deterministic next-action rules exist.
- explanation text exists.
- resume and prerequisite integration works.
- safe fallback exists.
- accessibility checks pass.
- tests cover major learning states.
- Founder approval is recorded.

---

# 14. Success Metrics

- Students spend less time deciding where to go.
- invalid recommendations are rare.
- recommendation logic remains explainable.
- Founder manual guidance decreases.

---

# 15. Implementation References

**Recommended Milestone:** `LEARN-M6 — Recommended Next Action`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 16. Future Extensions

- goal-aware recommendations.
- schedule-aware suggestions.
- richer AI explanation.

Not part of initial deterministic logic.

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

---

# Next Artifact

`LEARN-007 — Learning History`
