# LEARN-001 — Learning Progress Tracking

**Feature ID:** LEARN-001  
**Feature Name:** Learning Progress Tracking  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Learning Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Learning Progress Tracking records where a student is within the approved curriculum and which learning requirements have been completed, attempted, or remain incomplete.

Progress represents meaningful educational state, not time spent in the application.

---

# 2. Problem Statement

Students need to leave and return without losing their place.

The platform also needs reliable progress information for:

- Learning paths.
- Courses.
- Modules.
- Missions.
- Labs.
- Competency requirements.
- Certificates.
- Recommended next actions.

Traditional LMS progress often overvalues videos watched or pages clicked. This platform must track meaningful completion.

---

# 3. Student Value

Students can:

- See what they have completed.
- Understand what remains.
- Resume without starting over.
- Receive credit for demonstrated competency.
- Avoid being pressured by daily streaks.
- Learn at their own pace.

---

# 4. Founder Value

The Founder can understand learning progress without manually reviewing every student's activity.

Progress data can support course improvement and identify confusing or broken learning experiences.

---

# 5. Included Scope

- Learning-path progress.
- Course progress.
- Module progress.
- Mission progress.
- Completion state.
- Attempt state.
- In-progress state.
- Competency-linked completion.
- Timestamp history.
- Resume reference.
- deterministic progress calculation.
- progress aggregation.
- safe recalculation when curriculum versions change.

---

# 6. Explicitly Excluded Scope

LEARN-001 does not include:

- Course content authoring.
- Lab validation logic.
- AI judgment of mastery.
- Certificates.
- Gamification points.
- Daily streaks.
- social rankings.
- mandatory pacing.
- grading policy.

---

# 7. Progress States

Recommended states include:

- Not Started
- In Progress
- Completed
- Competency Demonstrated
- Needs Review
- Blocked by Prerequisite

The exact data model may evolve, but state meaning must remain clear and deterministic.

---

# 8. Dependencies

## Depends On

- AUTH-007 — Authentication Identity Context
- KERN-001 — Platform Configuration
- KERN-004 — Error Handling Framework

Future implementation also depends on Curriculum Engine identifiers.

## Unlocks

- LEARN-002
- LEARN-003
- LEARN-006
- Certificates
- Founder progress analytics
- Learning continuity

---

# 9. Security and Privacy

Progress data belongs to the authenticated student.

The platform must:

- Enforce student ownership.
- Prevent one student from reading another student's progress.
- Allow authorized Founder access only when operationally necessary.
- Avoid placing progress records in client-trusted state alone.
- preserve auditability for administrative corrections.

Progress data should not be publicly visible by default.

---

# 10. Accessibility Requirements

Progress displays must:

- Use text, not color alone.
- expose completion status to screen readers.
- use logical heading structure.
- support keyboard navigation.
- avoid visually overwhelming dashboards.
- clearly distinguish recommended action from total progress.

---

# 11. AI Usage

**AI Used:** Optional.

AI may:

- Explain progress.
- summarize what the student has accomplished.
- recommend review using deterministic learning state.

AI may not:

- change completion state.
- mark competency complete.
- invent progress.
- override required prerequisites.

---

# 12. Operational Requirements

Monitor:

- Progress-write failures.
- duplicate state transitions.
- invalid curriculum references.
- unexpected completion regressions.
- version migration failures.

Progress writes should be durable and idempotent where practical.

---

# 13. Failure Behavior

If a progress update fails:

- Student work should not be falsely marked complete.
- The system should preserve recoverable state.
- The student should receive a calm, clear message where visible.
- The failure should be logged with a correlation ID.
- retry should be safe where practical.

---

# 14. Acceptance Criteria

## Student can

- See progress at path, course, module, and mission levels.
- leave and return without losing completed progress.
- receive completion credit from approved competency evidence.
- understand blocked or incomplete states.

## Platform can

- Store progress by stable curriculum identifiers.
- calculate aggregate progress deterministically.
- preserve ownership boundaries.
- prevent duplicate completion records.
- distinguish completion from competency.

## Founder can

- view aggregate progress trends without changing student state accidentally.

---

# 15. Definition of Done

LEARN-001 is complete when:

- Progress data model exists.
- authenticated ownership is enforced.
- path/course/module/mission progress can be calculated.
- completion states are deterministic.
- competency completion can be represented.
- tests cover state transitions and ownership.
- accessibility checks pass.
- security review passes.
- Founder approval is recorded.

---

# 16. Success Metrics

- Students reliably resume with correct progress.
- Progress does not depend on watch time alone.
- Duplicate or contradictory progress states are prevented.
- Founder manual corrections are rare.
- Future Engines can consume progress through a stable interface.

---

# 17. Implementation References

**Recommended Milestone:** `LEARN-M1 — Learning Progress Foundation`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/learning/
packages/shared-types/
apps/web/
supabase/
tests/
```

---

# 18. Future Extensions

- Organization learning reports.
- Instructor views.
- advanced curriculum migration.
- employer-approved capability reports.

Not part of the MVP.

---

# 19. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

**Founder Notes:**

---

# 20. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`LEARN-002 — Resume and Continue Learning`
