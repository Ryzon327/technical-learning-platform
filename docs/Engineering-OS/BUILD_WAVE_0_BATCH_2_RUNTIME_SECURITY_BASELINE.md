# Build Wave 0 — Batch 2 Runtime and Security Baseline

**Status:** Implemented baseline  
**Date:** 2026-08-11

## This batch establishes

- runtime configuration loading and production validation;
- normalized `AppError` contract;
- structured JSON logging with basic secret-field redaction;
- non-secret health metadata;
- first reviewed Supabase migration baseline;
- local developer health check;
- baseline committed-secret scan;
- npm high/critical vulnerability check;
- reproducible CI installs using `npm ci`.

## Important boundaries

This is an engineering foundation, not the final security implementation.

The security scan is intentionally a baseline defense and does not replace:

- GitHub secret scanning where available;
- provider-side credential controls;
- code review;
- SAST/DAST later;
- application authorization testing;
- Supabase RLS testing;
- infrastructure hardening.

## Database boundary

The first migration does not create product-domain tables. Authentication, curriculum, learning, evidence, labs, certificates, and other domain schemas remain owned by their implementation waves.

## Exit direction

After validating this batch, Build Wave 0 should finish its remaining developer bootstrap/observability conventions and then transition into **Build Wave 1 — Platform Kernel and Authentication**.
