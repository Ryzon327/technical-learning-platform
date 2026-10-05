# AI Tutor Foundation — Manual Recovery Package

**Scope:** non-UI foundation for the optional in-lesson Tutor.

This package implements the service and contract seam that the accepted Lovable lesson workspace can call later. It does **not** recreate the learner-facing Tutor UI and it activates no paid AI provider.

## Contract

The request carries only the minimum context needed for one Tutor turn:

- learner question
- course / mission / lesson identifiers when known
- concept / scene / step identifiers when known
- approved reading-level preference
- bounded context sources with provenance
- explicitly selected note excerpts only
- trusted deterministic lab state only
- request and correlation IDs

The response is structured and provider-neutral:

- concise answer
- explanation
- optional steps
- references to supplied source IDs only
- suggested next action
- uncertainty
- grounding state
- trusted-lab-state availability
- immutable authority flags
- provider ID

## Authority boundary

The Tutor is explanatory. It cannot:

- grant mastery or competency
- mark a lab correct
- change deterministic practice scoring
- write learner notes

Those are not provider instructions; they are absent from the writable response surface and pinned false in the normalized response authority object.

## Grounding and privacy

Grounding is selected deterministically with current lesson content first. Context is bounded before it reaches a provider.

Selected-note context requires an explicit learner-selection marker. Lab context requires a trusted deterministic marker. Unsupported context fails validation.

Likely secrets are screened before the provider call. The audit-metadata helper records IDs, counts, kinds, correlation, and lab-state availability — not the learner's raw question or context text.

## Provider boundary

The service depends on one provider-neutral interface. The included static provider is deterministic and network-free for tests/local contract exercises. No credential, account, billing action, provider SDK, or production model is introduced.

Provider calls have a timeout and at most two attempts. A failure never downgrades privacy or deterministic-authority rules.

## Lesson-workspace integration seam

A later Lovable integration can pass the current lesson/mission/scene/step IDs and approved current content without navigating away from the lesson. Nothing in this package changes media, Read mode, practice state, Notes state, or navigation.

The rendering surface must treat the structured response as ordinary accessible content: keyboard-reachable controls, semantic headings/regions, readable error/unavailable states, and no reliance on motion or color.

## Verification intent

Automated coverage pins:

- malformed request rejection
- selected-note and trusted-lab gates
- secret screening before provider execution
- bounded context selection
- audit metadata without raw prompt/context
- provider-neutral local adapter
- bounded retry
- timeout normalization
- filtered source references
- explicit lab-state availability
- no mastery/lab/scoring/note-write authority

Exact-head CI remains authoritative for merge.
