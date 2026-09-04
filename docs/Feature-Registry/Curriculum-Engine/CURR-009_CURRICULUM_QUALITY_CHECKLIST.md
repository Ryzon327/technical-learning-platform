# CURR-009 — Curriculum Quality Checklist

**Feature ID:** CURR-009  
**Feature Name:** Curriculum Quality Checklist  
**Feature Level:** Level 2 — Essential  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Curriculum Engine  
**Governing Company Operating System:** Learning Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Curriculum Quality Checklist provides a consistent pre-publication standard for educational quality, accessibility, practical relevance, and completeness.

It reduces reliance on the Founder remembering every quality requirement manually.

---

# 2. Problem Statement

As curriculum production becomes automated, the risk shifts from “Can we create enough content?” to “Can we ensure every generated course is actually good?”

Without a standard checklist:

- AI-generated content may be generic.
- prerequisites may be missing.
- labs may not match lessons.
- accessibility may be incomplete.
- objectives may be vague.
- unnecessary content may accumulate.

---

# 3. Student Value

Students receive consistent, practical, understandable learning experiences regardless of subject.

---

# 4. Founder Value

The Founder gets a repeatable quality gate that supports automation and reduces manual review burden.

---

# 5. Included Scope

The checklist validates that a publishable curriculum unit has:

- Clear purpose.
- professional context.
- observable outcome.
- correct prerequisites.
- appropriate competency mapping.
- required assets.
- accessible media.
- accurate lab references.
- reasonable estimated effort.
- clear completion criteria.
- current technical information.
- no unnecessary repetition.
- student-respectful language.
- AI-generation provenance where required.

---

# 6. Explicitly Excluded Scope

- automatic publication.
- legal certification accreditation.
- guaranteeing employment.
- replacing technical SME review for high-risk or specialized material.

---

# 7. Required Quality Domains

## Learning Quality

- Objective is clear.
- content supports the objective.
- practice aligns with the objective.
- validation measures the intended competency.

## Practical Relevance

- Professional context is explained.
- commands/tools reflect realistic work where feasible.
- obsolete or artificial exercises are identified.

## Time Respect

- No unnecessary filler.
- unit size is reasonable.
- prior knowledge can be recognized where approved.

## Accessibility

- Required captions/transcripts/alt text exist.
- activities have accessible operation or approved alternatives.

## Technical Quality

- References resolve.
- prerequisites resolve.
- version/tool assumptions are documented.
- safety requirements are included.

## Student Experience

- Language is encouraging.
- failure is treated as part of learning.
- no guilt-based engagement is introduced.

---

# 8. Dependencies

## Depends On

- CURR-003
- CURR-004
- CURR-007
- CURR-008

## Integrates With

- CURR-005 — Curriculum Publication Workflow
- AI Orchestration Engine
- Lab Engine
- Accessibility validation.

---

# 9. AI Usage

AI should perform first-pass quality checks where deterministic checks and document analysis are appropriate.

AI may:

- detect missing sections.
- identify vague objectives.
- flag likely duplicate content.
- compare assessment to competency.
- flag accessibility metadata gaps.
- flag potentially outdated references for human review.

AI may not self-approve publication.

---

# 10. Failure Behavior

A failed required quality check keeps curriculum in Draft or Review Ready state.

Existing published curriculum remains unchanged.

---

# 11. Acceptance Criteria

## Founder can

- see a concise quality summary.
- identify exactly which checks failed.
- distinguish automated checks from required human review.
- approve only when required checks pass.

## Platform can

- run deterministic quality checks.
- store results.
- block publication on required failures.
- preserve existing published content.

---

# 12. Definition of Done

CURR-009 is complete when:

- checklist domains are defined.
- required versus advisory checks exist.
- publication workflow consumes results.
- AI cannot self-approve.
- accessibility checks are included.
- student-respect principles are included.
- tests cover pass/fail publication gates.
- Founder approval is recorded.

## Curriculum Doctrine compliance (DEC-060)

Every curriculum unit reviewed under this checklist must additionally be
reviewed for compliance with the **Curriculum Doctrine**, `docs/Learning-OS/
Learning-OS.md` §23–§33. That doctrine is PROJECT LAW and is not restated here.

Doctrine §23.2 is explicit:

> A curriculum feature or unit is **NOT complete** merely because tests pass,
> typecheck passes, build passes, or Claude says it is complete, **if it
> materially violates these curriculum laws.**

Doctrine compliance is therefore a **required review dimension**, not an
advisory signal. It is assessed under the three tiers in section 14a and it does
not change them:

- **Tier 1** may carry only those doctrine requirements that can be restated as
  objective, machine-verifiable invariants — for example, that a learner-facing
  field contains no certification-domain label (doctrine §28.1).
- **Tier 2** may flag suspected doctrine concerns for human attention. It never
  auto-passes and never auto-fails them.
- **Tier 3** is the authority for every doctrine requirement involving
  educational judgement — experience-before-abstraction, designed reuse,
  near-transfer, dual-gate sufficiency, assessment quality. **A curriculum unit
  may pass every automated check and still fail doctrine review.**

No regex or pattern engine may be treated as proving doctrine compliance, and
**no arbitrary numeric readiness or pedagogy threshold may be invented** to
automate it (doctrine §29.5; this document's section 14a).

---

# 13. Success Metrics

- Fewer broken or incomplete Courses reach students.
- Founder review becomes faster.
- AI-generated curriculum quality is more consistent.
- accessibility gaps are found before publication.
- curriculum remains practical and focused.

---

# 14. Implementation References

**Recommended Milestone:** `CURR-M9 — Curriculum Quality Gate`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 14a. Extension — Three-Tier Instructional Quality Authority (DEC-057)

Instructional quality is governed in three tiers with three different
authorities.

**Tier 1 — Hard structural validation.** Objective, machine-verifiable invariants
**may block publication**: invalid step type; invalid payload for its type;
unresolved required reference; missing required accessibility alternative;
duplicate or invalid position; unregistered interaction type; structurally
prohibited content.

**Tier 2 — Advisory instructional signals.** Automation **may flag** suspicious
instructional patterns for human review. These signals **never automatically fail
and never automatically approve** instruction.

**Tier 3 — Human instructional UAT.** A human reviewer is the **final authority
on pedagogical sufficiency.** A mission may pass every automated check and still
fail instructional UAT.

**No arbitrary numeric pedagogy threshold is authorized.** Where a Tier 2 signal
needs a comparison point, it is derived from the distribution of
already-published, human-approved missions — never chosen for automation
convenience.

A signal may be promoted from Tier 2 to Tier 1 only when it can be restated as an
objective invariant requiring no pedagogical judgement.

**BEGINNER-COMPLETE-1 remains a human-authoritative curriculum quality
requirement, supported and not replaced by automation.**

**"Structurally prohibited content" means prohibited content structures and
prohibited execution or rendering behaviour** — an executable authored payload,
executable authored markup, or a field requesting unsupported raw-markup
interpretation. It must **never** mean rejecting legitimate instructional plain
text because it resembles HTML, JavaScript, shell syntax, configuration syntax or
a security payload example. The boundary is inertness and renderer escaping, not
keyword or pattern matching. See `CURR-010` section 10.

---

# 15. Future Extensions

- Automated technical freshness checks.
- external SME review workflow.
- quality scoring trends.
- student-feedback correlation.

Not part of the MVP.

---

# 16. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

---

# 17. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |
| 1.1 | 2026-08-30 | Added section 14a — Three-Tier Instructional Quality Authority — separating hard structural validation, advisory instructional signals and human instructional UAT, and prohibiting arbitrary numeric pedagogy thresholds. Included Scope, Acceptance Criteria and Definition of Done unchanged. See DEC-057. |
| 1.2 | 2026-09-04 | Added Curriculum Doctrine compliance to section 12 — Definition of Done — making compliance with `docs/Learning-OS/Learning-OS.md` sections 23 through 33 a required curriculum review dimension. Assessed within the existing section 14a tiers, which are unchanged. No new gate, threshold or numeric score introduced. See DEC-060. |

---

# Curriculum Engine Specification Status

After Founder approval of CURR-004 through CURR-009, all initial Curriculum Engine Features are specified.

Next Engine:

`Knowledge & Notes Engine`
