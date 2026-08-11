# ANLY-005 — AI Cost and Usage Analytics

**Feature ID:** ANLY-005  
**Feature Name:** AI Cost and Usage Analytics  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Analytics Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Provides privacy-conscious visibility into AI usage, provider performance, and cost using normalized metadata produced by the AI Gateway.

# 2. Included Scope

Metrics may include:

- requests by capability/task class.
- provider/model routing counts.
- local versus hosted usage.
- token/usage units where available.
- estimated and billed cost.
- latency buckets.
- retry/fallback frequency.
- provider error rates.
- budget consumption.
- cost per approved product workflow.

# 3. Explicitly Excluded Scope

Analytics must not require storage of:

- raw prompts.
- raw responses.
- student notes.
- secrets.
- unnecessary personal content.

# 4. Source of Truth

The AI Gateway owns authoritative routing and usage metadata. Analytics consumes that metadata and does not independently call AI providers to reconstruct usage.

# 5. Cost Principle

Founder views should make expensive or unexpectedly growing workflows visible without encouraging lower-quality routing solely to minimize cost.

# 6. Dependencies

Depends on:

- AIGW-004
- AIGW-008
- ANLY-001

# 7. AI Usage

AI is not required to calculate AI usage analytics. AI may summarize already-calculated aggregates.

# 8. Acceptance Criteria

- Usage is visible by provider/model/capability.
- local versus hosted usage is visible.
- cost totals reconcile to available Gateway/provider metadata within documented tolerances.
- raw private content is not needed.
- fallback and error rates are measurable.

# 9. Definition of Done

Complete when usage, cost, reliability, privacy, reconciliation, and Founder dashboard contracts are defined and tested.

# Founder Approval

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |
