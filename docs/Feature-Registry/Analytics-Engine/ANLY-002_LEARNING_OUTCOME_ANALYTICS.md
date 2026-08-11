# ANLY-002 — Learning Outcome Analytics

**Feature ID:** ANLY-002  
**Feature Name:** Learning Outcome Analytics  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Analytics Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Learning Outcome Analytics measures whether students are progressing toward demonstrated capability rather than merely consuming content.

---

# 2. Problem Statement

Traditional LMS analytics often overemphasize:

- Login frequency.
- video watch time.
- page views.
- streaks.

Those metrics do not necessarily indicate learning.

---

# 3. Included Scope

Approved measures may include:

- Mission/course completion.
- competency attainment.
- readiness/test-out success.
- review/remediation needs.
- time-to-competency in coarse aggregates.
- completion by curriculum version.
- evidence-producing activity success.
- abandonment points where useful.

---

# 4. Explicitly Excluded Scope

- Ranking students publicly.
- punitive inactivity scores.
- engagement manipulation.
- measuring success primarily by screen time.
- identifying individuals in broad Founder dashboards without a support need and authorization.

---

# 5. Dependencies

Depends on approved data from:

- Learning Engine
- Evidence Engine
- Curriculum Engine

---

# 6. Learning Principle

A metric should favor demonstrated outcomes over consumption.

Example:

Prefer:

> Percentage of learners who demonstrated competency after Mission X.

over:

> Average minutes spent on Mission X.

Time may be supporting context but not the primary learning truth.

---

# 7. Privacy Requirements

Founder-facing analytics should be aggregate-first.

Small cohort or individual-level views require appropriate safeguards.

---

# 8. AI Usage

AI may summarize aggregate trends.

AI may not declare that an individual student is competent or deficient based solely on analytics.

---

# 9. Failure Behavior

Analytics calculation failure must not alter authoritative student progress or competency.

---

# 10. Acceptance Criteria

- Competency attainment can be measured.
- completion and evidence trends can be aggregated.
- engagement metrics are not treated as competency.
- individual privacy remains protected.
- metric definitions are traceable.

---

# 11. Definition of Done

ANLY-002 is complete when:

- initial learning outcome metrics exist.
- aggregate calculation exists.
- privacy controls exist.
- metrics use authoritative source data.
- tests verify analytics cannot change learning state.
- Founder approval is recorded.

---

# Founder Approval

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |

---

# Next Artifact

`ANLY-003 — Curriculum Effectiveness Analytics`
