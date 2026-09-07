# LAB-008 — Deterministic Lab Validation

**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Lab Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder


---

# 1. Feature Summary

Deterministic Lab Validation evaluates whether required technical outcomes exist in a student's lab using explicit checks.

AI may explain results, but it is not the source of truth for pass/fail.

---

# 2. Problem Statement

A student can follow steps without producing the intended result.

The platform needs evidence that the environment actually meets objective criteria.

---

# 3. Student Value

Students receive immediate, specific feedback on what works and what still needs attention.

---

# 4. Founder Value

Routine lab grading does not require manual inspection.

---

# 5. Included Scope

Validation may check:

- Service state.
- configuration values.
- network reachability.
- files.
- users/groups.
- ports.
- process state.
- API output.
- command output.
- topology relationships.
- security settings.

Checks are defined by approved validation profiles.

## 5.1 Operational state versus persisted state

Recorded for the practical networking path; the curriculum doctrine behind it is
owned by `CURR-012` §14.

A configuration task is **not complete** merely because the commands were
accepted, or because the running state happens to work. Where the device model
supports persistence, the running state and the saved state are **two separate
facts about the lab**, and a validator must be architecturally able to report
them separately:

```
Operational state:      PASS
Persistent/saved state: NOT COMPLETE
```

A profile that checks only the running state cannot establish that a learner
saved their work, and a learner whose lab is reset would lose it. A profile that
conflates the two cannot tell the learner which of the two things they missed.

This is a **contract requirement on the validator model**, not a UI
specification. No presentation of these two results is specified or authorized
here.

## 5.2 Network-state validation categories

Target categories for the practical networking path, recorded so future
validation profiles are scoped in advance rather than invented per mission.
**None of these is implemented, and this section authorizes no implementation.**

- hostname;
- interface administrative and operational state;
- interface address and prefix;
- VLAN existence;
- access-port VLAN membership;
- trunk state and required allowed VLANs;
- router subinterface state;
- encapsulation and VLAN mapping;
- gateway address;
- management SVI;
- remote-management reachability;
- DHCP lease or binding, or client-side result;
- DNS resolution outcome;
- routing-table state;
- OSPF neighbour state;
- OSPF-learned route;
- end-to-end reachability;
- paths that must remain **unreachable**;
- ACL or NAT result where applicable;
- running configuration;
- saved/persisted configuration.

The deterministic validator remains the sole authority for correctness in every
category. AI does not decide any of them (`DEC-062`, `CURR-011` §12).

---

# 6. Explicitly Excluded Scope

- AI-only grading.
- subjective essay grading.
- hidden arbitrary criteria.
- destructive validation unless explicitly approved.

---

# 7. Dependencies

## Depends On

- LAB-001
- LAB-003
- LAB-002

## Integrates With

- Evidence Engine
- Learning Engine
- Curriculum competency definitions

---

# 8. Validation Rule

A validator must define:

- What is checked.
- expected state.
- pass/fail behavior.
- safe timeout.
- student-facing explanation mapping.
- whether the check is required or advisory.

---

# 9. Security Requirements

Validation probes must:

- operate with least privilege.
- avoid exposing hidden answers unnecessarily.
- not allow arbitrary student-supplied commands to execute as privileged validator logic.
- be scoped to the correct session.

---

# 10. Accessibility Requirements

Results must:

- be understandable in text.
- identify each requirement.
- not rely on color alone.
- work with screen readers.
- distinguish technical validator failure from student configuration failure.

---

# 11. AI Usage

AI may:

- Explain a failed validation.
- suggest troubleshooting.
- translate low-level output.

AI may not change deterministic results.

---

# 12. Failure Behavior

If the validator itself fails:

- Do not mark the student failed.
- return Validation Unavailable/Technical Error.
- preserve session.
- allow retry.

---

# 13. Acceptance Criteria

## Student can

- request validation.
- see which requirements passed.
- see which requirements remain incomplete.
- distinguish their result from a platform failure.

## Platform can

- run approved checks.
- return deterministic outcomes.
- protect validator privileges.
- link successful validation to Evidence Engine later.

---

# 14. Definition of Done

LAB-008 is complete when:

- Validation profile model exists.
- required/advisory checks exist.
- deterministic results exist.
- technical failure state exists.
- privilege boundary is tested.
- accessibility checks pass.
- Founder approval is recorded.

---

# 15. Success Metrics

- Routine labs validate automatically.
- false student failures from validator outages are prevented.
- AI cannot alter pass/fail truth.
- feedback is actionable.

---

# Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |
| 1.1 | 2026-09-06 | Added section 5.1, recording that operational state and persisted state are two separate facts about the lab and that a validator must be architecturally able to report them separately: a profile checking only the running state cannot establish that a learner saved their work, and one that conflates the two cannot tell the learner which they missed. Stated as a contract requirement on the validator model, not a UI specification, and specifying no presentation of the two results. Added section 5.2, recording the target network-state validation categories so future profiles are scoped in advance rather than invented per mission, none of which is implemented and none of which is authorized here; the deterministic validator remains the sole authority for correctness in every category and AI decides none of them. Curriculum doctrine behind section 5.1 is owned by CURR-012 section 14; see DEC-062 and CURR-011 section 12 |

---

# Next Artifact

`LAB-009 — Lab Health and Failure Recovery`
