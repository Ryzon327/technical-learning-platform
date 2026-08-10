# LAB-007 — Lab Isolation and Safety Controls

**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Lab Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder


---

# 1. Feature Summary

Lab Isolation and Safety Controls enforces boundaries between student labs, management infrastructure, protected networks, and the public internet according to approved lab policy.

---

# 2. Problem Statement

Technical training may include administrative, security, networking, and offensive-security activities.

Poor isolation could expose:

- Other students.
- Management systems.
- Home networks.
- production services.
- the internet.

---

# 3. Student Value

Students can practice safely in environments designed for experimentation without accidentally harming unrelated systems.

---

# 4. Founder Value

Safety controls reduce operational and legal risk and make labs more scalable.

---

# 5. Included Scope

- Session network isolation.
- provider management-plane separation.
- outbound network policy.
- inbound access policy.
- per-lab safety classification.
- prohibited destination controls.
- resource boundary enforcement.
- privileged-access rules.
- security validation before session readiness.
- offensive-security restriction hooks.

---

# 6. Explicitly Excluded Scope

- Real-world unauthorized testing.
- public-target scanning.
- unrestricted malware execution.
- bypass of provider security.
- student access to management VLANs.

---

# 7. Dependencies

## Depends On

- LAB-001
- LAB-002
- LAB-003

---

# 8. Default Safety Rule

Labs are isolated by default.

Internet or cross-network access must be explicitly allowed by the published Lab Definition and supported safely by the provider.

---

# 9. Security Requirements

The Lab Engine must prevent:

- One student reaching another student's private lab unless a future team lab explicitly permits it.
- Student access to Proxmox management interfaces.
- arbitrary modification of network policy from the client.
- unsafe routes to protected infrastructure.
- use of provider administrative tokens inside lab guests.

---

# 10. Accessibility Requirements

Safety notices must:

- Be readable and concise.
- clearly explain prohibited actions.
- not rely solely on legalistic language.
- support screen readers.

---

# 11. AI Usage

AI may explain safety boundaries.

AI may not weaken isolation or authorize restricted network targets.

---

# 12. Failure Behavior

If required isolation cannot be confirmed:

- The session must not become Ready.
- provisioning should fail closed.
- the issue should be surfaced operationally.

---

# 13. Acceptance Criteria

## Platform can

- isolate lab sessions.
- prevent management-network access.
- enforce outbound/inbound policy.
- validate required safety controls before Ready state.

## Student can

- understand lab boundaries.
- perform approved activities inside the lab.
- not access unrelated sessions.

---

# 14. Definition of Done

LAB-007 is complete when:

- isolation policy model exists.
- default-deny boundary exists.
- management separation is validated.
- per-definition safety policy works.
- tests verify cross-session isolation.
- unsafe readiness fails closed.
- Founder approval is recorded.

---

# 15. Success Metrics

- No unintended cross-student access.
- no student access to management plane.
- restricted labs remain contained.
- safety failures prevent launch.

---

# Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`LAB-008 — Deterministic Lab Validation`
