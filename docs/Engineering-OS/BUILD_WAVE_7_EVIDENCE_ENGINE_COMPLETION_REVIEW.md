# BUILD WAVE 7 — EVIDENCE ENGINE COMPLETION REVIEW

**Reviewed at:** `2607a68` — build: add evidence export and verification hooks
**Authority:** `docs/Feature-Registry/` (EVID-001 … EVID-008,
`EVIDENCE_ENGINE_FEATURES.md`) governed by `FEATURE_REGISTRY_SPEC.md`
**Verdict:** the Evidence Engine satisfies the approved Wave 7 MVP.

This review is independent of the seven batch build documents. Those record how
each batch was implemented; this asks whether the engine, as a subsystem,
satisfies the approved Feature Registry requirements.

---

## 1. The governing rule

`FEATURE_REGISTRY_SPEC.md` §9.11 states:

> A Feature is complete only when: approved acceptance criteria pass; required
> tests pass; security requirements pass; accessibility requirements pass;
> documentation is updated; monitoring is present where required; recovery
> behavior is documented; feature status is updated; no unrelated scope was
> introduced; Founder approval is recorded when required.

Completion is therefore measured against **Acceptance Criteria**, not against
§9.3 Scope. §9.3 defines a Feature record's Scope section as *"Included
behavior. Explicitly excluded behavior. User roles served. Supported
environments. Current phase."* — a boundary statement describing what the
Feature is and is not about, not a completion checklist. §9.10 reinforces the
distinction: acceptance criteria *"must describe observable behavior"*.

§19 also fixes the conflict order: Founder instruction → Blueprint → Decision
Ledger → **Feature Registry** → Current Build Status → Roadmap → existing
implementation → AI recommendation. This review treats the Registry as
authoritative and the implementation as subordinate to it.

---

## 2. Findings

### 2.1 Retention classification — **NON-BLOCKING FUTURE CAPABILITY**

`EVID-001 §5` lists "retention classification" among the fields an Evidence
Record should include. `EVIDENCE_ENGINE_FEATURES.md` lists "Evidence retention
rules" among the engine's owned responsibilities. Neither is implemented:
`evidence_records` has thirteen columns and none concerns retention.

Under §9.11 this is **not** a completion gap:

1. Completion is measured by **acceptance criteria**. `EVID-001 §13` requires
   that the platform can create a canonical record, associate it with one
   student and one or more competencies, distinguish evidence type and source,
   preserve validation status and prevent unauthorized modification; and that a
   student can view understandable metadata and see which competency it
   supports. **All are satisfied.** Retention appears in none of them.
2. §9.3 makes Scope a boundary statement, not a bar. Retention is in the
   Evidence Engine's remit rather than the Curriculum or Certificate Engine's —
   which is exactly what a Scope section exists to say.
3. The engine's owned-responsibility list demonstrably spans future work: the
   same list includes "Evidence consumed by Certificate Engine", which belongs
   to Build Wave 8. Membership there cannot mean "must exist before closure".
4. No approved specification defines retention behaviour — no classification
   vocabulary, no policy, no lifecycle, no consumer. Implementing it now would
   require inventing a vocabulary the Registry does not specify, which §9.11
   forbids as "unrelated scope".

**Recommendation:** carry retention forward as a specified Evidence Engine
Feature (an EVID-009, or a Certificate-era requirement once a certificate
lifecycle defines how long proof must persist). It is a real responsibility, it
is simply not a Wave 7 exit criterion, and it should be specified before it is
built rather than guessed at now.

### 2.2 Evidence version — **SATISFIED BY EXISTING IMPLEMENTATION**

`EVID-001 §5` lists "evidence version". The registry spec does not contradict
the reading that this is version-awareness rather than a mandatory column, and
three mechanisms already provide it:

- `EVIDENCE_CANONICAL_VERSION = "evidence-v1"` is the first element of the
  canonical string hashed into every `evidence_integrity_digest`. Every record
  is cryptographically bound to the model version that accepted it; changing the
  version changes every digest.
- `platform_schema_version` records `('evidence-foundation', '0.1.0')`.
- Exact competency-version preservation satisfies the engine design principle
  "Version-aware" end to end.

`EVID-001 §13` contains no acceptance criterion requiring a queryable version
field.

### 2.3 `unverified` / `mismatch` persistence — **SATISFIED BY EXISTING IMPLEMENTATION**

`EVID-002 §13` requires that when source integrity cannot be established,
Evidence "must not be promoted to trusted/verified state", the pending record be
preserved "if useful", and a source-integrity problem be reported. Refusing
creation satisfies the mandatory clause absolutely — no record exists to be
promoted — and the problem is reported through `VALIDATION_ERROR` and the
`evidence.record.integrity_conflict` audit event. "If useful" is permissive;
persisted untrusted records are not required.

`EVID-002 §14` acceptance criteria — record source engine and record, record
source version metadata, detect missing required provenance, prevent
client-supplied trusted status, preserve original provenance through corrections
— are all satisfied.

The `unverified` and `mismatch` enum values are currently unreachable. That is
headroom for a future intake path, not a defect.

### 2.4 Finer Evidence categories — **SATISFIED BY EXISTING IMPLEMENTATION**

`EVID-001 §7` says "Initial types **may** include" and lists Lab Validation,
Readiness/Knowledge/Practical Assessment, Project/Capstone and Administrative
Imported Evidence (marked future). The acceptance criterion is "distinguish
evidence type/source", satisfied by `source_type` (four canonical values),
`source_engine` (four canonical values) and, for assessments, the purpose
governed by `EVID-005` and carried in bounded metadata. No approved Feature
branches on the readiness/knowledge/practical distinction.

---

## 3. Capability review

| | Capability | Result |
| --- | --- | --- |
| A | Canonical Evidence model | Satisfied — one record table, one shared type |
| B | Source provenance and integrity | Satisfied — source and Evidence digests never conflated |
| C | Server-authoritative creation | Satisfied — no student write policy anywhere |
| D | Exact competency/version linking | Satisfied — FK to the versioned row |
| E | Assessment ingestion | Satisfied — purpose-gated, `result_digest` carried forward |
| F | Lab ingestion | Satisfied — frozen mapping authority, derived source digest |
| G | positive / negative / indeterminate | Satisfied — one rule, fail-closed |
| H | AI-independent truth | Satisfied — engine-wide scan |
| I | Append-only correction history | Satisfied — database refuses UPDATE and DELETE |
| J | Effective state | Satisfied — derived at read, never snapshotted |
| K | Ceases qualifying dynamically | Satisfied — asserted inside the accessor body |
| L | Restoration | Satisfied — restores state only, never outcome |
| M | Private portfolio | Satisfied |
| N | Filtering | Satisfied — competency, source type, course |
| O | Historical version preservation | Satisfied — `stableId@version` keying |
| P | Privacy-safe presentation | Satisfied — no digests, provider data or actor info |
| Q | Export | Satisfied — projection of the safe model |
| R | Verification reference | Satisfied — opaque, immutable, stable, owner-scoped |
| S | No anonymous verification | Satisfied — gate, verifier and smoke all assert |
| T | Ownership, RLS, least privilege | Satisfied on all five Evidence tables |
| U | Retry, idempotency, failure isolation | Satisfied — logical identities, never timestamps |
| V | Source truth untouched | Satisfied — table-level write scans in every consumer |
| W | Accessibility | Satisfied for implemented surfaces |
| X | No mastery or certificate leakage | Satisfied |

---

## 4. Cross-batch invariants

The engine was reviewed as a chain, not as seven independent batches:

```
assessment / lab source truth
    → canonical Evidence        (provenance immutable)
    → competency link           (exact version pinned)
    → correction history        (append-only)
    → effective state           (derived at read)
    → portfolio                 (private, filtered)
    → export                    (privacy-safe, current status)
```

Verified end to end, each with a gate check:

- a failed assessment remains historical Evidence and never qualifies;
- an incomplete Lab validation is negative Evidence, and a validator
  technical error produces no Evidence at all;
- invalidated positive Evidence is retained and stops qualifying immediately;
- restored Evidence recovers its state but not a negative outcome;
- a v2 competency link keeps its v2 curriculum context after v5 publishes;
- an export reflects current effective state, so later-invalidated Evidence
  reads as revoked;
- a verification identifier does not make Evidence public;
- corrections never reach assessment or Lab truth.

Two of these were caught during the batches themselves rather than assumed:
Batch 6's review found proof qualification ignoring source outcome, and Batch
4's found curriculum context resolving against the latest mission version. Both
are now enforced by checks that fail the build if reverted.

---

## 5. Verifier assessment

`scripts/verify-wave7.sh` carries 109 structural checks and passes. It is not
treated here as proof of completion, for three reasons worth recording:

1. **It verifies implementation, not governance.** It never checks that
   EVID-001…008 exist or are approved. The completion gate adds that.
2. **It is organised per batch.** No check spans the source-to-export chain.
   The completion gate adds those.
3. **Grep-based checks can over-fire.** Three did during development —
   `share` matching "shared-types", `to public` matching "into public", and an
   `awk` range terminating on a signature line. All were narrowed rather than
   removed. The same class of false positive appeared twice while building the
   completion gate itself, where test files legitimately name forbidden strings
   in order to assert their absence; both scans are now scoped to
   implementation files.

Residual weakness, recorded rather than hidden: absence-based checks prove a
pattern is missing from the files scanned, not from files a future batch might
add. The completion gate mitigates this by scanning table and policy
definitions across all Evidence migrations rather than named files alone.

---

## 6. Completion gate

`scripts/verify-evidence-engine-completion.sh` — 13 engine-level checks, then
the full per-batch verifier and repository toolchain:

1. EVID-001…008 exist, record Founder approval, carry acceptance criteria and a
   Definition of Done, and have build documentation.
2. Exactly one canonical Evidence model, one effective-state resolver, one
   outcome rule.
3. The source-to-export chain is connected.
4. Qualification resolves effective state at read time and is never persisted.
5. Provenance, correction history and verification references are immutable;
   source-engine truth is never mutated; competency versions never drift.
6. RLS on every Evidence table, no student write policy, no anonymous policy.
7. No public verification, share link, employer access or public profile.
8. No AI dependency in the truth path.
9. Build Wave 8 — Certificates read only from the roadmap sequence.
10. `bash scripts/verify-wave7.sh`, which runs typecheck, tests, build,
    security scan and smoke.

Five deliberate regressions were used to confirm the gate bites: removing an
EVID Founder approval, removing read-time effective-state resolution from the
qualifying accessor, adding an anonymous verification policy, removing the Wave
8 declaration from the roadmap, and making corrections reference Lab source
truth. Each exits non-zero.

---

## 7. Next wave

`docs/Roadmap/ROADMAP.md` twice defers to `MVP_IMPLEMENTATION_SEQUENCE.md` for
the next approved wave, and that document declares **`Build Wave 8 —
Certificates`**. This is read from the roadmap, not inferred from the Evidence
Engine's "Next Engine: Certificate Engine" note, and the gate fails if the
declaration is absent.

---

## 8. Recommendation

Build Wave 7 — Evidence Engine is **complete** against the approved MVP.
Administrative closure may proceed once the completion gate passes in the real
repository. Retention classification should be specified as a future Evidence
Engine Feature before it is implemented.
