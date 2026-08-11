# AIGW-002 — AI Provider Interface

**Feature ID:** AIGW-002  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** AI Gateway

## 1. Summary

Defines one provider contract for local and external AI services.

## 2. Problem

Providers differ in API shape, model IDs, token limits, streaming, structured output, tool calling, pricing, and failure behavior.

## 3. Provider Contract

The provider interface supports:

- Capability discovery
- Provider health
- Model inventory
- Request execution
- Optional streaming
- Structured responses
- Usage metadata
- Normalized errors
- Timeout/cancellation

## 4. Capability Model

Capabilities may include chat/text, long context, structured JSON, tool calling, embeddings, vision, streaming, local-only processing, context/output limits, and pricing metadata.

## 5. Security

Provider keys stay server-side in approved secret storage. Only adapter code may depend on provider SDKs.

## 6. Normalized Errors

Examples:

- ProviderUnavailable
- RateLimited
- BudgetExceeded
- UnsupportedCapability
- Timeout
- InvalidProviderResponse

## 7. Acceptance Criteria

- Multiple providers can register.
- Capabilities and models can be queried.
- Requests run through one interface.
- Provider errors are normalized.
- Secrets never reach clients.

## 8. Definition of Done

- Provider interface exists.
- Capability/model metadata exists.
- Error model exists.
- Mock provider can implement the interface.
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

`AIGW-003 — Model Routing and Capability Policy`
