# Wave 7 Closure — Evidence Engine

**Project:** Technical Learning Platform
**Wave:** Build Wave 7
**Engine:** Evidence Engine
**Status:** Pending completion-gate verification

## Closure Rule

This document may be committed as an implementation closure only after:

```bash
bash scripts/verify-evidence-engine-completion.sh
```

returns:

```text
Evidence Engine completion gate PASSED.
```

The seven implementation batches passing individually is **not** sufficient.
The dedicated gate exists because batch-level verification cannot prove
engine-level invariants.

## Exit Criterion

Wave 7 requires that the platform can answer, for any student:

> What did this student demonstrate, when did they demonstrate it, against which
> requirement, and what trusted system produced the result?

satisfied through a governed chain:

- canonical Evidence Records with immutable provenance;
- source and Evidence integrity kept as separate proofs;
- server-authoritative creation, never client-asserted;
- competency links pinned to exact historical competency versions;
- assessment and Lab validation consumed without either engine losing authority;
- deterministic positive / negative / indeterminate outcome semantics;
- append-only review and correction history;
- effective state derived at read time;
- a private student portfolio;
- a privacy-safe export and a stable verification hook.

## Source Engine Boundary

The Evidence Engine records truth; it does not manufacture it.

Assessment attempt results, assessment evidence handoffs, Lab validation runs,
Lab validation results and Lab evidence handoffs remain owned by their source
engines and are never rewritten by any Evidence operation. Invalidating Evidence
does not mean the assessment never happened or the lab never passed — it means
that proof is no longer accepted for downstream trust.

## Learning Engine Boundary

An Evidence-to-competency link means "this canonical Evidence is approved proof
relevant to this competency". It does not mean the competency is demonstrated.

`student_competency_state`, `student_competency_evidence_refs` and
`recordAuthoritativeCompetencyEvidence()` remain Learning Engine property and
were not modified. Qualifying Evidence reaches the Learning Engine only through
a read-only adapter.

## Certificate Engine Boundary

No certificate is issued, revoked or modelled in Wave 7.

`EVID-008` establishes the verification identifier so that Certificate Engine
verification can be built without an Evidence schema redesign. A verification
identifier existing does not make Evidence public: there is no anonymous
endpoint, no public read policy, no share link and no employer access.

## AI Boundary

AI holds no authority over Evidence truth, Evidence state, integrity results,
competency mappings or verification. No AI provider dependency exists anywhere
in the Evidence truth path.

## Carried Forward

Retention classification (`EVID-001 §5`, and "Evidence retention rules" in
`EVIDENCE_ENGINE_FEATURES.md`) is **not** implemented. The completion review
classified it as a non-blocking future capability: it is absent from
`EVID-001`'s acceptance criteria, which `FEATURE_REGISTRY_SPEC.md` §9.11 makes
the completion bar, and no approved specification defines retention vocabulary,
policy or lifecycle. It should be specified as a future Evidence Engine Feature
before it is implemented rather than invented now.

## Next Wave

`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md` declares the next approved
implementation wave: **Build Wave 8 — Certificates**.
