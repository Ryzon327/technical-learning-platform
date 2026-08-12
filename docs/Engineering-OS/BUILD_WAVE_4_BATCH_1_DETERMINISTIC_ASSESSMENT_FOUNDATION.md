# Build Wave 4 Batch 1 — Deterministic Assessment Foundation

**Status:** Implementation package
**Date:** 2026-08-12

## Objective
Establish the server-authoritative assessment definition and deterministic scoring foundation required for readiness assessment and test-out, without prematurely implementing the Evidence Engine.

## Implements
- Stable/versioned assessment definitions.
- Practice, diagnostic, and evidence-producing classifications.
- Stable/versioned question representation.
- Deterministic exact-answer scoring with explicit pass thresholds.
- Approved competency mapping metadata.
- Attempt-limit policy field for later enforcement.
- Published-only student assessment discovery.
- Server-only question/answer-key persistence boundary.

## Guardrails
- AI does not score, pass, fail, alter thresholds, or create competency mappings.
- Student clients do not receive trusted answer keys from the database.
- Evidence-producing assessments require competency mappings.
- This batch does not create trusted Evidence Records; that remains an Evidence Engine responsibility.
- Technical interruption semantics and persisted attempts are implemented in later Wave 4 batches.

## Verification
`bash scripts/verify-wave4.sh` must pass typecheck, tests, build, security scan, and API smoke checks.
