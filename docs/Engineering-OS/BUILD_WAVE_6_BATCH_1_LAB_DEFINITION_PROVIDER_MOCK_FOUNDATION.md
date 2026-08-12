# Build Wave 6 Batch 1 — Lab Definition, Provider Contract, and Mock Foundation

## Scope
Implements the first dependency slice of the approved Lab Engine sequence: LAB-001 Lab Definition Model, LAB-002 Lab Provider Interface, and the safe foundation of LAB-010 Mock Lab Provider.

## Architectural boundaries
- Lab Definitions describe capabilities, not Proxmox/container/cloud placement.
- Provider credentials remain outside definitions and student responses.
- Business logic depends on the `LabProvider` contract, not provider SDKs.
- Mock infrastructure is deterministic, credential-free, and supports controlled failure simulation.
- No AI decides validation, provisioning, safety classification, or lifecycle state.

## Delivered
- Shared Lab Definition and validation contracts.
- Explicit safety and accessibility metadata.
- Provider capability/capacity/session/connection/health/validation contracts.
- Deterministic in-memory Mock Provider with capacity, provisioning, health, cleanup, and validation failure modes.
- Database foundation for versioned Lab Definitions with published-only student read policy.
- Protected mock-provider capability endpoint for integration development.
- Verification, unit tests, security boundary checks, and smoke coverage.

## Intentionally deferred
LAB-003 persistent student Lab Session Lifecycle, LAB-008 deterministic validation profiles/check execution, LAB-007 isolation enforcement, LAB-004 capacity scheduling, LAB-005 access delivery, LAB-006 cleanup orchestration, LAB-009 recovery, LAB-011 container provider, and LAB-012 Proxmox provider.

## Exit signal
Batch 1 is complete when typecheck/tests/build/security/smoke pass and the Mock Provider can execute its deterministic contract without real infrastructure credentials.
