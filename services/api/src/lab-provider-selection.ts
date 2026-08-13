/**
 * Wave 6 / Batch 10 — Database-aware Lab Provider selection & resolution.
 *
 * Two strictly separated responsibilities:
 *
 *  1. SELECTION (new sessions only)
 *     `chooseLabProvider(requiredCapabilities, userId)` consults the persisted
 *     control plane (`public.lab_provider_registry`), the deterministic rollout
 *     policy, runtime enablement, provider health, provider capacity and the
 *     Lab Definition's required capabilities.
 *
 *  2. RESOLUTION (existing sessions)
 *     `getLabProvider(providerId)` / `resolveLabProviderForSession(ref)` map a
 *     PERSISTED provider reference to a provider instance. Rollout policy is
 *     NEVER consulted here: turning rollout off must never strand an existing
 *     Container session's start/reset/validate/access/destroy/cleanup paths.
 *
 * The module is dependency-injected on purpose so it can be unit tested without
 * a database and without touching the existing registry wiring.
 */

import {
  CONTAINER_PROVIDER_ID,
  MOCK_PROVIDER_ID,
  evaluateProviderControlPlane,
  isSupportedLabProviderId,
  mapLabProviderRegistryRow,
  type ControlPlaneEvaluation,
  type LabProviderRegistryRecord,
} from "./lab-provider-rollout";

export {
  CONTAINER_PROVIDER_ID,
  MOCK_PROVIDER_ID,
} from "./lab-provider-rollout";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class UnknownLabProviderError extends Error {
  readonly code = "UNKNOWN_PROVIDER";
  readonly providerId: string;

  constructor(providerId: string) {
    super(`Unknown or unsupported lab provider: ${providerId}`);
    this.name = "UnknownLabProviderError";
    this.providerId = providerId;
  }
}

export class LabProviderUnavailableError extends Error {
  /** Preserves the existing API failure contract. */
  readonly code = "DEPENDENCY_UNAVAILABLE";
  readonly evaluations: LabProviderCandidateEvaluation[];

  constructor(evaluations: LabProviderCandidateEvaluation[]) {
    super("No lab provider can satisfy the requested lab definition");
    this.name = "LabProviderUnavailableError";
    this.evaluations = evaluations;
  }
}

/* ------------------------------------------------------------------ *
 * Contracts
 * ------------------------------------------------------------------ */

export interface LabProviderRegistryReader {
  getRecord(providerId: string): Promise<LabProviderRegistryRecord | null>;
  listRecords(): Promise<LabProviderRegistryRecord[]>;
}

export interface LabSessionProviderReference {
  providerId: string;
  providerSessionId: string;
}

export interface ResolvedSessionProvider<TProvider> {
  providerId: string;
  providerSessionId: string;
  provider: TProvider;
}

/**
 * Adapter describing one selectable provider. Health / capacity / capability
 * probes stay owned by the existing provider implementations; this layer only
 * orchestrates them.
 */
export interface LabProviderCandidate<TProvider> {
  providerId: string;
  /** Fallback priority when the registry row has none. Lower is preferred. */
  priority?: number;
  /**
   * Runtime enablement for THIS API instance (e.g.
   * `TLP_CONTAINER_PROVIDER_ENABLED`). Independent from, and additional to, the
   * persisted database activation/rollout gate.
   */
  isRuntimeEnabled?(): boolean | Promise<boolean>;
  isHealthy?(): boolean | Promise<boolean>;
  hasCapacity?(): boolean | Promise<boolean>;
  supportsCapabilities?(
    requiredCapabilities: readonly string[],
  ): boolean | Promise<boolean>;
  getProvider(): TProvider | Promise<TProvider>;
}

export type CandidateRejectionReason =
  | "CONTROL_PLANE_DENIED"
  | "RUNTIME_DISABLED"
  | "PROVIDER_UNHEALTHY"
  | "CAPACITY_UNAVAILABLE"
  | "MISSING_REQUIRED_CAPABILITIES"
  | "CANDIDATE_PROBE_FAILED";

export interface LabProviderCandidateEvaluation {
  providerId: string;
  priority: number;
  selected: boolean;
  rejectedBecause: CandidateRejectionReason | null;
  controlPlane: ControlPlaneEvaluation;
  detail?: string;
}

/**
 * Rejections that may resolve on their own. A request rejected only for these
 * reasons should keep the existing "queue and retry" behaviour rather than
 * failing the student's request.
 */
export const TRANSIENT_REJECTION_REASONS: readonly CandidateRejectionReason[] = [
  "PROVIDER_UNHEALTHY",
  "CAPACITY_UNAVAILABLE",
  "CANDIDATE_PROBE_FAILED",
];

export type SelectionFailureKind = "transient" | "unsatisfiable";

/**
 * "transient" when at least one candidate could plausibly serve the request
 * later (unhealthy / at capacity / probe error). "unsatisfiable" when every
 * candidate was rejected for a structural reason (control plane, runtime
 * disablement, missing capabilities) or when there are no candidates at all.
 */
export function classifySelectionFailure(
  evaluations: readonly LabProviderCandidateEvaluation[],
): SelectionFailureKind {
  const hasTransient = evaluations.some(
    (entry) =>
      entry.rejectedBecause !== null &&
      TRANSIENT_REJECTION_REASONS.includes(entry.rejectedBecause),
  );
  return hasTransient ? "transient" : "unsatisfiable";
}

export interface LabProviderSelection<TProvider> {
  providerId: string;
  provider: TProvider;
  priority: number;
  controlPlane: ControlPlaneEvaluation;
  evaluations: LabProviderCandidateEvaluation[];
}

export interface LabProviderSelectorOptions {
  /**
   * How `lab_provider_registry.priority` orders candidates.
   * "asc" (default): lower number is evaluated first.
   */
  priorityDirection?: "asc" | "desc";
  defaultPriority?: number;
}

const DEFAULT_PRIORITY = 1000;

async function resolveMaybeAsync<T>(value: T | Promise<T>): Promise<T> {
  return await Promise.resolve(value);
}

/* ------------------------------------------------------------------ *
 * Selector
 * ------------------------------------------------------------------ */

export class LabProviderSelector<TProvider> {
  private readonly candidates = new Map<string, LabProviderCandidate<TProvider>>();
  private readonly registrationOrder = new Map<string, number>();
  private registryReader: LabProviderRegistryReader | null = null;
  private priorityDirection: "asc" | "desc";
  private defaultPriority: number;
  private sequence = 0;

  constructor(options: LabProviderSelectorOptions = {}) {
    this.priorityDirection = options.priorityDirection ?? "asc";
    this.defaultPriority = options.defaultPriority ?? DEFAULT_PRIORITY;
  }

  registerCandidate(candidate: LabProviderCandidate<TProvider>): this {
    if (!isSupportedLabProviderId(candidate.providerId)) {
      throw new UnknownLabProviderError(candidate.providerId);
    }
    if (!this.registrationOrder.has(candidate.providerId)) {
      this.registrationOrder.set(candidate.providerId, this.sequence++);
    }
    this.candidates.set(candidate.providerId, candidate);
    return this;
  }

  setRegistryReader(reader: LabProviderRegistryReader | null): this {
    this.registryReader = reader;
    return this;
  }

  setPriorityDirection(direction: "asc" | "desc"): this {
    this.priorityDirection = direction;
    return this;
  }

  /** Test / bootstrap helper. */
  reset(): this {
    this.candidates.clear();
    this.registrationOrder.clear();
    this.registryReader = null;
    this.sequence = 0;
    return this;
  }

  listCandidateIds(): string[] {
    return [...this.candidates.keys()];
  }

  private async readRecord(
    providerId: string,
  ): Promise<LabProviderRegistryRecord | null> {
    if (!this.registryReader) {
      return null;
    }
    return (await this.registryReader.getRecord(providerId)) ?? null;
  }

  /* ---------------- resolution (existing sessions) ---------------- */

  /**
   * Resolves a PERSISTED provider id to a provider instance.
   *
   * Fails closed on unknown ids. Deliberately ignores rollout/activation state
   * so existing sessions remain fully operable (start, reset, validate, access,
   * destroy, cleanup) after a rollout is switched off or suspended.
   */
  async getLabProvider(providerId: string): Promise<TProvider> {
    if (!isSupportedLabProviderId(providerId)) {
      throw new UnknownLabProviderError(String(providerId));
    }
    const candidate = this.candidates.get(providerId);
    if (!candidate) {
      throw new UnknownLabProviderError(providerId);
    }
    return await resolveMaybeAsync(candidate.getProvider());
  }

  async resolveLabProviderForSession(
    reference: LabSessionProviderReference,
  ): Promise<ResolvedSessionProvider<TProvider>> {
    if (!reference || typeof reference.providerId !== "string") {
      throw new UnknownLabProviderError(String(reference?.providerId));
    }
    if (
      typeof reference.providerSessionId !== "string" ||
      reference.providerSessionId.length === 0
    ) {
      throw new UnknownLabProviderError(reference.providerId);
    }
    const provider = await this.getLabProvider(reference.providerId);
    return {
      providerId: reference.providerId,
      providerSessionId: reference.providerSessionId,
      provider,
    };
  }

  /* ---------------- selection (new sessions only) ---------------- */

  private effectivePriority(
    candidate: LabProviderCandidate<TProvider>,
    record: LabProviderRegistryRecord | null,
  ): number {
    if (record && typeof record.priority === "number") {
      return record.priority;
    }
    if (typeof candidate.priority === "number") {
      return candidate.priority;
    }
    return this.defaultPriority;
  }

  async evaluateCandidates(
    requiredCapabilities: readonly string[] = [],
    userId = "",
  ): Promise<LabProviderCandidateEvaluation[]> {
    const entries: Array<{
      candidate: LabProviderCandidate<TProvider>;
      record: LabProviderRegistryRecord | null;
      priority: number;
    }> = [];

    for (const candidate of this.candidates.values()) {
      const record = await this.readRecord(candidate.providerId);
      entries.push({
        candidate,
        record,
        priority: this.effectivePriority(candidate, record),
      });
    }

    entries.sort((a, b) => {
      const delta =
        this.priorityDirection === "asc"
          ? a.priority - b.priority
          : b.priority - a.priority;
      if (delta !== 0) {
        return delta;
      }
      return (
        (this.registrationOrder.get(a.candidate.providerId) ?? 0) -
        (this.registrationOrder.get(b.candidate.providerId) ?? 0)
      );
    });

    const evaluations: LabProviderCandidateEvaluation[] = [];
    let alreadySelected = false;

    for (const entry of entries) {
      const { candidate, record, priority } = entry;
      const controlPlane = evaluateProviderControlPlane(
        candidate.providerId,
        record,
        userId,
      );

      const base: LabProviderCandidateEvaluation = {
        providerId: candidate.providerId,
        priority,
        selected: false,
        rejectedBecause: null,
        controlPlane,
      };

      if (alreadySelected) {
        // Keep a complete trace but stop probing once a winner exists.
        evaluations.push({ ...base, detail: "not-evaluated" });
        continue;
      }

      if (!controlPlane.allowed) {
        evaluations.push({
          ...base,
          rejectedBecause: "CONTROL_PLANE_DENIED",
          detail: controlPlane.reason,
        });
        continue;
      }

      try {
        if (
          candidate.isRuntimeEnabled &&
          !(await resolveMaybeAsync(candidate.isRuntimeEnabled()))
        ) {
          evaluations.push({ ...base, rejectedBecause: "RUNTIME_DISABLED" });
          continue;
        }

        if (
          candidate.isHealthy &&
          !(await resolveMaybeAsync(candidate.isHealthy()))
        ) {
          evaluations.push({ ...base, rejectedBecause: "PROVIDER_UNHEALTHY" });
          continue;
        }

        if (
          candidate.hasCapacity &&
          !(await resolveMaybeAsync(candidate.hasCapacity()))
        ) {
          evaluations.push({
            ...base,
            rejectedBecause: "CAPACITY_UNAVAILABLE",
          });
          continue;
        }

        if (
          candidate.supportsCapabilities &&
          !(await resolveMaybeAsync(
            candidate.supportsCapabilities(requiredCapabilities),
          ))
        ) {
          evaluations.push({
            ...base,
            rejectedBecause: "MISSING_REQUIRED_CAPABILITIES",
          });
          continue;
        }
      } catch (error) {
        // A misbehaving probe must never take down an otherwise serviceable
        // request: reject this candidate and keep evaluating the next one.
        evaluations.push({
          ...base,
          rejectedBecause: "CANDIDATE_PROBE_FAILED",
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      alreadySelected = true;
      evaluations.push({ ...base, selected: true });
    }

    return evaluations;
  }

  /**
   * Selects a provider for a NEW lab session.
   * Throws `LabProviderUnavailableError` (code `DEPENDENCY_UNAVAILABLE`) when no
   * provider can satisfy the definition.
   */
  async chooseLabProvider(
    requiredCapabilities: readonly string[] = [],
    userId = "",
  ): Promise<LabProviderSelection<TProvider>> {
    const evaluations = await this.evaluateCandidates(
      requiredCapabilities,
      userId,
    );
    const winner = evaluations.find((entry) => entry.selected);
    if (!winner) {
      throw new LabProviderUnavailableError(evaluations);
    }
    const candidate = this.candidates.get(winner.providerId);
    if (!candidate) {
      throw new LabProviderUnavailableError(evaluations);
    }
    return {
      providerId: winner.providerId,
      provider: await resolveMaybeAsync(candidate.getProvider()),
      priority: winner.priority,
      controlPlane: winner.controlPlane,
      evaluations,
    };
  }
}

/* ------------------------------------------------------------------ *
 * SQL-backed registry reader
 * ------------------------------------------------------------------ */

export type LabProviderRegistryQuery = (
  sql: string,
  params: unknown[],
) => Promise<Array<Record<string, unknown>>>;

export interface SqlRegistryReaderOptions {
  table?: string;
  /** Cache TTL in milliseconds. 0 disables caching. */
  cacheTtlMs?: number;
  now?: () => number;
}

const REGISTRY_COLUMNS =
  "provider_id, provider_type, enabled, priority, configuration, " +
  "activation_state, last_canary_passed_at, rollout_mode, rollout_percentage, " +
  "rollout_allowed_user_ids";

/**
 * Builds a reader over `public.lab_provider_registry` using whatever query
 * function the API service already owns. Read-only by construction.
 */
export function createSqlLabProviderRegistryReader(
  query: LabProviderRegistryQuery,
  options: SqlRegistryReaderOptions = {},
): LabProviderRegistryReader {
  const table = options.table ?? "public.lab_provider_registry";
  const cacheTtlMs = options.cacheTtlMs ?? 0;
  const now = options.now ?? (() => Date.now());

  let cache: { at: number; records: LabProviderRegistryRecord[] } | null = null;

  async function loadAll(): Promise<LabProviderRegistryRecord[]> {
    if (cache && cacheTtlMs > 0 && now() - cache.at < cacheTtlMs) {
      return cache.records;
    }
    const rows = await query(`SELECT ${REGISTRY_COLUMNS} FROM ${table}`, []);
    const records = rows.map((row) => mapLabProviderRegistryRow(row));
    cache = { at: now(), records };
    return records;
  }

  return {
    async getRecord(providerId: string) {
      const records = await loadAll();
      return records.find((record) => record.providerId === providerId) ?? null;
    },
    async listRecords() {
      return await loadAll();
    },
  };
}

/**
 * Reads the authoritative persisted provider reference for a session from
 * `lab_session_provider_references`.
 */
export function createSqlLabSessionProviderReferenceReader(
  query: LabProviderRegistryQuery,
  options: { table?: string } = {},
): (sessionId: string) => Promise<LabSessionProviderReference | null> {
  const table = options.table ?? "public.lab_session_provider_references";
  return async (sessionId: string) => {
    const rows = await query(
      `SELECT provider_id, provider_session_id FROM ${table} WHERE lab_session_id = $1 LIMIT 1`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    const providerId = String(row["provider_id"] ?? row["providerId"] ?? "");
    const providerSessionId = String(
      row["provider_session_id"] ?? row["providerSessionId"] ?? "",
    );
    if (!providerId || !providerSessionId) {
      return null;
    }
    return { providerId, providerSessionId };
  };
}

/* ------------------------------------------------------------------ *
 * Convenience factory
 * ------------------------------------------------------------------ */

export interface LabProviderSelectionApi<TProvider> {
  selector: LabProviderSelector<TProvider>;
  getLabProvider(providerId: string): Promise<TProvider>;
  resolveLabProviderForSession(
    reference: LabSessionProviderReference,
  ): Promise<ResolvedSessionProvider<TProvider>>;
  chooseLabProvider(
    requiredCapabilities?: readonly string[],
    userId?: string,
  ): Promise<LabProviderSelection<TProvider>>;
  evaluateLabProviderCandidates(
    requiredCapabilities?: readonly string[],
    userId?: string,
  ): Promise<LabProviderCandidateEvaluation[]>;
}

/**
 * Creates a selection API bound to a concrete provider type. Call this once
 * from `lab-provider-registry.ts` with the real `LabProvider` type so every
 * call site keeps full type safety.
 */
export function createLabProviderSelection<TProvider>(
  options: LabProviderSelectorOptions = {},
): LabProviderSelectionApi<TProvider> {
  const selector = new LabProviderSelector<TProvider>(options);
  return {
    selector,
    getLabProvider: (providerId) => selector.getLabProvider(providerId),
    resolveLabProviderForSession: (reference) =>
      selector.resolveLabProviderForSession(reference),
    chooseLabProvider: (requiredCapabilities = [], userId = "") =>
      selector.chooseLabProvider(requiredCapabilities, userId),
    evaluateLabProviderCandidates: (requiredCapabilities = [], userId = "") =>
      selector.evaluateCandidates(requiredCapabilities, userId),
  };
}
