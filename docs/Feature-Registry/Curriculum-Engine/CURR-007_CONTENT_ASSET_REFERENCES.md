# CURR-007 — Content Asset References

**Feature ID:** CURR-007  
**Feature Name:** Content Asset References  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Content Asset References provides a provider-independent way for curriculum units to reference instructional assets without embedding storage or generation logic directly into curriculum definitions.

---

# 2. Problem Statement

Courses may use:

- AI-generated videos.
- demonstrations.
- diagrams.
- text.
- downloadable files.
- transcripts.
- code.
- lab instructions.
- external approved resources.

Hardcoding storage URLs or provider-specific objects into curriculum makes updates and migration difficult.

---

# 3. Student Value

Students receive consistent access to course assets even when the underlying media provider or storage location changes.

---

# 4. Founder Value

The Founder can replace or regenerate assets without rewriting course structure.

---

# 5. Included Scope

- Stable asset reference ID.
- asset type.
- purpose.
- location/provider abstraction.
- version.
- accessibility metadata.
- transcript/caption references.
- checksum or integrity metadata where useful.
- draft/published state.
- replacement/supersession mapping.

---

# 6. Explicitly Excluded Scope

- Media generation itself.
- storage provider implementation.
- video editing.
- copyright licensing workflows.
- unrestricted external URLs.

---

# 7. Dependencies

## Depends On

- CURR-001
- CURR-003

## Integrates With

- AI Orchestration Engine.
- Search Engine.
- media/storage provider adapters.
- Lab Engine.

---

# 8. Asset Types

Initial types may include:

- Text
- Video
- Audio
- Image
- Diagram
- Code
- Download
- Transcript
- Caption File
- Lab Reference
- External Approved Resource

---

# 9. Accessibility Requirements

Assets must include required accessibility metadata.

Examples:

- Video → captions + transcript.
- Image → alt text or marked decorative.
- Audio → transcript.
- interactive content → keyboard requirements and alternative path where necessary.

---

# 10. Security Requirements

Asset references must:

- avoid exposing private storage credentials.
- validate allowed origins.
- prevent unsafe arbitrary script embedding.
- support access controls for protected materials.

---

# 11. AI Usage

AI may:

- generate draft assets.
- regenerate approved asset variants.
- produce transcripts, descriptions, and captions for review.
- identify missing accessibility metadata.

AI-generated assets remain subject to curriculum publication approval.

---

# 12. Failure Behavior

If an asset is unavailable:

- core curriculum should provide a clear fallback where possible.
- the failure should not corrupt progress.
- the missing asset should be visible operationally.
- inaccessible content should not be silently substituted.

---

# 13. Acceptance Criteria

## Founder can

- replace an asset without changing Mission identity.
- see asset type and version.
- confirm accessibility metadata exists.

## Student can

- access published assets consistently.
- use required accessible alternatives.

## Platform can

- resolve provider-independent asset references.
- reject broken or unsafe references before publication.

---

# 14. Definition of Done

CURR-007 is complete when:

- asset reference schema exists.
- provider-independent location model exists.
- accessibility metadata exists.
- publication validation checks asset references.
- tests cover missing and replaced assets.
- Founder approval is recorded.

---

# 15. Success Metrics

- Asset replacement does not break curriculum structure.
- provider migration requires minimal curriculum change.
- accessibility alternatives are consistently available.
- broken references are caught before publication.

---

# 16. Implementation References

**Recommended Milestone:** `CURR-M7 — Content Asset References`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 17. Future Extensions

- Asset generation pipeline.
- localization variants.
- adaptive media variants.
- content CDN adapters.

Not part of the initial MVP.

---

# 18. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# 19. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Next Artifact

`CURR-008 — Estimated Effort and Course Sizing`
