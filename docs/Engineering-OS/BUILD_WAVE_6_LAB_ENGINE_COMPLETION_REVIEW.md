# Build Wave 6 — Lab Engine Completion Review

**Date:** 2026-08-12  
**Review Type:** Engine implementation completion gate  
**Scope:** LAB-001 through LAB-012 and the Wave 6 MVP exit criterion

## Why this review exists

Passing individual implementation batches is not enough to close an Engine.

The completion review validates that the pieces form one usable learning loop rather than a collection of independently green components.

## Review domains

The completion script checks:

1. all 12 Lab Engine specifications exist and are Founder-approved;
2. provider-independent Lab Definition and Provider contracts;
3. persistent student-owned Lab Session lifecycle;
4. Mock Provider foundation;
5. deterministic, AI-independent validation;
6. isolation and safety;
7. capacity and provisioning;
8. authenticated access delivery;
9. reset, expiration, cleanup, and retry;
10. health and recovery;
11. hardened Container Provider;
12. canary and controlled rollout;
13. integration of rollout policy with actual provider selection;
14. a real protected student access path for the real provider.

## Known high-risk integration boundaries

### Rollout policy vs. provider selection

Creating an activation policy is insufficient if the provider registry ignores it.

The completion review therefore requires the actual student provisioning path to consult controlled-rollout eligibility before selecting Container Provider infrastructure.

### Connection metadata vs. usable access

Returning an endpoint string is not equivalent to providing student access.

If the Container Provider returns a `/container-labs/.../terminal` endpoint, the LMS must implement and protect the corresponding runtime access gateway before Wave 6 can close.

## Expected outcome

The first execution may intentionally fail.

A failure at one of the two integration boundaries above is a useful completion-review result: it identifies the exact missing implementation batch instead of allowing scope to continue blindly.

## Closure behavior

Only after the verifier prints:

```text
LAB ENGINE COMPLETION CHECK PASSED
```

should `scripts/apply-wave6-closure.py` be executed and the closure documents/status changes committed.
