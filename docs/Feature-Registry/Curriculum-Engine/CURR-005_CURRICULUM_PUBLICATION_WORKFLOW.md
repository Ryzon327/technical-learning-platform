# CURR-005 — Curriculum Publication Workflow

**Feature ID:** CURR-005  
**Feature Name:** Curriculum Publication Workflow  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Curriculum Publication Workflow separates draft curriculum from student-visible published curriculum.

It ensures incomplete, invalid, or unapproved content is never exposed accidentally.

---

# 2. Problem Statement

Curriculum will be created and updated continuously, often with AI assistance.

Without a publication boundary:

- Draft content could become visible.
- Broken references could reach students.
- incomplete labs could be assigned.
- accessibility requirements could be skipped.
- course changes could occur without review.

---

# 3. Student Value

Students only see approved, validated curriculum.

---

# 4. Founder Value

The Founder can build and revise content safely without affecting active students until a version is intentionally published.

---

# 5. Included Scope

- Draft state.
- Review-ready state.
- Approved state.
- Published state.
- Retired state.
- publication validation.
- Founder approval.
- publication timestamp.
- published version reference.
- rollback to a prior approved curriculum version where supported.

---

# 6. Explicitly Excluded Scope

- Full editorial CMS.
- instructor workflows.
- enterprise approval chains.
- automatic AI publication.
- marketing site publication.
- application deployment.

---

# 7. Dependencies

## Depends On

- CURR-001
- CURR-003
- CURR-004
- KERN-005 — Audit Logging Foundation

## Unlocks

- safe student curriculum delivery.
- curriculum versioning.
- automated course generation pipelines.
- Founder course approval center later.

---

# 8. Publication States

Recommended states:

```text
Draft
→ Review Ready
→ Approved
→ Published
→ Superseded/Retired
```

Only Published curriculum is available to normal students.

---

# 9. Validation Before Publication

Publication must validate:

- Stable IDs.
- required fields.
- prerequisite references.
- competency references.
- asset references.
- accessibility metadata.
- lab references when required.
- content status.
- estimated effort.
- no broken dependencies.

---

# 10. Security and Integrity

Only authorized administrative workflows may approve or publish curriculum.

Publication actions must be auditable.

---

# 11. Accessibility Requirements

Accessibility validation is a publication requirement, not a later cleanup step.

Content that requires captions, transcripts, alt text, or keyboard alternatives cannot publish without the required metadata or approved exception.

---

# 12. AI Usage

AI may:

- create drafts.
- run pre-publication checks.
- summarize changes.
- identify likely accessibility gaps.

AI may not publish curriculum without Founder or explicitly delegated human approval.

---

# 13. Failure Behavior

If publication validation fails:

- nothing becomes partially published.
- the draft remains intact.
- validation errors identify exact problems.
- already published curriculum remains unchanged.

---

# 14. Acceptance Criteria

## Founder can

- create or receive draft curriculum.
- review validation results.
- approve a valid version.
- publish intentionally.
- keep drafts invisible to students.

## Platform can

- prevent invalid publication.
- preserve current published content if a new publication fails.
- record publication history.
- distinguish draft from published content.

---

# 15. Definition of Done

CURR-005 is complete when:

- publication states exist.
- validation gate exists.
- only published content reaches students.
- approval is required.
- audit event exists.
- failed publication is atomic.
- tests pass.
- Founder approval is recorded.

---

# 16. Success Metrics

- Students never encounter accidental drafts.
- broken curriculum references are caught before publication.
- Founder can update courses safely.
- AI-generated content cannot self-publish.

---

# 17. Implementation References

**Recommended Milestone:** `CURR-M5 — Curriculum Publication Workflow`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 18. Future Extensions

- Multi-reviewer approval.
- scheduled publication.
- staged rollout.
- enterprise curriculum branches.

Not part of the MVP.

---

# 19. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# 20. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`CURR-006 — Curriculum Versioning and Migration Rules`
