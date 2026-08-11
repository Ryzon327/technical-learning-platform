# Build Wave 1 — Batch 4 Founder/Admin MFA and Authorization

**Status:** Implementation baseline  
**Date:** 2026-08-11

## Implemented

- Founder/admin role bootstrap command;
- explicit two-value confirmation for role elevation;
- server-only use of the privileged Supabase client;
- verified-email prerequisite for Founder/admin provisioning;
- TOTP MFA enrollment UI;
- QR/secret enrollment presentation;
- TOTP challenge and verification;
- authentication assurance-level checks;
- Founder/admin UI gate requiring AAL2;
- server-side Founder/admin authorization helper;
- email verification requirement for privileged access;
- MFA/AAL2 requirement for privileged access;
- protected `/admin/ping` route;
- smoke test proving admin routes reject unauthenticated requests.

## Founder bootstrap procedure

A user must already:

1. exist in Supabase Auth;
2. have a matching `user_profiles` row;
3. have a verified email.

Then the operator supplies:

- `FOUNDER_BOOTSTRAP_USER_ID`
- `FOUNDER_BOOTSTRAP_CONFIRM`

Both values must exactly match the same target user ID.

The operator runs:

`npm run admin:provision-founder`

The command uses the server-side service-role client and elevates only the application profile role.

## MFA rule

Founder/admin role alone is insufficient for privileged API access.

A privileged request must satisfy:

- valid bearer token;
- trusted database profile;
- `role = founder_admin`;
- verified email;
- session authenticator assurance level = `aal2`.

This rule is enforced on the server.

## MFA user flow

If a Founder/admin has no verified TOTP factor:

1. enroll;
2. scan the QR code or enter the secret manually;
3. enter the current 6-digit authenticator code;
4. challenge-and-verify promotes the session to AAL2.

If a verified factor already exists, the Founder/admin is challenged for the current code.

## Security boundary

The browser MFA gate improves UX but is not the authorization control.

The backend `requireFounderAdmin()` function is the privileged access control.

## Remaining Authentication Engine work

Before closing Wave 1, perform a completion review against AUTH-001 through AUTH-007 and add any missing session/audit hardening required by the approved specifications.

The expected next step is:

**Wave 1 completion review / closure package**, followed by **Wave 2 — Curriculum Foundation**.
