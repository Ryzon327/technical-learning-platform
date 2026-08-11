# Analytics Engine Features

**Platform Engine:** Analytics Engine  
**Status:** Approved

---

# Purpose

The Analytics Engine converts approved platform events and aggregate operational data into useful insight for the Founder and, where appropriate, students.

Analytics should help answer:

- Are students learning?
- Where are students struggling?
- Which labs or assessments fail unusually often?
- Which curriculum areas need improvement?
- How healthy is the learning platform?
- Are AI and infrastructure costs sustainable?

Analytics must not become a surveillance system.

---

# Engine Responsibilities

The Analytics Engine owns:

- Analytics event contracts.
- Aggregate learning metrics.
- Curriculum effectiveness metrics.
- Lab reliability metrics.
- Assessment/evidence trends.
- AI usage/cost summaries.
- Founder dashboards.
- privacy-preserving aggregation.
- analytics retention policy.
- metric definitions and versioning.
- anomaly/threshold hooks.

---

# Non-Responsibilities

The Analytics Engine does not own:

- Student progress truth.
- competency decisions.
- evidence truth.
- certificate issuance.
- authentication.
- authorization.
- raw operational logs.
- student notes.
- AI provider routing.

Source Engines remain authoritative.

---

# Design Principles

Analytics must be:

- Purpose-limited.
- Aggregate-first.
- Privacy-conscious.
- Explainable.
- Metric-definition driven.
- Resistant to vanity metrics.
- Useful for curriculum and operations decisions.
- Independent of AI.
- Non-punitive toward students.
- Careful with small-group or individual-level reporting.

The platform should optimize learning outcomes and reliability, not maximize clicks, screen time, or addictive engagement.

---

# Current MVP Features

| Feature ID | Feature | Level | Status |
|---|---|---|---|
| ANLY-001 | Analytics Event Contract | Core | Specified |
| ANLY-002 | Learning Outcome Analytics | Core | Specified |
| ANLY-003 | Curriculum Effectiveness Analytics | Core | Specified |
| ANLY-004 | Lab and Assessment Reliability Analytics | Essential | Approved |
| ANLY-005 | AI Cost and Usage Analytics | Essential | Approved |
| ANLY-006 | Founder Analytics Dashboard | Essential | Approved |
| ANLY-007 | Privacy and Aggregation Controls | Core | Approved |
| ANLY-008 | Metric Definition and Versioning | Essential | Approved |

---

# Feature Summary

## ANLY-001 — Analytics Event Contract

Defines normalized, minimal events that source Engines may emit for approved analytics purposes.

## ANLY-002 — Learning Outcome Analytics

Measures learning progress, competency attainment, review needs, and completion patterns without equating engagement with learning.

## ANLY-003 — Curriculum Effectiveness Analytics

Helps identify confusing, oversized, weak, or unusually difficult curriculum areas.

## ANLY-004 — Lab and Assessment Reliability Analytics

Measures technical failure, validation failure, provisioning reliability, and assessment interruption rates.

## ANLY-005 — AI Cost and Usage Analytics

Summarizes AI provider/model/task usage and cost using Gateway metadata rather than raw private prompts.

## ANLY-006 — Founder Analytics Dashboard

Presents concise decision-oriented metrics instead of overwhelming the Founder with raw data.

## ANLY-007 — Privacy and Aggregation Controls

Controls retention, minimum cohort size, sensitive metric access, and data minimization.

## ANLY-008 — Metric Definition and Versioning

Ensures every KPI has a stable definition so dashboards do not silently change meaning.

---

# Dependencies

The Analytics Engine depends on approved events or metadata from:

- Learning Engine
- Curriculum Engine
- Lab Engine
- Evidence Engine
- Certificate Engine
- AI Gateway
- Platform Kernel

It integrates with:

- Operations Engine
- Notification Engine

---

# Analytics Principle

The platform should ask:

> What decision will this metric help us make?

If a metric has no meaningful product, learning, reliability, or cost decision attached to it, it should generally not be collected.

---

# Next Feature

`ANLY-001 — Analytics Event Contract`
