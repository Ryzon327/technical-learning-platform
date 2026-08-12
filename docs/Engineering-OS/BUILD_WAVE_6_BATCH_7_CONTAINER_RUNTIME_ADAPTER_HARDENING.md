# Build Wave 6 Batch 7 — Container Runtime Adapter and Hardening

**Date:** 2026-08-12

## Objective

Connect the already-approved Container Provider contract to a real local container-engine CLI boundary without enabling the provider for students yet.

The Container Provider remains disabled by default.

## Delivered

- runtime adapter abstraction for testability;
- Docker-compatible CLI adapter;
- explicit runtime enablement flag;
- explicit image allowlist;
- no implicit image pulling;
- required non-root image default user;
- TLP-managed session naming and labels;
- CPU, memory, PID, and temporary-filesystem limits;
- `network=none` baseline;
- read-only root filesystem;
- all Linux capabilities dropped;
- `no-new-privileges`;
- runtime socket-mount detection;
- managed-resource ownership checks;
- real create/start/stop/reset/destroy runtime operations;
- runtime-backed capacity;
- runtime-backed health;
- runtime-backed isolation attestation;
- bounded built-in validation probes;
- rejection of arbitrary/unregistered validation probes;
- tests that do not require Docker to be installed;
- persistent security metadata for the Container Provider.

## Important deployment behavior

This batch does **not** automatically activate containers for students.

Activation requires all of the following later:

1. `TLP_CONTAINER_PROVIDER_ENABLED=true`;
2. an explicitly approved default image;
3. that image included in the allowlist;
4. the image already available on the runtime host;
5. the image declaring a non-root default user;
6. a tested student terminal/access gateway;
7. successful canary verification.

Until those conditions are met, the Container Provider reports unavailable and the existing Mock Provider remains the active implementation.

## No implicit image pull

The provider uses `docker image inspect` before container creation.

If the image does not already exist locally, provisioning fails safely. The LMS does not pull arbitrary images from registries during a student request.

## Security posture

The baseline container is created with:

- no network;
- read-only root filesystem;
- `CAP_DROP=ALL`;
- `no-new-privileges`;
- bounded memory;
- bounded CPU;
- bounded PID count;
- bounded `/tmp`;
- no runtime-engine socket mount;
- a required non-root image user.

These are platform defaults, not student-controlled options.

## Validation

Batch 7 deliberately supports only a small built-in probe registry:

- `container.running`;
- `security.nonroot`;
- `security.readonly-rootfs`;
- `security.no-network`.

Arbitrary commands from curriculum or student input are not executed.

Course-specific deterministic validation adapters remain a future Lab Engine task.

## Deferred

- student terminal gateway;
- curated training-image build pipeline;
- signed image provenance;
- course-specific container probe registry;
- provider canary activation;
- provider selection from persistent registry state;
- Container Provider production enablement;
- Proxmox Provider.
