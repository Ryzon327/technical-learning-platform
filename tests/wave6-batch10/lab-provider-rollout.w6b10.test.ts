/**
 * Wave 6 / Batch 10 — rollout policy tests (cases A-H).
 * Framework: node:test (zero dependency, runs under `node --test` or `tsx --test`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONTAINER_PROVIDER_ID,
  ROLLOUT_BUCKET_COUNT,
  computeRolloutBucket,
  evaluateContainerRollout,
  isUserInRolloutPercentage,
  normalizeRolloutPercentage,
  type LabProviderRegistryRecord,
} from "../../services/api/src/lab-provider-rollout";

function record(
  overrides: Partial<LabProviderRegistryRecord> = {},
): LabProviderRegistryRecord {
  return {
    providerId: CONTAINER_PROVIDER_ID,
    providerType: "container",
    enabled: true,
    priority: 10,
    configuration: null,
    activationState: "enabled",
    lastCanaryPassedAt: "2026-08-01T00:00:00.000Z",
    rolloutMode: "off",
    rolloutPercentage: 0,
    rolloutAllowedUserIds: [],
    ...overrides,
  };
}

/* A. rollout off => Container not selected */
test("A: rollout_mode off denies Container selection", () => {
  const decision = evaluateContainerRollout(
    record({ rolloutMode: "off" }),
    "user-1",
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "ROLLOUT_MODE_OFF");
});

/* B. activation_state != enabled => Container not selected */
test("B: non-enabled activation_state denies Container selection", () => {
  for (const state of ["canary_passed", "suspended", "disabled", null, ""]) {
    const decision = evaluateContainerRollout(
      record({ activationState: state, rolloutMode: "all" }),
      "user-1",
    );
    assert.equal(decision.allowed, false, `activation_state=${String(state)}`);
    assert.equal(decision.reason, "PROVIDER_ACTIVATION_STATE_NOT_ENABLED");
  }
});

test("B2: registry enabled=false denies Container selection", () => {
  const decision = evaluateContainerRollout(
    record({ enabled: false, rolloutMode: "all" }),
    "user-1",
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "PROVIDER_REGISTRY_DISABLED");
});

test("B3: missing Container registry row fails closed", () => {
  const decision = evaluateContainerRollout(null, "user-1");
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "PROVIDER_RECORD_MISSING");
});

/* C. allowlist user included => eligible */
test("C: allowlisted user is eligible", () => {
  const decision = evaluateContainerRollout(
    record({
      rolloutMode: "allowlist",
      rolloutAllowedUserIds: ["user-a", "user-b"],
    }),
    "user-b",
  );
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "ROLLOUT_USER_ALLOWLISTED");
});

/* D. allowlist user excluded => not eligible */
test("D: non-allowlisted user is not eligible", () => {
  const decision = evaluateContainerRollout(
    record({ rolloutMode: "allowlist", rolloutAllowedUserIds: ["user-a"] }),
    "user-z",
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "ROLLOUT_USER_NOT_ALLOWLISTED");
});

test("D2: allowlist mode with no user id fails closed", () => {
  const decision = evaluateContainerRollout(
    record({ rolloutMode: "allowlist", rolloutAllowedUserIds: ["user-a"] }),
    "",
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "ROLLOUT_USER_ID_MISSING");
});

/* E. percentage rollout deterministic */
test("E: percentage bucketing is deterministic across repeated calls", () => {
  const userId = "student-00417";
  const first = computeRolloutBucket(userId);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(computeRolloutBucket(userId), first);
  }
  assert.ok(Number.isInteger(first));
  assert.ok(first >= 0 && first < ROLLOUT_BUCKET_COUNT);
});

test("E2: percentage rollout never uses randomness (distinct users differ)", () => {
  const buckets = new Set<number>();
  for (let i = 0; i < 200; i += 1) {
    buckets.add(computeRolloutBucket(`student-${i}`));
  }
  // A stable hash spreads users; a constant would collapse to one bucket.
  assert.ok(buckets.size > 50, `expected spread, got ${buckets.size} buckets`);
});

/* F. same user always maps to same percentage bucket */
test("F: eligibility is stable for the same user and percentage", () => {
  const userId = "student-42";
  const bucket = computeRolloutBucket(userId);
  const percentage = bucket + 1; // guarantees inclusion
  for (let i = 0; i < 25; i += 1) {
    const decision = evaluateContainerRollout(
      record({ rolloutMode: "percentage", rolloutPercentage: percentage }),
      userId,
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.bucket, bucket);
  }
  const excluded = evaluateContainerRollout(
    record({ rolloutMode: "percentage", rolloutPercentage: bucket }),
    userId,
  );
  assert.equal(excluded.allowed, false);
  assert.equal(excluded.reason, "ROLLOUT_PERCENTAGE_BUCKET_EXCLUDED");
});

test("F2: 0 percent excludes everybody", () => {
  for (let i = 0; i < 100; i += 1) {
    assert.equal(isUserInRolloutPercentage(`student-${i}`, 0), false);
  }
});

/* G. 100% percentage rollout => eligible */
test("G: 100 percent includes everybody", () => {
  for (let i = 0; i < 100; i += 1) {
    const decision = evaluateContainerRollout(
      record({ rolloutMode: "percentage", rolloutPercentage: 100 }),
      `student-${i}`,
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "ROLLOUT_PERCENTAGE_BUCKET_INCLUDED");
  }
});

/* H. all rollout => eligible */
test("H: rollout_mode all includes everybody", () => {
  for (const userId of ["a", "b", "student-99", "00000000-0000-0000-0000-0"]) {
    const decision = evaluateContainerRollout(
      record({ rolloutMode: "all" }),
      userId,
    );
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, "ROLLOUT_MODE_ALL");
  }
});

test("H2: unknown persisted rollout_mode fails closed", () => {
  const decision = evaluateContainerRollout(
    record({ rolloutMode: "gradual-ish" }),
    "user-1",
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "ROLLOUT_MODE_UNKNOWN");
});

test("H3: percentage values are clamped and floored", () => {
  assert.equal(normalizeRolloutPercentage(-10), 0);
  assert.equal(normalizeRolloutPercentage(250), 100);
  assert.equal(normalizeRolloutPercentage("37.9"), 37);
  assert.equal(normalizeRolloutPercentage(Number.NaN), 0);
  assert.equal(normalizeRolloutPercentage(undefined), 0);
});
