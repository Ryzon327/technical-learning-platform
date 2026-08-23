# SEARCH-005 — Technical Query Normalization and Typo Tolerance

**Feature ID:** SEARCH-005  
**Feature Name:** Technical Query Normalization and Typo Tolerance  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Search Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Technical Query Normalization and Typo Tolerance improves retrieval for acronyms, commands, product names, aliases, and common spelling errors while preserving the original user intent.

---

# 2. Problem Statement

Technical learners frequently search terms such as:

- AD / Active Directory.
- IAM.
- RTO / RPO.
- kubectl.
- Terraform.
- Proxmox.
- Splunk.
- PowerShell.

Small typos or alternate terminology should not cause empty results unnecessarily.

---

# 3. Student Value

Students can find content even when they:

- Misspell a term.
- use an acronym.
- use a common alias.
- include command punctuation.
- use singular/plural variants.

---

# 4. Founder Value

Search becomes more forgiving without requiring manual duplicate content.

---

# 5. Included Scope

- Case normalization.
- safe punctuation handling.
- acronym aliases.
- approved synonyms.
- common typo tolerance.
- command-token preservation.
- product-name normalization.
- phrase handling.
- query-length and abuse controls.

---

# 6. Explicitly Excluded Scope

- Rewriting every query through AI.
- aggressive synonym expansion that changes meaning.
- unrestricted fuzzy matching.
- correction that hides exact technical terms.

---

# 7. Dependencies

## Depends On

- SEARCH-002 — Curriculum Search

## Integrates With

- SEARCH-008 — Search Result Ranking and Fallback

SEARCH-008 was previously recorded under **Depends On**, which created a
prohibited circular dependency with SEARCH-008 (see `FEATURE_REGISTRY_SPEC.md`
section 12). SEARCH-005 does not require ranking: normalization, technical-token
preservation, curated aliases, bounded tolerance and original-query fallback are
all defined without it. SEARCH-008 consumes SEARCH-005 match and query-adjustment
metadata, so the relationship is forward-facing and belongs here — the same
treatment SEARCH-002 already gives SEARCH-005 and SEARCH-008.

See `DECISION_LEDGER.md` DEC-046.

---

# 8. Technical Token Principle

The system must preserve meaningful technical tokens.

Examples:

- `Get-ADUser`
- `kubectl`
- `index=botsv3`
- `terraform plan`
- `show vlan brief`

Normalization must not strip the characters needed to distinguish technical content.

---

# 9. Security and Privacy

Normalization must occur after appropriate input validation and before authorized retrieval.

It must not expand search into hidden scopes.

---

# 10. Accessibility Requirements

When a query is corrected or broadened, the interface should clearly explain what was searched and allow the user to return to the original query.

---

# 11. AI Usage

AI may optionally suggest interpretations for ambiguous technical language.

Baseline normalization must remain deterministic and functional without AI.

---

# 12. Failure Behavior

If normalization fails:

- Search the sanitized original query.
- do not block retrieval.
- do not invent corrected terms silently.

---

# 13. Acceptance Criteria

## Student can

- Search common acronyms and aliases.
- recover from small typos.
- search code/command-like tokens.
- see when the platform adjusted the query.

## Platform can

- preserve exact technical terms.
- apply deterministic aliases.
- avoid unsafe query expansion.

---

# 14. Definition of Done

SEARCH-005 is complete when:

- normalization pipeline exists.
- technical token rules exist.
- alias dictionary structure exists.
- typo tolerance is bounded.
- original-query fallback exists.
- tests cover representative technical searches.
- Founder approval is recorded.

---

# 15. Success Metrics

- Fewer false empty searches.
- technical commands remain searchable.
- query correction does not materially change user intent.
- AI is not required for useful normalization.

---

# 16. Implementation References

**Recommended Milestones:**

- `SEARCH-M5A — Technical Query Normalization and Curated Aliases`
- `SEARCH-M5B — Bounded Typo Recovery`

**Roadmap Phase:** Phase 3 — MVP Development

SEARCH-M5A covers normalization, technical-token preservation, punctuation
preservation, the curated alias and acronym structure, bounded alias expansion,
original-query preservation and fallback, query-adjustment transparency, and
exact-before-adjusted match-class tiering.

SEARCH-M5B covers free-form small-misspelling recovery. It is separated because
typo recovery affects **candidate generation**, not comparison: a post-filter
over today's literal `ILIKE` result set can only remove rows that already
matched, so it can never recover a misspelling. The retrieval mechanism —
bounded query-time variant generation, a PostgreSQL trigram extension, or
another approved approach — requires a separate Founder ruling and may require a
migration.

**Section 14 is unchanged.** SEARCH-005 is not complete while SEARCH-M5B is
outstanding; SEARCH-M5A is a milestone checkpoint, not feature completion.

---

# 17. Founder Approval

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# 18. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |
| 1.1 | 2026-08-23 | Reclassified SEARCH-008 from Depends On to Integrates With, resolving the prohibited SEARCH-005 ↔ SEARCH-008 circular dependency. Recorded the SEARCH-M5A / SEARCH-M5B milestone split. Scope, security, acceptance criteria and Definition of Done unchanged. See DEC-046. |

---

# Next Artifact

`SEARCH-006 — Personal Notes Search Integration`
