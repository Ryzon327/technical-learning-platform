# OPS-007 — Operational Runbook Registry

**Feature ID:** OPS-007  
**Feature Name:** Operational Runbook Registry  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Operations Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Operational Runbook Registry provides stable, versioned instructions for diagnosing and resolving known platform incidents.

---

# 2. Problem Statement

Operational knowledge should not live only in memory or scattered notes.

When an incident occurs, the Founder should be able to open the exact approved procedure associated with it.

---

# 3. Runbook Model

A runbook should include:

- Runbook ID.
- title.
- applicable incident/error classes.
- scope.
- prerequisites.
- diagnostic steps.
- approved automated steps.
- manual steps.
- safety warnings.
- rollback.
- verification.
- escalation condition.
- owner.
- version.
- last review date.

---

# 4. Stable Reference Rule

Incidents and remediations should reference stable runbook IDs so procedures can evolve without breaking operational history.

---

# 5. Included Scope

- Runbook registry.
- runbook versioning.
- incident-to-runbook mapping.
- remediation-to-runbook mapping.
- searchable Founder view.
- review/expiration metadata.
- links to approved scripts/tools.

---

# 6. Explicitly Excluded Scope

- storing secrets in runbooks.
- arbitrary pasted production credentials.
- automatically trusting outdated procedures.
- AI-generated runbooks becoming active without review.

---

# 7. Dependencies

Depends on:

- OPS-001
- OPS-002
- Search Engine where Founder search is later used

---

# 8. AI Usage

AI may draft or summarize a runbook.

A runbook becomes operationally approved only through human review/approval.

---

# 9. Acceptance Criteria

- incidents can link to stable runbooks.
- runbooks are versioned.
- old incident history preserves referenced version where required.
- stale runbooks can be flagged for review.
- secrets are excluded.

---

# 10. Definition of Done

Complete when runbook schema, versioning, incident/remediation links, review controls, access rules, and tests exist.

# Founder Approval

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |

# Next Artifact

`OPS-008 — Escalation and Alert Thresholds`
