/**
 * Wave 6 / Batch 10 — integration wiring assertions.
 *
 * These run against the real service files rather than fixtures, so a future
 * edit that reintroduces a Mock-only path, a competing provider source of
 * truth, randomness in rollout, or an AI dependency in validation fails the
 * suite rather than silently regressing the batch.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const API = "../../services/api/src/";
const SHARED = "../../packages/shared-types/src/";

const labSessions = source(API + "lab-sessions.ts");
const labRuntime = source(API + "lab-runtime.ts");
const labOperations = source(API + "lab-operations.ts");
const labAutomation = source(API + "lab-automation.ts");
const labRegistry = source(API + "lab-provider-registry.ts");
const labTypes = source(SHARED + "labs.ts");

test("shared contract declares the provider-neutral isolation status", () => {
  assert.match(labTypes, /export interface LabProviderIsolationStatus/);
  assert.match(
    labTypes,
    /getIsolationStatus\(sessionId: string\): Promise<LabProviderIsolationStatus>;/,
  );
  for (const assertion of [
    "studentHasProviderAdminAccess",
    "managementPlaneExposed",
    "networkIsolationEnforced",
    "resourceOwnershipScoped",
  ]) {
    assert.ok(labTypes.includes(assertion), `missing assertion: ${assertion}`);
  }
});

test("student provisioning selects a provider and persists it", () => {
  assert.match(labSessions, /chooseLabProviderOrNull\(/);
  assert.match(labSessions, /provider_id:providerId/);
  assert.match(labSessions, /saveProviderRef\(userId,id,providerId,ps\.providerSessionId\)/);
  assert.doesNotMatch(labSessions, /mockLabProvider/);
});

test("start and end resolve the persisted provider, not a hardcoded one", () => {
  assert.match(labSessions, /const provider=providerForRef\(ref\.providerId\);/);
  assert.match(labSessions, /await provider\.start\(ref\.providerSessionId\)/);
  assert.match(labSessions, /await provider\.destroy\(ref\.providerSessionId\)/);
  assert.doesNotMatch(labSessions, /providerId\s*!==\s*"mock"/);
});

test("runtime access, reset and validation are provider-aware", () => {
  assert.match(labRuntime, /getLabProvider/);
  assert.match(labRuntime, /providerId:string;providerSessionId:string;provider:LabProvider/);
  assert.match(labRuntime, /ref\.provider\.getConnection\(/);
  assert.match(labRuntime, /ref\.provider\.reset\(/);
  assert.match(labRuntime, /ref\.provider\.runValidationProbe\(/);
  assert.doesNotMatch(labRuntime, /mockLabProvider/);
});

test("isolation attestation and cleanup are provider-aware", () => {
  assert.match(labOperations, /provider\.getIsolationStatus\(/);
  assert.match(labOperations, /labProviderIsolationMode\(ref\.providerId\)/);
  assert.match(labOperations, /getLabProvider\(ref\.providerId\)\.destroy\(/);
  assert.doesNotMatch(labOperations, /mockLabProvider/);
  assert.doesNotMatch(labOperations, /Unsupported provider for cleanup/);
  // the four isolation assertions must still be enforced
  for (const assertion of [
    "studentHasProviderAdminAccess",
    "managementPlaneExposed",
    "networkIsolationEnforced",
    "resourceOwnershipScoped",
  ]) {
    assert.ok(labOperations.includes(assertion));
  }
});

test("queued provisioning uses provider selection", () => {
  assert.match(labAutomation, /chooseLabProviderOrNull\(definition\.requiredCapabilities, userId\)/);
  assert.match(labAutomation, /provider_id: providerId/);
  assert.doesNotMatch(labAutomation, /mockLabProvider\s*\.\s*provision/);
});

test("registry is the single source of truth and gates are separate", () => {
  assert.match(labRegistry, /lab_provider_registry/);
  assert.match(labRegistry, /TLP_CONTAINER_PROVIDER_ENABLED/);
  assert.match(labRegistry, /isRuntimeEnabled: \(\) => isContainerRuntimeEnabled\(\)/);
  assert.match(labRegistry, /DEPENDENCY_UNAVAILABLE/);
  // resolution must not consult rollout policy
  assert.match(labRegistry, /export function getLabProvider\(providerId: string\): LabProvider/);
  // Container must not be enabled by default anywhere in the registry
  assert.doesNotMatch(labRegistry, /providerId: "container",[\s\S]{0,120}enabled: true/);
});

test("no randomness and no AI dependency in the provider path", () => {
  const files = [
    labSessions,
    labRuntime,
    labOperations,
    labAutomation,
    labRegistry,
    source(API + "lab-provider-rollout.ts"),
    source(API + "lab-provider-selection.ts"),
  ];
  const forbidden = [
    /Math\s*\.\s*random\s*\(/,
    /@anthropic-ai/,
    /from\s+["']openai/,
    /\bollama\b/i,
    /ai[-_]?gateway/i,
  ];
  for (const file of files) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(file, pattern);
    }
  }
});
