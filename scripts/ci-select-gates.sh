#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# CI-HARDEN-1 — change-relevant gate selection.
#
# Reads changed file paths on stdin (one per line) and prints the verifier
# scripts that own them, one per line, de-duplicated and in a stable order.
#
# ## Why this exists
#
# The repository has 24 verifier scripts. Running all of them on every pull
# request would be slow and mostly irrelevant: an engine completion gate proves
# something about ITS engine, and a change that does not touch that engine
# learns nothing from it.
#
# ## Why it is a flat list and not a dependency graph
#
# Deliberately explicit. Each entry is one glob and one gate, so adding a future
# engine is a one-line change and a reader can see the whole policy at once.
# A computed graph would be harder to audit and easy to get subtly wrong.
#
# ## Runtime honesty
#
# Several gates internally defer to wave verifiers that re-run typecheck, the
# full test suite and the build:
#
#   verify-roas4.sh -> verify-roas3.sh -> verify-roas2.sh -> roas1 -> lab engine
#   verify-roas3.sh -> verify-roas2.sh -> verify-roas1.sh -> lab engine
#   verify-roas2.sh -> verify-roas1.sh -> verify-lab-engine-completion.sh
#   verify-roas1.sh -> verify-lab-engine-completion.sh -> 4 wave-6 verifiers
#   verify-search-engine-completion.sh -> verify-wave9.sh
#   verify-certificate-engine-completion.sh -> verify-wave8.sh -> wave 7
#
# So a selected gate is not free, and a lab-touching change runs the suite more
# than once. CI-HARDEN-1 does NOT restructure the verifiers to fix that; doing so
# would modify many files outside its scope. Selecting narrowly is what keeps the
# cost proportionate.
#
# ## Two ways in, one behaviour
#
# Paths may arrive on stdin (one per line) or as arguments. CI uses stdin and
# that path is unchanged. Arguments exist so a mapping can be checked without
# building a shell pipeline, which is itself an approval prompt (DEV-FLOW-2).
#
# Usage:
#   git diff --name-only origin/main...HEAD | scripts/ci-select-gates.sh
#   bash scripts/ci-select-gates.sh services/api/src/lab-admin.ts
#   npm run gate -- select services/api/src/lab-admin.ts
# ============================================================

# The verification machinery maps to itself. Editing a gate, a wave verifier or
# the shared toolchain step must run at least one real gate, or a change to the
# thing that does the checking would be merged unchecked. DEV-FLOW-1 found this
# the hard way: it modified 13 verifier scripts and originally selected none.
#
# One rule per line: "<glob> <gate script>".
#
# Globs are matched with bash pattern matching against each changed path.
# Order here is the order gates run: cheapest and most specific first.
#
# ## No comments inside the RULES block
#
# The loop below reads every non-empty line as `glob|gate`, so a `#` line would
# be read as a glob with an EMPTY gate, and the missing-gate check at the bottom
# would abort selection for the whole pull request. Explanations belong here.
#
# ## Two entries added by the Mission 2 Founder UAT repair
#
# `verify-wpj-m1.sh` asserts what the journey presentation DOES — its sections
# 6f and 6g read `packet-journey-presentation.ts` directly — but nothing mapped
# that file to it. A presentation repair could therefore break Mission 1's
# device inspection or Mission 2's simultaneous delivery and never run the gate
# that owns those two missions. Both presentation modules now select it.
#
# ## The dependency policy owns the lockfile and its own definition
#
# `package-lock.json` and `scripts/lib/authorized-dependency*` previously
# selected NOTHING. That is the failure this table's header names, in its worst
# form: nine gates get their dependency rule from a file that no gate was woken
# for, so an edit weakening the rule would have merged unchecked.
#
# They now select `verify-dependency-policy.sh`, which proves the policy against
# sixteen hostile shapes, and `verify-wpj-m2.sh`, which is the work package the
# one authorized dependency belongs to. `npm audit` is unaffected — it runs
# unconditionally in the CI baseline, not through this table.
#
# Deliberately keyed on the LITERAL `package-lock.json` and not a `package*`
# glob: a glob would also match `package.json`, and the autonomy gate's selector
# regression asserts that path's exact output.
#
# ## The two Search handoff documents
#
# `verify-search-engine-completion.sh` section 17b asserts that the Founder UAT
# checklist and the rendered review record exist and that neither claims an
# acceptance nobody granted. Every other UAT runbook in this table is mapped to
# the gate that reads it, for the reason the header gives: a gate that checks a
# file it is not woken for is a gate that passes forever.
#
# `verify-wpj-m2.sh` is new and owns Mission 2 alone. It is mapped from the
# curriculum, the parsed suite, the ledger and the declaration like every other
# per-mission gate, and additionally from the four presentation and contract
# modules its assertions read — a gate that checks a file it is not woken for
# is a gate that passes forever.
RULES=$(
  cat <<'RULES'
services/api/src/cors*|scripts/verify-api-cors.sh
services/api/src/server.ts|scripts/verify-api-cors.sh
services/api/src/config*|scripts/verify-api-cors.sh
services/api/src/auth-context*|scripts/verify-api-cors.sh
apps/web/src/lib/api-client*|scripts/verify-api-cors.sh
scripts/verify-api-cors.sh|scripts/verify-api-cors.sh
supabase/migrations/*|scripts/verify-learn-progress-db.sh
services/api/src/learning-progress*|scripts/verify-learn-progress-db.sh
scripts/verify-learn-progress-db.sh|scripts/verify-learn-progress-db.sh
apps/web/src/learning/roas-course-presentation.ts|scripts/verify-learn-progress-db.sh
supabase/migrations/*|scripts/verify-db-service-role.sh
scripts/verify-db-service-role.sh|scripts/verify-db-service-role.sh
services/api/src/db-diagnostics*|scripts/verify-db-service-role.sh
services/api/src/admin/publish-roas-curriculum.ts|scripts/verify-db-service-role.sh
packages/shared-types/src/roas-bootstrap*|scripts/verify-db-service-role.sh
scripts/uat-env.sh|scripts/verify-uat-env.sh
scripts/verify-uat-env.sh|scripts/verify-uat-env.sh
docs/Engineering-OS/ROAS_UAT_RUNBOOK.md|scripts/verify-uat-env.sh
.gitignore|scripts/verify-uat-env.sh
scripts/uat-env.sh|scripts/verify-db-service-role.sh
scripts/migration-baseline.sha256|scripts/verify-db-service-role.sh
supabase/migrations/*|scripts/verify-db-rls.sh
scripts/verify-db-rls.sh|scripts/verify-db-rls.sh
supabase/config.toml|scripts/verify-db-tooling.sh
supabase/README.md|scripts/verify-db-tooling.sh
docs/Engineering-OS/DATABASE_MIGRATION_WORKFLOW.md|scripts/verify-db-tooling.sh
scripts/db-tooling-doctor.sh|scripts/verify-db-tooling.sh
scripts/verify-db-tooling.sh|scripts/verify-db-tooling.sh
docs/Engineering-OS/ROAS_UAT_RUNBOOK.md|scripts/verify-db-tooling.sh
supabase/migrations/*|scripts/verify-db-tooling.sh
packages/shared-types/src/roas-bootstrap*|scripts/verify-roas4.sh
services/api/src/admin/publish-roas-curriculum.ts|scripts/verify-roas4.sh
docs/Engineering-OS/ROAS_UAT_RUNBOOK.md|scripts/verify-roas4.sh
scripts/verify-roas4.sh|scripts/verify-roas4.sh
apps/web/src/learning/roas-course-presentation.ts|scripts/verify-roas4.sh
apps/web/src/learning/*|scripts/verify-roas3.sh
apps/web/src/auth/AuthenticatedApp.tsx|scripts/verify-roas3.sh
scripts/verify-roas3.sh|scripts/verify-roas3.sh
apps/web/src/uat/*|scripts/verify-wpi.sh
apps/web/src/App.tsx|scripts/verify-wpi.sh
content/fixtures/*|scripts/verify-wpi.sh
docs/Engineering-OS/WP_I_UAT_RUNBOOK.md|scripts/verify-wpi.sh
apps/web/src/learning/MissionInstruction.tsx|scripts/verify-wpi.sh
apps/web/src/learning/InteractionSurface.tsx|scripts/verify-wpi.sh
apps/web/src/learning/PacketJourney.tsx|scripts/verify-wpi.sh
apps/web/src/learning/topology-layout*|scripts/verify-wpi.sh
apps/web/src/learning/TopologyView.tsx|scripts/verify-wpi.sh
apps/web/src/learning/DeviceNode.tsx|scripts/verify-wpi.sh
apps/web/src/learning/packet-journey-presentation*|scripts/verify-wpi.sh
apps/web/public/*|scripts/verify-wpi.sh
apps/web/vite.config.ts|scripts/verify-wpi.sh
apps/web/src/styles.css|scripts/verify-wpi.sh
packages/shared-types/src/mission-instruction*|scripts/verify-wpi.sh
scripts/verify-wpi.sh|scripts/verify-wpi.sh
content/curriculum/*|scripts/verify-wpj.sh
scripts/lib/wpj-*|scripts/verify-wpj.sh
docs/Engineering-OS/WP_J_CROSS_COURSE_TRANSITION.md|scripts/verify-wpj.sh
services/api/src/networking-foundations*|scripts/verify-wpj.sh
packages/shared-types/src/roas-curriculum*|scripts/verify-wpj.sh
packages/shared-types/src/curriculum-document*|scripts/verify-wpj.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj.sh
scripts/verify-wpj.sh|scripts/verify-wpj.sh
apps/web/src/learning/curriculum-course-projection*|scripts/verify-wpj15.sh
apps/web/src/learning/LearningView.tsx|scripts/verify-wpj15.sh
apps/web/src/learning/roas-course-content*|scripts/verify-wpj15.sh
apps/web/src/learning/learning-service.ts|scripts/verify-wpj15.sh
packages/shared-types/src/curriculum.ts|scripts/verify-wpj15.sh
scripts/verify-wpj15.sh|scripts/verify-wpj15.sh
content/curriculum/*|scripts/verify-wpj-m1.sh
apps/web/src/uat/*|scripts/verify-wpj-m1.sh
services/api/src/networking-foundations-module1*|scripts/verify-wpj-m1.sh
docs/Engineering-OS/WP_J_MODULE_1_UAT_RUNBOOK.md|scripts/verify-wpj-m1.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m1.sh
packages/shared-types/src/instruction-interaction*|scripts/verify-wpj-m1.sh
packages/shared-types/src/observation-model*|scripts/verify-wpj-m1.sh
apps/web/src/learning/DeviceSymbol.tsx|scripts/verify-wpj-m1.sh
apps/web/src/learning/DeviceNode.tsx|scripts/verify-wpj-m1.sh
apps/web/src/learning/TopologyView.tsx|scripts/verify-wpj-m1.sh
apps/web/src/learning/topology-layout*|scripts/verify-wpj-m1.sh
apps/web/src/styles.css|scripts/verify-wpj-m1.sh
apps/web/src/learning/packet-journey-presentation*|scripts/verify-wpj-m1.sh
apps/web/src/learning/near-transfer-presentation*|scripts/verify-wpj-m1.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m1.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m1.sh
scripts/verify-wpj-m1.sh|scripts/verify-wpj-m1.sh
content/curriculum/*|scripts/verify-wpj-m2.sh
services/api/src/networking-foundations-module1*|scripts/verify-wpj-m2.sh
docs/Engineering-OS/WP_J_MISSION_2_UAT_RUNBOOK.md|scripts/verify-wpj-m2.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m2.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m2.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m2.sh
packages/shared-types/src/instruction-interaction*|scripts/verify-wpj-m2.sh
packages/shared-types/src/observation-model*|scripts/verify-wpj-m2.sh
packages/shared-types/src/mission-steps*|scripts/verify-wpj-m2.sh
apps/web/src/learning/packet-journey-presentation*|scripts/verify-wpj-m2.sh
apps/web/src/learning/topology-layout*|scripts/verify-wpj-m2.sh
apps/web/src/learning/near-transfer-presentation*|scripts/verify-wpj-m2.sh
apps/web/src/learning/MissionInstruction.tsx|scripts/verify-wpj-m2.sh
# The m2 gate RUNS this suite and asserts the file exists, so a change to it
# that the gate would catch has to wake the gate. It did not: the rule above
# matches `networking-foundations-module1*` only, and the course-wide suite
# selected verify-wpj.sh alone. A gate that checks a file it is not woken for
# is a gate that passes forever.
services/api/src/networking-foundations.test.ts|scripts/verify-wpj-m2.sh
# The projection that carries BOTH contracts this mission introduced —
# `requiredForProgression` and per-stage `alsoAtNodeIds` — reached no WP-J
# gate at all.
packages/shared-types/src/mission-instruction*|scripts/verify-wpj-m2.sh
# Mission 2 authors a second near-transfer topology, and the gate runs the
# near-transfer suite.
packages/shared-types/src/near-transfer*|scripts/verify-wpj-m2.sh
# The view that holds the required-instruction state Mission 2's activity
# reports. The fail-open window this repair closed lived here, not in the
# lesson.
apps/web/src/learning/LearningView.tsx|scripts/verify-wpj-m2.sh
apps/web/src/learning/mission-instruction-presentation*|scripts/verify-wpj-m2.sh
# The DOM focus behaviour suite, and the config that gives it an environment.
# Both are Mission 2's: the suite exists because a mutation on this mission's
# repair went unnoticed, and a change to either could silence it.
apps/web/src/learning/mission-instruction-focus*|scripts/verify-wpj-m2.sh
apps/web/vite.config.ts|scripts/verify-wpj-m2.sh
apps/web/package.json|scripts/verify-wpj-m2.sh
package-lock.json|scripts/verify-dependency-policy.sh
package-lock.json|scripts/verify-wpj-m2.sh
scripts/lib/authorized-dependency.sh|scripts/verify-dependency-policy.sh
scripts/lib/authorized-dependency.sh|scripts/verify-wpj-m2.sh
scripts/lib/authorized-dependency-policy.mjs|scripts/verify-dependency-policy.sh
scripts/lib/authorized-dependency-policy.mjs|scripts/verify-wpj-m2.sh
scripts/verify-dependency-policy.sh|scripts/verify-dependency-policy.sh
packages/shared-types/package.json|scripts/verify-dependency-policy.sh
services/api/package.json|scripts/verify-dependency-policy.sh
package.json|scripts/verify-dependency-policy.sh
apps/web/package.json|scripts/verify-dependency-policy.sh
# The development-only UAT harness mounts the same lesson component the learner
# view does, and the Mission 2 repair changed what it must pass down. It is
# already mapped to verify-wpi.sh, which owns the harness itself; this maps it
# additionally to the gate that owns what it now renders.
apps/web/src/uat/*|scripts/verify-wpj-m2.sh
# The Mission 4 continuity suite this gate now runs. A change that reintroduced
# the substitute vocabulary would otherwise break a suite the Mission 2 gate
# executes without ever waking the Mission 2 gate.
services/api/src/networking-foundations-mission4*|scripts/verify-wpj-m2.sh
# The journey's own renderer and the surface that mounts it. Mission 2's
# Finish control, its reply orientation and its quick-reference rows are drawn
# here, and a change to any of them can break a rule this gate asserts.
apps/web/src/learning/PacketJourney.tsx|scripts/verify-wpj-m2.sh
apps/web/src/learning/InteractionSurface.tsx|scripts/verify-wpj-m2.sh
# The near-transfer step's own component. Mission 2 authors the second
# near-transfer check in the course, and its Finish control now hands focus on.
apps/web/src/learning/NearTransferStep.tsx|scripts/verify-wpj-m2.sh
# The stylesheet carries the participation treatment and the reveal focus ring
# this mission's repairs added.
apps/web/src/styles.css|scripts/verify-wpj-m2.sh
# The parser that accepts Mission 2's authored stage traffic, simultaneous
# participants and progression gate. A key removed from its whitelist would
# reject the mission at publication.
packages/shared-types/src/curriculum-document*|scripts/verify-wpj-m2.sh
# The two contracts this mission's repairs amended.
docs/Feature-Registry/Curriculum-Engine/CURR-010_MISSION_INSTRUCTIONAL_STEPS.md|scripts/verify-wpj-m2.sh
docs/Feature-Registry/Curriculum-Engine/CURR-011_INSTRUCTIONAL_INTERACTION_CONTRACT.md|scripts/verify-wpj-m2.sh
scripts/verify-wpj-m2.sh|scripts/verify-wpj-m2.sh
packages/shared-types/src/near-transfer*|scripts/verify-nt1.sh
apps/web/src/learning/near-transfer-presentation*|scripts/verify-nt1.sh
apps/web/src/learning/NearTransferStep.tsx|scripts/verify-nt1.sh
apps/web/src/learning/MissionInstruction.tsx|scripts/verify-nt1.sh
packages/shared-types/src/mission-steps*|scripts/verify-nt1.sh
packages/shared-types/src/mission-instruction*|scripts/verify-nt1.sh
packages/shared-types/src/curriculum-document*|scripts/verify-nt1.sh
packages/shared-types/src/index.ts|scripts/verify-nt1.sh
services/api/src/curriculum-document*|scripts/verify-nt1.sh
content/curriculum/*|scripts/verify-nt1.sh
packages/shared-types/src/observation-model*|scripts/verify-nt1.sh
apps/web/src/learning/topology-layout*|scripts/verify-nt1.sh
apps/web/src/learning/TopologyView.tsx|scripts/verify-nt1.sh
apps/web/src/learning/roas-course-presentation*|scripts/verify-nt1.sh
apps/web/src/learning/LearningView.tsx|scripts/verify-nt1.sh
scripts/verify-nt1.sh|scripts/verify-nt1.sh
docs/Feature-Registry/Curriculum-Engine/CURR-012*|scripts/verify-curriculum-completion.sh
docs/Feature-Registry/Lab-Engine/LAB-012*|scripts/verify-curriculum-completion.sh
content/curriculum/*|scripts/verify-wpj-m3.sh
services/api/src/networking-foundations-mission3*|scripts/verify-wpj-m3.sh
docs/Engineering-OS/WP_J_MISSION_3_UAT_RUNBOOK.md|scripts/verify-wpj-m3.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m3.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m3.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m3.sh
scripts/verify-wpj-m3.sh|scripts/verify-wpj-m3.sh
content/curriculum/*|scripts/verify-wpj-m4.sh
services/api/src/networking-foundations-mission4*|scripts/verify-wpj-m4.sh
docs/Engineering-OS/WP_J_MISSION_4_UAT_RUNBOOK.md|scripts/verify-wpj-m4.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m4.sh
apps/web/src/learning/packet-journey-presentation*|scripts/verify-wpj-m4.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m4.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m4.sh
scripts/verify-wpj-m4.sh|scripts/verify-wpj-m4.sh
content/curriculum/*|scripts/verify-wpj-m5.sh
services/api/src/networking-foundations-mission5*|scripts/verify-wpj-m5.sh
docs/Engineering-OS/WP_J_MISSION_5_UAT_RUNBOOK.md|scripts/verify-wpj-m5.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m5.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m5.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m5.sh
scripts/verify-wpj-m5.sh|scripts/verify-wpj-m5.sh
content/curriculum/*|scripts/verify-wpj-m6.sh
services/api/src/networking-foundations-mission6*|scripts/verify-wpj-m6.sh
docs/Engineering-OS/WP_J_MISSION_6_UAT_RUNBOOK.md|scripts/verify-wpj-m6.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m6.sh
apps/web/src/learning/packet-journey-presentation*|scripts/verify-wpj-m6.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m6.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m6.sh
scripts/verify-wpj-m6.sh|scripts/verify-wpj-m6.sh
content/curriculum/*|scripts/verify-wpj-m7.sh
services/api/src/networking-foundations-mission7*|scripts/verify-wpj-m7.sh
docs/Engineering-OS/WP_J_MISSION_7_UAT_RUNBOOK.md|scripts/verify-wpj-m7.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m7.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m7.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m7.sh
scripts/verify-wpj-m7.sh|scripts/verify-wpj-m7.sh
content/curriculum/*|scripts/verify-wpj-m8.sh
services/api/src/networking-foundations-mission8*|scripts/verify-wpj-m8.sh
docs/Engineering-OS/WP_J_MISSION_8_UAT_RUNBOOK.md|scripts/verify-wpj-m8.sh
scripts/lib/wpj-concept-ledger.txt|scripts/verify-wpj-m8.sh
scripts/lib/wpj-missions.txt|scripts/verify-wpj-m8.sh
scripts/lib/wpj-mission-authority.sh|scripts/verify-wpj-m8.sh
apps/web/src/learning/packet-journey-presentation*|scripts/verify-wpj-m8.sh
docs/Project/DECISION_LEDGER.md|scripts/verify-wpj-m8.sh
scripts/verify-wpj-m8.sh|scripts/verify-wpj-m8.sh
apps/web/src/uat/*|scripts/verify-wpj15.sh
content/curriculum/*|scripts/verify-wpi.sh
content/curriculum/*|scripts/verify-wph.sh
apps/web/src/learning/topology-layout*|scripts/verify-wph.sh
apps/web/src/learning/TopologyView.tsx|scripts/verify-wph.sh
apps/web/src/learning/DeviceNode.tsx|scripts/verify-wph.sh
packages/shared-types/src/instruction-interaction*|scripts/verify-wph.sh
packages/shared-types/src/observation-model*|scripts/verify-wph.sh
packages/shared-types/src/mission-steps*|scripts/verify-wph.sh
apps/web/src/learning/packet-journey-presentation*|scripts/verify-wph.sh
apps/web/src/learning/PacketJourney.tsx|scripts/verify-wph.sh
apps/web/src/learning/InteractionSurface.tsx|scripts/verify-wph.sh
scripts/verify-wph.sh|scripts/verify-wph.sh
packages/shared-types/src/curriculum-document*|scripts/verify-wpg.sh
services/api/src/curriculum-reconciliation*|scripts/verify-wpg.sh
services/api/src/curriculum-import*|scripts/verify-wpg.sh
services/api/src/curriculum-current-state*|scripts/verify-wpg.sh
services/api/src/curriculum-content-path*|scripts/verify-wpg.sh
services/api/src/curriculum-command-args*|scripts/verify-wpg.sh
services/api/src/curriculum-quality*|scripts/verify-wpg.sh
services/api/src/admin/publish-curriculum.ts|scripts/verify-wpg.sh
content/*|scripts/verify-wpg.sh
scripts/verify-wpg.sh|scripts/verify-wpg.sh
apps/web/src/learning/MissionInstruction.tsx|scripts/verify-wpf.sh
apps/web/src/learning/mission-instruction-presentation*|scripts/verify-wpf.sh
apps/web/src/learning/learning-service.ts|scripts/verify-wpf.sh
apps/web/src/learning/LearningView.tsx|scripts/verify-wpf.sh
apps/web/src/styles.css|scripts/verify-wpf.sh
packages/shared-types/src/mission-instruction*|scripts/verify-wpf.sh
packages/shared-types/src/mission-steps*|scripts/verify-wpf.sh
services/api/src/curriculum.ts|scripts/verify-wpf.sh
services/api/src/server.ts|scripts/verify-wpf.sh
scripts/verify-wpf.sh|scripts/verify-wpf.sh
packages/shared-types/src/roas-curriculum*|scripts/verify-roas2.sh
scripts/verify-roas2.sh|scripts/verify-roas2.sh
services/api/src/lab-*|scripts/verify-roas1.sh
services/api/src/lab-admin*|scripts/verify-roas1.sh
packages/shared-types/src/lab*|scripts/verify-roas1.sh
scripts/verify-roas1.sh|scripts/verify-roas1.sh
scripts/verify-lab-engine-completion.sh|scripts/verify-roas1.sh
scripts/verify-wave6*.sh|scripts/verify-roas1.sh
scripts/ci-toolchain.sh|scripts/verify-roas1.sh
scripts/verify-certificate-engine-completion.sh|scripts/verify-certificate-engine-completion.sh
scripts/verify-wave8.sh|scripts/verify-certificate-engine-completion.sh
scripts/verify-wave7.sh|scripts/verify-certificate-engine-completion.sh
scripts/verify-wave9.sh|scripts/verify-search-engine-completion.sh
scripts/verify-search-engine-completion.sh|scripts/verify-search-engine-completion.sh
services/api/src/curriculum-search*|scripts/verify-search-engine-completion.sh
services/api/src/search-*|scripts/verify-search-engine-completion.sh
services/api/src/note-retrieval*|scripts/verify-search-engine-completion.sh
packages/shared-types/src/search-*|scripts/verify-search-engine-completion.sh
packages/shared-types/src/curriculum-search*|scripts/verify-search-engine-completion.sh
apps/web/src/search/*|scripts/verify-search-engine-completion.sh
docs/Engineering-OS/SEARCH_FOUNDER_UAT_CHECKLIST.md|scripts/verify-search-engine-completion.sh
docs/Engineering-OS/SEARCH_RENDERED_REVIEW_RECORD.md|scripts/verify-search-engine-completion.sh
services/api/src/certificate-*|scripts/verify-certificate-engine-completion.sh
packages/shared-types/src/certificate-*|scripts/verify-certificate-engine-completion.sh
apps/web/src/certificates/*|scripts/verify-certificate-engine-completion.sh
services/api/src/evidence*|scripts/verify-evidence-engine-completion.sh
packages/shared-types/src/*evidence*|scripts/verify-evidence-engine-completion.sh
apps/web/src/evidence/*|scripts/verify-evidence-engine-completion.sh
services/api/src/note*|scripts/verify-knowledge-notes-completion.sh
packages/shared-types/src/note*|scripts/verify-knowledge-notes-completion.sh
services/api/src/assessment*|scripts/verify-assessment-completion.sh
services/api/src/readiness*|scripts/verify-assessment-completion.sh
services/api/src/learning-*|scripts/verify-learning-completion.sh
services/api/src/competency*|scripts/verify-learning-completion.sh
packages/shared-types/src/learning*|scripts/verify-learning-completion.sh
services/api/src/curriculum.ts|scripts/verify-curriculum-completion.sh
services/api/src/curriculum-admin*|scripts/verify-curriculum-completion.sh
packages/shared-types/src/curriculum.ts|scripts/verify-curriculum-completion.sh
services/api/src/auth-context*|scripts/verify-authentication-completion.sh
services/api/src/authorization*|scripts/verify-authentication-completion.sh
apps/web/src/auth/*|scripts/verify-authentication-completion.sh
# MISSION-STEP-VOCAB-1 owns BOTH sides of a contract that is defined twice.
#
# This is the rule the header's own warning is about, in its sharpest form. The
# mission step vocabulary lives in a SQL CHECK and in MISSION_STEP_TYPES, and no
# existing gate was woken for both: `supabase/migrations/*` selects four
# database gates that never read the shared types, and
# `packages/shared-types/src/mission-steps*` selects four product gates that
# never read the migrations. So `near_transfer` was added to one side, omitted
# from the other, and every gate stayed green until a Founder publication failed
# mid-course.
#
# `curriculum-admin.ts` is mapped because it is the writer that joins the two:
# it validates against the TypeScript vocabulary and then writes the value into
# the constrained column.
supabase/migrations/*|scripts/verify-mission-step-vocabulary.sh
packages/shared-types/src/mission-steps*|scripts/verify-mission-step-vocabulary.sh
services/api/src/mission-step-vocabulary*|scripts/verify-mission-step-vocabulary.sh
services/api/src/curriculum-admin*|scripts/verify-mission-step-vocabulary.sh
scripts/verify-mission-step-vocabulary.sh|scripts/verify-mission-step-vocabulary.sh
# CI-MIGRATION-GATE-1 — the five gates that assert migration integrity read a
# shared helper and a frozen baseline, and were woken for neither.
#
# That is this table's own warning in its worst form: the helper decides
# whether five gates pass, and an edit to it would have merged unchecked.
# `scripts/migration-baseline.sha256` previously woke only the service-role
# gate, while four other gates verified against it.
scripts/lib/migration-floor.sh|scripts/verify-wpj-m1.sh
scripts/lib/migration-floor.sh|scripts/verify-wpj.sh
scripts/lib/migration-floor.sh|scripts/verify-wpi.sh
scripts/lib/migration-floor.sh|scripts/verify-wpj15.sh
scripts/lib/migration-floor.sh|scripts/verify-wph.sh
scripts/migration-baseline.sha256|scripts/verify-wpj-m1.sh
scripts/migration-baseline.sha256|scripts/verify-wpj.sh
scripts/migration-baseline.sha256|scripts/verify-wpi.sh
scripts/migration-baseline.sha256|scripts/verify-wpj15.sh
scripts/migration-baseline.sha256|scripts/verify-wph.sh
.claude/settings.json|scripts/verify-autonomy.sh
CLAUDE.md|scripts/verify-autonomy.sh
docs/Engineering-OS/Engineering-OS.md|scripts/verify-autonomy.sh
package.json|scripts/verify-autonomy.sh
scripts/run-gate.sh|scripts/verify-autonomy.sh
scripts/verify-autonomy.sh|scripts/verify-autonomy.sh
scripts/ci-select-gates.sh|scripts/verify-autonomy.sh
RULES
)

selected=""

# Arguments win when present; otherwise stdin is read exactly as before. Both
# feed the identical matching loop below, so the two entry points cannot drift.
read_changed_paths() {
  if [ "$#" -gt 0 ]; then
    printf '%s\n' "$@"
  else
    cat
  fi
}

while IFS= read -r changed; do
  [ -n "$changed" ] || continue

  while IFS='|' read -r glob gate; do
    [ -n "$glob" ] || continue
    # shellcheck disable=SC2254 — the glob is intentionally unquoted here.
    case "$changed" in
      $glob)
        case " $selected " in
          *" $gate "*) ;;
          *) selected="$selected $gate" ;;
        esac
        ;;
    esac
  done <<<"$RULES"
done < <(read_changed_paths "$@")

for gate in $selected; do
  # A gate that has been removed must not silently stop running.
  if [ ! -f "$gate" ]; then
    echo "ci-select-gates: mapped gate is missing: $gate" >&2
    exit 1
  fi
  echo "$gate"
done
