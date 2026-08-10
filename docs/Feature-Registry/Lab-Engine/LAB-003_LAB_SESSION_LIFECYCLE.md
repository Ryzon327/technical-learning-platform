# LAB-003 — Lab Session Lifecycle

**Feature ID:** LAB-003  
**Feature Name:** Lab Session Lifecycle  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Lab Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Lab Session Lifecycle tracks each student's individual lab instance from request through provisioning, active use, validation, expiration, cleanup, and termination.

A Lab Definition describes the lab. A Lab Session represents one student's actual running instance.

---

# 2. Problem Statement

Student labs are temporary operational resources.

Without an explicit lifecycle:

- Abandoned VMs may remain running.
- resources may leak.
- students may reconnect to invalid environments.
- validation may reference the wrong session.
- capacity becomes unreliable.
- Founder troubleshooting increases.

---

# 3. Student Value

Students receive predictable lab behavior:

```text
Request
→ Preparing
→ Ready
→ Active
→ Validate
→ Complete
→ Cleanup
```

They can understand what is happening without knowing infrastructure internals.

---

# 4. Founder Value

The platform automatically tracks temporary lab resources and reduces manual cleanup.

---

# 5. Included Scope

A Lab Session should record:

- Session ID.
- Student ID.
- Lab Definition ID/version.
- Provider.
- Provider session/resource reference.
- Lifecycle state.
- Requested time.
- Ready time.
- Last activity/heartbeat where appropriate.
- expiration time.
- validation state reference.
- cleanup state.
- normalized failure information.
- connection metadata reference.

---

# 6. Lifecycle States

Recommended initial states:

```text
Requested
→ Queued
→ Provisioning
→ Ready
→ Active
→ Validating
→ Completed
→ Cleaning
→ Terminated
```

Failure states may include:

- Provisioning Failed
- Degraded
- Recovery Required
- Expired
- Cleanup Failed

States must be explicit and machine-readable.

---

# 7. Explicitly Excluded Scope

- Curriculum completion decisions.
- competency state.
- Evidence storage.
- provider-specific provisioning.
- billing.
- cohort scheduling.

---

# 8. Dependencies

## Depends On

- LAB-001 — Lab Definition Model
- LAB-002 — Lab Provider Interface
- AUTH-007 — Authentication Identity Context
- KERN-004 — Error Handling Framework
- KERN-005 — Audit Logging Foundation

## Unlocks

- LAB-004
- LAB-005
- LAB-006
- LAB-008
- LAB-009

---

# 9. Ownership and Isolation

Every Lab Session belongs to one authenticated student unless explicitly defined as a future team lab.

Students must not be able to operate another student's session.

---

# 10. Session State Rules

State transitions must be validated.

Examples:

- Terminated → Active is invalid.
- Requested → Ready without provider confirmation is invalid.
- Cleaning → Active is invalid.

Retries must be idempotent where practical.

---

# 11. Security Requirements

The session model must:

- Enforce student ownership.
- keep provider resource IDs private where appropriate.
- prevent client-side state manipulation.
- audit privileged administrative lifecycle actions.
- avoid exposing management credentials.

---

# 12. Accessibility Requirements

Student-facing session states must:

- Use plain language.
- include text labels.
- work with screen readers.
- not rely on spinner-only feedback.
- provide understandable failure/retry states.
- avoid inaccessible countdown behavior.

---

# 13. AI Usage

AI may:

- Explain lifecycle failures.
- summarize session status.
- recommend approved recovery actions.

AI may not directly mutate session state outside approved tools and permissions.

---

# 14. Expiration Principle

Labs may expire to protect capacity and cost.

Expiration must:

- Be communicated clearly.
- avoid surprise where practical.
- not be used as an arbitrary learning deadline.
- allow reasonable extension policy where capacity permits.
- distinguish resource expiration from student learning failure.

---

# 15. Failure Behavior

If provisioning fails:

- Session moves to explicit failure state.
- student receives a clear message.
- resources already created are cleaned when safe.
- retry creates or reuses state safely according to policy.

If cleanup fails:

- student session remains inaccessible.
- operational alert may be raised.
- leaked resources are tracked for remediation.

---

# 16. Acceptance Criteria

## Student can

- Request an allowed lab.
- see preparing/ready/active states.
- understand failures.
- use only their own session.
- see expiration information.

## Platform can

- enforce valid state transitions.
- track provider/session references.
- expire sessions.
- trigger cleanup.
- detect failed cleanup.
- prevent duplicate unsafe provisioning.

## Founder can

- understand session state without logging into the hypervisor.
- identify sessions requiring operational attention.

---

# 17. Definition of Done

LAB-003 is complete when:

- Session schema exists.
- lifecycle states exist.
- transition rules exist.
- ownership is enforced.
- expiration metadata exists.
- cleanup state exists.
- failure states exist.
- tests cover normal and invalid transitions.
- accessibility checks pass.
- Founder approval is recorded.

---

# 18. Success Metrics

- Lab resources have traceable owners and states.
- abandoned sessions are recoverable/cleanable.
- students understand session status.
- Founder rarely needs to inspect provider state manually.
- later providers can reuse the same session lifecycle.

---

# 19. Implementation References

**Recommended Milestone:** `LAB-M3 — Lab Session Lifecycle`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/labs/
services/lab-orchestrator/
supabase/
apps/web/
tests/
```

---

# 20. Future Extensions

- Team sessions.
- scheduled labs.
- resumable long-running labs.
- session snapshots.

Not part of the initial MVP.

---

# 21. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# 22. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`LAB-004 — Lab Provisioning and Capacity Control`
