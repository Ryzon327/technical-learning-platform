# MVP Implementation Sequence

**Project:** Technical Learning Platform  
**Status:** Proposed Implementation Baseline  
**Date:** 2026-08-11

---

# 1. Objective

Translate the approved architecture into a build order that produces a working MVP as early as possible without violating core security, data, and learning boundaries.

The implementation strategy is vertical and dependency-aware:

```text
Foundation
→ Identity
→ Curriculum
→ Learning
→ Assessments
→ Notes
→ Labs
→ Evidence
→ Certificates
→ Search
→ AI
→ Analytics
→ Operations
→ Notifications
→ Hardening
→ MVP Release
```

This is an implementation sequence, not a requirement to finish every Feature in one Engine before touching the next.

---

# 2. Build Wave 0 — Repository and Engineering Foundation

Build first:

- Application workspace/package structure.
- environment/configuration strategy.
- shared types/contracts.
- database migration workflow.
- backend service conventions.
- frontend application shell.
- testing framework.
- CI checks.
- secrets handling.
- basic observability.
- local development bootstrap.

## Exit criteria

A new developer environment can start the application and run tests using documented commands.

---

# 3. Build Wave 1 — Platform Kernel and Authentication

Implement the minimum required Platform Kernel and Authentication features.

Focus:

- configuration.
- error handling.
- audit foundation.
- application settings.
- account registration.
- sign in/sign out.
- session management.
- email verification.
- password recovery.
- Founder/admin MFA.
- trusted identity context.

## Exit criteria

A student can securely create an account, authenticate, and access an authorized application shell.

---

# 4. Build Wave 2 — Curriculum Foundation

Implement:

- stable curriculum IDs.
- Learning Path/Course/Module/Mission hierarchy.
- competency definitions.
- prerequisite definitions.
- publication/version state.
- content asset references.

## Exit criteria

The Founder can define and publish a small real course through governed curriculum data.

---

# 5. Build Wave 3 — Core Learning Experience

Implement:

- progress tracking.
- resume/continue learning.
- prerequisite enforcement.
- competency state.
- recommended next action.
- learning history.
- review/reinforcement state.

## Exit criteria

A student can enroll/access a course, complete Missions, leave, return, and continue from the correct state.

---

# 6. Build Wave 4 — Assessments and Test-Out

Implement the deterministic assessment path required by Learning Engine and Evidence Engine.

Focus:

- question/assessment representation.
- attempts.
- deterministic scoring.
- readiness/test-out.
- technical interruption handling.
- competency mapping.

## Exit criteria

A student can complete an assessment and receive deterministic, persisted results without AI controlling the score.

---

# 7. Build Wave 5 — Knowledge and Notes

Implement:

- student notes workspace.
- technical content blocks.
- learning-context links.
- tags.
- note retrieval/search.
- bookmarks.
- export baseline.

AI-assisted notes can remain disabled until AI Gateway foundation exists.

## Exit criteria

Students can maintain private technical notes linked to learning context.

---

# 8. Build Wave 6 — Lab Engine MVP

Implementation order:

1. Lab Definition Model
2. Provider Interface
3. Session Lifecycle
4. Mock Provider
5. Deterministic Validation
6. Isolation/Safety
7. Capacity/Provisioning
8. Access Delivery
9. Reset/Cleanup
10. Health/Recovery
11. Container Provider where useful
12. Proxmox Provider

## Important rule

Build and test the **Mock Provider before Proxmox integration**.

## Exit criteria

A student can launch, use, validate, reset, and terminate at least one real practical lab through the LMS without direct Proxmox administrative access.

---

# 9. Build Wave 7 — Evidence

Implement:

- canonical Evidence Record.
- provenance.
- competency evidence linking.
- lab validation evidence.
- assessment evidence.
- correction history.
- private evidence portfolio.

## Exit criteria

A successful assessment or lab produces durable, traceable competency evidence.

---

# 10. Build Wave 8 — Certificates

Implement:

- certificate definitions.
- eligibility rules.
- deterministic issuance.
- lifecycle.
- verification.
- student portfolio.
- export.
- correction/revocation.
- basic accessible branding.

## Exit criteria

A student who satisfies evidence requirements receives a verifiable certificate automatically.

---

# 11. Build Wave 9 — Search

Start with deterministic baseline search:

- searchable curriculum.
- permission-aware retrieval.
- technical query normalization.
- filters.
- personal notes integration.
- indexing freshness.
- fallback search/navigation.

## Exit criteria

Students can find authorized curriculum and their own notes without AI.

---

# 12. Build Wave 10 — AI Gateway and AI Features

Implementation order:

1. AI Request Contract.
2. Mock AI Provider.
3. Provider Interface.
4. Routing policy.
5. privacy/redaction.
6. cost controls.
7. health/fallback.
8. response normalization.
9. usage metadata.
10. Local provider adapter.
11. External provider adapter.

Then enable selected AI product features.

## Exit criteria

At least one local or hosted provider can safely serve an approved learning-assistance workflow through the Gateway.

---

# 13. Build Wave 11 — Analytics

Implement only decision-useful MVP metrics:

- learning outcomes.
- curriculum review signals.
- lab/assessment reliability.
- AI cost/usage.
- Founder dashboard.
- privacy aggregation.
- versioned KPI definitions.

## Exit criteria

Founder can see whether students are learning, where systems fail, and where cost is growing without raw-surveillance dashboards.

---

# 14. Build Wave 12 — Operations and Notifications

Operations:

- incident model.
- bounded remediation.
- Founder operations queue.
- dependency health.
- degraded mode.
- runbooks.
- escalation.

Notifications:

- request contract.
- in-app.
- email.
- preferences.
- retry/dedup.
- operational alert delivery.
- history/read state.

## Exit criteria

Routine failures recover or degrade safely, important unresolved issues surface once, and users receive appropriate notifications.

---

# 15. Build Wave 13 — Security, Reliability, and Accessibility Hardening

Before MVP release:

- authorization review.
- tenant/user data-isolation tests.
- secret scanning.
- abuse/rate-limit tests.
- destructive-action tests.
- lab isolation tests.
- backup/recovery validation.
- accessibility audit.
- mobile usability review.
- performance/load baseline.
- dependency failure exercises.
- logging/privacy review.

---

# 16. MVP Release Gate

MVP release requires:

- [ ] secure student account flow.
- [ ] at least one publishable course.
- [ ] durable progress.
- [ ] deterministic assessment.
- [ ] at least one practical lab.
- [ ] evidence generated from assessment/lab.
- [ ] evidence-backed certificate.
- [ ] private notes.
- [ ] baseline search.
- [ ] at least one approved AI-assisted workflow.
- [ ] Founder operational visibility.
- [ ] email/in-app notifications for required flows.
- [ ] security/accessibility/reliability checks passed.
- [ ] no critical unresolved architecture conflicts.

---

# 17. Scope Discipline

Do not block MVP on:

- enterprise multi-tenancy.
- marketplace/community features.
- advanced public portfolios.
- complex gamification.
- mobile native applications.
- many AI providers.
- many lab providers.
- advanced employer verification.
- advanced analytics.
- large-scale organization administration.

Those may be added after the core learning loop proves valuable.
