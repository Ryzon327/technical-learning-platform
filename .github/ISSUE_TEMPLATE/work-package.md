---
name: Work Package
about: An architect-approved bounded unit of implementation work
title: "[WP-000] "
labels: work-package
---

<!--
Authored by the ChatGPT Architect and approved by the Founder before work starts.
One work package = one issue = one feature branch = one pull request.

Claude Code implements ONLY what "In scope" lists. Anything discovered outside
that list is reported on the issue or PR, never silently absorbed.
-->

## Work Package ID

WP-000

## Architect-approved objective

<!-- One or two sentences. The outcome, not the steps. -->

## Why this work exists

<!-- The problem or gap. Cite the authoritative source: Feature Registry ID,
DEC-0xx, MVP_IMPLEMENTATION_SEQUENCE section, or a verified defect. -->

## In scope

<!-- Enumerate. This is the boundary, not a suggestion. -->

- [ ]
- [ ]

## Explicitly out of scope

<!-- Name the adjacent work most likely to be pulled in by accident. -->

-

## Existing architecture and contracts that must be preserved

<!-- Engines already closed, provider neutrality, deterministic validation
authority, RLS/authorization shapes, publication lifecycles, forbidden-field
lists. Name the ones this work could plausibly disturb. -->

-

## Expected implementation outcome

<!-- What is demonstrably true when this is done. -->

## Required internal checkpoints

<!-- Automated checkpoints INSIDE the package. These replace Founder relay;
they are not stop-and-ask points. -->

- [ ]
- [ ]

## Required automated validation

- [ ] targeted tests
- [ ] full test suite
- [ ] typecheck
- [ ] build
- [ ] security scan
- [ ] API smoke
- [ ] applicable verifier / completion gate:

## Relevant Feature / Engine IDs

<!-- e.g. LAB-001, LAB-008, ROAS-1, SEARCH-00x -->

## Migration status

- [ ] **NONE EXPECTED**
- [ ] **MIGRATION REQUIRED — FOUNDER GATE**

<!-- If a migration becomes necessary mid-work, STOP and report on this issue.
Never author or execute one under a "NONE EXPECTED" package. -->

## Dependency-change status

- [ ] **NONE EXPECTED**
- [ ] **DEPENDENCY CHANGE — FOUNDER GATE**

## Infrastructure / provider consequences

- [ ] **NONE EXPECTED**
- [ ] **CONSEQUENCE — FOUNDER GATE**

<!-- Proxmox or other provider configuration, deployment targets, paid
provisioning, DNS, credentials. -->

## Human UAT required?

- [ ] No — automated verification is sufficient for this package
- [ ] Yes — Founder browser UAT required before acceptance (DEC-047)

## Consequential Founder gates in this package

<!-- List every point that must stop for the Founder. If the list is empty,
say so explicitly. -->

-

## Definition of Done

<!-- Objective and checkable. "Implementation complete" and "Founder accepted"
are different states; state which one this package reaches. -->

- [ ]
- [ ]

## Architecture-review instructions

<!-- What the architect should scrutinise on the PR: the invariant most at risk,
the guard that must genuinely bite, the boundary most likely to erode. -->
