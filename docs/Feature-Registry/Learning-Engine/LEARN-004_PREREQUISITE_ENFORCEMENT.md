# LEARN-004 — Prerequisite Enforcement

**Feature ID:** LEARN-004  
**Feature Name:** Prerequisite Enforcement  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Learning Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Prerequisite Enforcement ensures that students complete or demonstrate required foundational knowledge before entering dependent learning activities.

The platform should guide rather than punish.

---

# 2. Problem Statement

Some technical topics depend on prior skills.

For example:

- Router-on-a-stick assumes basic switching and VLAN knowledge.
- Windows domain work assumes basic Windows and networking knowledge.
- SOC investigation assumes operating-system and network fundamentals.

Allowing students to skip required foundations can create confusion and wasted time.

---

# 3. Student Value

Students receive:

- Clear learning order.
- Explanations for why prerequisites matter.
- A path to prove prior knowledge.
- Fewer confusing advanced lessons.
- More confidence when entering dependent material.

---

# 4. Founder Value

The platform enforces learning quality automatically instead of requiring manual intervention.

---

# 5. Included Scope

- Required prerequisite relationships.
- Prerequisite state checks.
- Blocked-state explanations.
- Approved test-out paths.
- prerequisite completion through competency.
- dependency visualization where useful.
- safe curriculum-version handling.

---

# 6. Explicitly Excluded Scope

- Arbitrary course locking.
- time-based waiting periods.
- streak requirements.
- instructor approval for routine progression.
- paid unlocks unrelated to learning requirements.

---

# 7. Dependencies

## Depends On

- LEARN-001 — Learning Progress Tracking
- LEARN-003 — Competency State and Advancement
- Curriculum Engine prerequisite definitions

## Unlocks

- Structured Learning Paths.
- advanced missions.
- safe technical progression.

---

# 8. Enforcement Rules

A prerequisite may be satisfied by:

- Required content completion where appropriate.
- demonstrated competency.
- approved readiness assessment.
- approved equivalent competency.

The system must explain which requirement remains incomplete.

---

# 9. Security and Integrity

Prerequisite state must be server-authoritative and resistant to client-side manipulation.

---

# 10. Accessibility Requirements

Blocked states must:

- Use plain language.
- explain the missing prerequisite.
- provide a keyboard-accessible path to the prerequisite.
- avoid color-only indicators.
- avoid shame-based wording.

---

# 11. AI Usage

AI may explain prerequisites and recommend preparation.

AI may not bypass prerequisites or mark them complete.

---

# 12. Failure Behavior

If prerequisite evaluation is unavailable:

- Do not incorrectly mark the student unqualified.
- Use a temporary unavailable state.
- preserve progress.
- retry safely.
- explain the technical issue.

---

# 13. Acceptance Criteria

## Student can

- See why an activity is blocked.
- navigate to the required prerequisite.
- satisfy a prerequisite through approved competency evidence.
- avoid repeating material when approved test-out exists.

## Platform can

- evaluate prerequisites deterministically.
- reject manipulated client state.
- distinguish incomplete from temporarily unavailable evaluation.

---

# 14. Definition of Done

LEARN-004 is complete when:

- prerequisite relationships can be represented.
- deterministic checks exist.
- competency can satisfy approved prerequisites.
- accessible blocked states exist.
- tests cover satisfied, unsatisfied, test-out, and unavailable states.
- Founder approval is recorded.

---

# 15. Success Metrics

- Students encounter fewer advanced topics without foundations.
- blocked students understand what to do next.
- unnecessary repetition is minimized.
- Founder manual progression intervention is rare.

---

# 16. Implementation References

**Recommended Milestone:** `LEARN-M4 — Prerequisite Enforcement`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 17. Future Extensions

- Equivalent external competency mappings.
- enterprise prerequisite policies.
- advanced dependency visualization.

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

`LEARN-005 — Readiness Assessment and Test-Out`
