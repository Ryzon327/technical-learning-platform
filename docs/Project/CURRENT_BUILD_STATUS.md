# Current Build Status

**Project:** Technical Learning Platform
**Status version:** 1.0
**Current phase:** MVP Implementation
**Current milestone:** Local Development Foundation
**Owning area:** Platform Core
**Milestone status:** Ready to begin
**Last completed milestone:** Master Build Prompt
**Active blockers:** None

---

# 1. Current Objective

Establish a working local software-development foundation for the Technical Learning Platform.

This milestone creates the application shells, workspace configuration, shared development standards, automated checks, and founder-friendly setup documentation.

This milestone must not implement student-facing product features.

---

# 2. Authoritative Documents Completed

The following project documents are approved and stored in GitHub:

* `PLATFORM_BLUEPRINT.md`
* `MASTER_BUILD_PROMPT.md`
* `CURRENT_BUILD_STATUS.md`
* `DECISION_LEDGER.md`
* `FEATURE_REGISTRY.md`
* `ROADMAP.md`
* `NOT_NOW.md`
* `SECURITY.md`
* `CONTRIBUTING.md`

The Platform Blueprint and Master Build Prompt are authoritative.

Claude must read them before planning or implementing work.

---

# 3. Completed Work

## Product and architecture

* Product vision approved.
* Product Constitution approved.
* Product boundaries approved.
* Learning philosophy approved.
* Student experience approved.
* Founder experience approved.
* Lab Engine concept approved.
* AI architecture approved.
* Security architecture approved.
* Accessibility requirements approved.
* Infrastructure progression approved.
* MVP scope approved.
* Future functionality separated from MVP scope.

## Repository foundation

* Local Git repository created.
* GitHub repository created.
* GitHub remote configured.
* Initial project documentation committed.
* Platform Blueprint committed.
* Claude Master Build Prompt committed.
* Empty repository directories preserved where required.
* Sensitive files excluded through `.gitignore`.
* `.env.example` created using placeholders only.

---

# 4. Current Milestone

## Local Development Foundation

The purpose is to create a stable local development environment without implementing platform functionality.

### Approved scope

* Inspect the current repository structure.
* Create the root Node.js workspace configuration.
* Select and configure one package manager.
* Configure a monorepo workspace.
* Create the React and TypeScript student web application shell.
* Create the React and TypeScript founder-admin application shell.
* Create shared TypeScript configuration.
* Create the initial Design System package.
* Create Shared Types and Shared Utilities packages.
* Add formatting.
* Add linting.
* Add strict TypeScript validation.
* Add a basic test framework.
* Add automated foundation checks.
* Create an accessible application shell.
* Create local development scripts.
* Create founder-friendly setup documentation.
* Confirm both application shells run locally.
* Update project documentation.

### Explicitly out of scope

Do not implement:

* Authentication.
* User registration.
* Student goals.
* Supabase integration.
* Database tables.
* Row-Level Security.
* Course functionality.
* Learning paths.
* Notes.
* AI integration.
* AI Mentor.
* Lab functionality.
* Proxmox integration.
* Containerlab.
* Evidence records.
* Certificates.
* Search.
* Payments.
* Recruitment.
* Career simulation.
* Future learning pathways.
* Production hosting.

---

# 5. Milestone Acceptance Criteria

The Local Development Foundation is complete only when:

* The repository installs successfully using one documented command.
* The student web application runs locally.
* The founder-admin application runs locally.
* Both applications display a basic accessible shell.
* Shared packages can be imported by both applications.
* Strict TypeScript checks pass.
* Linting passes.
* Formatting checks pass.
* Basic tests pass.
* No product functionality has been added.
* No secrets are present.
* Local setup instructions are complete.
* Common startup and shutdown commands are documented.
* Common beginner errors have recovery guidance.
* `CURRENT_BUILD_STATUS.md` is updated.
* `FEATURE_REGISTRY.md` is updated.
* `CHANGELOG.md` is updated.
* Claude provides a milestone completion report.
* Claude provides exact Git commands.
* Claude stops before beginning Authentication.

---

# 6. Required Founder Experience

The founder must be able to:

1. Download or clone the repository.
2. Open Terminal.
3. Navigate to the project.
4. Install dependencies using one command.
5. Start both application shells using one documented command.
6. Open both applications in a browser.
7. Stop the environment safely.
8. Understand basic error messages.
9. Save completed work to GitHub using documented commands.

Instructions must not assume professional software-development experience.

---

# 7. Expected Repository Changes

Claude should inspect the repository before confirming exact files.

Expected additions may include:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
eslint configuration
formatting configuration
test configuration
apps/web/package.json
apps/web source files
apps/founder-admin/package.json
apps/founder-admin source files
packages/design-system/package.json
packages/shared-types/package.json
packages/shared-utils/package.json
docs/founder-guides/HOW_TO_RUN_LOCALLY.md
docs/founder-guides/HOW_TO_STOP_LOCALLY.md
docs/founder-guides/COMMON_SETUP_ERRORS.md
```

This list is an expectation, not permission to create unnecessary files.

Claude must reuse any existing compatible files.

---

# 8. Package Manager Decision

The implementation engineer must select one package manager for the repository.

Preferred choice:

* `pnpm`

Reasons:

* Strong monorepo support.
* Efficient disk usage.
* Clear workspace configuration.
* Suitable for multiple applications and shared packages.

Claude must confirm that the choice is appropriate before implementation.

Do not configure multiple competing package managers.

Do not commit conflicting lock files.

---

# 9. Application Shell Requirements

## Student web application

The initial shell may contain:

* Application name.
* Accessible header.
* Main-content region.
* Placeholder navigation.
* Clear “Local Development Foundation” status.
* No functional learning features.

## Founder-admin application

The initial shell may contain:

* Founder Operations title.
* Accessible header.
* Main-content region.
* Placeholder platform-health area.
* Clear “Local Development Foundation” status.
* No actual analytics or operational controls.

The shells exist only to prove the workspace and shared packages function correctly.

---

# 10. Accessibility Requirements

Both application shells must include:

* Semantic HTML.
* A visible page title.
* Logical heading order.
* Keyboard-accessible navigation.
* Visible keyboard focus.
* Skip-to-content link.
* Adequate contrast.
* No color-only meaning.
* Responsive text and layout.
* Reduced-motion consideration.
* Automated accessibility checks where practical.

Accessibility is part of the foundation, not a later visual enhancement.

---

# 11. Security Requirements

During this milestone:

* Do not add secrets.
* Do not connect production services.
* Do not connect Proxmox.
* Do not connect Supabase.
* Do not expose administrative services.
* Do not create real student accounts.
* Do not store personal data.
* Keep `.env.example` limited to placeholders.
* Verify `.env` remains ignored.
* Avoid dependencies with known critical vulnerabilities when alternatives exist.

---

# 12. Testing Expectations

At minimum, the foundation should include:

* Strict TypeScript checking.
* Linting.
* Formatting validation.
* Basic unit or component tests.
* Production build validation.
* Basic accessibility validation.

Claude must not claim a check passed unless it actually ran.

If a check cannot run, Claude must state why.

---

# 13. Documentation Requirements

The current milestone should create or update:

* `README.md`
* `CURRENT_BUILD_STATUS.md`
* `FEATURE_REGISTRY.md`
* `CHANGELOG.md`
* `docs/founder-guides/HOW_TO_RUN_LOCALLY.md`
* `docs/founder-guides/HOW_TO_SAVE_TO_GITHUB.md`
* `docs/founder-guides/WHAT_TO_DO_IF_SOMETHING_BREAKS.md`

Additional documentation should be created only when necessary.

---

# 14. Current Stop Condition

Claude must stop when:

> Both application shells run locally, shared packages work, automated foundation checks pass, founder setup documentation is complete, and no product features have been implemented.

The next milestone after approval will be:

> Design System Foundation

Claude must not begin that milestone automatically.

---

# 15. Founder’s Next Action

The founder should provide Claude access to the repository and give it the following instruction:

> Read `MASTER_BUILD_PROMPT.md` and all required authoritative project files. Complete only the Local Development Foundation milestone currently defined in `CURRENT_BUILD_STATUS.md`. Inspect and reuse existing work. Do not implement product features. Provide the required milestone plan, completion report, and exact GitHub-saving commands. Stop when the milestone acceptance criteria are satisfied.

---

# 16. Status Summary

```text
Planning: Complete
Architecture: Complete
Blueprint: Complete
Master Build Prompt: Complete
GitHub foundation: Complete
Local Development Foundation: Ready to begin
Product features: Not started
Lab infrastructure: Not started
Private beta: Not started
```

