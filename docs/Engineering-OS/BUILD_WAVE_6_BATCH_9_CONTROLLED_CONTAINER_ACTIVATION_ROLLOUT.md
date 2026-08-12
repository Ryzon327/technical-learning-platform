# Build Wave 6 Batch 9 — Controlled Container Provider Activation and Rollout

**Date:** 2026-08-12

## Objective

Turn the Batch 8 canary gate into a controlled operational rollout model without allowing a passing canary to become automatic student production authorization.

## Delivered

- explicit Container Provider activation service;
- persistent rollout mode;
- rollout allowlist;
- deterministic percentage rollout;
- all-user rollout mode;
- suspension;
- disable/rollback;
- audited activation/suspension/disable operations;
- database-level activation guard;
- database-level passing-canary evidence guard;
- database-level rollback safety;
- explicit operator command;
- reusable deterministic rollout evaluator.

## State model

```text
disabled
   ↓
passing canary
   ↓
canary_eligible
   ↓
explicit operator activation
   ↓
enabled
   ↓
allowlist | percentage | all
```

Operational rollback:

```text
enabled
   ├──> suspended
   └──> disabled
```

Both `suspended` and `disabled` force rollout mode to `off`.

## Important distinction

`canary_eligible` is **not** equivalent to `enabled`.

The rollout evaluator refuses all users unless the provider's activation state is explicitly `enabled`.

This remains true even if the user is already present in an allowlist.

## Safe first rollout

The expected first real rollout is:

```text
mode = allowlist
users = Founder-controlled test accounts only
```

Do not begin with percentage or all-user rollout.

## Percentage rollout

Percentage rollout uses a deterministic hash of:

```text
providerId:userId
```

A user therefore stays in the same rollout bucket rather than randomly changing provider eligibility between requests.

## Database enforcement

The database independently refuses a transition to `enabled` unless:

- the previous state is `canary_eligible`;
- a passing canary timestamp exists;
- an explicit rollout mode is supplied;
- allowlist mode contains at least one user;
- percentage mode is at least 1%.

This protects the activation boundary even if an application-layer bug is introduced.

## Administrative command

Status:

```bash
npm --workspace @tlp/api run lab:container:rollout -- status
```

First limited activation:

```bash
npm --workspace @tlp/api run lab:container:rollout -- \
  activate \
  --actor <FOUNDER_USER_ID> \
  --mode allowlist \
  --user <TEST_USER_ID>
```

Emergency suspension:

```bash
npm --workspace @tlp/api run lab:container:rollout -- \
  suspend \
  --actor <FOUNDER_USER_ID> \
  --reason "Operational safety hold"
```

Full disable:

```bash
npm --workspace @tlp/api run lab:container:rollout -- \
  disable \
  --actor <FOUNDER_USER_ID> \
  --reason "Roll back Container Provider"
```

## Still deferred

This batch does not automatically route students to Container Provider infrastructure.

Before that integration is enabled, the Lab Engine completion review must confirm that the controlled rollout policy is consulted by the provider-selection/runtime path and that a safe student access mechanism exists.

## Next checkpoint

After this batch, perform the **Wave 6 Lab Engine completion review against LAB-001 through LAB-012**.

Do not add more infrastructure simply because the current batches are green. The review determines whether another implementation batch is actually necessary before Wave 6 closure.
