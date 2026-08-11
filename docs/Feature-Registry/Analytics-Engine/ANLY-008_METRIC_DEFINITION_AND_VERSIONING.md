# ANLY-008 — Metric Definition and Versioning

**Feature ID:** ANLY-008  
**Feature Name:** Metric Definition and Versioning  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Analytics Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Creates a governed registry for analytics metrics so every KPI has a stable definition, owner, formula, source, privacy classification, and version.

# 2. Problem Statement

A dashboard becomes untrustworthy when the meaning of a metric changes silently.

# 3. Metric Definition Model

Each governed metric should define:

- stable metric ID.
- human-readable name.
- purpose/decision supported.
- formula.
- numerator/denominator where relevant.
- source events/data.
- inclusion/exclusion rules.
- aggregation level.
- freshness expectation.
- privacy classification.
- owner.
- version.
- effective date.
- deprecation status.

# 4. Versioning Rule

Material formula or semantic changes create a new metric version.

Historical reporting should preserve which definition produced a value.

# 5. Comparability

When versions are not directly comparable, the UI must not present them as one continuous trend without a visible boundary or explanation.

# 6. Dependencies

Depends on ANLY-001 and supports all Analytics features.

# 7. AI Usage

AI may explain a metric definition in plain language but cannot alter formulas or metric versions.

# 8. Acceptance Criteria

- every dashboard KPI maps to a governed metric.
- definitions are inspectable.
- material changes are versioned.
- historical values retain definition lineage.
- incompatible versions are visibly separated.

# 9. Definition of Done

Complete when metric registry schema, versioning rules, lineage, dashboard linkage, compatibility rules, tests, and Founder approval exist.

# Founder Approval

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |
