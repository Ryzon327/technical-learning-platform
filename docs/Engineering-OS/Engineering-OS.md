# Engineering Company Operating System

**Technical Learning Platform**
**Version:** 1.0

---

# 1. Mission

Build reliable, maintainable, secure, accessible, and modular software that supports the Product Vision while minimizing founder workload.

Engineering exists to transform approved product decisions into high-quality software—not to redefine the product.

---

# 2. Purpose

The Engineering Company Operating System defines:

* How software is designed.
* How software is built.
* How changes are made.
* How quality is verified.
* How AI participates in development.
* How work is documented.
* How the repository is managed.

It is the authoritative guide for implementation.

---

# 3. Guiding Principles

Engineering follows these principles in order:

1. Understand before building.
2. Inspect before creating.
3. Reuse before rewriting.
4. Extend before replacing.
5. Build the smallest complete solution.
6. Test what was changed.
7. Document what was changed.
8. Commit only completed work.
9. Stop at the approved milestone.

Engineering values:

* Simplicity.
* Maintainability.
* Predictability.
* Accessibility.
* Security.
* Transparency.
* Automation.
* Reliability.

---

# 4. Responsibilities

Engineering owns:

* Software implementation.
* Repository structure.
* Code quality.
* Testing.
* Build systems.
* CI/CD (future).
* Security implementation.
* Accessibility implementation.
* Deployment processes.
* Technical documentation.

Engineering does **not** own:

* Product vision.
* Learning philosophy.
* Business strategy.
* Pricing.
* Roadmap priorities.

---

# 5. Interfaces

Engineering works with:

**Product OS**

Receives approved product requirements.

**Learning OS**

Implements educational experiences.

**Platform OS**

Implements infrastructure and platform services.

**Founder OS**

Provides operational tooling and automation.

Engineering does not override decisions owned by another Company Operating System.

---

# 6. Engineering Standards

## Architecture

* Modular.
* Replaceable.
* Loosely coupled.
* Clearly owned.

Every feature belongs to one engine.

---

## Repository

GitHub is the single source of truth.

Every change must be:

* Version controlled.
* Documented.
* Traceable.
* Reversible when practical.

---

## Code

Preferred technologies:

* React
* TypeScript
* Strict typing
* Reusable components
* Small focused modules

Avoid:

* Duplicate logic.
* Hidden behavior.
* Unnecessary dependencies.
* Large monolithic components.

---

## Security

Security is built into every milestone.

No secrets.

Least privilege.

Input validation.

Output encoding.

Role separation.

Auditability.

---

## Accessibility

Accessibility is mandatory.

Target:

WCAG 2.1 AA or higher.

Accessibility is never deferred to a later phase.

---

## Testing

Every completed milestone should include appropriate testing.

Possible tests include:

* Type checking.
* Linting.
* Unit tests.
* Integration tests.
* Accessibility checks.
* Build validation.

Do not claim tests passed unless they were actually executed.

### Automated verification is not final acceptance

Type checking, linting, unit and integration tests, mutation testing, static
verification, builds, security scans and architecture review are **necessary but
not sufficient** for final product acceptance.

They can prove that an implementation has a property. They cannot prove that the
real learner experience is usable, understandable, visually correct, accessible
in practice, or correct when exercised end to end.

Major learner-facing engines therefore require **Human Acceptance Testing** —
the Founder exercising the actual application **through the browser** — before
final product acceptance. Reviewing source, unit tests, verifier output,
test-generated screenshots or implementation reports does not satisfy this.

Human acceptance testing:

* is an **additional** release gate, never a replacement for automated testing,
  CI, security testing, accessibility automation or architecture review;
* occurs at meaningful **engine or workflow boundaries**, not after every small
  implementation batch;
* **may block acceptance even when CI is green**;
* returns material defects through the normal scoped
  implementation/review/test/commit workflow rather than fixing them silently
  during the review.

A security property that requires real infrastructure to verify — row level
security, cross-user isolation, live database behaviour — **must not be
represented as proven because mocked or unit tests pass**. State what was
actually exercised.

The MVP-scoped checkpoints implementing this standard are defined in
`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md` section 15d.

---

## Documentation

Engineering updates documentation as part of implementation.

Documentation is never considered optional.

---

# 7. AI Engineering Standards

AI is an implementation assistant.

AI must:

* Read authoritative documents.
* Inspect existing work.
* Reuse existing components.
* Stay within scope.
* Explain changes.
* Update documentation.
* Stop when the milestone is complete.

AI must not:

* Introduce scope creep.
* Rewrite completed work.
* Add speculative features.
* Surprise the founder with unrelated changes.

Every AI action should be understandable and reviewable.

## Autonomous execution within an approved objective

Once the Founder approves an implementation objective, the ordinary
non-destructive engineering work required to accomplish it is **pre-authorized**.
Routine shell execution is an implementation mechanism, not a Founder decision
point, and AI must not repeatedly ask *"do you want to proceed?"* for it.

This **replaces repetitive command approval, not governance**. The control model
is:

```
approved objective → autonomous implementation → automated verification
  → fail-closed inventory review → architecture review → commit authorization
  → designated Human UAT
```

Pre-authorized when relevant to the approved objective: repository navigation and
file inspection · `grep`, `find`, `sed`, `awk`, `cat` · scripted controlled edits
to project files · modifying files the objective legitimately requires · adding
or modifying tests and verifier scripts within scope · temporary mutation testing
with verified restoration · package-manager repository commands · tests,
typecheck, build, lint, security scans, smoke tests and existing verification
scripts · read-only git inspection (`status`, `diff`, `log`, `show`,
`rev-parse`, `fetch`) · inventory, attribution, dependency and migration **state**
checks · starting existing local development processes when the approved task
requires it and doing so does not modify persistent state.

## Actions that always require Founder approval

Autonomy stops at consequence. Approval remains mandatory for:

* **Persistent state** — executing migrations, `supabase db push`,
  `supabase migration up`, destructive SQL, schema or RLS changes outside an
  approved implementation, and modifying development or production data.
* **Dependencies and toolchain** — adding, removing, upgrading or replacing
  dependencies, test frameworks, package managers or major tooling.
* **Security and credentials** — secrets, credentials, authentication providers,
  credential stores, weakening a security control, or exposing a token.
* **Destructive operations** — deleting substantial existing work, destructive
  bulk file operations, destructive database operations.
* **Git history** — force push, history rewriting, shared-history rebase,
  `reset --hard` against established work, amending an approved commit.
* **Production** — deployment, production infrastructure, DNS, paid provisioning.
* **Material architecture or product scope** — a new subsystem or service,
  materially different data or authorization architecture, changing approved
  acceptance criteria, weakening an approved guardrail, implementing another
  Feature's functionality, or any meaningful product behaviour that is the
  Founder's choice.

Do **not** stop for trivial implementation choices where repository precedent
already establishes the correct approach.

## Tooling permissions are defence in depth, not the boundary

The project permission configuration in `.claude/settings.json` denies the
consequential operations listed above and allows routine repository-local work.
It is **defence in depth, not a sandbox**: the rules match command strings, so
flag position and shell composition can evade them. **These standards remain
authoritative even where a pattern could technically be evaded.** A command that
slips past a deny rule is still forbidden if it crosses a boundary above.

Construct commands so they match the permission rules. A single compound
expression — shell variable assignment with command substitution, nested `$(…)`,
or a loop — cannot be attributed to any one rule and will prompt even when every
operation inside it is individually permitted. Prefer one simple command per
invocation, or move genuinely multi-step logic into a script invoked as a single
command. **Never weaken a boundary merely to avoid a prompt.**

## Inventory expansion

An obviously required existing file omitted from an initial inventory is not a
reason to interrupt the Founder. It may be included when it does not materially
expand architecture or product scope, weaken security, introduce a dependency or
execute a migration — and the final report must record the file, why it became
necessary, and why it stayed within approved scope. **Stop only for material
scope expansion.**

## Verification replaces repetitive approval

Reduced command approval makes verification the control. Every implementation
batch executes all applicable existing gates and reports the evidence: exact
working-tree inventory and file-level changes, diff review, targeted and full
test suites, typecheck, build, lint, security scan, smoke tests, engine
verification scripts, regression verification, mutation testing for important
contract and security guards, dependency and migration **state** checks,
temporary-artifact checks, known limitations, and Human UAT status.

**Never claim a gate passed unless it was executed. Never hide a failing gate.** A
failure may be reported as pre-existing only when evidence establishes the
current work did not introduce it.

## Commit and push remain boundaries

Unless the current instruction explicitly authorizes them, the default is
**implement → verify → report → stop before commit**. Staging and inspection
commands within an authorized commit do not need separate approval: once
commit and push are authorized, the whole safe sequence — verify inventory,
stage approved paths explicitly, commit with the approved subject, verify author,
committer, body, trailers and attribution, push, fetch, and confirm
`HEAD == origin/main` with a clean tree — is authorized as one operation.

**Never force push.**

---

# 8. Daily Practice

Every engineering session follows this sequence:

1. Read `MASTER_INDEX.md`.
2. Read `PLATFORM_BLUEPRINT.md`.
3. Read `MASTER_BUILD_PROMPT.md`.
4. Read `CURRENT_BUILD_STATUS.md`.
5. Review relevant documentation.
6. Inspect existing implementation.
7. Identify reusable work.
8. Create a milestone plan.
9. Implement only the approved milestone.
10. Run relevant tests.
11. Update documentation.
12. Prepare Git commands.
13. Stop.

No milestone should continue into the next without founder approval.

---

# 9. Success Metrics

Engineering succeeds when:

* Code is maintainable.
* Features are modular.
* Tests pass.
* Documentation stays current.
* Accessibility requirements are met.
* Security requirements are met.
* Founder workload decreases over time.
* AI token usage remains efficient.
* Existing work is reused whenever possible.

---

# 10. Decision Authority

Engineering decisions include:

* Internal implementation.
* Folder organization.
* Technical design within approved architecture.
* Testing approaches.
* Refactoring that preserves behavior.

Engineering does **not** have authority to change:

* Product scope.
* Product priorities.
* Learning philosophy.
* Business direction.
* Constitutional rules.

Those require founder approval.

---

# 11. Revision Policy

This document is a living operational manual.

Changes should improve engineering quality while remaining consistent with:

* MASTER_INDEX.md
* PLATFORM_BLUEPRINT.md
* Product Company Operating System

Engineering evolves continuously, but always within the constitutional boundaries of the company.

