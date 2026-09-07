# AGENTS.md — Repository Agent Operating Map

This file governs operational agent behavior in this repository. It does not
replace product, architecture, curriculum, engineering, or work-package law.
Canonical repository documents and current Git evidence outrank external-agent
conversation history. If this file conflicts with a Locked decision, the Locked
decision wins; stop on the affected work and report the conflict.

## Canonical Sources

Read only the sources relevant to the task, including:

- `CLAUDE.md` for repository-wide implementation behavior and source hierarchy.
- `docs/Project/DECISION_LEDGER.md` for binding decisions, especially DEC-027,
  DEC-057, DEC-060, DEC-062, DEC-067, and DEC-068 when applicable.
- `docs/Learning-OS/Learning-OS.md` for learning standards and the Founder-owned
  Curriculum Doctrine in sections 23–33.
- `docs/Feature-Registry/` for owning-engine contracts, acceptance criteria, and
  feature-specific requirements.
- `docs/Engineering-OS/Engineering-OS.md` and the applicable work-package,
  completion-review, and UAT-runbook documents under `docs/Engineering-OS/`.
- The relevant `scripts/verify-*.sh` verifier and `scripts/run-gate.sh`; invoke a
  named verifier through `npm run gate -- <name>`.
- `docs/Project/CURRENT_BUILD_STATUS.md`, `docs/Project/PLATFORM_BLUEPRINT.md`,
  `docs/Project/NOT_NOW.md`, and `docs/Project/SECURITY.md` when scope, current
  state, architecture, deferred work, or security is material.

Use the applicable approved work package as the implementation boundary. Do not
treat imported Claude, Codex, or ChatGPT conversations as repository authority.

## Authority Model

### Founder / Product Authority

The Founder owns final product authority, scope and change control,
Founder-gated actions, final learner-experience UAT, and final product
acceptance.

### ChatGPT / Architect

ChatGPT owns architecture and orchestration, instructional architecture,
substantive technical curriculum authorship, independent rendered functional
QA, independent UI/UX QA, learner-experience QA, technical-writing review, and
rendered-product acceptance recommendations. ChatGPT does not replace Founder
final UAT authority.

### Claude Code / Codex / Implementation Agents

Implementation agents own repository investigation, approved implementation,
tests, typechecking, builds, security checks, verifier and gate execution,
regression analysis, appropriate mutation checks, mechanically testable
accessibility protections, and accurate implementation reporting.

Implementation agents do not independently approve rendered UI, UX,
instructional, learner-experience, visual, or accessibility quality, and do not
grant final product acceptance.

## Protected Curriculum Authorship

Substantive learner-facing curriculum is reserved to ChatGPT unless the Founder
explicitly changes that authority. Implementation agents must not independently
author, rewrite, simplify, expand, polish, or substitute curriculum; invent
learner scenarios, questions, answer choices, explanations, remediation, or
substantive lab instructions; or silently resolve educational ambiguity.

Implement Architect-authored curriculum substantially as written. If it
conflicts with technical reality, repository architecture, binding decisions,
approved scope, schema, or accessibility requirements, stop on the affected item
and report the conflict. Mechanical UI and accessibility labels may follow
established application conventions when they carry no substantive instructional
meaning.

## Parallel-First Execution

For every substantial engineering task, first identify independent workstreams,
dependent workstreams, likely long poles, write-overlap risks, and integration
dependencies. Parallelize independent work when it materially reduces elapsed
time without reducing quality or materially increasing conflict, duplication,
cost, or integration risk. Keep dependent work sequential.

The objective is maximum useful parallelism, not maximum agent count. Every
parallel agent needs a distinct responsibility. Launch likely long-running
independent investigation or validation early, and continue safe non-conflicting
work rather than idling. Do not duplicate investigation or implementation unless
independent comparison is intentional.

When model choice is available, use the fastest and least expensive model that
can reliably meet the assignment. Use stronger reasoning for difficult
architecture, subtle debugging, security-critical work, high-risk review, and
difficult integration. Required quality is the floor.

## Lead Integrator and Write Isolation

Multi-agent work has one lead integrator responsible for the execution plan,
partitioning, integration, conflict resolution, approved technical decisions,
final integrated validation, and the final implementation report. Specialists
return findings or scoped work to the lead and do not redefine architecture or
product scope.

Multiple read agents may inspect the same areas concurrently. Parallel writers
require either clearly non-overlapping file or component ownership, or isolated
Git worktrees and branches. Never permit uncontrolled simultaneous edits to the
same checkout or files.

On a substantially dirty checkout, prefer parallel readers and one
writer/integrator. Prefer a known clean checkpoint before broad parallel-write
work. Reconcile competing findings against repository evidence, never by
majority vote.

## Validation and Agent-Efficiency Evidence

Per-agent tests do not establish completion. After integration, run every
applicable combined-state gate: formatting, lint, typecheck, unit and integration
tests, builds, security checks, accessibility automation, browser tests,
mutation guards, project verifiers, and CI-required checks. The required CI
status-check context is `verify`.

For substantial multi-agent work, report when available: agent count and roles;
concurrent work; elapsed time by workstream; parallel wall-clock time; a
defensible approximate sequential comparison; duplicate work; conflicts;
integration overhead; defects or constraints found; and whether more or fewer
agents would likely be more efficient next time. Never fabricate timings or
claim concurrency that did not occur.

## Independent Evidence and DEC-068 QA Claims

Claude and Codex must not treat each other's reports, or other providers'
conversations, as repository truth. Independent reviewers inspect canonical
evidence independently. Share only task-required context consistent with project
data-transfer policy; do not continuously import broad conversation history.

Distinguish **OBSERVED** from **INFERRED / COMPUTED / EXPECTED**. Source code,
layout arithmetic, semantic markup, and automation may establish implementation
properties; they do not establish human-perceived appearance, focus quality,
screen-reader usability, responsive readability, zoom/reflow quality, visual
hierarchy, theme appearance, or rendered accessibility unless an authorized
rendered surface was actually inspected.

Never claim UI, UX, instructional quality, learner experience, visual quality,
rendered accessibility, intuition, professionalism, or final acceptance from
source inspection or automated tests alone. For learner-facing work, report
separately:

- **AUTOMATED VALIDATION** — what was mechanically tested and established.
- **HUMAN UAT REQUIRED** — what remains for rendered Architect/Founder review.

Use: "Implemented and automated validation passed. Rendered Architect/Founder
UAT remains required."

## Neutral UAT and Defect Handling

UAT handoffs describe where to go, the starting state, actions to perform,
useful wrong/error paths, state transitions, known implementation-risk areas,
and completion behavior worth observing. Describe what to exercise, never what
conclusion to reach.

Before repairing a rendered-UAT defect, classify it where relevant as
curriculum/content, technical writing, functional interaction, UI/visual,
UX/usability, accessibility, state/progression, architecture, security, or
regression. Do not solve a UI defect by rewriting protected curriculum or a
curriculum defect by redesigning UI without authorization. Add durable
regression protection for mechanically testable defects; human semantic and
rendered quality remains human-owned.

## Git, CI, and Autonomy Guardrails

Ordinary approved in-scope work may proceed autonomously: repository reading,
approved edits, tests, typechecks, builds, lint, security checks, project
verifiers, and non-destructive local validation. Use the simple command forms
required by `CLAUDE.md` and Engineering-OS.

Stop for destructive file or data operations, production deployment, database
migration execution, secrets or credential changes, force-push or history
rewrite, major architecture or scope change, and all other Founder-gated
operations. Do not weaken gates, discard unrelated work, delete unexplained user
files, merge pull requests, deploy, or run destructive migrations without
explicit authorization. Do not stage, commit, push, create a pull request, or
merge unless the task explicitly authorizes that action.

Commits use only the user's configured Git identity. Never add AI authorship,
co-authorship, generation, or assistance attribution.

## Completion Discipline

Report the exact changed-file inventory, validation actually run and observed,
unresolved risks, human-review status, and actions deliberately left outside
scope. Passing automation establishes implementation confidence only; it never
constitutes architecture approval, rendered-product acceptance, or Founder UAT.
