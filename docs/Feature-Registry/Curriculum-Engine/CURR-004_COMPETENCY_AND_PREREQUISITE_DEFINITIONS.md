# CURR-004 — Competency and Prerequisite Definitions

**Feature ID:** CURR-004  
**Feature Name:** Competency and Prerequisite Definitions  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Competency and Prerequisite Definitions establishes the authoritative curriculum-side definitions of what students are expected to demonstrate and which prior capabilities are required before dependent learning begins.

The Curriculum Engine defines the requirement. The Learning Engine evaluates each student's state against that requirement.

---

# 2. Problem Statement

Without explicit competency and prerequisite definitions:

- Progress rules become inconsistent.
- Students may enter advanced work without foundations.
- Test-out cannot be mapped reliably.
- Evidence cannot be linked to meaningful outcomes.
- Certificates lose value.
- AI explanations may drift from curriculum standards.

---

# 3. Student Value

Students can clearly understand:

- What they are expected to be able to do.
- Which prerequisite skills matter.
- Why a prerequisite exists.
- What evidence can satisfy a competency.
- When test-out is available.

---

# 4. Founder Value

The Founder can define educational standards once and let the platform enforce them consistently.

---

# 5. Included Scope

- Stable competency IDs.
- Competency title and description.
- Required evidence types.
- Competency relationships.
- prerequisite competency references.
- prerequisite Course/Module/Mission references where appropriate.
- test-out eligibility.
- required versus optional competency state.
- curriculum ownership.
- version-safe references.

---

# 6. Explicitly Excluded Scope

- Student competency state.
- evidence storage.
- AI mastery decisions.
- certificate issuance.
- external credential equivalency.
- instructor grading.

---

# 7. Dependencies

## Depends On

- CURR-001 — Curriculum Hierarchy and Stable IDs
- CURR-003 — Course, Module, and Mission Definition

## Integrates With

- LEARN-003 — Competency State and Advancement
- LEARN-004 — Prerequisite Enforcement
- LEARN-005 — Readiness Assessment and Test-Out
- Evidence Engine
- Certificate Engine

---

# 8. Competency Definition Rules

Each competency should define:

- Stable ID.
- Capability statement.
- Scope.
- Required evidence.
- Acceptable validation method.
- prerequisite competencies if any.
- whether test-out is permitted.
- related Missions.
- current version/state.

Capability statements should use observable language.

Prefer:

> Configure and verify inter-VLAN routing using an approved lab environment.

Avoid:

> Understand VLANs.

---

# 9. Prerequisite Definition Rules

Prerequisites must:

- Have a learning reason.
- Be explainable to students.
- reference stable IDs.
- be satisfiable by approved completion or competency evidence.
- avoid arbitrary time or seat requirements.

---

# 10. Security and Integrity

Only authorized curriculum workflows may change official competency or prerequisite definitions.

Published changes should be auditable and versioned.

---

# 11. Accessibility Requirements

Competency and prerequisite displays must:

- use plain text descriptions.
- expose relationships to screen readers.
- avoid color-only dependency indicators.
- provide accessible navigation to prerequisite learning.

---

# 12. AI Usage

AI may:

- help draft competency statements.
- suggest prerequisite relationships.
- detect vague or non-observable wording.

AI may not:

- publish competency standards.
- lower requirements automatically.
- decide that a competency is unnecessary.

---

# 13. Failure Behavior

Invalid or circular prerequisite definitions must fail validation before publication.

---

# 14. Acceptance Criteria

## Founder can

- define observable competencies.
- assign prerequisites.
- identify test-out eligibility.
- publish only valid dependency structures.

## Platform can

- resolve competency references.
- detect duplicate IDs.
- detect circular prerequisite chains.
- expose definitions to Learning and Evidence Engines.

---

# 15. Definition of Done

CURR-004 is complete when:

- competency schema exists.
- prerequisite schema exists.
- observable capability statements are supported.
- circular dependency validation exists.
- test-out eligibility exists.
- version-safe references exist.
- tests pass.
- Founder approval is recorded.

---

# 16. Success Metrics

- Student advancement rules map to clear competencies.
- prerequisite confusion decreases.
- certificates can trace to defined capabilities.
- AI explanations remain grounded in approved standards.

---

# 17. Implementation References

**Recommended Milestone:** `CURR-M4 — Competency and Prerequisite Model`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 18. Future Extensions

- External credential equivalencies.
- competency frameworks by employer role.
- competency reuse across multiple learning paths.

Not part of the MVP.

---

# 19. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# 20. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`CURR-005 — Curriculum Publication Workflow`
