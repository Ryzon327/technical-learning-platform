# CURR-001 — Curriculum Hierarchy and Stable IDs

**Feature ID:** CURR-001  
**Feature Name:** Curriculum Hierarchy and Stable IDs  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Curriculum Hierarchy and Stable IDs establishes the permanent structural model used to identify and relate Learning Paths, Courses, Modules, Missions, and supported educational units.

Stable identifiers allow curriculum content to change without breaking student progress, evidence, notes, analytics, or certificates.

---

# 2. Problem Statement

The platform will eventually support many technical subjects and continuous course updates.

If curriculum items are identified only by titles, file names, or page URLs:

- Renaming content may break progress.
- Course updates may lose student history.
- Notes may point to the wrong lesson.
- Evidence may become disconnected.
- AI may confuse old and new content.
- Analytics become unreliable.

---

# 3. Student Value

Students keep their progress and history even when course titles, wording, or content organization changes.

---

# 4. Founder Value

The Founder can update curriculum without manually repairing every reference across the platform.

---

# 5. Included Scope

- Stable Learning Path IDs.
- Stable Course IDs.
- Stable Module IDs.
- Stable Mission IDs.
- Stable competency references.
- Parent/child relationships.
- Ordering metadata.
- slugs separate from IDs.
- retirement and supersession states.
- validation of duplicate or invalid identifiers.

---

# 6. Explicitly Excluded Scope

CURR-001 does not include:

- Student progress.
- Content authoring UI.
- Lab provisioning.
- Search indexing.
- Certificate issuance.
- AI content generation.
- Course pricing.

---

# 7. Curriculum Hierarchy

The initial hierarchy is:

```text
Learning Path
→ Course
→ Module
→ Mission
```

Missions may reference:

- Lessons.
- Demonstrations.
- Activities.
- Assessments.
- Labs.
- Reflections.
- Competencies.

These references do not change the core hierarchy.

---

# 8. Stable ID Rules

IDs must:

- Be unique.
- Never depend on display titles.
- Never be reused after retirement.
- Remain stable when content wording changes.
- Be machine-readable.
- Be safe for long-term references.

Example formats may include:

```text
PATH-NET-001
COURSE-NET-001
MOD-NET-001-01
MISSION-NET-001-01-01
```

Exact formatting may evolve, but stability is mandatory.

---

# 9. Dependencies

## Depends On

- KERN-001 — Platform Configuration
- KERN-004 — Error Handling Framework

## Unlocks

- CURR-002
- CURR-003
- LEARN-001 progress references
- Evidence links
- Notes links
- Search indexing
- Curriculum versioning

---

# 10. Security and Integrity

Curriculum identifiers and relationships must:

- Be server-authoritative.
- reject duplicate IDs.
- prevent unauthorized publication changes.
- preserve retired IDs.
- support audit records for significant administrative changes.

---

# 11. Accessibility Requirements

This Feature is primarily structural.

Any administrative interface managing hierarchy must:

- support keyboard navigation.
- use clear labels.
- expose hierarchy relationships to screen readers.
- avoid drag-and-drop as the only ordering method.
- provide accessible validation errors.

---

# 12. AI Usage

AI may:

- propose IDs.
- detect duplicates.
- suggest structural organization.

AI may not:

- silently rename stable IDs.
- reuse retired IDs.
- restructure published curriculum without approval.

---

# 13. Failure Behavior

Invalid hierarchy changes must fail before publication.

The platform must not partially publish a broken parent/child relationship.

---

# 14. Acceptance Criteria

## Platform can

- create stable IDs for all core hierarchy levels.
- preserve IDs after display-name changes.
- validate parent/child relationships.
- reject duplicate IDs.
- retain retired identifiers.

## Founder can

- understand the hierarchy.
- change display titles without breaking historical references.
- identify retired or superseded curriculum.

---

# 15. Definition of Done

CURR-001 is complete when:

- Core hierarchy types exist.
- Stable-ID rules exist.
- duplicate validation exists.
- parent/child rules exist.
- retired IDs cannot be reused.
- tests verify title changes do not alter identity.
- Founder approval is recorded.

---

# 16. Success Metrics

- Curriculum updates do not break progress references.
- Duplicate IDs are prevented.
- Historical evidence remains linked correctly.
- Future course domains can reuse the same hierarchy.

---

# 17. Implementation References

**Recommended Milestone:** `CURR-M1 — Curriculum Identity Foundation`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/curriculum/
packages/shared-types/
content/
tests/
```

---

# 18. Future Extensions

- Localization identifiers.
- external-content mappings.
- organization-specific curriculum forks.

Not part of the MVP.

---

# 19. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# 20. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`CURR-002 — Structured Learning Path Definition`
