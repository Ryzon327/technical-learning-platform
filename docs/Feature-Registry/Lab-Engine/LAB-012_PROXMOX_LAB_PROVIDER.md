# LAB-012 — Proxmox Lab Provider

**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Lab Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder


---

# 1. Feature Summary

Proxmox Lab Provider connects the Lab Engine to the initial Dell R620 / Proxmox training infrastructure through the standard provider interface.

Proxmox is the starting infrastructure provider, not the permanent LMS architecture.

---

# 2. Problem Statement

The current training environment uses existing on-premises hardware, but the Founder should not manually create VMs and networks for every student lab.

---

# 3. Student Value

Students can launch VM-based labs from the LMS without seeing the Proxmox management plane.

---

# 4. Founder Value

Existing hardware can be used to launch the business while preserving the option to migrate to more cost-effective or scalable infrastructure later.

---

# 5. Included Scope

The adapter may support:

- Proxmox API authentication.
- Capability reporting.
- node/capacity reporting.
- approved template cloning.
- VM start/stop/reset/destroy.
- network assignment.
- snapshot/recreate behavior where approved.
- connection metadata.
- health status.
- cleanup.
- normalized errors.

## 5.1 Learn / Do / Prove — where this provider sits

Recorded for the practical networking path. The curriculum doctrine is owned by
`CURR-012` §17; the validator contract by `LAB-008`.

| Layer | Owns | Owner |
|---|---|---|
| **LEARN** | Architect-authored instruction, topology, packet journeys, explanations, predictions | Curriculum Engine |
| **DO** | The isolated environment, real command entry, real configuration state | Lab Engine — **Proxmox sits beneath it** |
| **PROVE** | Deterministic examination of the actual required state and behaviour | `LAB-008` |

**Proxmox is infrastructure beneath the Lab Engine, never a learner-facing
concept.** The product continues to present *Launch Lab*; it does not expose
node, cluster, template or hypervisor detail to a learner. `LAB-002` keeps the
provider interface the boundary, and §6 already forbids hardcoding platform logic
to Proxmox.

**AI coaches; AI does not validate.** AI may explain, hint and repair
misconceptions against lab state. It may not silently complete a learner's
practical work, and it is never the factual authority for pass or fail
(`DEC-062`, `CURR-011` §12).

## 5.2 Topology identity consistency

A device the lesson calls **PC-A**, **PC-B**, **Switch-1**, **Router-1**,
**Router-2**, **Switch-2**, **PC-C** or **PC-D** must carry that same
learner-facing identity into the lab.

Implementation-specific names — an interface such as `ens18`, `eth0`,
`ge-0/0/0` or `GigabitEthernet0/1` — remain authentic where they are real, and
must be **explicitly mapped back** to the learner-facing topology by the
authored instruction.

A learner must not enter a lab and find unrelated hostnames, addresses or
interfaces with no mapping to the lesson they just completed. This is a
requirement on how a lab definition is authored and templated; it specifies no
implementation here.

---

# 6. Explicitly Excluded Scope

- Exposing Proxmox UI to students.
- general cluster administration.
- Ceph architecture.
- Proxmox Backup Server administration.
- host patching.
- arbitrary VM creation by students.
- hardcoding LMS logic to Proxmox.

---

# 7. Dependencies

## Depends On

- LAB-002
- LAB-003
- LAB-004
- LAB-006
- LAB-007
- KERN-001

---

# 8. Credentials

Use a dedicated least-privilege Proxmox API identity/token.

Credentials must:

- stay server-side.
- be stored through approved secret handling.
- never be committed.
- never be returned to student clients.
- have only permissions required for lab operations.

---

# 9. Capacity and Placement

The adapter reports actual available Proxmox capacity to LAB-004.

The LMS should not assume a specific R620 node by hardcoded name in curriculum.

---

# 10. Network Safety

Student lab networking must remain separated from:

- Proxmox management.
- protected home/business networks.
- other student sessions unless explicitly approved.

Network mappings belong to provider configuration and safety policy.

---

# 11. Accessibility Requirements

Students interact through the standard Lab Engine access UI.

They should not need to navigate Proxmox itself.

---

# 12. AI Usage

AI may:

- summarize Proxmox errors.
- recommend troubleshooting.
- prepare an approved remediation plan.

AI may not execute novel cluster changes without approval.

---

# 13. Failure Behavior

If Proxmox is unavailable:

- no false Ready state is returned.
- queued/new sessions are held or fail safely.
- existing session state is preserved where possible.
- Founder receives meaningful operational context only when necessary.

---

# 14. Acceptance Criteria

## Platform can

- authenticate using a dedicated API identity.
- report capabilities/capacity.
- clone approved lab templates.
- start/stop/reset/destroy assigned VMs.
- keep students away from management plane.
- normalize API errors.
- clean resources.

## Founder can

- see provider health/capacity from the platform.
- avoid routine manual VM creation.
- replace the provider later without curriculum redesign.

---

# 15. Definition of Done

LAB-012 is complete when:

- Proxmox adapter implements LAB-002.
- least-privilege token model exists.
- provisioning works in approved test environment.
- session isolation is validated.
- cleanup works.
- capacity reporting works.
- management-plane exposure is prevented.
- tests and Founder runbook exist.
- Founder approval is recorded.

---

# 16. Success Metrics

- Routine Proxmox lab creation is automated.
- students never need Proxmox administrative access.
- existing R620 infrastructure can support MVP training.
- LMS code remains portable to future providers.

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
| 1.1 | 2026-09-06 | Added section 5.1, recording where this provider sits in Learn / Do / Prove: the Lab Engine owns DO and Proxmox sits beneath it as infrastructure, never as a learner-facing concept, and AI may coach against lab state but is never the factual authority for pass or fail. Added section 5.2, requiring a device the lesson calls PC-A, PC-B, Switch-1, Router-1, Router-2, Switch-2, PC-C or PC-D to carry that same learner-facing identity into the lab, with authentic implementation-specific interface names explicitly mapped back by the authored instruction. Curriculum doctrine remains owned by CURR-012 section 17 and the validator contract by LAB-008. Specifies no implementation and authors no learner-facing curriculum |

---

# Lab Engine Specification Status

After Founder approval of LAB-004 through LAB-012, all initial Lab Engine Features are specified.

Next Engine:

`Evidence Engine`
