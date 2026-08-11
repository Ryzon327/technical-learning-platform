# AIGW-003 — Model Routing and Capability Policy

**Feature ID:** AIGW-003  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** AI Gateway

## 1. Summary

Selects an approved model/provider based on task, capability, privacy class, cost, latency, and availability.

## 2. Core Rule

Select the least expensive approved model that safely satisfies the required capability and privacy class, unless a higher-capability model is explicitly required.

## 3. Routing Inputs

- Task type
- Required capability
- Privacy class
- Provider availability
- Context/output limits
- Local-first policy
- Cost tier
- Latency preference
- Allowed/disallowed providers
- Fallback chain

## 4. Privacy Classes

Examples:

- Public / non-sensitive
- Student learning context
- Student private content
- Founder / operational sensitive
- Local-only

## 5. Security

Routing runs server-side. Clients cannot force disallowed providers or models. Local-only content never silently falls back to external providers.

## 6. Failure

If the preferred provider fails, the Gateway evaluates only approved fallbacks while preserving privacy and cost policy. Otherwise it returns AI unavailable.

## 7. Acceptance Criteria

- Different task types route differently.
- Local-only policy is enforced.
- Disabled/unhealthy providers are excluded.
- Capability requirements are enforced.
- Fallback remains deterministic.

## 8. Definition of Done

- Routing policy model exists.
- Capability/privacy matching exists.
- Local-only policy exists.
- Fallback ordering exists.
- Tests cover privacy, cost, and capability selection.
- Founder approval is recorded.

## Founder Approval

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

## Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |

## Next Artifact

`AIGW-004 — AI Cost and Usage Controls`
