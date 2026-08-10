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

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Lab Engine Specification Status

After Founder approval of LAB-004 through LAB-012, all initial Lab Engine Features are specified.

Next Engine:

`Evidence Engine`
