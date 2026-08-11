# ANLY-007 — Privacy and Aggregation Controls

**Feature ID:** ANLY-007  
**Feature Name:** Privacy and Aggregation Controls  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Analytics Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Defines how analytics data is minimized, aggregated, retained, accessed, and protected so analytics improves the platform without becoming unnecessary surveillance.

# 2. Core Controls

Controls include:

- approved-purpose collection.
- data minimization.
- direct-identifier reduction.
- cohort aggregation.
- minimum cohort thresholds where appropriate.
- role-based access.
- retention classes.
- deletion/anonymization behavior.
- sensitive dimension restrictions.
- export controls.
- auditability for privileged analytics access.

# 3. Small Cohort Protection

When a filtered cohort becomes small enough to expose individuals, the system should suppress, broaden, or restrict the result according to policy.

# 4. Individual-Level Data

Individual views are allowed only when the product has a legitimate support/administrative purpose and the requesting role is authorized.

# 5. Prohibited Patterns

- collecting data because it might be useful later.
- hidden behavioral profiling unrelated to learning.
- selling student analytics data.
- exposing raw notes/prompts for general analytics.
- using analytics to infer protected/sensitive attributes without an explicitly approved lawful purpose.

# 6. Dependencies

Depends on:

- Platform Kernel authorization/audit controls.
- ANLY-001.

# 7. AI Usage

AI cannot override privacy suppression or authorization controls.

# 8. Acceptance Criteria

- unauthorized analytics access is blocked.
- small-cohort protections work.
- retention policy is enforceable.
- prohibited fields are rejected or excluded.
- privileged access is auditable.

# 9. Definition of Done

Complete when privacy policy mappings, aggregation thresholds, retention controls, access rules, suppression tests, and Founder approval exist.

# Founder Approval

- [x] Approved
- [ ] Deferred
- [ ] Rejected

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |
