# CERT-004 — Certificate Record and Lifecycle

**Feature ID:** CERT-004  
**Feature Name:** Certificate Record and Lifecycle  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Certificate Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Certificate Record and Lifecycle defines the durable record created after issuance and the states that certificate may enter over time.

---

# 2. Problem Statement

Certificates need stable identity and status beyond the initial issuance event.

Without lifecycle management, the platform cannot reliably represent:

- Active certificates.
- superseded certificates.
- expired certificates.
- revoked certificates.
- corrected certificates.

---

# 3. Student Value

Students can always see the current status of an earned certificate and understand whether it remains valid.

---

# 4. Founder Value

The Founder can manage certificate history without deleting or rewriting prior records.

---

# 5. Included Scope

A Certificate Record should include:

- Certificate ID.
- Student ID.
- Certificate Definition ID/version.
- Issue timestamp.
- Current lifecycle status.
- Effective status timestamp.
- Evidence snapshot references.
- Competency snapshot references.
- Expiration date when applicable.
- Supersession/revocation references.
- Verification identifier.
- presentation metadata reference.

---

# 6. Lifecycle States

Recommended states:

- Active
- Superseded
- Expired
- Revoked
- Corrected

Historical transitions must remain traceable.

---

# 7. Explicitly Excluded Scope

- Evidence creation.
- eligibility calculation.
- PDF layout.
- external accreditation.
- arbitrary deletion of certificate history.

---

# 8. Dependencies

## Depends On

- CERT-003 — Deterministic Certificate Issuance
- EVID-006 — Evidence Review and Correction History
- KERN-005 — Audit Logging Foundation

## Unlocks

- CERT-005
- CERT-006
- CERT-007
- CERT-008

---

# 9. Security and Integrity

Certificate records must:

- Be server-authoritative.
- preserve issue history.
- prevent student status modification.
- reference trusted evidence.
- support audited lifecycle transitions.
- avoid silent rewriting.

---

# 10. Privacy Requirements

Student-facing records may show appropriate identity and achievement information.

Internal evidence or provider metadata must remain protected.

---

# 11. Accessibility Requirements

Lifecycle status must:

- Be represented in text.
- not rely on color alone.
- support screen readers.
- clearly explain revoked, expired, or superseded state.

---

# 12. AI Usage

AI may explain lifecycle state.

AI may not change certificate status without an approved deterministic or privileged workflow.

---

# 13. Failure Behavior

If a lifecycle update fails:

- preserve current known-good status.
- do not partially update history.
- retry safely.
- log a sanitized operational error.

---

# 14. Acceptance Criteria

## Student can

- View certificate status.
- understand whether the certificate is active, expired, revoked, or superseded.

## Platform can

- Preserve one durable certificate identity.
- record lifecycle transitions.
- maintain history.
- prevent unauthorized status changes.

---

# 15. Definition of Done

CERT-004 is complete when:

- Certificate Record schema exists.
- lifecycle states exist.
- transition history exists.
- status changes are auditable.
- unauthorized mutation tests pass.
- Founder approval is recorded.

---

# 16. Success Metrics

- Certificate status remains explainable over time.
- historical issuance records are preserved.
- downstream verification reflects current lifecycle state accurately.

---

# 17. Implementation References

**Recommended Milestone:** `CERT-M4 — Certificate Record and Lifecycle`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 18. Founder Approval

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

`CERT-005 — Certificate Verification`
