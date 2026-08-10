# CERT-002 — Certificate Eligibility Rules

**Feature ID:** CERT-002  
**Feature Name:** Certificate Eligibility Rules  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Certificate Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Certificate Eligibility Rules deterministically evaluate whether a student satisfies all requirements for an approved Certificate Definition.

---

# 2. Problem Statement

Certificates lose meaning if eligibility is based on vague completion percentages or manual judgment.

The platform must know exactly what evidence and competencies are required.

---

# 3. Student Value

Students can clearly see:

- What requirements are complete.
- What remains.
- Which evidence supports each requirement.
- Why they are or are not yet eligible.

---

# 4. Founder Value

Routine eligibility requires no manual review when all requirements are deterministic.

---

# 5. Included Scope

Eligibility may evaluate:

- Required competencies.
- trusted evidence status.
- required evidence type.
- minimum evidence count where applicable.
- certificate definition version.
- revalidation/expiration rules where applicable.
- unresolved evidence corrections.
- superseded competency mappings.

---

# 6. Explicitly Excluded Scope

- AI deciding eligibility.
- arbitrary Founder approval for routine certificates.
- seat-time requirements unless explicitly approved.
- payment status as proof of competency.
- course completion percentage alone.

---

# 7. Dependencies

## Depends On

- CERT-001 — Certificate Definition Model
- LEARN-003 — Competency State and Advancement
- EVID-001
- EVID-003
- EVID-006

## Unlocks

- CERT-003 — Deterministic Certificate Issuance

---

# 8. Eligibility Rule

A student is eligible only when:

```text
All required competencies satisfied
AND
all required trusted evidence valid
AND
no blocking correction/revocation state exists
AND
definition-specific requirements satisfied
```

---

# 9. Security and Integrity

Eligibility must be server-authoritative.

Client-supplied completion, evidence, or role values must not determine eligibility.

---

# 10. Accessibility Requirements

Eligibility views must:

- Use clear text.
- list requirements.
- explain incomplete state.
- support screen readers.
- avoid color-only status.
- distinguish unavailable verification from unmet competency.

---

# 11. AI Usage

AI may explain requirements and recommend what to work on next.

AI may not change eligibility truth.

---

# 12. Failure Behavior

If evidence/competency services are temporarily unavailable:

- Do not mark the student ineligible permanently.
- return Eligibility Unknown/Temporarily Unavailable.
- retry safely.

---

# 13. Acceptance Criteria

## Student can

- View eligibility status.
- see required competencies/evidence.
- understand what remains.

## Platform can

- evaluate requirements deterministically.
- reject client manipulation.
- distinguish ineligible from temporarily unknown.
- respect evidence corrections/revocations.

---

# 14. Definition of Done

CERT-002 is complete when:

- Eligibility evaluator exists.
- requirement-by-requirement result exists.
- trusted evidence checks exist.
- unavailable state exists.
- tests cover eligible/ineligible/unknown states.
- Founder approval is recorded.

---

# 15. Success Metrics

- Certificate eligibility is explainable.
- routine manual review is unnecessary.
- invalid/revoked evidence cannot satisfy requirements.
- AI cannot alter eligibility.

---

# 16. Implementation References

**Recommended Milestone:** `CERT-M2 — Certificate Eligibility Rules`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 17. Future Extensions

- External evidence eligibility.
- certificate renewals.
- organization-specific eligibility policy.

Not part of the initial MVP.

---

# 18. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# 19. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`CERT-003 — Deterministic Certificate Issuance`
