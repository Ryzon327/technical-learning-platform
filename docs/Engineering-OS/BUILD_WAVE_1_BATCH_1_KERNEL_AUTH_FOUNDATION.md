# Build Wave 1 — Batch 1 Kernel and Authentication Foundation

**Status:** Implementation baseline  
**Date:** 2026-08-11

## This batch begins implementation of

### Platform Kernel

- version/build information;
- normalized audit event contract;
- audit logging boundary;
- existing configuration/error/logging foundations.

### Authentication Engine

- shared identity/session contracts;
- student versus Founder/admin role contract;
- browser Supabase client boundary;
- server Supabase service-role boundary;
- profile/role database foundation;
- automatic student profile creation.

## Security boundaries

- Browser code receives only the Supabase URL and anonymous/public key.
- `SUPABASE_SERVICE_ROLE_KEY` remains server-only.
- Normal signup cannot assign `founder_admin`.
- Supabase Auth remains authoritative for credentials and sessions.
- Application roles live in `public.user_profiles`.
- RLS protects student profile access.

## Not implemented yet

This batch does not yet implement the user-facing:

- registration form;
- sign-in form;
- sign-out;
- session provider;
- email-verification flow;
- password recovery;
- Founder/admin MFA enrollment/challenge.

Those are the next Wave 1 authentication batches.

## Next Batch

**Build Wave 1, Batch 2 — Student registration, sign-in/sign-out, and browser session state.**
