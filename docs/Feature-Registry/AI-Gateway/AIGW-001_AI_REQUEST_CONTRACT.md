# AIGW-001 — AI Request Contract

**Feature ID:** AIGW-001  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** AI Gateway

## 1. Summary

Defines the normalized request object every Engine must use when requesting AI assistance.

## 2. Problem

Provider-specific request formats spread lock-in, inconsistent privacy controls, and inconsistent cost handling.

## 3. Included Scope

A request may include:

- Request ID
- Calling Engine
- User reference where needed
- Task type
- Prompt/instruction payload
- Approved context
- Privacy classification
- Output budget
- Required capability
- Allowed provider/model classes
- Response format requirement
- Fallback policy
- Correlation ID

## 4. Task Types

Examples:

- Explain Concept
- Summarize Selected Content
- Tutor/Coach
- Draft Curriculum
- Explain Search Results
- Explain Lab Failure
- Organize Selected Notes
- Founder Operations Summary

## 5. Privacy Rule

Only minimum necessary context is attached. Full note libraries, full histories, or unrelated profile data are not included by default.

## 6. Security

The contract rejects raw provider credentials, unsupported capabilities, unsafe context, and unauthorized provider overrides.

## 7. Failure

Invalid requests fail before reaching a provider.

## 8. Acceptance Criteria

- One normalized request works across Engines.
- Task/privacy/capability classification is explicit.
- Unsafe or malformed requests are rejected.
- Provider-specific payloads stay inside the Gateway.

## 9. Definition of Done

- Request schema exists.
- Task and privacy classifications exist.
- Capability requirements exist.
- Validation tests exist.
- Founder approval is recorded.

## Founder Approval

- [x] Approved
- [ ] Deferred
- [ ] Rejected

## Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial specification |

## Next Artifact

`AIGW-002 — AI Provider Interface`
