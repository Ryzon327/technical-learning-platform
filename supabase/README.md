# Supabase

Current Assessment implementation migrations:

- `20260812000100_assessment_foundation.sql`
- `20260812000200_assessment_attempts_scoring.sql`

## Assessment attempts

Attempts are persisted with a frozen assessment/version reference and explicit state:

- `in_progress`
- `submitted`
- `passed`
- `failed`
- `interrupted`

Technical interruption is distinct from failure.

## Answer security

Assessment answer keys remain in server-only `assessment_questions.correct_option_ids`.

Student-delivered question payloads do not include answer keys.

## Mutation boundary

Authenticated users may read their own attempt/result state through RLS.

There are intentionally no direct authenticated insert/update policies for attempt or answer mutation. The trusted API owns:

- attempt creation;
- answer persistence;
- attempt-limit checks;
- deterministic scoring;
- pass/fail persistence.

The browser cannot provide its own score or pass/fail result.
