# LAB-002 — Lab Provider Interface

**Feature ID:** LAB-002  
**Feature Name:** Lab Provider Interface  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Lab Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Lab Provider Interface defines the contract between the Technical Learning Platform and any infrastructure provider capable of running student labs.

The LMS asks for lab capabilities. Provider adapters translate those requests into provider-specific operations.

---

# 2. Problem Statement

The initial lab infrastructure may run on Dell R620 servers with Proxmox, but that should not become a permanent architectural dependency.

The platform may later use:

- Containers.
- Different virtualization platforms.
- Cloud providers.
- Hosted lab services.
- Mixed infrastructure.

Without a provider interface, migration would require rewriting the LMS.

---

# 3. Student Value

Students receive the same lab experience regardless of where the underlying environment runs.

---

# 4. Founder Value

The Founder can start with existing hardware and later change providers based on cost, reliability, or scale without rebuilding student-facing workflows.

---

# 5. Included Scope

The provider contract should support operations such as:

- Capability discovery.
- Capacity status.
- Provision session.
- Start session.
- Stop session.
- Reset session.
- Destroy session.
- Get connection information.
- Get provider health.
- Get session health.
- Run approved validation probes.
- Report provider errors in normalized form.

---

# 6. Explicitly Excluded Scope

LAB-002 does not define:

- Proxmox API details.
- Docker/Podman commands.
- AWS APIs.
- curriculum.
- student progress.
- evidence decisions.
- provider billing.

Those belong to provider adapters or other Engines.

---

# 7. Provider Contract

A conceptual interface may resemble:

```typescript
export interface LabProvider {
  getCapabilities(): Promise<LabProviderCapabilities>;
  getCapacity(): Promise<LabProviderCapacity>;
  provision(request: LabProvisionRequest): Promise<LabProviderSession>;
  start(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  reset(sessionId: string): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  getConnection(sessionId: string): Promise<LabConnectionInfo>;
  getHealth(sessionId?: string): Promise<LabHealth>;
}
```

Exact implementation may evolve.

---

# 8. Provider Capability Model

Providers should advertise capabilities such as:

- Containers.
- Virtual machines.
- Windows.
- Linux.
- Isolated networking.
- Snapshots.
- Console access.
- SSH.
- RDP.
- Browser console.
- Nested virtualization.
- GPU.
- Internet access controls.

The scheduler selects only providers capable of satisfying the Lab Definition.

---

# 9. Dependencies

## Depends On

- LAB-001 — Lab Definition Model
- KERN-001 — Platform Configuration
- KERN-004 — Error Handling Framework

## Unlocks

- LAB-010 — Mock Lab Provider
- LAB-011 — Container Lab Provider
- LAB-012 — Proxmox Lab Provider
- future provider adapters

---

# 10. Security Requirements

Provider credentials must:

- Remain server-side.
- use least privilege.
- never be returned to students.
- never be embedded in Lab Definitions.
- never be committed to GitHub.

Provider adapters must enforce authorization before operating on sessions.

---

# 11. Provider Independence Rule

Business logic must never import provider-specific SDKs directly.

Only the provider adapter layer may use provider-specific clients.

---

# 12. Accessibility Requirements

Provider differences must not unnecessarily change the student-facing workflow.

Where provider access methods have accessibility limitations, the provider must report those capabilities so the platform can present appropriate guidance or alternatives.

---

# 13. AI Usage

AI may:

- Explain provider failures.
- Compare provider health/capacity.
- recommend provider selection based on approved policies.

AI may not:

- Invent provider credentials.
- silently switch production providers.
- bypass safety controls.

---

# 14. Failure Behavior

Provider errors must be normalized into platform error categories.

A provider failure should not expose raw infrastructure internals to students.

---

# 15. Acceptance Criteria

## Platform can

- Register multiple provider adapters.
- query capabilities.
- query capacity.
- request provisioning through one interface.
- normalize provider failures.
- select only capable providers.
- keep provider credentials isolated.

## Founder can

- understand which provider is being used.
- compare capacity/health later.
- change approved provider strategy without curriculum rewrites.

---

# 16. Definition of Done

LAB-002 is complete when:

- Provider interface exists.
- capability model exists.
- capacity model exists.
- normalized errors exist.
- provider-specific code is isolated.
- tests can run using a mock provider.
- security boundary is documented.
- Founder approval is recorded.

---

# 17. Success Metrics

- LMS business logic remains provider-agnostic.
- Mock and real providers use the same contract.
- provider migration requires adapter work rather than product redesign.
- credentials remain protected.

---

# 18. Implementation References

**Recommended Milestone:** `LAB-M2 — Lab Provider Interface`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/labs/
services/lab-orchestrator/
tests/
```

---

# 19. Future Extensions

- Provider cost scoring.
- automated multi-provider placement.
- regional provider selection.
- provider failover.

Not part of the initial MVP.

---

# 20. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# 21. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`LAB-003 — Lab Session Lifecycle`
