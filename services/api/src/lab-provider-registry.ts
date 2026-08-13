import {
  AppError,
  type LabProvider
} from "@tlp/shared-types";

import { containerLabProvider } from "./container-lab-provider";
import { mockLabProvider } from "./mock-lab-provider";
import { createServerSupabaseClient } from "./supabase";
import {
  CONTAINER_PROVIDER_ID,
  MOCK_PROVIDER_ID,
  mapLabProviderRegistryRow,
  type LabProviderRegistryRecord
} from "./lab-provider-rollout";
import {
  LabProviderSelector,
  LabProviderUnavailableError,
  UnknownLabProviderError,
  classifySelectionFailure,
  type LabProviderCandidateEvaluation,
  type LabProviderRegistryReader,
  type LabSessionProviderReference,
  type SelectionFailureKind
} from "./lab-provider-selection";

export type RegisteredLabProviderId = "mock" | "container";

/**
 * Wave 6 / Batch 10.
 *
 * There is exactly one source of truth for each concern:
 *
 *   - which provider implementations exist in this build  -> `providers` below
 *   - whether this API instance may use a runtime         -> environment
 *   - whether students may be placed on a provider        -> database
 *     (public.lab_provider_registry: enabled, activation_state, rollout_*)
 *
 * Runtime enablement and database student authorization are separate gates and
 * BOTH must pass before a new session is placed on the Container provider.
 *
 * Provider selection happens only when provisioning a new session. Resolution of
 * an already provisioned session goes through `getLabProvider` /
 * `resolveLabProviderForSession`, which never consult rollout policy: an
 * existing session must stay startable, resettable, validatable, accessible,
 * destroyable and cleanable even after Container is suspended or rollout is
 * switched off.
 */

/** Runtime enablement for this API instance. Container is off unless set. */
export function isContainerRuntimeEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return String(env.TLP_CONTAINER_PROVIDER_ENABLED ?? "").trim().toLowerCase() === "true";
}

interface RegisteredProvider {
  providerId: RegisteredLabProviderId;
  provider: LabProvider;
  /** Fallback ordering when the registry row carries no priority. Lower first. */
  priority: number;
  /** Technical permission for this instance; NOT student authorization. */
  isRuntimeEnabled: () => boolean;
  /** Provider-specific isolation label surfaced by isolation attestation. */
  isolationMode: string;
}

const providers = new Map<RegisteredLabProviderId, RegisteredProvider>([
  [
    "mock",
    {
      providerId: "mock",
      provider: mockLabProvider,
      priority: 100,
      isRuntimeEnabled: () => true,
      isolationMode: "mock-isolated"
    }
  ],
  [
    "container",
    {
      providerId: "container",
      provider: containerLabProvider,
      priority: 10,
      isRuntimeEnabled: () => isContainerRuntimeEnabled(),
      isolationMode: "container-isolated"
    }
  ]
]);

function isRegisteredLabProviderId(
  providerId: string
): providerId is RegisteredLabProviderId {
  return providerId === MOCK_PROVIDER_ID || providerId === CONTAINER_PROVIDER_ID;
}

/**
 * Resolves a persisted provider id to its implementation.
 * Unknown ids fail closed. Rollout state is deliberately not consulted.
 */
export function getLabProvider(providerId: string): LabProvider {
  const registration = isRegisteredLabProviderId(providerId)
    ? providers.get(providerId)
    : undefined;

  if (!registration) {
    throw new AppError({
      code: "NOT_FOUND",
      message: `Lab provider ${providerId} is not registered`,
      retryable: false
    });
  }

  return registration.provider;
}

export function listRegisteredLabProviders(): Array<{
  providerId: RegisteredLabProviderId;
  provider: LabProvider;
  enabled: boolean;
}> {
  return [...providers.values()].map((registration) => ({
    providerId: registration.providerId,
    provider: registration.provider,
    enabled: registration.isRuntimeEnabled()
  }));
}

/** Provider-specific isolation label. Never weakens the isolation assertions. */
export function labProviderIsolationMode(providerId: string): string {
  const registration = isRegisteredLabProviderId(providerId)
    ? providers.get(providerId)
    : undefined;
  return registration?.isolationMode ?? "unknown-isolation";
}

/* ------------------------------------------------------------------ *
 * Control plane: public.lab_provider_registry
 * ------------------------------------------------------------------ */

const REGISTRY_COLUMNS =
  "provider_id,provider_type,enabled,priority,configuration,activation_state," +
  "last_canary_passed_at,rollout_mode,rollout_percentage,rollout_allowed_user_ids";

const REGISTRY_CACHE_TTL_MS = 5000;

let registryCache: { at: number; records: LabProviderRegistryRecord[] } | null = null;

/** Test/operations helper: drops the short-lived control-plane cache. */
export function resetLabProviderRegistryCache(): void {
  registryCache = null;
}

async function loadRegistryRecords(): Promise<LabProviderRegistryRecord[]> {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_CACHE_TTL_MS) {
    return registryCache.records;
  }

  try {
    const server = createServerSupabaseClient();
    const { data, error } = await server
      .from("lab_provider_registry")
      .select(REGISTRY_COLUMNS);

    if (error) {
      // Fail closed: no control-plane rows means Container is not authorized.
      registryCache = { at: Date.now(), records: [] };
      return registryCache.records;
    }

    const records = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(
      (row) => mapLabProviderRegistryRow(row)
    );
    registryCache = { at: Date.now(), records };
    return records;
  } catch {
    registryCache = { at: Date.now(), records: [] };
    return registryCache.records;
  }
}

const registryReader: LabProviderRegistryReader = {
  async getRecord(providerId: string) {
    const records = await loadRegistryRecords();
    return records.find((record) => record.providerId === providerId) ?? null;
  },
  async listRecords() {
    return loadRegistryRecords();
  }
};

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

const selector = new LabProviderSelector<LabProvider>();
selector.setRegistryReader(registryReader);

for (const registration of providers.values()) {
  const provider = registration.provider;
  selector.registerCandidate({
    providerId: registration.providerId,
    priority: registration.priority,
    isRuntimeEnabled: () => registration.isRuntimeEnabled(),
    isHealthy: async () => (await provider.getHealth()).state === "healthy",
    hasCapacity: async () => (await provider.getCapacity()).available,
    supportsCapabilities: async (requiredCapabilities) => {
      const capabilities = await provider.getCapabilities();
      return requiredCapabilities.every((capability) =>
        capabilities.capabilities.includes(capability)
      );
    },
    getProvider: () => provider
  });
}

export interface SelectedLabProvider {
  providerId: RegisteredLabProviderId;
  provider: LabProvider;
  evaluations: LabProviderCandidateEvaluation[];
}

export interface LabProviderSelectionOutcome {
  selection: SelectedLabProvider | null;
  evaluations: LabProviderCandidateEvaluation[];
  failure: SelectionFailureKind | null;
}

/**
 * Selects a provider for a NEW lab session without throwing.
 *
 * `failure` is "transient" when a provider could serve the request later
 * (unhealthy or at capacity) and "unsatisfiable" when no provider can ever
 * satisfy this definition under the current control-plane policy.
 */
export async function chooseLabProviderOrNull(
  requiredCapabilities: string[],
  userId: string
): Promise<LabProviderSelectionOutcome> {
  const evaluations = await selector.evaluateCandidates(requiredCapabilities, userId);
  const winner = evaluations.find((entry) => entry.selected);

  if (!winner || !isRegisteredLabProviderId(winner.providerId)) {
    return {
      selection: null,
      evaluations,
      failure: classifySelectionFailure(evaluations)
    };
  }

  return {
    selection: {
      providerId: winner.providerId,
      provider: await selector.getLabProvider(winner.providerId),
      evaluations
    },
    evaluations,
    failure: null
  };
}

/**
 * Selects a provider for a NEW lab session.
 * Preserves the existing DEPENDENCY_UNAVAILABLE behaviour when nothing fits.
 */
export async function chooseLabProvider(
  requiredCapabilities: string[],
  userId: string
): Promise<SelectedLabProvider> {
  const outcome = await chooseLabProviderOrNull(requiredCapabilities, userId);
  if (outcome.selection) {
    return outcome.selection;
  }
  throw new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message:
      "No enabled healthy Lab Provider currently satisfies this Lab Definition",
    retryable: true
  });
}

/**
 * @deprecated Use `chooseLabProvider`, which also returns the provider id that
 * must be persisted for the session. Retained for callers that only need the
 * implementation.
 */
export async function chooseLabProviderInstance(
  requiredCapabilities: string[],
  userId = ""
): Promise<LabProvider> {
  return (await chooseLabProvider(requiredCapabilities, userId)).provider;
}

/** Diagnostics for operations surfaces. Never used to authorize provisioning. */
export async function evaluateLabProviderCandidates(
  requiredCapabilities: string[],
  userId: string
): Promise<LabProviderCandidateEvaluation[]> {
  return selector.evaluateCandidates(requiredCapabilities, userId);
}

/**
 * Resolves the persisted provider reference for an existing session.
 * Rollout and activation state are not consulted.
 */
export async function resolveLabProviderForSession(
  reference: LabSessionProviderReference
): Promise<{
  providerId: string;
  providerSessionId: string;
  provider: LabProvider;
}> {
  try {
    return await selector.resolveLabProviderForSession(reference);
  } catch (error) {
    if (error instanceof UnknownLabProviderError) {
      throw new AppError({
        code: "NOT_FOUND",
        message: `Lab provider ${reference.providerId} is not registered`,
        retryable: false
      });
    }
    if (error instanceof LabProviderUnavailableError) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Lab provider session is unavailable",
        retryable: true
      });
    }
    throw error;
  }
}
