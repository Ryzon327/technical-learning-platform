import { readFileSync } from "node:fs";
import {
  BootstrapEnvironmentError,
  isPublishableDocumentKind,
  parseCurriculumDocument,
  resolveBootstrapEnvironment,
  type CurriculumDocument
} from "@tlp/shared-types";
import { readCurrentCurriculumState } from "../curriculum-current-state";
import { importCurriculumDocument } from "../curriculum-import";
import { resolveProductionContentPath } from "../curriculum-content-path";
import { parseCommandArguments } from "../curriculum-command-args";
import {
  planConflictsByKind,
  type CurriculumReconciliationPlan
} from "../curriculum-reconciliation";

/**
 * WP-G / DEC-056 — import a repository-authored curriculum document.
 *
 * ## What this is
 *
 * The operator interface, and nothing else. It resolves argv, checks the path,
 * reads the file, guards the environment and prints; every decision about the
 * database belongs to `curriculum-import.ts`, which is testable without one.
 *
 * It holds no course content. Every value written comes from the document, and
 * `scripts/verify-wpg.sh` fails if authored text appears in this file.
 *
 * It replaces nothing. `publish-roas-curriculum.ts` remains the ROAS command and
 * is untouched; migrating that course to JSON is deferred.
 *
 * ## Two acts, not one
 *
 * ROAS-4 has a single write mode, so confirming it necessarily publishes. WP-G
 * keeps that confirmation contract exactly and separates what a confirmed run
 * does:
 *
 *   (default)   reconcile — write and validate DRAFT curriculum
 *   --publish   also perform the lifecycle transition
 *
 * Publishing is therefore something an operator asks for, not the automatic
 * consequence of an import having succeeded.
 *
 * ## Order of operations
 *
 *   1. resolve and check the path        no file is read until it is allowed
 *   2. follow it on disk                 a symlink cannot leave the content root
 *   3. parse and validate the document   no database is touched until it is valid
 *   4. refuse a non-production document  a fixture never reaches the catalog
 *   5. resolve the environment           dry run unless explicitly confirmed
 *   6. read current state                read-only
 *   7. plan, gate, and only then write   see curriculum-import.ts
 *
 * Steps 1-5 touch no database at all.
 *
 * ## Not atomic, and not pretending to be
 *
 * The REST admin layer offers no transaction spanning an import. Everything
 * knowable is checked before the first write; that is mitigation, not a
 * guarantee. A mid-import failure leaves DRAFTS — publication is separate and
 * does not run — so the result is inspectable and re-importable rather than
 * half-published. Re-running converges. No rollback is simulated.
 */

function printPlan(plan: CurriculumReconciliationPlan): void {
  console.log("");
  console.log("Plan:");

  const line = (action: string, what: string) =>
    console.log(`  ${action.padEnd(20)} ${what}`);

  for (const node of plan.nodes) line(node.action, `${node.kind} ${node.stableId}`);
  for (const entry of plan.missionContent) {
    line(entry.action, `content ${entry.missionStableId}`);
  }
  for (const entry of plan.missionCompetencyLinks) {
    line(entry.action, `competency links ${entry.missionStableId}`);
  }
  line(plan.competencyPrerequisites.action, "competency prerequisites");
  for (const entry of plan.prerequisiteRules) {
    line(
      entry.action,
      `prerequisite rule ${entry.targetStableId} <- ${entry.requirementStableId}`
    );
  }
}

/**
 * Report why an import is refused, distinguishing the two reasons.
 *
 * They stop the run for different causes and are fixed differently. Telling an
 * author that published curriculum changed when they had actually deleted a
 * step from a draft would send them looking for a change they never made.
 */
function printRefusal(plan: CurriculumReconciliationPlan): void {
  const published = planConflictsByKind(plan, "published_content");
  const removals = planConflictsByKind(plan, "unsupported_removal");

  if (published.length > 0) {
    console.error("");
    console.error("Published curriculum would change:");
    for (const conflict of published) console.error(`  ${conflict.message}`);
    console.error("");
    console.error(
      "  Published curriculum is not revised in place, and this command does not"
    );
    console.error(
      "  create a new version. Re-versioning is a separate approved change."
    );
  }

  if (removals.length > 0) {
    console.error("");
    console.error("The import would need to remove existing curriculum:");
    for (const conflict of removals) console.error(`  ${conflict.message}`);
    console.error("");
    console.error(
      "  This command only creates and updates. Restore the entries in the"
    );
    console.error("  document, or request a reviewed removal capability.");
  }
}

/** Read and validate the document, or explain why it cannot be used. */
function loadDocument(
  documentPath: string
):
  | { readonly ok: true; readonly document: CurriculumDocument; readonly shown: string }
  | { readonly ok: false; readonly exitCode: number } {
  const decision = resolveProductionContentPath(process.cwd(), documentPath);

  if (!decision.allowed) {
    console.error(decision.reason);
    return { ok: false, exitCode: 2 };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(decision.absolutePath, "utf8"));
  } catch (caught) {
    console.error(
      `Could not read "${decision.relativePath}" as JSON: ${
        caught instanceof Error ? caught.message : "unknown error"
      }`
    );
    return { ok: false, exitCode: 2 };
  }

  const parsed = parseCurriculumDocument(raw);

  if (!parsed.valid) {
    console.error(
      `"${decision.relativePath}" is not a valid curriculum document:`
    );
    for (const error of parsed.errors) console.error(`  ${error}`);
    return { ok: false, exitCode: 1 };
  }

  // The third fixture refusal, independent of where the file sits. A fixture
  // copied into the production directory is still a fixture.
  if (!isPublishableDocumentKind(parsed.document.documentKind)) {
    console.error(
      `"${decision.relativePath}" declares documentKind "${parsed.document.documentKind}" and is not publishable curriculum.`
    );
    return { ok: false, exitCode: 2 };
  }

  return { ok: true, document: parsed.document, shown: decision.relativePath };
}

async function main(): Promise<void> {
  const parsedArgs = parseCommandArguments(process.argv.slice(2));

  if (!parsedArgs.ok) {
    console.error(parsedArgs.reason);
    process.exitCode = 2;
    return;
  }

  const { documentPath, publish } = parsedArgs;
  const loaded = loadDocument(documentPath);
  if (!loaded.ok) {
    process.exitCode = loaded.exitCode;
    return;
  }

  console.log(`Curriculum document: ${loaded.shown}`);
  console.log(`Course: ${loaded.document.course.stableId}`);
  console.log(publish ? "Requested: reconcile and publish" : "Requested: reconcile");

  let environment;
  try {
    environment = resolveBootstrapEnvironment({
      ...(process.env.APP_ENV === undefined
        ? {}
        : { appEnv: process.env.APP_ENV }),
      ...(process.env.SUPABASE_URL === undefined
        ? {}
        : { supabaseUrl: process.env.SUPABASE_URL }),
      ...(process.env.TLP_UAT_BOOTSTRAP_CONFIRM === undefined
        ? {}
        : { confirmation: process.env.TLP_UAT_BOOTSTRAP_CONFIRM }),
      ...(process.env.SUPABASE_SERVICE_ROLE_KEY === undefined
        ? {}
        : { serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY }),
      ...(process.env.TLP_UAT_BOOTSTRAP_ACTOR_ID === undefined
        ? {}
        : { actorUserId: process.env.TLP_UAT_BOOTSTRAP_ACTOR_ID })
    });
  } catch (caught) {
    if (caught instanceof BootstrapEnvironmentError) {
      console.error(`REFUSED: ${caught.message}`);
      process.exitCode = 2;
      return;
    }
    throw caught;
  }

  const current = await readCurrentCurriculumState(loaded.document);

  const outcome = await importCurriculumDocument({
    document: loaded.document,
    current,
    mode: environment.mode === "execute" ? "execute" : "dry_run",
    publish,
    ...(environment.actorUserId === undefined
      ? {}
      : { actorUserId: environment.actorUserId })
  });

  printPlan(outcome.plan);

  if (outcome.status === "refused_unsafe") {
    console.error("");
    console.error("Refusing to import. Nothing was written.");
    printRefusal(outcome.plan);
    process.exitCode = 1;
    return;
  }

  if (outcome.status === "refused_review") {
    console.error("");
    for (const message of outcome.messages) console.error(message);
    process.exitCode = 1;
    return;
  }

  console.log("");
  if (outcome.writes.length > 0) {
    console.log("Wrote:");
    for (const write of outcome.writes) console.log(`  ${write}`);
    console.log("");
  }

  if (environment.mode === "dry_run") {
    console.log(`DRY RUN — ${environment.reason}`);
  }

  for (const message of outcome.messages) console.log(message);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  console.error("");
  console.error(
    "The import stopped partway. Any rows already written remain as DRAFTS for"
  );
  console.error(
    "inspection: publication is a separate step and does not run on failure."
  );
  console.error(
    "Re-running is safe — every write is keyed by stable id and converges."
  );
  process.exitCode = 1;
});
