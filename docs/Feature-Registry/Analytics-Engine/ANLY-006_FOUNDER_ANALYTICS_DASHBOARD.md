# ANLY-006 — Founder Analytics Dashboard

**Feature ID:** ANLY-006  
**Feature Name:** Founder Analytics Dashboard  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Analytics Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Provides a concise, decision-oriented operating view of learning outcomes, curriculum quality, lab reliability, AI usage, and platform trends.

# 2. Dashboard Principle

The dashboard is not a wall of charts. Each major metric should answer a meaningful operating question and, where appropriate, lead to a review action.

# 3. Initial Sections

The Founder dashboard may include:

- learning outcomes.
- competency attainment.
- curriculum review signals.
- lab/assessment reliability.
- evidence/certificate trends.
- AI usage and cost.
- platform health summaries supplied by Operations.
- privacy-safe cohort trends.

# 4. Drill-Down

A metric may drill into:

```text
summary
→ time trend
→ curriculum/provider/version breakdown
→ approved supporting records
```

Drill-down must honor authorization and privacy rules.

# 5. Explicitly Excluded Scope

- public student leaderboards.
- addictive engagement KPIs.
- raw prompt inspection.
- unrestricted individual surveillance.
- silently changing KPI definitions.

# 6. Dependencies

Depends on ANLY-001 through ANLY-005 and ANLY-007/008 controls.

# 7. AI Usage

AI may create a plain-language executive summary from deterministic metrics. The underlying numbers remain authoritative.

# 8. Acceptance Criteria

- Founder can see core learning, reliability, and cost signals.
- metric definitions are accessible.
- filters cannot bypass authorization.
- dashboard remains useful without AI.
- stale or incomplete data is visibly identified.

# 9. Definition of Done

Complete when initial dashboard information architecture, metric cards, drill-down contracts, freshness indicators, privacy controls, and tests exist.

# Founder Approval

- [x] Approved
- [ ] Deferred
- [ ] Rejected

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |
