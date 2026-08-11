# AI Gateway Features

**Platform Engine:** AI Gateway  
**Status:** Approved

## Purpose

The AI Gateway is the single controlled entry point for all AI requests made by the Technical Learning Platform. Product Engines must not call AI providers directly.

It owns provider abstraction, model routing, privacy controls, cost controls, secret screening, provider health, retry/fallback, response normalization, and AI usage metadata.

## Design Principles

- Provider-independent.
- Privacy-first.
- Cost-aware.
- Local-model friendly.
- Functional when AI is unavailable.
- No AI authority over competency, lab validation, certificate eligibility, authentication, or authorization.
- No product Engine may hardcode itself to Anthropic, OpenAI, Ollama, or any other provider.

## Current MVP Features

| Feature ID | Feature | Status |
|---|---|---|
| AIGW-001 | AI Request Contract | Specified |
| AIGW-002 | AI Provider Interface | Specified |
| AIGW-003 | Model Routing and Capability Policy | Specified |
| AIGW-004 | AI Cost and Usage Controls | Approved |
| AIGW-005 | Privacy, Redaction, and Secret Screening | Approved |
| AIGW-006 | Provider Health, Retry, and Fallback | Approved |
| AIGW-007 | AI Response Normalization | Approved |
| AIGW-008 | AI Usage and Audit Metadata | Approved |
| AIGW-009 | Local AI Provider Adapter | Approved |
| AIGW-010 | External AI Provider Adapters | Approved |

## Provider Progression

```text
Mock AI Provider
→ Local Ollama / self-hosted models
→ Anthropic
→ OpenAI
→ Additional approved providers
```

## Dependencies

- Platform Kernel
- Authentication Identity Context
- Error Handling
- Audit Logging
- Application Health Monitoring

## Next Feature

`AIGW-001 — AI Request Contract`
