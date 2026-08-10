# AUTH-007 — Authentication Identity Context

**Feature ID:** AUTH-007  
**Feature Name:** Authentication Identity Context  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Authentication Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Authentication Identity Context provides a stable, minimal platform identity contract that other Engines use after authentication.

It prevents Learning, Labs, Notes, Evidence, and other Engines from coupling directly to Supabase or any future identity provider.

---

# 2. Problem Statement

If every Engine reads provider-specific authentication objects directly:

- Provider lock-in increases.
- Security logic becomes inconsistent.
- Testing becomes harder.
- Future migration becomes expensive.
- Engines may consume more identity data than necessary.

The platform needs one normalized identity boundary.

---

# 3. Student Value

Students receive consistent identity behavior across the platform and are less likely to encounter mismatched account state between features.

---

# 4. Founder Value

Authentication-provider changes can be isolated rather than requiring widespread application rewrites.

Troubleshooting also becomes easier because all Engines consume the same identity model.

---

# 5. Included Scope

- Stable authenticated user ID.
- Approved display identity fields.
- Verified-email state when required.
- Approved role claims.
- Session validity reference.
- Provider-independent type.
- Server-side identity resolution.
- Client-safe identity representation.
- Test identity fixtures.
- Explicit anonymous state.

---

# 6. Explicitly Excluded Scope

- Full student profile.
- Learning preferences.
- Notes.
- Goals.
- Course enrollment.
- Engine-specific authorization.
- Billing identity.
- HR or enterprise directory profile.

---

# 7. Dependencies

## Depends On

- AUTH-003 — Session Management
- AUTH-004 — Email Verification
- AUTH-006 — Founder and Admin MFA for privileged identity state

## Unlocks

Every Engine that requires authenticated identity.

---

# 8. Identity Contract

A normalized identity may resemble:

```typescript
export interface AuthenticationIdentity {
  userId: string;
  email?: string;
  emailVerified: boolean;
  roles: string[];
  privilegedMfaSatisfied?: boolean;
}
```

The exact fields may evolve, but provider tokens and unnecessary profile data must remain outside this contract.

---

# 9. Security Requirements

The identity context must:

- Be derived from trusted server/provider state.
- never trust client-supplied role claims.
- expose only required fields.
- keep tokens out of domain objects.
- distinguish authentication from authorization.
- prevent students from elevating roles.
- reflect expired sessions promptly.
- protect privileged MFA state.

---

# 10. Privacy Requirements

Use data minimization.

Other Engines should receive only identity information necessary for their function.

Email should not be passed everywhere when stable `userId` is sufficient.

---

# 11. Accessibility Requirements

This Feature is primarily internal. Any UI using identity state must provide accessible account labels, authentication-state messages, and session-expiration behavior.

---

# 12. AI Usage

**AI Used:** No for identity truth.

AI systems may receive a scoped user identifier when explicitly required by an approved AI Feature, but must not receive authentication tokens or unnecessary identity attributes.

---

# 13. Operational Requirements

Monitor:

- Identity resolution failures.
- role-claim inconsistencies.
- stale-session identity failures.
- privileged identity validation failures.

Unexpected identity failures should use KERN-004 correlation IDs.

---

# 14. Failure Behavior

If trusted identity cannot be resolved:

- protected operations fail closed.
- no guessed identity is created.
- the user is directed to reauthenticate when appropriate.
- internal diagnostics remain sanitized.

---

# 15. Acceptance Criteria

## Platform Engines can

- request normalized authenticated identity.
- identify the current user by stable ID.
- receive approved roles.
- avoid importing provider-specific authentication objects.

## Student can

- experience consistent signed-in identity across platform capabilities.

## Founder can

- understand identity-resolution failures without examining raw tokens.

## Security

- Client-modified role values do not elevate access.
- Expired sessions cannot produce trusted identity.
- Provider tokens remain outside the identity contract.

---

# 16. Definition of Done

AUTH-007 is complete when:

- Shared identity type exists.
- Server-side identity resolver exists.
- client-safe representation exists.
- anonymous state is explicit.
- provider-specific objects remain isolated.
- role claims are server-authoritative.
- tests cover student, privileged, anonymous, expired, and manipulated states.
- security review passes.
- Founder approval is recorded.

---

# 17. Success Metrics

- Other Engines use one identity contract.
- Provider-specific authentication code remains isolated.
- No Engine relies on client-provided roles.
- Identity failures are consistent and diagnosable.
- Future provider migration can occur behind the authentication boundary.

---

# 18. Implementation References

**Recommended Milestone:** `AUTH-M7 — Authentication Identity Context`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/authentication/
packages/shared-types/
apps/web/
apps/founder-admin/
tests/
```

---

# 19. Future Extensions

- Organization identity context.
- delegated administration.
- enterprise directory attributes.
- scoped service identities.

Not part of the MVP.

---

# 20. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

**Founder Notes:**

---

# 21. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Authentication Engine Specification Status

After Founder approval of AUTH-004 through AUTH-007, all initial Authentication Engine Features are specified.

Next Engine:

`Learning Engine`
