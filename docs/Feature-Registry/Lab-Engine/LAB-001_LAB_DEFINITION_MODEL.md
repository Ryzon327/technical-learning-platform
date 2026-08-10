# LAB-001 — Lab Definition Model

**Feature ID:** LAB-001  
**Feature Name:** Lab Definition Model  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Lab Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Lab Definition Model provides a portable, provider-independent description of a hands-on technical lab.

A Lab Definition describes what the learning experience requires without embedding Proxmox, container, or cloud-specific implementation details into curriculum or learning logic.

---

# 2. Problem Statement

The platform will use multiple kinds of labs.

Examples may include:

- Networking simulations.
- Linux administration.
- Windows administration.
- Active Directory.
- Proxmox.
- SOC investigation.
- Vulnerability management.
- Ethical hacking.
- Cloud engineering.

If each lab is hardcoded directly to one infrastructure provider, the LMS becomes difficult to scale, migrate, test, and automate.

---

# 3. Student Value

Students receive predictable labs with:

- Clear objectives.
- Consistent launch behavior.
- Required resources.
- Known starting state.
- Clear validation requirements.
- Defined reset behavior.

The student should not need to know which provider hosts the lab.

---

# 4. Founder Value

The Founder can design labs once and run them on approved providers without rewriting the learning platform.

---

# 5. Included Scope

A Lab Definition may describe:

- Lab ID.
- Name.
- Description.
- Related Mission ID.
- Related competency IDs.
- Provider capability requirements.
- Resource requirements.
- Node/device roles.
- Network/topology requirements.
- Required software/image references.
- Access methods.
- Estimated duration.
- Session limits.
- Validation profile.
- Reset strategy.
- Safety classification.
- Data persistence policy.
- Version.
- Publication state.

---

# 6. Explicitly Excluded Scope

LAB-001 does not include:

- Actual provisioning.
- Provider credentials.
- Session state.
- Student evidence.
- grading.
- AI judgment.
- Proxmox-specific APIs.
- container runtime implementation.

---

# 7. Stable Lab Identity

Every Lab Definition must use a stable ID.

Example:

```text
LABDEF-NET-001
LABDEF-WIN-001
LABDEF-SOC-001
```

The exact format may evolve, but IDs must remain stable when titles or descriptions change.

---

# 8. Provider Requirements

A Lab Definition should specify capabilities rather than providers.

Prefer:

```text
requires:
- isolated-network
- 2-linux-nodes
- console-access
```

Avoid:

```text
run-this-on-proxmox-node-r620-2
```

Provider selection belongs to LAB-002 and later provisioning logic.

---

# 9. Dependencies

## Depends On

- CURR-001 — Curriculum Hierarchy and Stable IDs
- CURR-003 — Course, Module, and Mission Definition
- KERN-001 — Platform Configuration

## Unlocks

- LAB-002
- LAB-003
- LAB-008
- LAB-010
- LAB-011
- LAB-012

---

# 10. Security and Safety

Definitions must include a safety classification.

Examples:

- Standard
- Elevated
- Offensive Security Restricted

Definitions must identify:

- Whether internet access is allowed.
- Whether outbound traffic is restricted.
- Whether privileged access is required.
- Whether malware or exploit content is prohibited or specially controlled.
- What networks the lab may reach.

Unsafe or incomplete definitions must not publish.

---

# 11. Accessibility Requirements

Lab Definitions must support metadata describing:

- Connection method.
- keyboard requirements.
- screen-reader limitations.
- command-line alternatives.
- visual-only activities.
- available accommodations.
- whether timing is an essential competency.

Accessibility limitations should be transparent before the student begins.

---

# 12. AI Usage

AI may:

- Help draft Lab Definitions.
- Identify missing requirements.
- Suggest validation checks.
- Explain topology.

AI may not publish a Lab Definition or change its safety classification without approval.

---

# 13. Failure Behavior

Invalid definitions must fail validation before they can be assigned to students.

Existing published versions remain available if a new draft fails validation.

---

# 14. Acceptance Criteria

## Founder can

- Define a lab without specifying the underlying provider.
- Connect a lab to a Mission and competencies.
- Review resource and safety requirements.
- Version and update a Lab Definition.

## Platform can

- Validate required fields.
- Resolve stable curriculum references.
- Match definitions to provider capabilities later.
- reject definitions with incomplete safety requirements.

---

# 15. Definition of Done

LAB-001 is complete when:

- Lab Definition schema exists.
- Stable IDs exist.
- Resource/capability requirements exist.
- curriculum links exist.
- safety metadata exists.
- validation profile reference exists.
- accessibility metadata exists.
- versioning hooks exist.
- tests cover valid and invalid definitions.
- Founder approval is recorded.

---

# 16. Success Metrics

- New labs can be described without provider-specific business logic.
- Curriculum can reference labs reliably.
- Provider migration does not require curriculum redesign.
- Safety requirements are explicit.
- Lab definitions are reusable and testable.

---

# 17. Implementation References

**Recommended Milestone:** `LAB-M1 — Lab Definition Foundation`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/labs/
packages/shared-types/
labs/definitions/
tests/
```

---

# 18. Future Extensions

- Advanced topology schemas.
- GPU capability requirements.
- cloud-service lab definitions.
- multi-region labs.
- team labs.

Not part of the initial MVP.

---

# 19. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# 20. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`LAB-002 — Lab Provider Interface`
