# ANLY-003 — Curriculum Effectiveness Analytics

**Feature ID:** ANLY-003  
**Feature Name:** Curriculum Effectiveness Analytics  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Analytics Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Curriculum Effectiveness Analytics helps the Founder identify curriculum areas that may be confusing, oversized, poorly sequenced, technically broken, or ineffective at producing competency.

---

# 2. Problem Statement

A course can be published and technically functional while still producing weak learning outcomes.

The platform should help identify where curriculum deserves review.

---

# 3. Included Scope

Signals may include:

- High validation failure rate.
- repeated remediation.
- prerequisite-related failure.
- unusually high abandonment.
- unusually low competency attainment.
- repeated test-out success that suggests content is overly basic.
- oversized Mission/course indicators.
- content-version comparison.
- student feedback integration later.

---

# 4. Explicitly Excluded Scope

- Automatically rewriting published curriculum.
- blaming students for difficult content.
- changing competency thresholds automatically.
- treating one failure as proof that curriculum is bad.

---

# 5. Dependencies

Depends on:

- ANLY-001
- ANLY-002
- Curriculum Engine
- Lab Engine
- Evidence Engine

---

# 6. Review Principle

Analytics produces a signal for review, not an automatic curriculum verdict.

Example:

```text
Signal
→ Founder/quality review
→ determine likely cause
→ update draft curriculum if justified
→ publish through Curriculum Engine
```

---

# 7. Privacy Requirements

Curriculum analytics should use aggregate results where possible.

---

# 8. AI Usage

AI may:

- summarize trends.
- suggest possible causes.
- compare curriculum versions.
- prepare a review brief.

AI may not publish curriculum changes or lower standards automatically.

---

# 9. Failure Behavior

Missing analytics must not block students from valid published curriculum.

---

# 10. Acceptance Criteria

- Founder can identify unusually weak curriculum areas.
- metrics can be compared by curriculum version.
- lab/platform failures can be distinguished from likely learning difficulty where data permits.
- analytics never edits curriculum directly.

---

# 11. Definition of Done

ANLY-003 is complete when:

- initial curriculum health metrics exist.
- version comparison exists.
- review thresholds/hooks exist.
- learning versus technical-failure signals are separated where practical.
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

`ANLY-004 — Lab and Assessment Reliability Analytics`
