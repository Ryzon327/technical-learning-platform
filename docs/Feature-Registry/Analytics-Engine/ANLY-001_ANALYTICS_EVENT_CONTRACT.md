# ANLY-001 — Analytics Event Contract

**Feature ID:** ANLY-001  
**Feature Name:** Analytics Event Contract  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Analytics Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Analytics Event Contract defines the normalized, privacy-conscious event structure used by source Engines to publish approved analytics signals.

---

# 2. Problem Statement

If every Engine emits arbitrary telemetry:

- Metric definitions drift.
- personal data may leak.
- dashboards become inconsistent.
- schema changes break reports.
- analytics becomes difficult to govern.

---

# 3. Included Scope

An analytics event may include:

- Event ID.
- Event type.
- Source Engine.
- Source version.
- Timestamp.
- Correlation ID.
- approved anonymous/pseudonymous actor reference when required.
- curriculum/lab/feature references where approved.
- outcome/status.
- duration bucket where useful.
- metric-safe attributes.
- schema version.

---

# 4. Explicitly Excluded Scope

- Raw student notes.
- full AI prompts/responses.
- passwords or secrets.
- arbitrary clickstream capture.
- keystroke logging.
- unrestricted device fingerprinting.
- analytics fields with no approved purpose.

---

# 5. Data-Minimization Rule

Events should contain the minimum information necessary to compute approved metrics.

---

# 6. Dependencies

Depends on:

- KERN-004 — Error Handling Framework
- KERN-005 — Audit Logging Foundation

Unlocks:

- ANLY-002 through ANLY-008

---

# 7. Security and Privacy

Events must:

- use server-authoritative values for trusted outcomes.
- reject secrets.
- use approved identifiers.
- support retention classification.
- avoid unnecessary direct PII.

---

# 8. AI Usage

AI is not required to create analytics events.

AI may summarize aggregates later but must not fabricate event data.

---

# 9. Failure Behavior

Analytics event failure must not block the student's primary learning action unless the event is required for a separate authoritative transaction.

---

# 10. Acceptance Criteria

- Multiple Engines can emit one normalized event shape.
- Event schemas are versioned.
- prohibited fields are rejected.
- analytics failures do not normally block learning.
- source identity is preserved.

---

# 11. Definition of Done

ANLY-001 is complete when:

- Event schema exists.
- event taxonomy exists.
- schema versioning exists.
- privacy field rules exist.
- ingestion validation exists.
- tests cover prohibited data.
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

`ANLY-002 — Learning Outcome Analytics`
