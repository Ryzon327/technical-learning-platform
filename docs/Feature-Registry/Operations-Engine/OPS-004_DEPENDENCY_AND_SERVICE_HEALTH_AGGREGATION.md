# OPS-004 — Dependency and Service Health Aggregation

**Feature ID:** OPS-004  
**Feature Name:** Dependency and Service Health Aggregation  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Operations Engine  
**Product Owner:** Founder

---

# 1. Feature Summary

Dependency and Service Health Aggregation combines health signals from platform services and external dependencies into one coherent operational view.

---

# 2. Problem Statement

A student-facing failure may originate from:

- Supabase.
- Proxmox.
- a container host.
- an AI provider.
- search/indexing.
- email delivery.
- a background worker.
- application services.

Without aggregation, the same outage can create many disconnected alerts.

---

# 3. Included Scope

Aggregated health may include:

- Core application services.
- database/auth dependencies.
- Lab providers.
- Search/indexing.
- AI Gateway/providers.
- Notification delivery dependencies.
- background workers/jobs.
- object/file storage where applicable.
- external provider status supplied through approved adapters.

---

# 4. Health Model

Each dependency should expose:

- current state.
- last successful check.
- last failure.
- latency/response bucket where relevant.
- degraded capabilities.
- dependent platform features.
- maintenance state.
- source of health truth.

---

# 5. Correlation Rule

Related dependency failures should roll up into a higher-level incident where appropriate.

Example:

```text
Proxmox provider unavailable
→ multiple lab provisioning failures
→ one provider-level incident
→ impacted lab features summarized
```

---

# 6. Dependencies

Depends on:

- OPS-001
- KERN-003
- Lab Engine
- Search Engine
- AI Gateway
- Notification Engine

---

# 7. Security

Health summaries shown to students must not reveal sensitive infrastructure details.

Founder views may expose additional authorized operational context.

---

# 8. AI Usage

AI may summarize correlated health state but does not determine authoritative service health.

---

# 9. Failure Behavior

If a dependency health check is itself unavailable:

- represent health as Unknown when appropriate.
- do not falsely report Healthy.
- preserve last-known-good metadata with timestamp.

---

# 10. Acceptance Criteria

- Multiple dependency health signals can be aggregated.
- impacted platform features are identifiable.
- duplicate downstream failures can correlate to one root incident.
- student-facing health hides sensitive infrastructure detail.
- Unknown is distinct from Healthy.

---

# 11. Definition of Done

Complete when dependency registry, health aggregation, impact mapping, correlation rules, access boundaries, and tests exist.

# Founder Approval

- [x] Approved
- [ ] Deferred
- [ ] Rejected

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |

# Next Artifact

`OPS-005 — Degraded Mode and Feature Availability`
