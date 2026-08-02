# Feature Registry Specification

**Project:** Technical Learning Platform
**Document version:** 1.0
**Document status:** Approved foundation
**Owning Operating System:** Product Operating System

---

# 1. Purpose

The Feature Registry is the authoritative inventory of approved platform capabilities.

It exists to help:

* The Founder understand what the product contains.
* Claude determine what already exists.
* Developers identify feature ownership and dependencies.
* AI agents avoid recreating completed work.
* The Roadmap organize implementation.
* Founder OS report product progress.
* Future project-management automation create milestones and tasks.

The Feature Registry tracks both software capabilities and approved educational platform capabilities.

It is not a list of ideas.

Unapproved or deferred ideas belong in `docs/Project/NOT_NOW.md`.

---

# 2. Registry Structure

The Feature Registry is organized by Platform Engine.

```text
docs/Feature-Registry/
├── FEATURE_REGISTRY_SPEC.md
├── FEATURE_CATALOG.md
├── templates/
│   └── FEATURE_TEMPLATE.md
├── Platform-Kernel/
├── Authentication-Engine/
├── Learning-Engine/
├── Curriculum-Engine/
├── Knowledge-and-Notes-Engine/
├── Lab-Engine/
├── Evidence-Engine/
├── Certificate-Engine/
├── Search-Engine/
├── Analytics-Engine/
├── Operations-Engine/
├── Notification-Engine/
└── AI-Orchestration-Engine/
```

`FEATURE_CATALOG.md` is the master index.

Each Engine directory owns the detailed records for features assigned to that Engine.

---

# 3. Core Governance Rule

> One Concept → One Home → One Owner

Every Feature must have:

* One permanent Feature ID.
* One owning Platform Engine.
* One primary business purpose.
* One authoritative Feature record.
* One lifecycle state.

Other Engines may integrate with the Feature, but they do not share ownership.

If Feature ownership is unclear, the Feature is not ready for approval.

---

# 4. Definition of a Feature

A Feature is a distinct capability that produces meaningful value for a student, the Founder, the business, or platform operations.

A Feature should be independently understandable and testable.

Examples:

* Student sign-in.
* Learning-path progress tracking.
* Student notes.
* Lab launch requests.
* Automated lab validation.
* Certificate verification.
* AI-provider routing.
* Founder daily brief.

A Feature is not:

* A vague idea.
* An entire Platform Engine.
* A low-level coding task.
* A temporary implementation detail.
* A decorative change with no defined value.
* A future concept that has not been approved.

---

# 5. Feature Hierarchy

The Registry uses this hierarchy:

```text
Company Operating System
└── Platform Engine
    └── Feature
        └── Milestone
            └── Task
```

## Platform Engine

Owns a defined software domain.

## Feature

Describes a capability delivered by that Engine.

## Milestone

The smallest complete unit of approved implementation work.

## Task

A specific action required to complete a Milestone.

Tasks do not belong in the Feature Registry unless they are necessary to explain current implementation status.

---

# 6. Feature Identification

Every Feature receives a permanent ID based on its owning Engine.

## Approved prefixes

| Engine                   | Prefix  |
| ------------------------ | ------- |
| Platform Kernel          | `KERN`  |
| Authentication Engine    | `AUTH`  |
| Learning Engine          | `LEARN` |
| Curriculum Engine        | `CURR`  |
| Knowledge & Notes Engine | `KNOW`  |
| Lab Engine               | `LAB`   |
| Evidence Engine          | `EVID`  |
| Certificate Engine       | `CERT`  |
| Search Engine            | `SRCH`  |
| Analytics Engine         | `ANLY`  |
| Operations Engine        | `OPS`   |
| Notification Engine      | `NOTIF` |
| AI Orchestration Engine  | `AIOR`  |

## Format

```text
PREFIX-###
```

Examples:

```text
AUTH-001
LEARN-004
LAB-012
AIOR-003
```

Feature IDs must never be reused.

If a Feature is retired, its ID remains reserved.

If ownership changes, the historical ID should normally remain unless a formal migration decision is recorded.

---

# 7. Feature Levels

Every Feature must have one Product Level.

## Level 1 — Core

Without the Feature, the MVP or platform cannot deliver its central promise.

Examples:

* Authentication.
* Learning progression.
* Lab launching.
* Validation.

## Level 2 — Essential

The platform may technically operate without it, but the student or Founder experience would be significantly incomplete.

Examples:

* Notes.
* Search.
* Progress restoration.
* Founder health summary.

## Level 3 — Enhancement

Improves usability, efficiency, personalization, or quality but is not required to prove the MVP.

Examples:

* Advanced keyboard shortcuts.
* Optional themes.
* Expanded personalization.

## Level 4 — Future

Approved for later consideration but outside the current active scope.

Level 4 Features must not enter implementation unless the Founder explicitly changes their phase.

Deferred concepts should also be referenced in `NOT_NOW.md`.

---

# 8. Feature Lifecycle

Every Feature has exactly one lifecycle state.

```text
Idea
→ Approved
→ Specified
→ Planned
→ Building
→ Testing
→ Review
→ Production
→ Optimizing
→ Deprecated
→ Retired
```

## Idea

A concept exists but has not been approved.

Ideas generally belong outside the active Feature Catalog.

## Approved

The Founder has accepted the Feature concept.

## Specified

Purpose, ownership, boundaries, dependencies, acceptance criteria, and risks are documented.

## Planned

The Feature has an approved implementation phase or Milestone.

## Building

Implementation is actively underway.

## Testing

Implementation is complete enough for required validation.

## Review

The Feature is awaiting Founder or designated human approval.

## Production

The Feature is released and available in its approved environment.

## Optimizing

The Feature is stable and being improved based on evidence.

## Deprecated

The Feature remains available temporarily but should not receive new expansion.

## Retired

The Feature is no longer active.

Historical records remain preserved.

---

# 9. Required Feature Record

Every Feature record must include the following sections.

## 9.1 Identity

* Feature ID.
* Feature name.
* Short description.
* Feature level.
* Lifecycle state.
* Owning Engine.
* Governing Company Operating System.
* Product owner.

## 9.2 Purpose

* Problem being solved.
* Student value.
* Founder value.
* Business value.
* Why the Feature should exist.
* What would be lost if it were removed.

## 9.3 Scope

* Included behavior.
* Explicitly excluded behavior.
* User roles served.
* Supported environments.
* Current phase.

## 9.4 Dependencies and Interfaces

* Required Features.
* Features unlocked.
* External provider interfaces.
* Events or APIs used.
* Data domains used.
* Cross-Engine integrations.

Dependencies must reference permanent Feature IDs whenever possible.

## 9.5 Security and Privacy

* Authorization requirements.
* Data classification.
* Sensitive information handled.
* Audit requirements.
* Abuse cases.
* Retention requirements.
* Security controls.

A Feature that handles student, administrative, payment, authentication, or lab data must explicitly document its security boundary.

## 9.6 Accessibility

* Keyboard requirements.
* Screen-reader requirements.
* Visual alternatives.
* Error-message requirements.
* Time-related accommodations.
* Media alternatives.
* Manual accessibility checks.

Accessibility cannot be marked “not applicable” without an explanation.

## 9.7 AI Involvement

* AI used: Yes, No, or Optional.
* AI agent involved.
* AI responsibility.
* Human approval requirements.
* Context permitted.
* Tools permitted.
* Expected token or generation-cost concerns.
* Non-AI fallback where required.

AI must not be added merely because it is available.

## 9.8 Operational Requirements

* Logging.
* Monitoring.
* Alerts.
* Capacity concerns.
* Operational cost.
* Backup or recovery needs.
* Failure behavior.
* Founder escalation conditions.

## 9.9 Risks

* Primary product risks.
* Security risks.
* Privacy risks.
* Cost risks.
* Reliability risks.
* Accessibility risks.
* Mitigations.

## 9.10 Acceptance Criteria

Acceptance criteria must describe observable behavior.

They should state what:

* The student can do.
* The Founder can do.
* The platform can verify.
* The system does when something fails.

Avoid acceptance criteria that only describe internal implementation.

## 9.11 Definition of Done

A Feature is complete only when:

* Approved acceptance criteria pass.
* Required tests pass.
* Security requirements pass.
* Accessibility requirements pass.
* Documentation is updated.
* Monitoring is present where required.
* Recovery behavior is documented.
* Feature status is updated.
* No unrelated scope was introduced.
* Founder approval is recorded when required.

## 9.12 Success Metrics

Every Feature must identify useful outcome measures.

Examples:

* Successful completion rate.
* Reduced founder intervention.
* Reduced failed lab launches.
* Improved course continuation.
* Faster issue resolution.
* Lower AI cost per successful outcome.
* Increased accessibility success.
* Improved student confidence.

Vanity metrics should not be used as the only success measure.

## 9.13 Implementation References

* Current Milestone ID.
* Roadmap phase.
* Relevant source directories.
* Relevant architecture documents.
* Relevant tests.
* Relevant founder or student documentation.
* Related decisions.

## 9.14 Future Extensions

Future extensions may be listed, but they must not enter current implementation automatically.

Each future extension must reference:

* A later phase.
* `NOT_NOW.md`, when appropriate.
* A separate future Feature ID once approved.

---

# 10. Feature Boundaries

A Feature must be split when it:

* Solves multiple unrelated problems.
* Belongs to multiple Engines.
* Has separate release schedules.
* Requires unrelated acceptance criteria.
* Has meaningfully different security boundaries.
* Cannot be completed within a reasonable Milestone sequence.

A Feature should not be split merely to create more records.

The goal is clear ownership, not excessive fragmentation.

---

# 11. Educational Asset Governance

Educational assets may be represented as Features when they are reusable platform capabilities or major approved product assets.

Examples include:

* Technical Foundations learning path.
* Networking Foundations course framework.
* Router-on-a-stick mission family.
* Lab validation model.
* Competency-based certificate model.

Individual lesson paragraphs, quiz questions, and video scenes are not normally Platform Features.

They belong to Curriculum content records and versioned educational assets.

Educational hierarchy remains:

```text
Learning Path
→ Course
→ Module
→ Mission
→ Lab
→ Validation
→ Evidence
```

---

# 12. Feature Dependencies

Dependencies must be explicit.

Use:

```text
Depends on:
- AUTH-001
- KERN-002

Unlocks:
- LEARN-003
- KNOW-001
```

Circular dependencies are prohibited unless reviewed and justified.

A Feature must not enter Building state when a required dependency is incomplete unless the implementation uses an approved mock or adapter.

---

# 13. Milestone Relationship

A Feature may require multiple Milestones.

Example:

```text
Feature: AUTH-001 Student Authentication

Milestones:
- AUTH-M1 Authentication interface
- AUTH-M2 Local authentication flow
- AUTH-M3 Session management
- AUTH-M4 Password recovery
- AUTH-M5 Administrative MFA
```

Milestones must be small enough to:

* Test independently.
* Review independently.
* Commit independently.
* Stop cleanly before the next Milestone.

---

# 14. Feature Approval

A Feature may enter Approved state only when the Founder agrees that it should exist.

Before approval, answer:

1. What problem does it solve?
2. Who receives value?
3. Does it support the MVP or approved Roadmap?
4. Which Engine owns it?
5. What does it depend on?
6. What would happen if it were deferred?
7. Does it increase Founder workload?
8. Can it be implemented without violating the Blueprint?

The final Founder question is:

> Should this Feature exist now?

If the answer is uncertain, defer it.

---

# 15. Change Management

Changes to a Feature record must preserve history.

When a significant Feature decision changes:

1. Update the Feature record.
2. Update the Decision Ledger when the decision is material.
3. Update the Feature Catalog.
4. Update the Roadmap or Milestone Catalog if sequencing changes.
5. Update `CURRENT_BUILD_STATUS.md` when active work changes.
6. Commit the change to GitHub.

Do not silently rewrite historical decisions.

---

# 16. Deprecation and Retirement

A deprecated or retired Feature record must include:

* Reason.
* Replacement Feature, if any.
* Student impact.
* Data-migration impact.
* Operational impact.
* Sunset plan.
* Final supported version.
* Related decision.

Removal must preserve required evidence, audit, certificate, and student records.

---

# 17. AI and Automation Usage

AI may help:

* Draft Feature records.
* Identify dependencies.
* Generate acceptance-criteria proposals.
* Identify risks.
* Suggest tests.
* Summarize status.
* Detect duplicate Features.

AI may not:

* Approve a Feature.
* Change ownership without approval.
* Promote a Feature into the MVP.
* Mark a Feature Production without evidence.
* Remove a Feature.
* alter constitutional product boundaries.

The Founder retains final approval.

---

# 18. Registry Maintenance

After every completed Milestone:

1. Update the affected Engine Feature file.
2. Update `FEATURE_CATALOG.md`.
3. Update lifecycle state.
4. Update implementation references.
5. Record known limitations.
6. Update success metrics when evidence exists.
7. Update `CURRENT_BUILD_STATUS.md`.
8. Commit all related changes together.

The Platform Engineer should eventually automate these updates, subject to Founder review.

---

# 19. Source-of-Truth Rules

The Feature Registry is authoritative for:

* Feature identity.
* Feature ownership.
* Feature lifecycle state.
* Feature dependencies.
* Feature acceptance criteria.
* Feature implementation references.

Other documents should reference the Registry rather than duplicate full Feature records.

When sources conflict, use this priority:

1. Explicit Founder instruction.
2. Platform Blueprint.
3. Decision Ledger.
4. Feature Registry.
5. Current Build Status.
6. Roadmap.
7. Existing implementation.
8. AI recommendation.

---

# 20. Repository Freeze Compliance

The Feature Registry must use the approved directory structure.

Do not:

* Rename Engine directories.
* Create new top-level Registry categories.
* Move Feature records between Engines without approval.
* Create duplicate Feature records.
* invent new Feature prefixes without approval.

The repository structure is considered stable.

---

# 21. Initial MVP Registry Scope

The first Feature Catalog should define only the capabilities required to prove the MVP.

Initial areas include:

* Local development foundation.
* Accessible application shells.
* Platform configuration.
* Authentication.
* Student onboarding and goals.
* Structured learning progression.
* Curriculum delivery.
* Student notes.
* AI Orchestration.
* Student AI Mentor.
* Mock Lab Provider.
* Evidence records.
* Certificates.
* Founder Operations.
* Container-based networking lab.
* Proxmox Provider.
* Initial Windows lab.
* Security validation.
* Accessibility validation.

Future pathways, recruitment, employer services, AI coworkers, and career simulation remain deferred.

---

# 22. Completion Criteria for This Specification

This specification is complete when:

* Feature ownership rules are clear.
* Feature IDs and prefixes are defined.
* Feature lifecycle is defined.
* Required Feature fields are defined.
* Approval and change rules are defined.
* Security and accessibility are mandatory.
* AI authority is limited.
* Registry maintenance is defined.
* MVP boundaries remain protected.

After approval, the next artifact is:

`docs/Feature-Registry/templates/FEATURE_TEMPLATE.md`

