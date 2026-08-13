/**
 * Wave 6 / Batch 10 — lifecycle tests (cases Q, R, S) plus static guards on the
 * validation truth boundary.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  CONTAINER_PROVIDER_ID,
  MOCK_PROVIDER_ID,
  type LabProviderRegistryRecord,
} from "../../services/api/src/lab-provider-rollout";
import {
  LabProviderSelector,
  type LabProviderRegistryReader,
} from "../../services/api/src/lab-provider-selection";

interface ProbeCheck {
  id: string;
  passed: boolean;
}

interface LifecycleProvider {
  id: string;
  destroyed: string[];
  reset: string[];
  destroy(providerSessionId: string): Promise<{ destroyed: true }>;
  resetSession(providerSessionId: string): Promise<{ reset: true }>;
  runValidationProbe(
    providerSessionId: string,
    checks: readonly string[],
  ): Promise<ProbeCheck[]>;
  getIsolationStatus(sessionId: string): Promise<{
    studentHasProviderAdminAccess: boolean;
    managementPlaneExposed: boolean;
    networkIsolationEnforced: boolean;
    resourceOwnershipScoped: boolean;
  }>;
}

function makeProvider(id: string, failing: string[] = []): LifecycleProvider {
  return {
    id,
    destroyed: [],
    reset: [],
    async destroy(providerSessionId: string) {
      this.destroyed.push(providerSessionId);
      return { destroyed: true };
    },
    async resetSession(providerSessionId: string) {
      this.reset.push(providerSessionId);
      return { reset: true };
    },
    async runValidationProbe(_providerSessionId: string, checks: readonly string[]) {
      // Deterministic: outcome depends only on the probe definition.
      return checks.map((checkId) => ({
        id: checkId,
        passed: !failing.includes(checkId),
      }));
    },
    async getIsolationStatus() {
      return {
        studentHasProviderAdminAccess: false,
        managementPlaneExposed: false,
        networkIsolationEnforced: true,
        resourceOwnershipScoped: true,
      };
    },
  };
}

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
    rolloutMode: "off",
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

function lifecycleSelector(records: LabProviderRegistryRecord[]) {
  const mock = makeProvider(MOCK_PROVIDER_ID);
  const container = makeProvider(CONTAINER_PROVIDER_ID);
  const selector = new LabProviderSelector<LifecycleProvider>()
    .setRegistryReader(reader(records))
    .registerCandidate({
      providerId: CONTAINER_PROVIDER_ID,
      priority: 10,
      getProvider: () => container,
    })
    .registerCandidate({
      providerId: MOCK_PROVIDER_ID,
      priority: 100,
      getProvider: () => mock,
    });
  return { selector, mock, container };
}

/* Q. validation derives pass/fail only from deterministic provider probes */
test("Q: validation outcome comes only from the deterministic provider probe", async () => {
  const { selector, container } = lifecycleSelector([
    row(CONTAINER_PROVIDER_ID),
    row(MOCK_PROVIDER_ID),
  ]);
  const resolved = await selector.resolveLabProviderForSession({
    providerId: CONTAINER_PROVIDER_ID,
    providerSessionId: "ctr-1",
  });

  const checks = ["service-listening", "file-created", "package-installed"];
  const first = await resolved.provider.runValidationProbe(
    resolved.providerSessionId,
    checks,
  );
  for (let i = 0; i < 10; i += 1) {
    const repeat = await resolved.provider.runValidationProbe(
      resolved.providerSessionId,
      checks,
    );
    assert.deepEqual(repeat, first);
  }
  assert.equal(resolved.provider, container);
  assert.ok(first.every((check) => check.passed === true));
});

test("Q2: new provider modules contain no AI/LLM dependency and no randomness", () => {
  const files = [
    "../../services/api/src/lab-provider-rollout.ts",
    "../../services/api/src/lab-provider-selection.ts",
  ];
  const forbidden = [
    /\bopenai\b/i,
    /\banthropic\b/i,
    /\bollama\b/i,
    /ai[-_ ]?gateway/i,
    /\bllm\b/i,
    /Math\s*\.\s*random\s*\(/,
  ];

  for (const relative of files) {
    const path = fileURLToPath(new URL(relative, import.meta.url));
    const source = readFileSync(path, "utf8");
    for (const pattern of forbidden) {
      assert.equal(
        pattern.test(source),
        false,
        `${relative} must not match ${String(pattern)}`,
      );
    }
  }
});

/* R. provider-aware cleanup can destroy Container resources */
test("R: cleanup destroys Container resources through the persisted provider", async () => {
  const { selector, container, mock } = lifecycleSelector([
    row(CONTAINER_PROVIDER_ID),
    row(MOCK_PROVIDER_ID),
  ]);
  const resolved = await selector.resolveLabProviderForSession({
    providerId: CONTAINER_PROVIDER_ID,
    providerSessionId: "ctr-cleanup-1",
  });
  await resolved.provider.destroy(resolved.providerSessionId);

  assert.deepEqual(container.destroyed, ["ctr-cleanup-1"]);
  assert.deepEqual(mock.destroyed, []);
});

/* S. existing Container cleanup remains possible even when rollout is off */
test("S: rollout off / suspended does not strand existing Container sessions", async () => {
  const { selector, container } = lifecycleSelector([
    row(CONTAINER_PROVIDER_ID, {
      enabled: false,
      activationState: "suspended",
      rolloutMode: "off",
    }),
    row(MOCK_PROVIDER_ID),
  ]);

  // New provisioning must not pick Container...
  const selection = await selector.chooseLabProvider(["terminal"], "student-1");
  assert.equal(selection.providerId, MOCK_PROVIDER_ID);

  // ...but the existing persisted Container session stays fully operable.
  const resolved = await selector.resolveLabProviderForSession({
    providerId: CONTAINER_PROVIDER_ID,
    providerSessionId: "ctr-legacy-9",
  });
  await resolved.provider.resetSession(resolved.providerSessionId);
  await resolved.provider.runValidationProbe(resolved.providerSessionId, ["x"]);
  const isolation = await resolved.provider.getIsolationStatus("ctr-legacy-9");
  await resolved.provider.destroy(resolved.providerSessionId);

  assert.deepEqual(container.reset, ["ctr-legacy-9"]);
  assert.deepEqual(container.destroyed, ["ctr-legacy-9"]);
  assert.equal(isolation.studentHasProviderAdminAccess, false);
  assert.equal(isolation.managementPlaneExposed, false);
  assert.equal(isolation.networkIsolationEnforced, true);
  assert.equal(isolation.resourceOwnershipScoped, true);
});

test("S2: an existing Mock session is never silently migrated to Container", async () => {
  const { selector, mock, container } = lifecycleSelector([
    row(CONTAINER_PROVIDER_ID, { rolloutMode: "all" }),
    row(MOCK_PROVIDER_ID),
  ]);
  const resolved = await selector.resolveLabProviderForSession({
    providerId: MOCK_PROVIDER_ID,
    providerSessionId: "mock-legacy-1",
  });
  await resolved.provider.destroy(resolved.providerSessionId);
  assert.deepEqual(mock.destroyed, ["mock-legacy-1"]);
  assert.deepEqual(container.destroyed, []);
});
