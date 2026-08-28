import {
  AppError,
  validateLabDefinition,
  type LabAccessMethod,
  type LabAccessibilityMetadata,
  type LabDataPersistencePolicy,
  type LabDefinition,
  type LabPublicationState,
  type LabResetStrategy,
  type LabResourceRequirement,
  type LabSafetyMetadata
} from "@tlp/shared-types";
import { createServerSupabaseClient } from "./supabase";

/**
 * ROAS-1 — Founder-guarded authoring for Lab Definitions and validation checks.
 *
 * ## Why this exists
 *
 * LAB-001 section 14 states the Founder can define a lab, connect it to a Mission
 * and competencies, and version it. `lab_definitions` and `lab_validation_checks`
 * were delivered in Wave 6 with a `publication_state` and a read policy, and the
 * schema records that "Founder/admin authoring remains server-side through
 * governed admin access" — but no write path to either table existed anywhere in
 * the repository. This module is that governed access and nothing more.
 *
 * It follows the pattern `curriculum-admin.ts` and `certificate-admin.ts`
 * already established: a Founder-guarded route calls an admin service module,
 * which writes through the service-role client. Neither curriculum nor
 * certificate tables grant an insert or update policy either; privileged
 * authoring is deliberately server-side rather than an RLS grant.
 *
 * ## The three layers stay separate
 *
 *   LEARNING/CURRICULUM   which Mission and competencies a lab serves
 *   LAB/VALIDATION        capabilities required and deterministic conditions
 *   PROVIDER/INFRASTRUCTURE  how mock, container or Proxmox realises it
 *
 * This module writes only the middle layer. It references curriculum by stable
 * id and never names a provider — LAB-001 section 8 requires a definition to
 * state capabilities rather than providers, and
 * `PROVIDER_SPECIFIC_CAPABILITY_TOKENS` enforces that as data.
 *
 * ## Authoring never touches infrastructure
 *
 * Nothing here imports a provider, the provider registry or a session service.
 * Authoring a lab cannot provision, start, reset, validate or destroy anything.
 * That separation is asserted by tests and by the ROAS-1 verifier.
 *
 * No AI. No migration: the Wave 6 schema already represents everything below.
 */

export interface LabAuthoringContext {
  actorUserId: string;
}

export interface LabDefinitionRecord {
  stableId: string;
  version: number;
  name: string;
  missionStableId: string;
  competencyStableIds: string[];
  validationProfileStableId: string;
  publicationState: LabPublicationState;
}

export interface LabValidationCheckRecord {
  profileStableId: string;
  stableId: string;
  probeId: string;
  title: string;
  required: boolean;
  sortOrder: number;
  publicationState: LabPublicationState;
}

/**
 * Capability strings that name an implementation rather than a requirement.
 *
 * LAB-001 section 8 prefers `isolated-network` and rejects
 * `run-this-on-proxmox-node-r620-2`. Held as data so the prohibition is asserted
 * directly rather than described, and so adding a provider later cannot quietly
 * leak its name into curriculum-facing lab metadata.
 */
export const PROVIDER_SPECIFIC_CAPABILITY_TOKENS: readonly string[] = [
  "proxmox",
  "pve",
  "hypervisor",
  "esxi",
  "vsphere",
  "vcenter",
  "qemu",
  "kvm",
  "libvirt",
  "docker",
  "podman",
  "containerd",
  "aws",
  "azure",
  "gcp",
  "node-r620"
];

const RESOURCE_KINDS = new Set([
  "linux_node",
  "windows_node",
  "network_device",
  "container",
  "virtual_machine"
]);

const ACCESS_METHODS = new Set(["ssh", "rdp", "browser_console", "terminal"]);
const RESET_STRATEGIES = new Set(["recreate", "snapshot", "provider_reset"]);
const PERSISTENCE_POLICIES = new Set(["ephemeral", "session"]);
const PUBLICATION_STATES = new Set(["draft", "review", "published", "retired"]);

function invalid(message: string, details?: Record<string, unknown>): AppError {
  return new AppError({
    code: "VALIDATION_ERROR",
    message,
    retryable: false,
    ...(details ? { details } : {})
  });
}

function unavailable(message: string): AppError {
  return new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });
}

/** Curriculum stable ids, matching the curriculum authoring convention. */
function normalizeCurriculumStableId(value: unknown, field: string): string {
  const stableId = String(value ?? "").trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(stableId)) {
    throw invalid(`${field} must be a stable curriculum identifier`);
  }

  return stableId;
}

/** Lab and profile identities keep the uppercase LABDEF/LABVP convention. */
function normalizeLabStableId(value: unknown, field: string, prefix: string): string {
  const stableId = String(value ?? "").trim().toUpperCase();

  if (!new RegExp(`^${prefix}-[A-Z0-9][A-Z0-9-]*$`).test(stableId)) {
    throw invalid(`${field} must look like ${prefix}-EXAMPLE-001`);
  }

  if (stableId.length > 120) {
    throw invalid(`${field} is too long`);
  }

  return stableId;
}

function requireText(value: unknown, field: string, max = 4000): string {
  const text = String(value ?? "").trim();
  if (!text) throw invalid(`${field} is required`);
  if (text.length > max) throw invalid(`${field} is too long`);
  return text;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw invalid(`${field} must be an array`);
  return value.map((entry, index) => requireText(entry, `${field}[${index}]`, 200));
}

/**
 * Rejects a capability that names a provider or product.
 *
 * Substring matching is deliberate: `proxmox-node`, `requires-docker` and
 * `kvm_host` must all fail, not only an exact match.
 */
function assertProviderNeutralCapabilities(capabilities: readonly string[]): void {
  for (const capability of capabilities) {
    const lowered = capability.toLowerCase();
    const offending = PROVIDER_SPECIFIC_CAPABILITY_TOKENS.find((token) =>
      lowered.includes(token)
    );

    if (offending) {
      throw invalid(
        "Lab capabilities must describe requirements, not providers",
        { capability, providerToken: offending }
      );
    }
  }
}

function normalizeResources(value: unknown): LabResourceRequirement[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalid("resources must contain at least one requirement");
  }

  return value.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const kind = String(record.kind ?? "");

    if (!RESOURCE_KINDS.has(kind)) {
      throw invalid(`resources[${index}].kind is not an approved resource kind`);
    }

    const count = Number(record.count);
    if (!Number.isInteger(count) || count < 1) {
      throw invalid(`resources[${index}].count must be a positive integer`);
    }

    const resource: LabResourceRequirement = {
      role: requireText(record.role, `resources[${index}].role`, 120),
      kind: kind as LabResourceRequirement["kind"],
      count
    };

    if (record.minimumMemoryMb !== undefined) {
      resource.minimumMemoryMb = Number(record.minimumMemoryMb);
    }
    if (record.minimumCpuCores !== undefined) {
      resource.minimumCpuCores = Number(record.minimumCpuCores);
    }
    if (record.imageReference !== undefined) {
      resource.imageReference = requireText(
        record.imageReference,
        `resources[${index}].imageReference`,
        200
      );
    }

    return resource;
  });
}

function normalizeAccessMethods(value: unknown, field: string): LabAccessMethod[] {
  const methods = requireStringArray(value, field);
  if (methods.length === 0) throw invalid(`${field} must not be empty`);

  for (const method of methods) {
    if (!ACCESS_METHODS.has(method)) {
      throw invalid(`${field} contains an unapproved access method: ${method}`);
    }
  }

  return methods as LabAccessMethod[];
}

function normalizeSafety(value: unknown): LabSafetyMetadata {
  const record = (value ?? {}) as Record<string, unknown>;
  const classification = String(record.classification ?? "");

  if (
    !["standard", "elevated", "offensive_security_restricted"].includes(
      classification
    )
  ) {
    throw invalid("safety.classification is not an approved classification");
  }

  const allowedNetworkScopes = requireStringArray(
    record.allowedNetworkScopes,
    "safety.allowedNetworkScopes"
  );

  if (allowedNetworkScopes.length === 0) {
    throw invalid("safety.allowedNetworkScopes must be explicit");
  }

  return {
    classification: classification as LabSafetyMetadata["classification"],
    internetAccessAllowed: Boolean(record.internetAccessAllowed),
    outboundTrafficRestricted: Boolean(record.outboundTrafficRestricted),
    privilegedAccessRequired: Boolean(record.privilegedAccessRequired),
    allowedNetworkScopes,
    prohibitedContent: Array.isArray(record.prohibitedContent)
      ? requireStringArray(record.prohibitedContent, "safety.prohibitedContent")
      : []
  };
}

function normalizeAccessibility(value: unknown): LabAccessibilityMetadata {
  const record = (value ?? {}) as Record<string, unknown>;

  return {
    connectionMethods: normalizeAccessMethods(
      record.connectionMethods,
      "accessibility.connectionMethods"
    ),
    keyboardRequired: Boolean(record.keyboardRequired),
    screenReaderLimitations: Array.isArray(record.screenReaderLimitations)
      ? requireStringArray(
          record.screenReaderLimitations,
          "accessibility.screenReaderLimitations"
        )
      : [],
    commandLineAlternativeAvailable: Boolean(
      record.commandLineAlternativeAvailable
    ),
    visualOnlyActivities: Array.isArray(record.visualOnlyActivities)
      ? requireStringArray(
          record.visualOnlyActivities,
          "accessibility.visualOnlyActivities"
        )
      : [],
    accommodations: Array.isArray(record.accommodations)
      ? requireStringArray(record.accommodations, "accessibility.accommodations")
      : [],
    timingIsEssentialCompetency: Boolean(record.timingIsEssentialCompetency)
  };
}

/**
 * The lab publication lifecycle.
 *
 * Deliberately identical in shape to `isValidPublicationTransition` in
 * `curriculum-admin.ts`: `PLATFORM_BLUEPRINT.md` section 11.4 describes the same
 * draft → review → Founder review → published progression for labs, and the
 * `lab_definitions` check constraint carries the same four states. A lab is
 * never published directly from draft — review is where the Founder looks.
 */
export function isValidLabPublicationTransition(
  from: LabPublicationState,
  to: LabPublicationState
): boolean {
  if (from === to) return true;
  if (from === "draft" && (to === "review" || to === "retired")) return true;
  if (from === "review" && (to === "draft" || to === "published" || to === "retired")) {
    return true;
  }
  if (from === "published" && to === "retired") return true;
  if (from === "retired" && to === "draft") return true;
  return false;
}

function requirePublicationState(value: unknown): LabPublicationState {
  const state = String(value ?? "").trim();
  if (!PUBLICATION_STATES.has(state)) {
    throw invalid("publicationState is not an approved lab publication state");
  }
  return state as LabPublicationState;
}

async function nextLabDefinitionVersion(stableId: string): Promise<number> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lab_definitions")
    .select("version")
    .eq("stable_id", stableId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw unavailable("Unable to resolve the next lab definition version");
  return Number(data?.version ?? 0) + 1;
}

export interface CreateLabDefinitionInput {
  stableId: unknown;
  name: unknown;
  description?: unknown;
  missionStableId: unknown;
  competencyStableIds: unknown;
  requiredCapabilities: unknown;
  resources: unknown;
  accessMethods: unknown;
  estimatedDurationMinutes: unknown;
  sessionLimitMinutes: unknown;
  validationProfileStableId: unknown;
  resetStrategy: unknown;
  safety: unknown;
  accessibility: unknown;
  dataPersistencePolicy: unknown;
}

/**
 * Creates a DRAFT Lab Definition.
 *
 * Always draft. A definition reaches learners only through
 * `transitionLabDefinitionState`, which re-validates and checks curriculum
 * references — so nothing can be authored straight into a student's path.
 *
 * The candidate is assembled by explicit assignment and then run through
 * SEARCH-001-style shared validation (`validateLabDefinition`) before any write,
 * so an invalid definition never reaches the database at all. LAB-001 section 13
 * requires invalid definitions to fail validation before assignment.
 */
export async function createDraftLabDefinition(
  context: LabAuthoringContext,
  input: CreateLabDefinitionInput
): Promise<LabDefinitionRecord> {
  if (!context.actorUserId) {
    throw invalid("An authoring actor is required");
  }

  const stableId = normalizeLabStableId(input.stableId, "stableId", "LABDEF");
  const validationProfileStableId = normalizeLabStableId(
    input.validationProfileStableId,
    "validationProfileStableId",
    "LABVP"
  );
  const missionStableId = normalizeCurriculumStableId(
    input.missionStableId,
    "missionStableId"
  );

  const competencyStableIds = requireStringArray(
    input.competencyStableIds,
    "competencyStableIds"
  ).map((value, index) =>
    normalizeCurriculumStableId(value, `competencyStableIds[${index}]`)
  );

  const requiredCapabilities = requireStringArray(
    input.requiredCapabilities,
    "requiredCapabilities"
  );
  assertProviderNeutralCapabilities(requiredCapabilities);

  const resetStrategy = String(input.resetStrategy ?? "");
  if (!RESET_STRATEGIES.has(resetStrategy)) {
    throw invalid("resetStrategy is not an approved reset strategy");
  }

  const dataPersistencePolicy = String(input.dataPersistencePolicy ?? "");
  if (!PERSISTENCE_POLICIES.has(dataPersistencePolicy)) {
    throw invalid("dataPersistencePolicy is not an approved policy");
  }

  const version = await nextLabDefinitionVersion(stableId);

  const candidate: LabDefinition = {
    stableId,
    version,
    name: requireText(input.name, "name", 200),
    description: String(input.description ?? "").trim(),
    missionStableId,
    competencyStableIds,
    requiredCapabilities,
    resources: normalizeResources(input.resources),
    accessMethods: normalizeAccessMethods(input.accessMethods, "accessMethods"),
    estimatedDurationMinutes: Number(input.estimatedDurationMinutes),
    sessionLimitMinutes: Number(input.sessionLimitMinutes),
    validationProfileStableId,
    resetStrategy: resetStrategy as LabResetStrategy,
    safety: normalizeSafety(input.safety),
    accessibility: normalizeAccessibility(input.accessibility),
    dataPersistencePolicy: dataPersistencePolicy as LabDataPersistencePolicy,
    publicationState: "draft"
  };

  const validation = validateLabDefinition(candidate);
  if (!validation.valid) {
    throw invalid("Lab definition is not valid", { errors: validation.errors });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lab_definitions")
    .insert({
      stable_id: candidate.stableId,
      version: candidate.version,
      name: candidate.name,
      description: candidate.description,
      mission_stable_id: candidate.missionStableId,
      competency_stable_ids: candidate.competencyStableIds,
      required_capabilities: candidate.requiredCapabilities,
      resources: candidate.resources,
      access_methods: candidate.accessMethods,
      estimated_duration_minutes: candidate.estimatedDurationMinutes,
      session_limit_minutes: candidate.sessionLimitMinutes,
      validation_profile_stable_id: candidate.validationProfileStableId,
      reset_strategy: candidate.resetStrategy,
      safety: candidate.safety,
      accessibility: candidate.accessibility,
      data_persistence_policy: candidate.dataPersistencePolicy,
      publication_state: "draft"
    })
    .select(
      "stable_id,version,name,mission_stable_id,competency_stable_ids," +
        "validation_profile_stable_id,publication_state"
    )
    .single();

  if (error || !data) {
    throw unavailable("Unable to create the lab definition draft");
  }

  return mapDefinition(data as unknown as Record<string, unknown>);
}

function mapDefinition(row: Record<string, unknown>): LabDefinitionRecord {
  return {
    stableId: String(row.stable_id),
    version: Number(row.version),
    name: String(row.name),
    missionStableId: String(row.mission_stable_id),
    competencyStableIds: Array.isArray(row.competency_stable_ids)
      ? (row.competency_stable_ids as unknown[]).map(String)
      : [],
    validationProfileStableId: String(row.validation_profile_stable_id),
    publicationState: String(row.publication_state) as LabPublicationState
  };
}

export interface AddLabValidationChecksInput {
  profileStableId: unknown;
  checks: unknown;
}

/**
 * Adds DRAFT validation checks to a profile.
 *
 * A "validation profile" is not a table. `lab_validation_checks.profile_stable_id`
 * groups checks, so a profile exists exactly when checks reference it. That is
 * the Wave 6 shape and this module does not change it.
 *
 * LAB-008 section 8 requires a validator to state what is checked, whether it is
 * required or advisory, and the student-facing explanation. `title` and
 * `explanation` are therefore mandatory: they are what a failed check tells the
 * learner, and an unexplained failure teaches nothing.
 *
 * `probeId` is the deterministic contract with the provider. It is stored
 * verbatim and never interpreted here — authoring records which probe answers a
 * check; it never decides the answer.
 */
export async function addLabValidationChecks(
  context: LabAuthoringContext,
  input: AddLabValidationChecksInput
): Promise<LabValidationCheckRecord[]> {
  if (!context.actorUserId) {
    throw invalid("An authoring actor is required");
  }

  const profileStableId = normalizeLabStableId(
    input.profileStableId,
    "profileStableId",
    "LABVP"
  );

  if (!Array.isArray(input.checks) || input.checks.length === 0) {
    throw invalid("At least one validation check is required");
  }

  const seen = new Set<string>();
  const rows = input.checks.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>;
    const stableId = normalizeLabStableId(
      record.stableId,
      `checks[${index}].stableId`,
      "LABCHK"
    );

    if (seen.has(stableId)) {
      throw invalid(`checks[${index}].stableId is duplicated in this request`);
    }
    seen.add(stableId);

    return {
      profile_stable_id: profileStableId,
      stable_id: stableId,
      probe_id: requireText(record.probeId, `checks[${index}].probeId`, 200),
      title: requireText(record.title, `checks[${index}].title`, 200),
      explanation: requireText(
        record.explanation,
        `checks[${index}].explanation`,
        2000
      ),
      required: record.required === undefined ? true : Boolean(record.required),
      sort_order: Number.isInteger(Number(record.sortOrder))
        ? Number(record.sortOrder)
        : index,
      publication_state: "draft"
    };
  });

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("lab_validation_checks")
    .insert(rows)
    .select(
      "profile_stable_id,stable_id,probe_id,title,required,sort_order,publication_state"
    );

  if (error || !data) {
    throw unavailable("Unable to add validation checks");
  }

  return (data as unknown as Record<string, unknown>[]).map(mapCheck);
}

function mapCheck(row: Record<string, unknown>): LabValidationCheckRecord {
  return {
    profileStableId: String(row.profile_stable_id),
    stableId: String(row.stable_id),
    probeId: String(row.probe_id),
    title: String(row.title),
    required: Boolean(row.required),
    sortOrder: Number(row.sort_order),
    publicationState: String(row.publication_state) as LabPublicationState
  };
}

/** Confirms a curriculum stable id exists in a published version. */
async function publishedCurriculumExists(
  table: "missions" | "competencies",
  stableId: string
): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(table)
    .select("stable_id")
    .eq("stable_id", stableId)
    .eq("publication_state", "published")
    .limit(1);

  if (error) throw unavailable("Unable to resolve curriculum references");
  return (data ?? []).length > 0;
}

/**
 * Transitions a Lab Definition through its publication lifecycle.
 *
 * Publishing is the guarded step. Before a definition can reach a learner it
 * must re-validate, its Mission and every competency must exist in a PUBLISHED
 * version, and its validation profile must carry at least one published required
 * check. A lab with no required check could be "passed" without demonstrating
 * anything, which would make the evidence it produces meaningless.
 */
export async function transitionLabDefinitionState(
  context: LabAuthoringContext,
  stableId: string,
  version: number,
  to: LabPublicationState
): Promise<LabDefinitionRecord> {
  if (!context.actorUserId) {
    throw invalid("An authoring actor is required");
  }

  const normalizedStableId = normalizeLabStableId(stableId, "stableId", "LABDEF");
  const target = requirePublicationState(to);

  if (!Number.isInteger(version) || version < 1) {
    throw invalid("version must be a positive integer");
  }

  const supabase = createServerSupabaseClient();
  const { data: current, error: currentError } = await supabase
    .from("lab_definitions")
    .select(
      "stable_id,version,name,description,mission_stable_id,competency_stable_ids," +
        "required_capabilities,resources,access_methods,estimated_duration_minutes," +
        "session_limit_minutes,validation_profile_stable_id,reset_strategy,safety," +
        "accessibility,data_persistence_policy,publication_state"
    )
    .eq("stable_id", normalizedStableId)
    .eq("version", version)
    .maybeSingle();

  if (currentError) throw unavailable("Unable to load the lab definition");
  if (!current) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Lab definition was not found",
      retryable: false
    });
  }

  const row = current as unknown as Record<string, unknown>;
  const from = String(row.publication_state) as LabPublicationState;

  if (!isValidLabPublicationTransition(from, target)) {
    throw new AppError({
      code: "CONFLICT",
      message: `Invalid lab publication transition from ${from} to ${target}`,
      retryable: false
    });
  }

  if (target === "published") {
    const candidate: LabDefinition = {
      stableId: String(row.stable_id),
      version: Number(row.version),
      name: String(row.name),
      description: String(row.description ?? ""),
      missionStableId: String(row.mission_stable_id),
      competencyStableIds: Array.isArray(row.competency_stable_ids)
        ? (row.competency_stable_ids as unknown[]).map(String)
        : [],
      requiredCapabilities: Array.isArray(row.required_capabilities)
        ? (row.required_capabilities as unknown[]).map(String)
        : [],
      resources: (row.resources ?? []) as LabResourceRequirement[],
      accessMethods: Array.isArray(row.access_methods)
        ? ((row.access_methods as unknown[]).map(String) as LabAccessMethod[])
        : [],
      estimatedDurationMinutes: Number(row.estimated_duration_minutes),
      sessionLimitMinutes: Number(row.session_limit_minutes),
      validationProfileStableId: String(row.validation_profile_stable_id),
      resetStrategy: String(row.reset_strategy) as LabResetStrategy,
      safety: row.safety as LabSafetyMetadata,
      accessibility: row.accessibility as LabAccessibilityMetadata,
      dataPersistencePolicy: String(
        row.data_persistence_policy
      ) as LabDataPersistencePolicy,
      publicationState: from
    };

    const validation = validateLabDefinition(candidate);
    if (!validation.valid) {
      throw new AppError({
        code: "CONFLICT",
        message: "Lab definition cannot be published until validation passes",
        retryable: false,
        details: { errors: validation.errors }
      });
    }

    assertProviderNeutralCapabilities(candidate.requiredCapabilities);

    if (!(await publishedCurriculumExists("missions", candidate.missionStableId))) {
      throw new AppError({
        code: "CONFLICT",
        message: "Lab definition references a mission that is not published",
        retryable: false,
        details: { missionStableId: candidate.missionStableId }
      });
    }

    for (const competencyStableId of candidate.competencyStableIds) {
      if (!(await publishedCurriculumExists("competencies", competencyStableId))) {
        throw new AppError({
          code: "CONFLICT",
          message: "Lab definition references a competency that is not published",
          retryable: false,
          details: { competencyStableId }
        });
      }
    }

    const { data: checks, error: checkError } = await supabase
      .from("lab_validation_checks")
      .select("stable_id,required")
      .eq("profile_stable_id", candidate.validationProfileStableId)
      .eq("publication_state", "published")
      .eq("required", true);

    if (checkError) throw unavailable("Unable to resolve the validation profile");

    if ((checks ?? []).length === 0) {
      throw new AppError({
        code: "CONFLICT",
        message:
          "Lab definition cannot be published without a published required validation check",
        retryable: false,
        details: {
          validationProfileStableId: candidate.validationProfileStableId
        }
      });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("lab_definitions")
    .update({ publication_state: target, updated_at: new Date().toISOString() })
    .eq("stable_id", normalizedStableId)
    .eq("version", version)
    .select(
      "stable_id,version,name,mission_stable_id,competency_stable_ids," +
        "validation_profile_stable_id,publication_state"
    )
    .single();

  if (updateError || !updated) {
    throw unavailable("Unable to update the lab definition publication state");
  }

  return mapDefinition(updated as unknown as Record<string, unknown>);
}

/**
 * Transitions every check in a validation profile together.
 *
 * Checks are published as a profile rather than individually: a half-published
 * profile would silently change what a learner has to demonstrate, and the
 * profile is the unit a Lab Definition references.
 */
export async function transitionLabValidationProfileState(
  context: LabAuthoringContext,
  profileStableId: string,
  to: LabPublicationState
): Promise<LabValidationCheckRecord[]> {
  if (!context.actorUserId) {
    throw invalid("An authoring actor is required");
  }

  const normalizedProfileId = normalizeLabStableId(
    profileStableId,
    "profileStableId",
    "LABVP"
  );
  const target = requirePublicationState(to);

  const supabase = createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase
    .from("lab_validation_checks")
    .select("stable_id,publication_state")
    .eq("profile_stable_id", normalizedProfileId);

  if (existingError) throw unavailable("Unable to load the validation profile");

  if ((existing ?? []).length === 0) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "Validation profile was not found",
      retryable: false
    });
  }

  for (const row of existing ?? []) {
    const from = String(
      (row as unknown as Record<string, unknown>).publication_state
    ) as LabPublicationState;

    if (!isValidLabPublicationTransition(from, target)) {
      throw new AppError({
        code: "CONFLICT",
        message: `Invalid validation profile transition from ${from} to ${target}`,
        retryable: false
      });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("lab_validation_checks")
    .update({ publication_state: target })
    .eq("profile_stable_id", normalizedProfileId)
    .select(
      "profile_stable_id,stable_id,probe_id,title,required,sort_order,publication_state"
    );

  if (updateError || !updated) {
    throw unavailable("Unable to update the validation profile publication state");
  }

  return (updated as unknown as Record<string, unknown>[]).map(mapCheck);
}
