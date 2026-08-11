# SEARCH-001 — Search Document and Index Model

**Feature ID:** SEARCH-001  
**Feature Name:** Search Document and Index Model  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Search Engine  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Search Document and Index Model defines the normalized representation used to make approved platform content searchable without making the Search Engine the source of truth.

---

# 2. Problem Statement

The platform will contain searchable data from multiple Engines, each with different schemas.

Without a normalized search representation:

- Search logic becomes tightly coupled to every source schema.
- Ranking becomes inconsistent.
- provider migration becomes difficult.
- stale data becomes harder to identify.
- access metadata may be lost.

---

# 3. Student Value

Students receive consistent search results across different learning content types.

---

# 4. Founder Value

New Engines and content types can be added to search through a stable contract instead of rebuilding the search system.

---

# 5. Included Scope

A Search Document should include:

- Search document ID.
- Source Engine.
- Source record ID.
- Source version.
- Content type.
- Title.
- Searchable text.
- Search keywords.
- Stable route/reference.
- Publication state.
- access-scope metadata.
- optional Course/Module/Mission references.
- optional competency references.
- updated timestamp.
- index timestamp.

---

# 6. Explicitly Excluded Scope

- Making the index authoritative.
- storing provider credentials.
- full raw private records.
- arbitrary source HTML.
- permission decisions based only on index fields.
- AI embeddings as a mandatory MVP requirement.

---

# 7. Source-of-Truth Rule

Search results always point back to an authoritative source record.

If the source record is missing, retired, unpublished, or unauthorized, the search result must not be served as valid content.

---

# 8. Dependencies

## Depends On

- KERN-004 — Error Handling Framework
- CURR-001 — Stable IDs
- AUTH-007 — Authentication Identity Context

## Unlocks

- SEARCH-002
- SEARCH-003
- SEARCH-004
- SEARCH-007
- SEARCH-008

---

# 9. Security and Privacy

Search documents must:

- Contain only data appropriate for indexing.
- avoid secrets.
- preserve security scope metadata.
- separate public/shared content from student-private content.
- avoid trusting indexed permission metadata as the final authorization check.

---

# 10. Accessibility Requirements

Search metadata should support:

- Human-readable titles.
- result type labels.
- descriptive snippets.
- semantic result rendering.
- accessible destination names.

---

# 11. AI Usage

AI may help create optional keywords or summaries for approved public curriculum content.

AI may not create authoritative source facts or add private content to broader indexes.

---

# 12. Failure Behavior

If an index document cannot be created:

- The source record remains authoritative and intact.
- indexing failure is tracked.
- publication does not falsely report successful search availability when search is required.

---

# 13. Acceptance Criteria

## Platform can

- Normalize multiple source types.
- preserve source identity/version.
- distinguish private and shared content.
- update or remove stale documents.
- resolve results back to source records.

## Founder can

- Understand which source Engines are indexed.
- identify stale or failed indexing later.

---

# 14. Definition of Done

SEARCH-001 is complete when:

- Search Document schema exists.
- source identity/version metadata exists.
- privacy/access scope metadata exists.
- source resolution works.
- stale record handling exists.
- tests cover invalid/private/stale documents.
- Founder approval is recorded.

---

# 15. Success Metrics

- Search remains decoupled from source schemas.
- stale results are minimized.
- adding new searchable content requires adapter/index work rather than redesign.
- private data remains separated appropriately.

---

# 16. Implementation References

**Recommended Milestone:** `SEARCH-M1 — Search Document Foundation`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/search/
packages/shared-types/
services/search/
tests/
```

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

---

# Next Artifact

`SEARCH-002 — Curriculum Search`
