# LAB-004 — Lab Provisioning and Capacity Control

**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Lab Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder


---

# 1. Feature Summary

Lab Provisioning and Capacity Control safely turns approved Lab Definitions into running student environments while respecting provider capacity, quotas, and concurrency limits.

---

# 2. Problem Statement

The platform may initially rely on limited Dell R620 / Proxmox resources.

Without capacity control:

- Too many labs may start at once.
- Hosts may overcommit memory or CPU.
- student sessions may fail unpredictably.
- the Founder may need to manually decide who gets resources.
- stale sessions may consume capacity indefinitely.

---

# 3. Student Value

Students receive predictable lab launch behavior and clear queue/status messaging when capacity is temporarily unavailable.

---

# 4. Founder Value

The Founder does not manually allocate every lab. The platform makes approved placement decisions and explains capacity constraints.

---

# 5. Included Scope

- Capacity query.
- Resource-fit checks.
- concurrency limits.
- per-student session limits.
- per-definition limits.
- provider selection using declared capabilities.
- queue state.
- placement decision.
- reservation/claim semantics where practical.
- safe rejection when capacity is insufficient.
- capacity release after cleanup.

---

# 6. Explicitly Excluded Scope

- Hypervisor tuning.
- automatic hardware purchases.
- cloud cost optimization beyond simple policy.
- arbitrary overcommit.
- business billing.
- enterprise scheduling.

---

# 7. Dependencies

## Depends On

- LAB-001 — Lab Definition Model
- LAB-002 — Lab Provider Interface
- LAB-003 — Lab Session Lifecycle
- KERN-003 — Application Health Monitoring

---

# 8. Capacity Rules

Placement should consider:

- Provider health.
- provider capabilities.
- CPU.
- memory.
- storage.
- network constraints.
- special requirements.
- current active sessions.
- configured safety reserve.

A provider must not be selected only because it exists.

---

# 9. Security and Safety

Capacity controls must not allow a student to influence privileged placement parameters directly.

Resource requests come from approved Lab Definitions, not arbitrary client input.

---

# 10. Accessibility Requirements

Queue and provisioning status must:

- Use plain text.
- be screen-reader accessible.
- not rely on animation alone.
- explain what the student should do next.
- avoid misleading countdowns.

---

# 11. AI Usage

AI may explain capacity conditions or suggest operational adjustments.

AI may not override hard safety limits or increase production resource quotas without approval.

---

# 12. Failure Behavior

If capacity is unavailable:

- Do not partially provision.
- place the session in an explicit queued/unavailable state.
- explain the condition.
- retry according to policy.

---

# 13. Acceptance Criteria

## Student can

- Request an allowed lab.
- see whether it is preparing, queued, or unavailable.
- avoid duplicate accidental provisioning.

## Platform can

- compare requirements to provider capabilities.
- reject unsafe placements.
- track active reservations.
- release capacity after cleanup.

## Founder can

- see aggregate capacity without logging into every hypervisor.

---

# 14. Definition of Done

LAB-004 is complete when:

- Capacity model exists.
- placement rules exist.
- concurrency limits exist.
- queue handling exists.
- unsafe overcommit is prevented.
- capacity is released after session termination.
- tests cover full, available, and race conditions.
- Founder approval is recorded.

---

# 15. Success Metrics

- Overcommit incidents are rare.
- manual placement is unnecessary for routine labs.
- students receive understandable queue states.
- resource leaks are detectable.

---

# Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`LAB-005 — Lab Access and Connection Delivery`
