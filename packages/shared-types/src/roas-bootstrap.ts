import {
  ROAS_COMPETENCIES,
  ROAS_COMPETENCY_PREREQUISITES,
  ROAS_COURSE,
  ROAS_LEARNING_PATH_STABLE_ID,
  ROAS_MISSIONS,
  ROAS_MODULES,
  buildRoasAuthoringPlan,
  type RoasAuthoringOperation,
  type RoasAuthoringOperationKind
} from "./roas-curriculum";

/**
 * ROAS-4 — the derived plan for publishing the authored curriculum.
 *
 * ## What this is, and what it must never become
 *
 * ROAS-2 authored the Router-on-a-Stick course and derived
 * `buildRoasAuthoringPlan()`: the ordered list of existing admin operations
 * that would author it. That plan names *what to do*. This module produces the
 * *arguments* — the exact nodes, ordering, effort metadata and links a
 * publisher would pass to `curriculum-admin.ts`.
 *
 * Every value is read from the ROAS-2 constants. There is no course title, no
 * module description, no mission brief and no competency text written here, and
 * `scripts/verify-roas4.sh` fails if any authored string appears in this file.
 * A seed script carrying its own copy of the curriculum would be a second
 * truth that drifts silently from the reviewed content — which is the single
 * thing this package most needs not to do.
 *
 * ## Why the plan stops before the lab
 *
 * `buildRoasAuthoringPlan()` ends with four lab operations. No provider
 * implements the deterministic probes, so publishing a lab definition would
 * create a published record for something that cannot run. The curriculum
 * phase is therefore selected *from the authored plan* by operation kind —
 * derived, not a hardcoded slice — and the lab operations are reported as
 * deliberately deferred rather than silently dropped.
 *
 * ## This module performs no I/O
 *
 * It imports one sibling and computes data structures. It cannot reach
 * Supabase, the network or the environment; execution lives in
 * `services/api/src/admin/publish-roas-curriculum.ts`, and the environment
 * decision below is a pure function so it can be tested without a real project.
 */

/**
 * The authoring-plan kinds that belong to the curriculum phase.
 *
 * Held as data so the split is auditable, and so a future plan addition has to
 * be classified deliberately rather than silently landing in one phase.
 */
export const ROAS_CURRICULUM_PHASE_KINDS: readonly RoasAuthoringOperationKind[] =
  [
    "create_learning_path",
    "create_course",
    "create_module",
    "create_mission",
    "create_competency",
    "add_competency_prerequisite",
    "link_mission_competency",
    "validate_learning_path",
    "publish_learning_path"
  ];

/** The kinds deferred because no lab provider implements the probes. */
export const ROAS_LAB_PHASE_KINDS: readonly RoasAuthoringOperationKind[] = [
  "create_lab_definition",
  "add_lab_validation_checks",
  "publish_lab_validation_profile",
  "publish_lab_definition"
];

/** The curriculum-phase operations, in the order ROAS-2 derived them. */
export function selectCurriculumPhaseOperations(
  plan: RoasAuthoringOperation[] = buildRoasAuthoringPlan()
): RoasAuthoringOperation[] {
  return plan.filter((operation) =>
    ROAS_CURRICULUM_PHASE_KINDS.includes(operation.kind)
  );
}

/** The lab-phase operations this package deliberately does not execute. */
export function selectLabPhaseOperations(
  plan: RoasAuthoringOperation[] = buildRoasAuthoringPlan()
): RoasAuthoringOperation[] {
  return plan.filter((operation) =>
    ROAS_LAB_PHASE_KINDS.includes(operation.kind)
  );
}

/* ------------------------------------------------------------------ *
 * The publishable node plan
 * ------------------------------------------------------------------ */

export interface BootstrapLearningPath {
  stableId: string;
  title: string;
  description: string;
  estimatedMinutes: number;
}

export interface BootstrapCourse {
  stableId: string;
  title: string;
  description: string;
  position: number;
  estimatedMinutes: number;
}

export interface BootstrapModule {
  stableId: string;
  title: string;
  description: string;
  position: number;
  estimatedMinutes: number;
}

export interface BootstrapMission {
  stableId: string;
  moduleStableId: string;
  title: string;
  /** The authored brief, stored in `missions.description`. */
  description: string;
  position: number;
  estimatedMinutes: number;
}

export interface BootstrapCompetency {
  stableId: string;
  title: string;
  description: string;
}

export interface BootstrapCompetencyPrerequisite {
  competencyStableId: string;
  prerequisiteCompetencyStableId: string;
}

export interface BootstrapMissionCompetencyLink {
  missionStableId: string;
  competencyStableId: string;
  required: boolean;
}

export interface RoasCurriculumBootstrapPlan {
  learningPath: BootstrapLearningPath;
  course: BootstrapCourse;
  modules: BootstrapModule[];
  missions: BootstrapMission[];
  competencies: BootstrapCompetency[];
  competencyPrerequisites: BootstrapCompetencyPrerequisite[];
  missionCompetencyLinks: BootstrapMissionCompetencyLink[];
  /** The ROAS-2 operations this plan covers, for evidence in the output. */
  operations: RoasAuthoringOperation[];
  /** The ROAS-2 operations deliberately not covered. */
  deferredOperations: RoasAuthoringOperation[];
}

/**
 * The learning path the course attaches to.
 *
 * ROAS-2 authored the course's `learningPathStableId` but no learning-path node
 * of its own — the path is the container DEC-049 requires and the course
 * declares membership of. Its title and description are the only strings this
 * module originates, and they describe the *container*, not the course: no
 * authored curriculum text is restated.
 */
const CONNECTED_LEARNING_PATH_TITLE = "Connected Learning";
const CONNECTED_LEARNING_PATH_DESCRIPTION =
  "The connected learning path. Competencies demonstrated in one course are reused by later courses rather than duplicated.";

/**
 * Build the publishable plan from the ROAS-2 authored content.
 *
 * Ordering follows the authored `position` fields, and missions are attached to
 * modules by `moduleStableId`, exactly as the learner surface does. Estimated
 * effort is carried through because `buildLearningPathQualityReport` checks it.
 */
export function buildRoasCurriculumBootstrapPlan(): RoasCurriculumBootstrapPlan {
  const modules = [...ROAS_MODULES]
    .sort((left, right) => left.position - right.position)
    .map((module) => ({
      stableId: module.stableId,
      title: module.title,
      description: module.description,
      position: module.position,
      estimatedMinutes: module.estimatedMinutes
    }));

  const missions = [...ROAS_MISSIONS]
    .sort((left, right) => left.position - right.position)
    .map((mission) => ({
      stableId: mission.stableId,
      moduleStableId: mission.moduleStableId,
      title: mission.title,
      description: mission.brief,
      position: mission.position,
      estimatedMinutes: mission.estimatedMinutes
    }));

  const missionCompetencyLinks = ROAS_MISSIONS.flatMap((mission) =>
    mission.competencies.map((link) => ({
      missionStableId: mission.stableId,
      competencyStableId: link.competencyStableId,
      required: link.required
    }))
  );

  return {
    learningPath: {
      stableId: ROAS_LEARNING_PATH_STABLE_ID,
      title: CONNECTED_LEARNING_PATH_TITLE,
      description: CONNECTED_LEARNING_PATH_DESCRIPTION,
      estimatedMinutes: ROAS_COURSE.estimatedMinutes
    },
    course: {
      stableId: ROAS_COURSE.stableId,
      title: ROAS_COURSE.title,
      description: ROAS_COURSE.description,
      position: ROAS_COURSE.position,
      estimatedMinutes: ROAS_COURSE.estimatedMinutes
    },
    modules,
    missions,
    competencies: ROAS_COMPETENCIES.map((competency) => ({
      stableId: competency.stableId,
      title: competency.title,
      description: competency.description
    })),
    competencyPrerequisites: ROAS_COMPETENCY_PREREQUISITES.map((edge) => ({
      competencyStableId: edge.competencyStableId,
      prerequisiteCompetencyStableId: edge.prerequisiteCompetencyStableId
    })),
    missionCompetencyLinks,
    operations: selectCurriculumPhaseOperations(),
    deferredOperations: selectLabPhaseOperations()
  };
}

/* ------------------------------------------------------------------ *
 * The environment decision
 * ------------------------------------------------------------------ */

export type BootstrapMode = "dry_run" | "execute";

/* ------------------------------------------------------------------ *
 * DB-SERVICE-ROLE-1 — service-role credential classification
 * ------------------------------------------------------------------ */

/**
 * Why a supplied credential is not usable as a service-role key.
 *
 * This is an enum and not a message on purpose. Every refusal below is rendered
 * from a fixed string, so no code path can interpolate any part of a credential
 * into output that reaches a terminal, a log or a CI transcript.
 */
export type ServiceRoleCredentialProblem =
  | "absent"
  | "publishable_key"
  | "anon_role"
  | "wrong_role"
  | "unreadable_jwt"
  | "unrecognised_format";

export type ServiceRoleCredentialVerdict =
  | { usable: true; format: "legacy_jwt" | "secret_key" }
  | { usable: false; problem: ServiceRoleCredentialProblem };

/**
 * Read the `role` claim out of a JWT payload, or null.
 *
 * **This is not authentication and proves nothing about the key.** The
 * signature is not checked and cannot be checked here — only Supabase holds the
 * secret. Its single job is to catch the operator pasting the wrong key, which
 * is the failure that actually happens: the anon key and the service-role key
 * sit next to each other on the same dashboard page.
 *
 * The decoded payload is never returned, stored or logged. Only the `role`
 * claim is read, and only to compare it.
 */
function readJwtRoleClaim(token: string): string | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const payloadSegment = segments[1];
  if (!payloadSegment) return null;

  try {
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const parsed: unknown = JSON.parse(atob(padded));

    if (parsed && typeof parsed === "object" && "role" in parsed) {
      const role = (parsed as { role: unknown }).role;
      return typeof role === "string" ? role : null;
    }

    return null;
  } catch {
    // A credential we cannot parse is not a credential we will trust.
    return null;
  }
}

/**
 * Decide whether a credential is a service-role credential.
 *
 * The previous guard proved only that `SUPABASE_SERVICE_ROLE_KEY` was
 * non-empty. That is the same presence-not-validity defect that produced the
 * `SUPABASE_URL` incident: a wrong value passes a truthiness check and then
 * fails much later, deep inside a route, as something unrecognisable.
 *
 * Supabase issues two generations of key, and both are accepted:
 *
 *  - **Legacy JWT** — the `role` claim must be exactly `service_role`. An
 *    `anon` claim is called out separately because pasting the browser key here
 *    is the single most likely mistake, and because `anon` is granted nothing by
 *    DB-RLS-1, so it would fail with the *same* 42501 this package exists to
 *    fix.
 *  - **`sb_secret_…`** — the current secret-key format, which is opaque and
 *    carries no readable claim. The prefix is the only signal available and is
 *    accepted as such; `sb_publishable_…` is its browser counterpart and is
 *    refused.
 *
 * Anything else is refused. Fail closed: an unrecognised format is not assumed
 * to be a future valid one.
 */
export function classifyServiceRoleCredential(
  rawValue: string | undefined
): ServiceRoleCredentialVerdict {
  const credential = rawValue?.trim() ?? "";

  if (credential === "") {
    return { usable: false, problem: "absent" };
  }

  if (credential.startsWith("sb_publishable_")) {
    return { usable: false, problem: "publishable_key" };
  }

  if (credential.startsWith("sb_secret_")) {
    return { usable: true, format: "secret_key" };
  }

  if (credential.split(".").length === 3) {
    const role = readJwtRoleClaim(credential);

    if (role === null) return { usable: false, problem: "unreadable_jwt" };
    if (role === "service_role") return { usable: true, format: "legacy_jwt" };
    if (role === "anon") return { usable: false, problem: "anon_role" };

    return { usable: false, problem: "wrong_role" };
  }

  return { usable: false, problem: "unrecognised_format" };
}

/**
 * The operator-facing refusal for each problem.
 *
 * Every branch is a constant. None interpolates the credential, any part of it,
 * its length, or its decoded payload.
 */
export function describeServiceRoleCredentialProblem(
  problem: ServiceRoleCredentialProblem
): string {
  switch (problem) {
    case "absent":
      return "SUPABASE_SERVICE_ROLE_KEY is not set, so the authoring operations cannot run.";
    case "publishable_key":
      return "SUPABASE_SERVICE_ROLE_KEY holds a publishable (browser) key. Publication requires the service-role secret key, which is a different value on the same Supabase API settings page.";
    case "anon_role":
      return "SUPABASE_SERVICE_ROLE_KEY holds the anon key. The anon role is granted no curriculum privileges by design, so publication would fail at the database. Use the service-role key.";
    case "wrong_role":
      return "SUPABASE_SERVICE_ROLE_KEY is a JWT whose role claim is not service_role. Refusing rather than attempting a write with an unintended identity.";
    case "unreadable_jwt":
      return "SUPABASE_SERVICE_ROLE_KEY looks like a JWT but its payload could not be read. Refusing rather than guessing what identity it carries.";
    case "unrecognised_format":
      return "SUPABASE_SERVICE_ROLE_KEY is not in a recognised Supabase key format. Expected the service-role JWT or an sb_secret_ key.";
  }
}

/* ------------------------------------------------------------------ *
 * DB-SERVICE-ROLE-1 — authoring actor identity
 * ------------------------------------------------------------------ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a value can be the `actor_user_id` of a publication event.
 *
 * `curriculum_publication_events.actor_user_id` is
 * `uuid not null references auth.users(id)`, so the audit trail requires a real
 * account. The command previously defaulted to the literal string
 * `"roas4-uat-bootstrap"`, which cannot be cast to `uuid` at all — a guaranteed
 * `22P02` at the very last step of publication, after roughly fifty writes have
 * already been committed and with no transaction to roll them back.
 *
 * Format is all that can be checked locally. Whether the account exists is
 * settled by the foreign key, and DB-SERVICE-ROLE-1's error observability is
 * what makes that answer readable when it is not.
 */
export function isValidAuthoringActorId(value: string | undefined): boolean {
  return UUID_PATTERN.test(value?.trim() ?? "");
}

/**
 * A target description safe to print.
 *
 * The command used to announce `MODE: EXECUTE — target <the full project URL>`.
 * The URL is not a secret in the way a key is, but it names the project and
 * lands in terminals, screenshots, CI transcripts and pasted bug reports for no
 * operational benefit. The operator already had to type it exactly to get here.
 *
 * What the operator actually needs is proof the guard resolved the environment
 * it thinks it did, so this returns the environment and the host's first label
 * — enough to recognise the right project, not enough to address it.
 */
export function describeBootstrapTarget(
  appEnv: string,
  supabaseUrl: string
): string {
  const trimmed = supabaseUrl.trim();

  let projectHint = "unrecognised host";
  try {
    const host = new URL(trimmed).hostname;

    if (host === "localhost" || /^[0-9.]+$/.test(host)) {
      // A local stack names no project and is safe to show in full.
      projectHint = host;
    } else {
      const firstLabel = host.split(".")[0] ?? "";
      projectHint =
        firstLabel.length > 4 ? `${firstLabel.slice(0, 4)}…` : firstLabel;
    }
  } catch {
    // Keep the fallback. A URL that will not parse is reported as such rather
    // than echoed back.
  }

  return `${appEnv} environment, project ${projectHint}`;
}

export interface BootstrapEnvironmentInput {
  /** `APP_ENV`, as the API service already interprets it. */
  appEnv?: string;
  /** `SUPABASE_URL` of the target project. */
  supabaseUrl?: string;
  /** The operator's explicit confirmation value. */
  confirmation?: string;
  /**
   * `SUPABASE_SERVICE_ROLE_KEY`, classified locally and never logged.
   *
   * It is passed in full rather than as a boolean so the role claim can be
   * checked. Nothing in this module returns, stores or renders it, and every
   * refusal message is a constant.
   */
  serviceRoleKey?: string;
  /** `TLP_UAT_BOOTSTRAP_ACTOR_ID` — the account credited in the audit trail. */
  actorUserId?: string;
}

export interface BootstrapEnvironmentDecision {
  mode: BootstrapMode;
  /** Why the decision came out this way, shown to the operator. */
  reason: string;
  /** Present only when a write is permitted. */
  targetUrl?: string;
  /** A description of the target that is safe to print. Execute mode only. */
  targetDescription?: string;
  /** The validated authoring actor. Execute mode only. */
  actorUserId?: string;
}

export class BootstrapEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BootstrapEnvironmentError";
  }
}

/**
 * The exact string an operator must supply to authorize a write.
 *
 * It is the Supabase URL itself, following the `provision-founder.ts`
 * precedent where the confirmation must equal the thing being changed. An
 * operator cannot authorize "whatever is configured" — they have to name the
 * project, so a shell with the wrong `SUPABASE_URL` exported fails instead of
 * writing somewhere unintended.
 */
export function requiredConfirmationFor(supabaseUrl: string): string {
  return supabaseUrl.trim();
}

/**
 * Decide whether this invocation may write, and refuse when unsure.
 *
 * Fail-closed in every direction:
 *
 *  - `APP_ENV=production` is rejected outright, confirmation or not. There is
 *    no flag, override or force that reaches a production project from here.
 *  - An unrecognised or absent `APP_ENV` is rejected rather than assumed to be
 *    development, because "we could not identify the target" and "the target is
 *    safe" are different facts.
 *  - A URL that looks like a production host is rejected even when `APP_ENV`
 *    claims development, because an env var is a claim and a hostname is
 *    evidence.
 *  - With no confirmation the result is a **dry run**, never a refusal: the
 *    operator should be able to see the whole plan without risk.
 *
 * Pure, so the whole matrix is unit-testable with no Supabase project.
 */
export function resolveBootstrapEnvironment(
  input: BootstrapEnvironmentInput
): BootstrapEnvironmentDecision {
  const appEnv = input.appEnv?.trim() ?? "";
  const supabaseUrl = input.supabaseUrl?.trim() ?? "";
  const confirmation = input.confirmation?.trim() ?? "";

  if (appEnv === "production") {
    throw new BootstrapEnvironmentError(
      "APP_ENV is production. This command never writes to a production environment, and there is no override."
    );
  }

  if (appEnv !== "development" && appEnv !== "test") {
    throw new BootstrapEnvironmentError(
      `APP_ENV must be development or test to identify the target environment; received "${appEnv || "(unset)"}". Refusing rather than assuming.`
    );
  }

  if (!supabaseUrl) {
    throw new BootstrapEnvironmentError(
      "SUPABASE_URL is not set, so the target project cannot be identified."
    );
  }

  if (looksLikeProductionTarget(supabaseUrl)) {
    throw new BootstrapEnvironmentError(
      `SUPABASE_URL "${supabaseUrl}" names a production-looking target. APP_ENV alone is not sufficient evidence that a write is safe.`
    );
  }

  if (confirmation === "") {
    return {
      mode: "dry_run",
      reason:
        "No confirmation supplied, so nothing will be written. Re-run with TLP_UAT_BOOTSTRAP_CONFIRM set to the SUPABASE_URL to publish."
    };
  }

  if (confirmation !== requiredConfirmationFor(supabaseUrl)) {
    throw new BootstrapEnvironmentError(
      "TLP_UAT_BOOTSTRAP_CONFIRM does not match SUPABASE_URL exactly. Refusing: the operator must name the project being changed."
    );
  }

  // DB-SERVICE-ROLE-1 — the credential must be a service-role credential, not
  // merely a non-empty string. Refusals are constants and never echo the value.
  const credential = classifyServiceRoleCredential(input.serviceRoleKey);

  if (!credential.usable) {
    throw new BootstrapEnvironmentError(
      describeServiceRoleCredentialProblem(credential.problem)
    );
  }

  // DB-SERVICE-ROLE-1 — the audit trail requires a real account.
  // `curriculum_publication_events.actor_user_id` is `uuid not null references
  // auth.users(id)`, so refuse here rather than fail at the final write with
  // fifty uncommittable-back rows already in the database.
  if (!isValidAuthoringActorId(input.actorUserId)) {
    throw new BootstrapEnvironmentError(
      "TLP_UAT_BOOTSTRAP_ACTOR_ID must be the UUID of an existing account. Publication is recorded against a real actor in curriculum_publication_events, which requires a valid auth.users id."
    );
  }

  const targetDescription = describeBootstrapTarget(appEnv, supabaseUrl);

  return {
    mode: "execute",
    reason: `Confirmed target: ${targetDescription}. Publishing through the existing curriculum authoring operations.`,
    targetUrl: supabaseUrl,
    targetDescription,
    actorUserId: input.actorUserId?.trim() ?? ""
  };
}

/**
 * Hostname evidence that a target is production.
 *
 * Deliberately conservative and deliberately not exhaustive: it is a second
 * barrier behind `APP_ENV`, not the primary control. A local Supabase stack
 * (`localhost`, `127.0.0.1`, a `*.local` host) is the expected UAT target.
 */
export function looksLikeProductionTarget(supabaseUrl: string): boolean {
  const value = supabaseUrl.trim().toLowerCase();
  if (value === "") return false;

  for (const marker of ["prod", "production", "live", "www."]) {
    if (value.includes(marker)) return true;
  }

  return false;
}

/**
 * A one-line human summary of what the plan would create.
 *
 * Counts are computed from the plan, never stated as constants, so the output
 * cannot claim a shape the plan does not have.
 */
export function describeBootstrapPlan(
  plan: RoasCurriculumBootstrapPlan
): string {
  return [
    `1 learning path`,
    `1 course`,
    `${plan.modules.length} modules`,
    `${plan.missions.length} missions`,
    `${plan.competencies.length} competencies`,
    `${plan.competencyPrerequisites.length} competency prerequisites`,
    `${plan.missionCompetencyLinks.length} mission-competency links`
  ].join(", ");
}
