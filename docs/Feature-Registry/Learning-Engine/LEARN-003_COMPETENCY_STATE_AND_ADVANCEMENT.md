# LEARN-003 — Competency State and Advancement

**Feature ID:** LEARN-003  
**Feature Name:** Competency State and Advancement  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Learning Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Competency State and Advancement records demonstrated capability and determines when a student may advance based on approved evidence.

The platform must distinguish between consuming content and proving capability.

---

# 2. Problem Statement

A student may:

- Watch every lesson but still be unable to perform the work.
- Already know a topic and not need to repeat it.
- Complete a lab but fail a required competency.
- Demonstrate mastery without following the standard chronological route.

The platform needs a deterministic competency model.

---

# 3. Student Value

Students can:

- Receive credit for what they can actually do.
- Avoid wasting time on mastered topics.
- Understand what capability remains incomplete.
- progress based on evidence rather than seat time.
- build genuine professional confidence.

---

# 4. Founder Value

Competency status provides a stronger measure of educational quality than content completion alone.

It also supports meaningful certificates.

---

# 5. Included Scope

- Competency identifiers.
- Competency status.
- evidence references.
- deterministic advancement rules.
- competency dependencies.
- capability completion.
- competency revalidation hooks.
- distinction between attempted, demonstrated, and mastered.
- manual Founder override only through audited exceptional process if ever required.

---

# 6. Explicitly Excluded Scope

- AI deciding mastery.
- arbitrary grade curves.
- gamification scores.
- social ranking.
- certification exam guarantees.
- employer hiring decisions.

---

# 7. Competency States

Recommended initial states:

- Not Assessed
- In Progress
- Demonstrated
- Needs Reinforcement
- Superseded

The system may later add richer states, but advancement rules must remain explicit.

---

# 8. Dependencies

## Depends On

- LEARN-001 — Learning Progress Tracking
- Evidence Engine
- Curriculum competency definitions

## Unlocks

- LEARN-005 — Readiness Assessment and Test-Out
- Certificate Engine
- advanced learning progression.
- capability-based student records.

---

# 9. Deterministic Advancement

Advancement must be based on approved rules such as:

- Required competencies demonstrated.
- Required evidence validated.
- Required prerequisites satisfied.

AI explanations may help students understand results, but AI does not change the result.

---

# 10. Security and Integrity

Competency records must:

- Be owned by the correct student.
- reference validated evidence.
- resist client-side tampering.
- preserve historical status changes.
- support audited administrative correction.
- avoid arbitrary manual editing in production.

---

# 11. Accessibility Requirements

Competency state must:

- Use clear text.
- explain what remains.
- avoid color-only indicators.
- support screen readers.
- avoid language that shames students.
- distinguish “not yet demonstrated” from failure.

---

# 12. AI Usage

AI may:

- Explain competency expectations.
- summarize evidence.
- recommend practice.

AI may not:

- mark competency demonstrated.
- override failed deterministic validation.
- lower standards.
- fabricate evidence.

---

# 13. Failure Behavior

If competency evaluation cannot complete because evidence or validation is unavailable:

- Do not mark the competency failed.
- Use an unavailable/pending operational state.
- explain the technical issue.
- retry safely.
- preserve student evidence.

---

# 14. Acceptance Criteria

## Student can

- See required competencies.
- understand current state.
- see what evidence supports demonstrated competency.
- advance when approved rules are satisfied.
- avoid repeating already demonstrated capability where curriculum allows.

## Platform can

- calculate competency status deterministically.
- link status to evidence.
- prevent client-side tampering.
- preserve historical status changes.
- distinguish technical evaluation failure from student non-demonstration.

## Founder can

- review competency models and aggregate outcomes without manually grading normal deterministic assessments.

---

# 15. Definition of Done

LEARN-003 is complete when:

- Competency data model exists.
- status rules are deterministic.
- evidence references are required where applicable.
- advancement rules are testable.
- audit path exists for administrative corrections.
- accessibility checks pass.
- security/integrity tests pass.
- Founder approval is recorded.

---

# 16. Success Metrics

- Advancement reflects demonstrated capability.
- students do not need to repeat mastered content unnecessarily.
- competency records are traceable to evidence.
- AI cannot change competency truth.
- certificates can rely on competency state later.

---

# 17. Implementation References

**Recommended Milestone:** `LEARN-M3 — Competency State Foundation`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/learning/
packages/shared-types/
supabase/
tests/
```

---

# 18. Future Extensions

- Skill decay/revalidation.
- employer-verifiable capability maps.
- cross-course competency reuse.
- advanced competency equivalencies.

Not part of the MVP.

---

# 19. Founder Approval

**Should this Feature exist?**

- [x] Approved
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

`LEARN-004 — Prerequisite Enforcement`
