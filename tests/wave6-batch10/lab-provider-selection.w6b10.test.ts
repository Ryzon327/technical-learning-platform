/**
 * Wave 6 / Batch 10 — provider selection tests (cases I-P, M).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONTAINER_PROVIDER_ID,
  MOCK_PROVIDER_ID,
  type LabProviderRegistryRecord,
} from "../../services/api/src/lab-provider-rollout";
import {
  LabProviderSelector,
  LabProviderUnavailableError,
  UnknownLabProviderError,
  type LabProviderRegistryReader,
} from "../../services/api/src/lab-provider-selection";

interface FakeProvider {
  id: string;
}

const mockProvider: FakeProvider = { id: MOCK_PROVIDER_ID };
const containerProvider: FakeProvider = { id: CONTAINER_PROVIDER_ID };

function row(
  providerId: string,
  overrides: Partial<LabProviderRegistryRecord> = {},
): LabProviderRegistryRecord {
  return {
    providerId,
    providerType: providerId,
    enabled: true,
    priority: providerId === CONTAINER_PROVIDER_ID ? 10 : 100,
    configuration: null,
    activationState: "enabled",
    lastCanaryPassedAt: null,
    rolloutMode: providerId === CONTAINER_PROVIDER_ID ? "all" : "off",
    rolloutPercentage: 0,
    rolloutAllowedUserIds: [],
    ...overrides,
  };
}

function reader(records: LabProviderRegistryRecord[]): LabProviderRegistryReader {
  return {
    async getRecord(providerId) {
      return records.find((r) => r.providerId === providerId) ?? null;
    },
    async listRecords() {
      return records;
    },
  };
}

interface Knobs {
  runtimeEnabled?: boolean;
  healthy?: boolean;
  capacity?: boolean;
  capabilities?: string[];
}

function buildSelector(
  records: LabProviderRegistryRecord[],
  knobs: Knobs = {},
): LabProviderSelector<FakeProvider> {
  const {
    runtimeEnabled = true,
    healthy = true,
    capacity = true,
    capabilities = ["terminal", "filesystem", "network-isolation"],
  } = knobs;

  return new LabProviderSelector<FakeProvider>()
    .setRegistryReader(reader(records))
    .registerCandidate({
      providerId: CONTAINER_PROVIDER_ID,
      priority: 10,
      isRuntimeEnabled: () => runtimeEnabled,
      isHealthy: () => healthy,
      hasCapacity: () => capacity,
      supportsCapabilities: (required) =>
        required.every((cap) => capabilities.includes(cap)),
      getProvider: () => containerProvider,
    })
    .registerCandidate({
      providerId: MOCK_PROVIDER_ID,
      priority: 100,
      isRuntimeEnabled: () => true,
      isHealthy: () => true,
      hasCapacity: () => true,
      supportsCapabilities: () => true,
      getProvider: () => mockProvider,
    });
}

/* M. eligible healthy Container can be selected */
test("M: eligible, healthy, in-capacity Container is selected", async () => {
  const selector = buildSelector([
    row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }),
    row(MOCK_PROVIDER_ID),
  ]);
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, CONTAINER_PROVIDER_ID);
  assert.equal(selection.provider, containerProvider);
});

/* A/B at selection level: rollout off / activation not enabled => Mock */
test("selection: rollout off falls back to Mock", async () => {
  const selector = buildSelector([
    row(CONTAINER_PROVIDER_ID, { rolloutMode: "off" }),
    row(MOCK_PROVIDER_ID),
  ]);
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
});

test("selection: activation_state canary_passed does not authorize students", async () => {
  const selector = buildSelector([
    row(CONTAINER_PROVIDER_ID, {
      activationState: "canary_passed",
      rolloutMode: "all",
    }),
    row(MOCK_PROVIDER_ID),
  ]);
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
});

test("selection: Container absent from registry fails closed to Mock", async () => {
  const selector = buildSelector([row(MOCK_PROVIDER_ID)]);
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
});

/* I. Container runtime disabled => Mock fallback */
test("I: runtime-disabled Container falls back to Mock", async () => {
  const selector = buildSelector(
    [row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }), row(MOCK_PROVIDER_ID)],
    { runtimeEnabled: false },
  );
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
  const container = selection.evaluations.find(
    (e) => e.providerId === CONTAINER_PROVIDER_ID,
  );
  assert.equal(container?.rejectedBecause, "RUNTIME_DISABLED");
});

/* J. Container unhealthy => Mock fallback */
test("J: unhealthy Container falls back to Mock", async () => {
  const selector = buildSelector(
    [row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }), row(MOCK_PROVIDER_ID)],
    { healthy: false },
  );
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
  const container = selection.evaluations.find(
    (e) => e.providerId === CONTAINER_PROVIDER_ID,
  );
  assert.equal(container?.rejectedBecause, "PROVIDER_UNHEALTHY");
});

/* K. Container capacity unavailable => Mock fallback */
test("K: Container at capacity falls back to Mock", async () => {
  const selector = buildSelector(
    [row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }), row(MOCK_PROVIDER_ID)],
    { capacity: false },
  );
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
  const container = selection.evaluations.find(
    (e) => e.providerId === CONTAINER_PROVIDER_ID,
  );
  assert.equal(container?.rejectedBecause, "CAPACITY_UNAVAILABLE");
});

/* L. Container missing required capability => Mock fallback */
test("L: Container missing a required capability falls back to Mock", async () => {
  const selector = buildSelector(
    [row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }), row(MOCK_PROVIDER_ID)],
    { capabilities: ["terminal"] },
  );
  const selection = await selector.chooseLabProvider(
    ["terminal", "gpu"],
    "student-1",
  );
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
  const container = selection.evaluations.find(
    (e) => e.providerId === CONTAINER_PROVIDER_ID,
  );
  assert.equal(container?.rejectedBecause, "MISSING_REQUIRED_CAPABILITIES");
});

test("selection: allowlist eligibility drives per-user selection", async () => {
  const records = [
    row(CONTAINER_PROVIDER_ID, {
      rolloutMode: "allowlist",
      rolloutAllowedUserIds: ["pilot-user"],
    }),
    row(MOCK_PROVIDER_ID),
  ];
  const selector = buildSelector(records);
  assert.equal(
    (await selector.chooseLabProvider(["terminal"], "pilot-user")).providerId,
    CONTAINER_PROVIDER_ID,
  );
  assert.equal(
    (await selector.chooseLabProvider(["terminal"], "other-user")).providerId,
    MOCK_PROVIDER_ID,
  );
});

test("selection: no eligible provider yields DEPENDENCY_UNAVAILABLE", async () => {
  const selector = new LabProviderSelector<FakeProvider>()
    .setRegistryReader(reader([row(MOCK_PROVIDER_ID, { enabled: false })]))
    .registerCandidate({
      providerId: MOCK_PROVIDER_ID,
      getProvider: () => mockProvider,
    });

  await assert.rejects(
    () => selector.chooseLabProvider(["terminal"], "student-1"),
    (error: unknown) => {
      assert.ok(error instanceof LabProviderUnavailableError);
      assert.equal(error.code, "DEPENDENCY_UNAVAILABLE");
      return true;
    },
  );
});

/* N. persisted Mock provider resolves to Mock */
test("N: persisted mock reference resolves to the Mock provider", async () => {
  const selector = buildSelector([
    row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }),
    row(MOCK_PROVIDER_ID),
  ]);
  const resolved = await selector.resolveLabProviderForSession({
    providerId: MOCK_PROVIDER_ID,
    providerSessionId: "mock-session-1",
  });
  assert.equal(resolved.provider, mockProvider);
  assert.equal(resolved.providerSessionId, "mock-session-1");
});

/* O. persisted Container provider resolves to Container */
test("O: persisted container reference resolves to the Container provider", async () => {
  const selector = buildSelector([
    row(CONTAINER_PROVIDER_ID, { rolloutMode: "off" }),
    row(MOCK_PROVIDER_ID),
  ]);
  const resolved = await selector.resolveLabProviderForSession({
    providerId: CONTAINER_PROVIDER_ID,
    providerSessionId: "ctr-session-1",
  });
  assert.equal(resolved.provider, containerProvider);
});

/* P. unknown persisted provider fails closed */
test("P: unknown persisted provider id fails closed", async () => {
  const selector = buildSelector([row(MOCK_PROVIDER_ID)]);
  await assert.rejects(
    () => selector.getLabProvider("kubernetes"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownLabProviderError);
      assert.equal(error.code, "UNKNOWN_PROVIDER");
      return true;
    },
  );
  await assert.rejects(() =>
    selector.resolveLabProviderForSession({
      providerId: "",
      providerSessionId: "x",
    }),
  );
});

test("selection: registry priority ordering is honoured", async () => {
  const selector = buildSelector([
    row(CONTAINER_PROVIDER_ID, { rolloutMode: "all", priority: 500 }),
    row(MOCK_PROVIDER_ID, { priority: 1 }),
  ]);
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
});

test("selection: a throwing provider probe never fails the whole request", async () => {
  const selector = new LabProviderSelector<FakeProvider>()
    .setRegistryReader(
      reader([
        row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }),
        row(MOCK_PROVIDER_ID),
      ]),
    )
    .registerCandidate({
      providerId: CONTAINER_PROVIDER_ID,
      priority: 10,
      isHealthy: () => {
        throw new Error("probe exploded");
      },
      getProvider: () => containerProvider,
    })
    .registerCandidate({
      providerId: MOCK_PROVIDER_ID,
      priority: 100,
      getProvider: () => mockProvider,
    });

  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);
});
