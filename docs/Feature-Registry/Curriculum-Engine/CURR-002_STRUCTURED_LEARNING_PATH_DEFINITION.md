# CURR-002 — Structured Learning Path Definition

**Feature ID:** CURR-002  
**Feature Name:** Structured Learning Path Definition  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Structured Learning Path Definition organizes approved Courses into a guided technical progression.

The platform recommends structure by default while allowing approved competency-based advancement.

---

# 2. Problem Statement

Learners often do not know what order to study technical topics.

A flat catalog can encourage random course selection that leaves knowledge gaps.

---

# 3. Student Value

Students receive:

- A clear learning journey.
- understandable sequencing.
- prerequisite context.
- visibility into what comes next.
- the ability to prove prior knowledge where approved.

---

# 4. Founder Value

The Founder can define one coherent progression instead of repeatedly advising individual students about course order.

---

# 5. Included Scope

- Learning Path identity.
- ordered Course references.
- required versus optional Courses.
- path prerequisites.
- path outcomes.
- target competencies.
- recommended progression.
- current published version.
- clear path description.
- future extensibility across technical domains.

---

# 6. Explicitly Excluded Scope

- Student progress calculations.
- random recommendation engines.
- course marketplace.
- billing bundles.
- cohort scheduling.
- instructor assignment.

---

# 7. Initial Learning Philosophy

Learning Paths should generally progress:

```text
Foundations
→ Guided Practice
→ Practical Application
→ Troubleshooting
→ Competency
→ Professional Context
```

The path should explain why each Course exists.

---

# 8. Dependencies

## Depends On

- CURR-001 — Curriculum Hierarchy and Stable IDs

## Integrates With

- LEARN-004 — Prerequisite Enforcement
- LEARN-005 — Readiness Assessment and Test-Out
- LEARN-006 — Recommended Next Action

---

# 9. Initial MVP Direction

The first technical path is expected to establish foundations that support later work in:

- Networking.
- Windows administration.
- Linux.
- Proxmox.
- Windows domains.
- SOC operations.
- Defensive cybersecurity.
- Ethical hacking.

Exact course boundaries belong to later curriculum content work, not this Feature.

---

# 10. Security and Integrity

Only authorized administrative workflows may publish or reorder official Learning Paths.

Published order changes should be versioned and auditable.

---

# 11. Accessibility Requirements

Learning Path views must:

- expose order semantically.
- support keyboard navigation.
- clearly identify required and optional elements.
- avoid color-only status.
- explain prerequisites in text.
- work on small screens.

---

# 12. AI Usage

AI may:

- explain why Courses are ordered.
- help the Founder draft path structures.
- suggest missing prerequisites.

AI may not:

- publish a new path.
- bypass curriculum governance.
- automatically reorder published Courses.

---

# 13. Failure Behavior

Invalid path definitions must not publish.

If a required Course is retired, the path must enter an administrative review state rather than silently breaking student navigation.

---

# 14. Acceptance Criteria

## Student can

- understand the overall journey.
- see required Course order.
- understand why prerequisites exist.
- identify the next Course.
- use approved test-out mechanisms.

## Founder can

- define a structured path.
- reorder draft Courses.
- publish only valid paths.
- preserve prior published versions.

## Platform can

- validate stable Course references.
- distinguish required and optional Courses.
- reject broken dependencies.

---

# 15. Definition of Done

CURR-002 is complete when:

- Learning Path data model exists.
- ordered Course relationships exist.
- required/optional state exists.
- validation exists.
- accessibility requirements are represented.
- version hooks exist.
- Founder approval is recorded.

---

# 16. Success Metrics

- Students understand what to learn next.
- random path confusion decreases.
- foundational gaps are reduced.
- the same path model supports future domains.

---

# 17. Implementation References

**Recommended Milestone:** `CURR-M2 — Structured Learning Paths`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/curriculum/
content/learning-paths/
apps/web/
tests/
```

---

# 18. Future Extensions

- Multiple role-based paths.
- elective branches.
- employer-specific path variants.
- cross-domain paths.

Not part of the initial MVP.

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

`CURR-003 — Course, Module, and Mission Definition`
