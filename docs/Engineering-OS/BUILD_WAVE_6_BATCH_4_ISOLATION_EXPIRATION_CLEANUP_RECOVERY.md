# Build Wave 6 Batch 4 — Isolation, Expiration, Cleanup, and Recovery

**Date:** 2026-08-12

This batch advances the Lab Engine safety and operations baseline before any real infrastructure provider is introduced. It adds provider isolation attestation, access revocation on expiration and cleanup, bounded cleanup retries, escalation to `recovery_required`, an operational-attention view, private student operation history, and protected isolation/expiration/cleanup/recovery API routes.

Expiration is an infrastructure-capacity control, not learning failure. Cleanup follows automatic attempt → bounded retry → escalation. AI is not used as the source of truth for any isolation, cleanup, expiration, or recovery decision.
