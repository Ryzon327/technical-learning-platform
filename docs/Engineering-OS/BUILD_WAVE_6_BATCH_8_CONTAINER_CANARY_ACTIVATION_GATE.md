# Build Wave 6 Batch 8 — Container Provider Canary and Activation Gate

**Date:** 2026-08-12

## Objective

Introduce a deterministic, operationally safe canary gate before the Container Provider can ever be enabled for student workloads.

## Delivered

- complete Container Provider canary lifecycle;
- configuration validation;
- provider health validation;
- capacity validation;
- real canary provisioning;
- runtime isolation attestation;
- start verification;
- deterministic `container.running` validation;
- reset verification;
- cleanup verification;
- server-only canary history;
- provider activation-state model;
- automatic `canary_eligible` transition after a passing canary;
- explicit rule preventing automatic provider enablement;
- administrative canary command.

## Activation principle

A successful canary is **necessary but not sufficient** to enable the Container Provider.

The state progression is:

```text
disabled
  ↓
passing canary
  ↓
canary_eligible
  ↓
explicit administrative approval
  ↓
enabled
```

There is intentionally no trigger that converts `canary_eligible` to `enabled`.

## Canary stages

The canary must pass all stages:

1. configuration;
2. health;
3. capacity;
4. provision;
5. isolation;
6. start;
7. deterministic validation;
8. reset;
9. destroy.

Any failure produces an overall failed canary result.

## Cleanup rule

If a canary fails after provisioning, cleanup is attempted before the result is finalized.

Canary resources must not intentionally remain behind as leaked infrastructure.

## Privacy

Canary history is operational security evidence and is not student-facing data.

No student-facing RLS policy is granted.

## How to run later

The administrative command is:

```bash
npm --workspace @tlp/api run lab:container:canary
```

This command will fail safely unless the Container Provider is explicitly enabled in runtime configuration and its image is approved and available.

## Important

Do not enable the Container Provider for students merely because this code exists.

A real passing canary against the intended runtime host and curated image is required first.

## Deferred

- curated training-image build pipeline;
- signed image provenance;
- student terminal gateway;
- explicit Founder activation command/API;
- limited cohort canary rollout;
- automatic rollback/suspension;
- Proxmox Provider.
