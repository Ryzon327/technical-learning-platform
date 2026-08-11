# Build Wave 1 — Batch 3 Trusted Identity, Verification, and Recovery

**Status:** Implementation baseline  
**Date:** 2026-08-11

## Implemented

- browser profile hydration from `public.user_profiles`;
- role hydration from database state rather than a client default;
- server bearer-token extraction;
- server-side token verification through Supabase Auth;
- user-scoped server Supabase client using the public anon key plus bearer token;
- RLS-backed server profile lookup;
- protected `/auth/me` API endpoint;
- normalized 401/403 HTTP mapping;
- signup verification-email resend;
- password-reset email request;
- password-recovery mode;
- authenticated password update;
- post-reset sign-out;
- smoke test proving `/auth/me` rejects unauthenticated requests.

## Authorization boundary

The browser may use the hydrated role to present appropriate UI.

The browser role is **not** sufficient to authorize privileged actions.

Protected API operations must derive identity again on the server from the bearer token and trusted database state.

## Server key boundary

Two Supabase server keys now have different purposes:

- `SUPABASE_ANON_KEY`
  - public key;
  - used with a user's bearer token;
  - preserves RLS enforcement.

- `SUPABASE_SERVICE_ROLE_KEY`
  - privileged;
  - server-only;
  - reserved for explicitly authorized administrative/platform operations.

Normal user authorization should not use the service-role client to bypass RLS.

## Email verification

Signup confirmation can be resent.

The existing browser Supabase client is configured to detect auth state in redirect URLs. A successful verification can therefore establish/refresh browser authentication state according to the configured Supabase flow.

## Password recovery

The flow is:

1. user requests recovery;
2. Supabase sends the recovery email;
3. link returns to `/?mode=recovery`;
4. Supabase recovery auth state/session is established;
5. user chooses a new password;
6. `updateUser({ password })` changes it;
7. application signs the recovery session out;
8. user signs in normally.

## Next batch

Build Wave 1, Batch 4:

- Founder/admin role provisioning boundary;
- MFA enrollment/challenge for Founder/admin;
- server-side Founder/admin authorization helper;
- session/security hardening;
- Authentication Engine completion review.
