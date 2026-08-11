# NOTIF-001 — Notification Request and Message Model

**Feature ID:** NOTIF-001  
**Feature Name:** Notification Request and Message Model  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Notification Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Defines the normalized request and message model all platform Engines use when requesting delivery of an approved notification.

---

# 2. Problem Statement

Without one model:

- every Engine creates messages differently.
- priority becomes inconsistent.
- retries may duplicate messages.
- channels become hardcoded.
- privacy controls drift.

---

# 3. Included Scope

A Notification Request may include:

- Notification ID.
- source Engine.
- recipient identity.
- event/reference ID.
- message type.
- title.
- body/template reference.
- priority.
- allowed channels.
- required channel where applicable.
- delivery deadline/expiration.
- deduplication key.
- privacy classification.
- action/deep-link reference.
- correlation ID.

---

# 4. Message Types

Examples:

- Account/security.
- Learning reminder.
- Lab ready/failure/expiration.
- Evidence/certificate event.
- Operational Founder alert.
- Administrative notice.
- Product/system status.

---

# 5. Security and Privacy

Requests must:

- use trusted recipient identity.
- avoid secrets.
- avoid unnecessary private details.
- restrict sensitive messages to approved channels.
- reject client-forged operational severity.

---

# 6. Dependencies

Depends on:

- AUTH-007
- KERN-004
- OPS-008 for operational alert severity

Unlocks NOTIF-002 through NOTIF-008.

---

# 7. AI Usage

AI may help draft non-authoritative wording, but the triggering event and priority remain deterministic.

---

# 8. Failure Behavior

Malformed requests fail before delivery and do not create partial multi-channel sends.

---

# 9. Acceptance Criteria

- Multiple Engines can create one normalized notification request.
- recipient, priority, privacy, and deduplication metadata are explicit.
- malformed/unsafe requests are rejected.
- channel-specific data stays outside source Engines.

---

# 10. Definition of Done

Complete when request/message schema, message taxonomy, validation, privacy fields, deduplication key, and tests exist.

# Founder Approval

- [x] Approved
- [ ] Deferred
- [ ] Rejected

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |

# Next Artifact

`NOTIF-002 — Notification Channel Interface`
