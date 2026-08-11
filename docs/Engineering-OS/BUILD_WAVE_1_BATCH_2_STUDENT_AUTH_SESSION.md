# Build Wave 1 — Batch 2 Student Authentication and Session

**Status:** Implementation baseline  
**Date:** 2026-08-11

## Implemented

- student email/password registration;
- student email/password sign-in;
- browser sign-out;
- browser session restoration with `getSession`;
- auth-state subscription with `onAuthStateChange`;
- authenticated versus unauthenticated application shell;
- basic accessible authentication forms;
- generic public auth errors;
- explicit email-verification-pending registration state.

## Security decisions

- Browser auth uses only the public Supabase client.
- The service-role key remains server-only.
- Registration submits `display_name` metadata only; role is never submitted by the client.
- Database trigger remains responsible for assigning the `student` role.
- Public sign-in errors remain generic rather than revealing unnecessary account state.
- Authentication is a gate to the learning workspace; authorization remains a separate server/data-layer responsibility.

## Important current limitation

The in-memory identity context uses the default `student` role until authoritative profile/role hydration is implemented.

The client must **not** use that default as authorization truth.

Founder/admin authorization will be resolved from trusted server/database state in a later Wave 1 batch.

## Email verification

Supabase may return a user but no session when email confirmation is enabled. The registration UI explicitly tells the user to verify their email in that state.

The full verification callback and resend experience remains a subsequent batch.

## Next batch

Build Wave 1, Batch 3:

- authoritative profile/role hydration;
- protected server request identity;
- email-verification callback/status;
- password recovery.
