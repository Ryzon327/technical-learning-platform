# BUILD WAVE 8 — CERTIFICATE ENGINE COMPLETION REVIEW

**Reviewed at:** `dd7f239` — build: add certificate branding and presentation
**Authority:** `docs/Feature-Registry/Certificate-Engine/` (CERT-001 … CERT-009,
`CERTIFICATE_ENGINE_FEATURES.md`) governed by `FEATURE_REGISTRY_SPEC.md`
**Verdict:** the Certificate Engine satisfies the approved Wave 8 MVP.

This review is independent of the ten batch build documents. Those record how
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
§9.3 Scope. As in the Wave 7 review, a Scope section is a boundary statement
describing what a Feature is and is not about, not a completion checklist.

§19 fixes the conflict order: Founder instruction → Blueprint → Decision Ledger
→ **Feature Registry** → Current Build Status → Roadmap → existing
implementation → AI recommendation. This review treats the Registry as
authoritative and the implementation as subordinate to it.

---

## 2. Engine responsibilities

`CERTIFICATE_ENGINE_FEATURES.md` lists ten owned responsibilities. Each maps to
a delivered Feature:

| Responsibility | Feature |
|---|---|
| Certificate definitions | CERT-001 |
| Eligibility requirements | CERT-002 |
| Deterministic issuance | CERT-003 |
| Certificate records · Certificate lifecycle | CERT-004 |
| Verification | CERT-005 |
| Student certificate portfolio | CERT-006 |
| Export and sharing | CERT-007 |
| Revocation/correction | CERT-008 |
| Branding and presentation | CERT-009 |

Unlike Wave 7 — where retention classification was a named responsibility with
no implementation — **no owned responsibility is unimplemented.** One is
deliberately partial and is recorded as a finding below.

---

## 3. Findings

### 3.1 Sharing is designed, not built — **NON-BLOCKING, RULED**

"Export and sharing" is a single owned responsibility. Export is fully
implemented (CERT-007). Live sharing is not: `CertificateSharePayload` defines
the shape a future share link would carry, and nothing resolves it.

This is not a completion gap. It is the recorded outcome of **DEC-039**, which
states CERT-007 contains design-only share-link hooks and does not mint tokens,
create live share URLs, persist share state, add anonymous or public sharing
routes, or change RLS or public access. CERT-007 §5 itself says "share-link
**hooks**", and `CERTIFICATE_ENGINE_FEATURES.md` describes "**future**
student-controlled share links".

The verifier fails the build if the share payload is referenced by the service,
the router, the panel or the web service — so the boundary is enforced, not
merely intended.

### 3.2 Binary brand assets deferred — **NON-BLOCKING, RULED**

CERT-009 §5 lists a "logo/brand asset reference" and §7 declares a dependency on
**CURR-007 — Content Asset References**, which is specified but unimplemented.
**DEC-045** rules that CERT-009 uses existing CERT-001 presentation metadata and
a text/CSS brand treatment, and that binary asset infrastructure remains
deferred to CURR-007. CERT-009 must not create its own asset registry, and does
not.

**DEC-037** separately permits CERT-007 to precede CERT-009, so the engine's
internal ordering is a recorded decision rather than drift.

### 3.3 PDF and QR absent — **NON-BLOCKING, RULED**

**DEC-036** excludes PDF from CERT-007; **DEC-043** confirms PDF is not required
for CERT-009 and authorizes no PDF dependency. **DEC-044** makes QR design-only
and requires any future QR to encode the existing official CERT-005 destination.
No rendering dependency exists in any workspace manifest.

### 3.4 CERT-008 migration authored but never executed — **RECORDED LIMITATION**

`supabase/migrations/20260813001000_certificate_correction_foundation.sql` is
committed as source and has never been applied to any database. Its triggers,
constraints, RLS policy and privileged RPC are verified by static inspection and
by tests that read the migration text — never by running them. Execution remains
a separate protected operation requiring its own review.

---

## 4. Capability review

| | Capability | Result |
| --- | --- | --- |
| A | Versioned Certificate Definition model | Satisfied — material fields frozen on publication, presentation stays editable |
| B | A published certificate can never require nothing | Satisfied — DEC-034 safety property enforced in SQL and TypeScript |
| C | Deterministic eligibility from exact competency versions | Satisfied — Wave 7 version-exact Evidence links, never "latest" |
| D | Three eligibility outcomes, unresolved → unknown | Satisfied — fail-closed |
| E | Deterministic issuance | Satisfied — RPC confirms pinned Evidence, never re-evaluates |
| F | Idempotent issuance | Satisfied — unique (user, definition) plus 23505 re-read |
| G | Integrity pin covers both eligibility gates | Satisfied — corrected after a review found the pin set incomplete |
| H | Five lifecycle states, exact permitted edges | Satisfied — database trigger is the authority |
| I | Append-only lifecycle history | Satisfied — UPDATE and DELETE refused |
| J | Status derived at read time, never cached | Satisfied — no status column anywhere |
| K | Pinned expiry | Satisfied — survives definition retirement |
| L | Public verification without identity | Satisfied — explicit field list, 19 forbidden fields |
| M | Verification fails closed | Satisfied — `unavailable` never collapses into `not_found` |
| N | Private learner portfolio | Satisfied — owner-scoped, partial failure degraded not dropped |
| O | Focused certificate detail | Satisfied — one certificate open at a time, keyboard-operable |
| P | Portable export | Satisfied — JSON and Markdown, browser-native download |
| Q | Export reflects current status | Satisfied — composed on demand, revoked can never read as valid |
| R | Privileged revoke/correct/supersede/restore | Satisfied — founder-only, reason mandatory |
| S | Correction preserves original issuance | Satisfied — nothing deleted, history append-only |
| T | Branded, accessible, printable presentation | Satisfied — semantic text, `@media print` |
| U | Presentation cannot alter truth | Satisfied — proven by comparator in both directions |
| V | Ownership, RLS, least privilege | Satisfied — no student write policy on any certificate table |
| W | No AI in the truth path | Satisfied — engine-wide scan |
| X | Accessibility | Satisfied for implemented surfaces; contrast unmeasured |

---

## 5. Cross-batch invariants

The engine was reviewed as a chain, not as nine independent features:

```
certificate definition        (material fields frozen at publication)
    → eligibility             (exact competency versions, fail-closed)
    → issuance                (deterministic, idempotent, Evidence pinned)
    → lifecycle               (five states, append-only, status at read time)
    → public verification     (privacy-safe, no identity)
    → learner portfolio       (owner-scoped projection)
    → export                  (portable, current status)
    → correction              (privileged, reasoned, drives CERT-004)
    → presentation            (renders truth, alters none)
```

The invariants that hold across the whole chain:

- **CERT-004 is the single lifecycle authority.** CERT-008 records workflow
  facts and delegates every transition to `certificate_record_lifecycle_event`;
  it declares no edge of its own, and the verifier fails the build if any
  migration writes lifecycle history directly.
- **Later features compose earlier truth rather than duplicate it.** CERT-007
  composes CERT-006; CERT-009 composes CERT-006 and adds only the two
  presentation reads it owns. Neither issues a certificate query of its own.
- **Public verification stays privacy-safe.** CERT-005's payload is an explicit
  field list; its forbidden-field list is held as data and asserted directly.
- **Holder identity is excluded from CERT-005 and CERT-007.** Neither service
  reads `user_profiles`, enforced by a comment-stripped scan.
- **The CERT-009 holder name is presentation data, not historical issuance
  truth** (DEC-041). A rename changes how an older certificate renders and moves
  no frozen fact — proven by rendering one certificate under two names and
  asserting every authoritative field is unchanged.
- **No AI dependency exists anywhere in deterministic certificate truth.**
- **Revocation propagates without propagation code.** Verification, portfolio
  and export all resolve status from CERT-004 at read time, proven executably
  rather than argued.

Several of these were corrected during the batches rather than assumed. Reviews
found a non-atomic requirement replacement in CERT-001, an incomplete integrity
pin set in CERT-003 (demonstrated with a counterexample), and a missing
per-certificate focus affordance in CERT-006. All are now enforced by checks
that fail the build if reverted.

---

## 6. Verifier assessment

`scripts/verify-wave8.sh` carries 107 structural checks and passes. As in Wave
7, it is not treated as proof of completion:

1. **It verifies implementation, not governance.** It does not check that
   CERT-001…009 exist or are approved.
2. **It is organised per batch.** No check spans the definition-to-presentation
   chain end to end.
3. **Grep-based checks over-fire, repeatedly.** This recurred throughout Wave 8
   and is worth recording honestly: `"to public"` matched `revoke ... from
   public`; `"for update"` matched an RPC row lock; `export` matched the
   TypeScript keyword; `score` matched the export's own privacy notice ("your
   scores"); `user_profiles` matched a comment saying it is never queried;
   `shareToken` and `logoUrl` matched the prohibition lists that exist to forbid
   them; and `red` matched `c-red-ential`. Every one was narrowed — comment
   stripping, quoted-entry exclusion, word boundaries, block scoping — never
   removed.

**Residual weakness, recorded rather than hidden:** absence-based checks prove a
pattern is missing from the files scanned, not from files a future batch might
add.

**A second residual weakness specific to Wave 8:** three guards initially
matched an `import` line rather than a call site, so a feature could have been
gutted while its import remained. These were found only because the mutation was
actually executed. Guards asserting that behaviour *exists* should match a call
expression, not a name.

**Wave 8 has no engine-level completion gate script, and every earlier engine
has one.** `scripts/` contains `verify-authentication-completion.sh`,
`verify-curriculum-completion.sh`, `verify-learning-completion.sh`,
`verify-assessment-completion.sh`, `verify-knowledge-notes-completion.sh`,
`verify-lab-engine-completion.sh` and `verify-evidence-engine-completion.sh` —
seven engines, seven gates. There is no `verify-certificate-engine-completion.sh`.

Completion here is therefore established by this review plus
`scripts/verify-wave8.sh`, which is a per-batch verifier rather than an
engine-level governance gate: it does not check that CERT-001…009 exist, are
approved, or carry acceptance criteria, and no check spans the
definition-to-presentation chain.

This is a **real convention gap**, recorded rather than quietly accepted.
Creating the script is code, not documentation, and was therefore outside the
documentation-only scope of this closure. It is flagged for architect direction:
either authorise a Certificate Engine completion gate as its own small batch, or
record a decision that the per-batch verifier plus this review is sufficient for
this engine.

---

## 7. Negative and mutation testing

Critical guardrails were proven to bite by deliberately introducing the
forbidden behaviour, observing an explicit failure, and restoring the file
byte-identically. Across CERT-006 through CERT-009, **35 mutations** were run.

The most significant were:

- a migration inserting lifecycle history directly, bypassing CERT-004's edge
  guard, contiguity rule and serialization — **this guard did not exist until
  the mutation exposed the gap**;
- a workflow concept added to the CERT-004 migration, proving the original
  protection still bites after CERT-008 evolved around it;
- holder identity leaking into CERT-007's export;
- brand metadata displacing an authoritative title, caught by the
  truth-preservation comparator;
- a student-facing revoke route, a student write policy, and the correction RPC
  granted to authenticated users;
- the accessible print treatment and the printed verification destination
  removed.

Every mutated file was verified restored byte-identical before the gates ran.

---

## 8. Accepted limitations

Recorded as standing limitations, not as resolved items:

1. **No live PostgreSQL/RLS integration harness.** Ownership scoping is proven
   at the query level through mocks; cross-user isolation, transactional
   rollback and concurrency serialization are **not** runtime-proven.
2. **No browser/DOM accessibility harness.** Print CSS, focus order and rendered
   markup are asserted structurally, never executed.
3. **CERT-009 colour contrast is unmeasured.** No WCAG conformance is claimed.
   Queued for the pre-MVP accessibility work (§15c).
4. **CERT-006/CERT-007 colour-class verifier precision** — their unbounded
   green/red/amber matching is less precise than the word-bounded CERT-009
   equivalent. Queued for §15c; deliberately not repaired inside CERT-009.
5. **Repository-wide ESLint 9 flat-config failure** — pre-existing, unrelated to
   Wave 8, carried forward unchanged.
6. **The CERT-008 migration remains unapplied** to any database.

---

## 9. Next wave

`docs/Roadmap/ROADMAP.md` defers to `MVP_IMPLEMENTATION_SEQUENCE.md` for the
next approved wave, and that document's §11 declares **`Build Wave 9 —
Search`**, with the exit criterion "Students can find authorized curriculum and
their own notes without AI." This is read from the roadmap, not inferred from
the Certificate Engine's "Next Engine" note or from feature numbering.

`SEARCH-001` declares dependencies on KERN-004, CURR-001 and AUTH-007, all of
which are implemented.

**§15b Cross-Engine Batch — Course Completion Credentials** is unimplemented and
remains at its documented roadmap position after Wave 13 and before the MVP
Release Gate. It is not pulled forward. DEC-029 through DEC-035 are unchanged.

---

## 10. Recommendation

Build Wave 8 — Certificate Engine is **complete** against the approved MVP.
Administrative closure may proceed. Live-database verification of the CERT-008
migration, contrast measurement, and the two queued verifier-precision items
should be carried into the pre-MVP assurance audit rather than treated as Wave 8
remediation.
