# Supabase

Current Assessment migrations:

- `20260812000100_assessment_foundation.sql`
- `20260812000200_assessment_attempts_scoring.sql`
- `20260812000300_readiness_test_out.sql`

## Readiness and test-out

Test-out must be explicitly enabled and must use an `evidence_producing` assessment.

A successful test-out preserves `assessment-attempt:<attempt-id>` as the authoritative source reference, advances mapped competency through the trusted server flow, records approved prerequisite satisfaction, clears matching review state, and appends learning history.

An unsuccessful test-out does not remove progress, demote competency, or create prerequisite satisfaction. It creates an understandable review recommendation.

## Evidence Engine boundary

Wave 4 preserves the authoritative assessment source record. The later Evidence Engine converts eligible source outcomes into canonical Evidence Records with provenance.
