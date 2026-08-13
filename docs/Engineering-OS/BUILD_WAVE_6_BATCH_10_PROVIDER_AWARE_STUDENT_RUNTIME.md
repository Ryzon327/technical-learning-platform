# BUILD — Wave 6 / Batch 10

## Provider-Aware Student Runtime + Controlled Container Rollout Integration

**Status:** implemented
**Scope:** Lab Engine provider integration only. No unrelated architecture was
redesigned.

---

## 1. Purpose

Batch 9 delivered the Container Provider, its runtime hardening, its canary
activation gate, and the controlled rollout **database policy**. None of that
was reachable by students: `requestLabSession()` still provisioned through the
Mock Provider directly, and every post-provisioning path was guarded by
Mock-only checks.

Batch 10 closes that gap. It wires the persisted rollout policy into student
provisioning and makes the whole post-provisioning lifecycle resolve providers
from the persisted session reference.

The Container Provider becomes usable by students **only** through the explicit
controlled rollout gate. Mock remains the safe fallback.

---

## 2. Architecture

```
Student Request
      |
      v
Lab Definition (requiredCapabilities)
      |
      v
Provider Selection                <-- NEW: the only place a provider is chosen
      |
      +--> persisted DB activation/rollout policy   (lab_provider_registry)
      +--> deterministic user rollout eligibility   (SHA-256 bucketing)
      +--> runtime enablement                       (TLP_CONTAINER_PROVIDER_ENABLED)
      +--> provider health
      +--> provider capacity
      +--> required capabilities
      |
      v
Selected Provider  ->  Mock | Container
      |
      v
lab_session_provider_references (provider_id, provider_session_id)
      |
      v
authoritative provider for the entire remaining session lifecycle
```

### Modules

| File | Role |
| --- | --- |
| `services/api/src/lab-provider-rollout.ts` | Pure rollout policy. No I/O, no randomness, no AI dependency. |
| `services/api/src/lab-provider-selection.ts` | Registry-aware selection + persisted-reference resolution. Dependency-injected, unit-testable without a database. |
| `services/api/src/lab-provider-registry.ts` | The single source of truth. Owns the provider implementations, the runtime-enablement gate, the control-plane reader and the selection/resolution API. |
| `packages/shared-types/src/labs.ts` | `LabProviderIsolationStatus` + `LabProvider.getIsolationStatus()`. |

### Architectural rule

Provider selection happens **only** when provisioning a Lab Session. After
provisioning, `lab_session_provider_references.provider_id` is authoritative and
a provider is never re-selected for that session.

This is enforced structurally: `chooseLabProvider()` is the only function that
consults the rollout policy, and `getLabProvider()` /
`resolveLabProviderForSession()` deliberately do not.

---

## 3. Provider selection

`chooseLabProvider(requiredCapabilities, userId)` (and its non-throwing sibling
`chooseLabProviderOrNull`) evaluates candidates in
`lab_provider_registry.priority` order (ascending by default; configurable via
`setPriorityDirection`) and returns the first that passes **all** of:

1. **Control plane** — see §5.
2. **Runtime enablement** — this API instance is technically permitted to use
   the provider runtime.
3. **Health** — provider reports healthy.
4. **Capacity** — provider reports available capacity.
5. **Capabilities** — every `requiredCapabilities` entry from the Lab Definition
   is supported.

If a candidate fails any check, evaluation continues with the next candidate.
Container being ineligible, disabled, unhealthy, full, runtime-disabled or
capability-short never fails an otherwise-valid student request that Mock can
satisfy.

If no candidate passes, `LabProviderUnavailableError` is thrown with
`code = "DEPENDENCY_UNAVAILABLE"`, preserving the existing API contract.

A candidate probe that throws is treated as a rejection of that candidate only;
it never takes down the request.

Every selection returns a full `evaluations[]` trace (per provider: priority,
control-plane decision, rejection reason). This is what the audit log should
record.

---

## 4. Persisted provider authority

```ts
const ref = await getProviderRef(userId, sessionId);  // lab_session_provider_references
const provider = getLabProvider(ref.providerId);      // no rollout check
await provider.start(ref.providerSessionId);
```

* `getLabProvider(providerId)` maps a **persisted** id to a provider instance.
* Unknown ids fail closed with `UnknownLabProviderError`
  (`code = "UNKNOWN_PROVIDER"`). Supported ids in this build: `mock`,
  `container`.
* Rollout and activation state are **not** consulted here. Turning rollout off,
  or suspending the provider, must never strand an existing session.

---

## 5. Activation vs runtime enablement

Two independent gates, both required for **new** student Container
provisioning:

| Gate | Source | Meaning |
| --- | --- | --- |
| Runtime enablement | `TLP_CONTAINER_PROVIDER_ENABLED=true` | This API instance is *technically permitted* to use the Container runtime. |
| Control-plane activation | `lab_provider_registry` row | Students are *authorised* to be placed on Container. |

Runtime enablement alone authorises nothing. Control-plane activation alone
cannot force an instance that lacks the runtime to use it.

Control-plane activation requires all of:

```
provider_id      = 'container'
enabled          = true
activation_state = 'enabled'
rollout_mode    != 'off'
```

`activation_state = 'canary_passed'` is explicitly **not** sufficient. Passing
canary never auto-enables student traffic; promotion to `enabled` stays a
deliberate operator action.

A missing `container` row fails closed. A missing row for a legacy/default
provider (`mock`) does not, so Mock keeps working on installations whose
registry table predates it.

---

## 6. Rollout modes

| Mode | Behaviour |
| --- | --- |
| `off` | Never eligible. |
| `allowlist` | Eligible when `userId ∈ rollout_allowed_user_ids`. Empty/absent user id fails closed. |
| `all` | Every user eligible. |
| `percentage` | Eligible when the user's deterministic bucket `< rollout_percentage`. |

An unparseable or unknown persisted mode fails closed
(`ROLLOUT_MODE_UNKNOWN`). `rollout_percentage` is normalised: non-numeric → 0,
negative → 0, `> 100` → 100, fractional → floored.

---

## 7. Deterministic percentage bucketing

```
digest  = SHA-256("tlp:container-rollout:" + userId)
bucket  = uint32_be(digest[0..3]) mod 100          -> 0..99
eligible = bucket < rollout_percentage
```

Properties:

* **Deterministic** — no `Math.random()`, anywhere in the rollout path. The
  verifier enforces this.
* **Stable** — the same user maps to the same bucket forever, so a student does
  not oscillate between providers between requests.
* **Monotonic** — raising the percentage only adds users; lowering it only
  removes users from the top of the range.
* **Stateless** — no bucket assignment is persisted, so there is no migration or
  backfill and no per-user row to keep consistent.
* `0%` → nobody, `1%` → exactly bucket 0, `50%` → buckets 0-49, `100%` →
  everybody.

`CONTAINER_ROLLOUT_HASH_NAMESPACE` is a protocol constant: changing it
re-shuffles every user's bucket.

---

## 8. Fallback behaviour

Mock remains the safe fallback while it is enabled. Container ineligibility is
never a student-visible error. The only student-visible failure is
`DEPENDENCY_UNAVAILABLE`, and only when *no* provider can satisfy the Lab
Definition — the pre-existing behaviour.

Queued provisioning performs selection **at retry time** using
`definition.requiredCapabilities` and the session's `userId`, so a queued
session provisioned after a rollout change lands on the provider that is correct
at that moment. An already-provisioned session's provider is never changed.

---

## 9. Existing-session behaviour

* Persisted `provider_id = 'mock'` always routes to `MockLabProvider`,
  regardless of Container rollout state.
* Persisted `provider_id = 'container'` always routes to
  `ContainerLabProvider`, even after rollout is switched off or the provider is
  suspended.
* Rollout controls **new** provider selection only. It never makes an existing
  provider resource impossible to start, reset, validate, access, destroy or
  clean up.
* Operational suspension stops **new** Container provisioning; existing
  Container cleanup remains possible. Test `S` covers exactly this.
* No session is ever silently migrated between providers.

---

## 10. Validation truth boundary

Validation remains deterministic and AI-independent.

`validateLabSession()` resolves the persisted provider and calls
`provider.runValidationProbe(...)`. Pass/fail is derived **only** from the
structured probe result. No model, no grader, no heuristic.

Explicitly absent from the provider path: OpenAI, Anthropic, Ollama, AI Gateway,
LLM grading, AI pass/fail decisions. Enforced by test `Q2` (source scan of the
new modules) and by the verifier's targeted import checks — not by broad text
matching such as `AI.*validation`.

---

## 11. Cleanup behaviour

`cleanupLabSessionResources()` and the recovery path resolve the persisted
provider reference and call `provider.destroy(providerSessionId)`. Container is
no longer rejected as unsupported. Retry, recovery and audit semantics are
unchanged; only the provider lookup changed.

---

## 12. Security properties

Preserved from earlier batches, and asserted here:

* `getIsolationStatus()` is now part of the shared `LabProvider` contract, so
  isolation attestation is provider-neutral rather than Mock-shaped.
* The four mandatory assertions are unchanged and must not be weakened:
  `studentHasProviderAdminAccess = false`, `managementPlaneExposed = false`,
  `networkIsolationEnforced = true`, `resourceOwnershipScoped = true`.
  `isolationMode` may be provider-specific.
* Container remains **disabled by default**: no TypeScript hardcodes
  `enabled: true` for Container, and no committed env sample sets
  `TLP_CONTAINER_PROVIDER_ENABLED=true`.
* The database control plane cannot be bypassed from TypeScript — the in-memory
  registry flags are descriptive metadata only.
* No Docker socket exposure and no provider management interface is introduced.
  This batch adds no new runtime surface at all; it is a selection and
  resolution layer.
* Unknown provider ids fail closed everywhere.
* Student ownership controls, deterministic validation, audit behaviour and
  queue safety are untouched.

---

## 13. Tests

`tests/wave6-batch10/` (node:test; no new dependency).

| Case | Test |
| --- | --- |
| A | rollout `off` → Container not selected |
| B | `activation_state != enabled` → Container not selected (incl. `canary_passed`) |
| B2/B3 | registry `enabled = false`, missing Container row → fail closed |
| C | allowlisted user eligible |
| D | non-allowlisted user ineligible |
| D2 | allowlist with no user id fails closed |
| E | percentage bucketing deterministic across repeated calls |
| E2 | buckets are spread (a constant/random implementation would fail) |
| F | same user → same bucket → same eligibility |
| F2 | 0% excludes everybody |
| G | 100% includes everybody |
| H | `all` includes everybody |
| H2 | unknown persisted mode fails closed |
| H3 | percentage clamping/flooring |
| I | Container runtime disabled → Mock fallback |
| J | Container unhealthy → Mock fallback |
| K | Container at capacity → Mock fallback |
| L | Container missing required capability → Mock fallback |
| M | eligible healthy Container is selected |
| N | persisted `mock` resolves to Mock |
| O | persisted `container` resolves to Container |
| P | unknown persisted provider fails closed |
| Q | validation outcome comes only from the deterministic probe |
| Q2 | new modules contain no AI dependency and no `Math.random()` |
| R | provider-aware cleanup destroys Container resources |
| S | existing Container cleanup works with rollout off / suspended |
| S2 | existing Mock session is never migrated to Container |

`lab-integration-wiring.w6b10.test.ts` asserts the same properties against the
real service files: shared contract present; provisioning selects and persists a
provider; start/end/access/reset/validation/attestation/cleanup all go through
the persisted provider; queued drain uses selection; the registry keeps the two
gates separate and Container off by default; and no `Math.random()` or AI
dependency exists anywhere in the provider path.

Plus: registry priority ordering, `DEPENDENCY_UNAVAILABLE` when nothing is
eligible, and a throwing provider probe not failing the request.

Run: `bash scripts/verify-wave6-batch10.sh` (or `npm run test:wave6-batch10`).

---

## 14. Verification

`scripts/verify-wave6-batch10.sh` checks, in order:

1. shared provider contract
2. provider-aware architecture
3. rollout policy integration (fields consulted, SHA-256, no `Math.random`)
4. no direct Mock-only student provisioning path
5. Container default-off posture
6. AI-independent deterministic validation
7. typecheck
8. Batch 10 tests
9. existing Wave 6 baseline (`scripts/verify-lab-engine-completion.sh`)

`scripts/verify-lab-engine-completion.sh` is patched so its controlled-rollout
gap message is emitted **only** when
`tlp_w6b10_provider_wiring_unwired` reports the wiring is genuinely absent. The
checks live in `scripts/lib/w6b10-provider-wiring-checks.sh` and are structural
and targeted; no brittle broad patterns.

---

## 15. Integrated call sites

`scripts/apply-wave6-batch10.py` replaces six repository files with their
provider-aware versions. Each replacement is verified against the SHA-256 of the
expected pre-Batch-10 content first: a file that matches neither the pre-image
nor the post-image is reported as drift and left untouched (`--force` overrides
deliberately). Re-running the script is a no-op.

**`packages/shared-types/src/labs.ts`**
Adds `LabProviderIsolationStatus` and declares
`getIsolationStatus(sessionId: string): Promise<LabProviderIsolationStatus>` on
`LabProvider`. Both concrete providers already implemented it; the contract is
now provider-neutral. No existing type changed.

**`services/api/src/lab-provider-registry.ts`**
Rewritten so there is exactly one source of truth per concern. The in-memory map
now records only what exists in the build (implementation, fallback priority,
isolation label) plus the runtime-enablement predicate; the `enabled` flag
returned by `listRegisteredLabProviders()` is derived from
`TLP_CONTAINER_PROVIDER_ENABLED` rather than being a second, hand-maintained
switch. Student authorization comes solely from `public.lab_provider_registry`,
read through a 5-second cache that fails closed (a registry read error yields no
rows, so Container is not authorized and Mock still serves).

Exports: `getLabProvider` (sync, resolution-only, fails closed),
`resolveLabProviderForSession`, `chooseLabProvider`, `chooseLabProviderOrNull`,
`evaluateLabProviderCandidates`, `labProviderIsolationMode`,
`isContainerRuntimeEnabled`, `resetLabProviderRegistryCache`.
`chooseLabProvider` now takes `(requiredCapabilities, userId)` and returns
`{ providerId, provider, evaluations }`, because the caller must persist the id;
`chooseLabProviderInstance` is kept as a deprecated shim for any caller that
only wanted the implementation.

**`services/api/src/lab-sessions.ts`**
`requestLabSession()` runs selection before creating the session row. An
`unsatisfiable` result (no provider can ever serve this definition under current
policy) raises `DEPENDENCY_UNAVAILABLE` before anything is written; a
`transient` result (everything healthy-but-full or unhealthy) creates the row and
queues it, exactly as the old Mock capacity check did. On success the selected
provider id is written to `lab_sessions.provider_id` and to
`lab_session_provider_references` alongside the provider's session id.
`startLabSession()` and `endLabSession()` resolve the persisted reference through
`providerForRef()` and call `provider.start` / `provider.destroy`. The
`ref.providerId !== "mock"` guards and all direct `mockLabProvider` calls are
gone. Ownership filters, transition guards, audit events and the cleanup-failure
path are unchanged.

**`services/api/src/lab-runtime.ts`**
`providerRef()` no longer rejects non-Mock providers; it returns
`{ providerId, providerSessionId, provider }`. Access delivery uses
`provider.getConnection`, reset uses `provider.reset`, validation uses
`provider.runValidationProbe`. Reset limits, runtime-state persistence,
validation-run persistence and audit events are unchanged.

**`services/api/src/lab-operations.ts`**
`attestLabIsolation()` resolves the persisted provider and calls
`provider.getIsolationStatus`. The four mandatory assertions are unchanged;
only `isolationMode` became provider-specific via `labProviderIsolationMode()`
(`mock-isolated` / `container-isolated`). `cleanupLabSessionResources()` destroys
through the persisted provider — the "Unsupported provider for cleanup" rejection
is removed — and an unresolvable provider id still flows into the existing
retry/recovery path. `recoverLabSession()` is unchanged and inherits the
provider-aware cleanup.

**`services/api/src/lab-automation.ts`**
Queued drain loads the definition, runs `chooseLabProviderOrNull` per session,
then claims the row with the selected `provider_id` and provisions through the
selected provider. A `transient` failure breaks the drain loop (the old
stop-draining behaviour); an `unsatisfiable` failure marks that one session
`provisioning_failed` and continues. The operational snapshot stays Mock-oriented
as the legacy/default provider, but its early return now applies only when the
Container runtime is disabled on this instance, so it cannot block
Container-eligible queued sessions. An already provisioned session is never
re-selected.

## 16. Rollback considerations

Rollback is graduated; the code change rarely needs to be reverted.

1. **Stop new Container provisioning (seconds, no deploy).**
   `UPDATE public.lab_provider_registry SET rollout_mode = 'off' WHERE provider_id = 'container';`
   Existing Container sessions keep running and remain fully cleanable.

2. **Suspend the provider (control plane).**
   Set `activation_state` away from `enabled`, or `enabled = false`. New
   provisioning stops; existing sessions stay operable by design.

3. **Disable the runtime on an instance.**
   `TLP_CONTAINER_PROVIDER_ENABLED=false` and restart. Selection skips Container
   on that instance.

4. **Revert the code.**
   Every replaced file is copied to `.w6b10-backup/<timestamp>/` before the
   rewrite, so reverting is a file copy back (or a git revert). Reverting restores Mock-only
   provisioning; any Container sessions still alive must be drained *before*
   reverting, because the reverted code rejects Container references as
   unsupported.

Ordering rule: **drain before revert.** Steps 1-3 are always safe and are the
correct first response to any incident.

No schema change is introduced by this batch, so there is no database rollback.
No bucket assignment is persisted, so no data cleanup is required.
