# Build Wave 6 Batch 5 — Health, Capacity, and Lifecycle Automation

**Date:** 2026-08-12

Completes the Mock Provider operational control loop before any real infrastructure provider is introduced.

Delivered: provider health/capacity snapshots, server-only operational history, deterministic queue admission, FIFO queue draining, automatic due-session expiration, expiration-driven cleanup scheduling, processing of pending/failed cleanup operations, duplicate open-operation protection, and a single `runLabAutomationCycle()` entry point for future scheduler integration.

Queued Lab Sessions are provisioned only when provider health is `healthy` and capacity is available. Degraded or unavailable providers receive no new work.

Expiration is infrastructure lifecycle control, not learning failure. The automation cycle does not modify competency, progress, assessment outcomes, evidence, or certificates.

The control loop is deterministic: sample health/capacity → expire due sessions → process cleanup → drain the queue → persist a cycle summary.

Provider snapshots and automation-cycle history remain server-only operational data. Scheduler/cron binding is deliberately deferred to the Operations/Deployment layer.

Deferred: deployment scheduler wiring, richer Founder operations dashboard, multi-provider placement, Container Provider, Proxmox Provider, and provider-specific repair.
