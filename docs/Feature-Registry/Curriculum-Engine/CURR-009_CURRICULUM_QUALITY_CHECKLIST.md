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

## One beat at a time (DEC-065)

Guided instruction is delivered **one instructional beat at a time**. A
persistent workspace may remain visible — for Networking Foundations that is
the topology — while the primary instruction presents a single idea, decision,
result or explanation. Prior beats stay reviewable and secondary; the learner
advances intentionally; an answer resolves before the next task is set; and
observation and explanation do not compete for the same attention.

The shell must remain able to host a real action beat, because DEC-062 requires
one. A sequence of questions is not a course.

## Guided instruction (DEC-063)

A curriculum unit must not require the learner to reconstruct the lesson. It
opens with a short scenario and a stated objective, reaches the activity
quickly, gives the context a task needs before that task, names exactly what
each question is deciding, resolves answers rather than merely recording them,
connects each step to the next, and keeps its diagram, its words and any motion
describing the same state.

Two distinctions are load-bearing. A **prediction** asks what the learner
expects before they can be certain; a **knowledge check** tests something
already taught. `CURR-010` §8.2 owns the full boundary between prediction,
knowledge check, near-transfer, practice and mastery assessment; this document
applies that boundary rather than defining it. And **started at is not reached
at**: an originating device is not a recipient of its own traffic.

**How an answer resolves (amended).** A prediction was originally never graded,
because no correct option could be authored. That is superseded: where a
prediction has an **objectively correct answer** — one the learner can determine
from the authored topology or from what the course has already taught — the
mission authors it, and the answer resolves explicitly.

* The learner **commits before** any correctness is shown. Nothing may reveal
  the answer, or hint at it, before submission.
* After commitment the pane states the verdict in **words** — "Correct
  prediction" or "Not quite" — never by colour alone.
* A wrong answer is told **what was expected**, and every graded prediction
  carries **why**.
* No praise, points, streaks, scores or gamification. The feedback is
  satisfying because it is clear.
* Where the learner genuinely **cannot yet know**, the prediction stays
  ungraded and resolves by comparison: what was predicted, what happened, why.
  Grading a guess the course asked for would punish the learner for answering.

A graded prediction is still not an assessment: nothing is recorded, scored or
turned into evidence, and the correct option is withheld at the support levels
that test rather than teach.

DEC-064 makes those two instruments separate authored types and adds a third
that neither replaces: **hands-on performance**. Predict, confirm understanding,
and do the work are three different things, and a course that offers only the
first two has not met DEC-062. Knowledge checks are used where the answer has
already been taught and confirming it improves the lesson — never to turn a
course into read, answer, read, answer.

Simplified beginner language may reduce vocabulary. It may not create a false
model the learner later has to unlearn.

Assessed under the section 14a tiers, which are unchanged. No gate, threshold
or score is introduced.

## Hands-on practice in practical domains (DEC-062)

Where a course teaches a domain in which the learner can reasonably **perform**
the work, a curriculum unit does **not** reach final instructional approval
while its core activities remain read-only.

For Networking Foundations specifically, DEC-062 records that the course must
include real learner command execution and bounded network configuration. A
packet journey, displayed command output and question-and-answer interaction are
each valuable and none of them is sufficient on its own: the first visualises
what an action causes, the second reports what a machine told somebody else, and
the third exercises reasoning rather than doing.

This condition is separate from structural authoring. A course may be
**FULLY_AUTHORED** under DEC-061 — every approved mission carrying its
instruction, in order — and still be correctly unapproved here. Structural state
has never been an instructional verdict, and this is one of the named reasons.

It introduces no gate, no threshold and no score. It is a Tier 3 condition,
assessed under section 14a by the human reviewer alongside every other
instructional judgement, and doctrine §25.2 is its basis: **demonstration is
required where professional capability can reasonably be demonstrated.**

## Technical writing (DEC-067)

**Technical prose must reduce linguistic ambiguity, not technical rigor.**

Use explicit subjects, actions and objects. When several devices, addresses,
interfaces, networks, packets, frames, commands, results or settings are in
context, name the specific object wherever a pronoun or a vague reference could
reasonably point at more than one of them.

Prefer:

> Router-1 forwards the packet through its second connection.

over:

> Router-1 forwards it.

Prefer:

> What Router-1 did with the packet

over:

> What Router-1 did with it

A learner must not have to decode the writing in order to understand the
technology.

**Clarity may not be bought with any of the following:**

- removing necessary technical terminology;
- oversimplifying the concept;
- talking down to the learner;
- excessive hand-holding;
- replacing precise terminology with vague everyday language.

The standard is **clear technical-author prose for an adult beginner**. Give
enough context for the learner to understand the technical relationship without
assuming they remember every sentence of a previous mission — and without
re-explaining what the unit has already established.

### Concrete before abstract

When the learner is being taught to reason from technical evidence, order the
teaching:

> observable event
> → what the event establishes
> → what the event does **not** establish
> → the broader principle, or the next reasoning step.

A beginner must not be asked to decode an abstract principle before meeting the
technical event that gives the principle meaning. "A failed result is a starting
point rather than an answer" is a true sentence and a weak opening; the same
idea reached after "PC-A did not receive a reply from 192.168.2.20" is
instruction.

### One primary instructional job per paragraph

A paragraph normally does one of: **teach**, **establish**, **reactivate**,
**compare**, **qualify**, or **transition**. A paragraph that routinely performs
several at once is a paragraph the learner has to disassemble before they can
use it.

### Reactivate; do not re-teach

Earlier missions establish prerequisites, and a later mission may rely on them.
When an established fact is needed again after substantial learning distance,
**briefly reactivate exactly the fact the present reasoning needs** — not the
lesson that produced it. Mission 8 needs "PC-A is on 192.168.1.0/24, PC-C is on
192.168.2.0/24, Router-1 connects the two networks"; it does not need Mission 4's
account of the prefix.

Re-teaching is correct only when the unit's own instruction depends on it.

### Do not prematurely reveal the diagnosis

Where an activity exists so the learner can derive an answer, nothing before
that activity may give away the answer's shape. Specifically, a failure must not
be narrowed to **one configuration problem**, **one device**, **one correction**
or **one fault class** before the evidence supports that narrowing.

This binds every surface the learner can reach, including a mission description
rendered on a fallback path.

### Repetition requires a new instructional purpose

Repeating a fact is right when it serves reactivation, standing context,
comparison, or later consolidation after the learner has done something that
changes what the statement means.

Repeating substantially the same explanation on consecutive screens, with no new
instructional purpose, is not. See DEC-066 for the presentation half of this
rule: one region owns each authored paragraph.

### Beginner does not mean non-technical

Use the correct term when the learner has learned it, or when the term is being
taught. Do not substitute vague everyday wording to make prose feel easier —
that is the failure this whole section exists to prevent, in the opposite
direction.

### Technical terms are earned, then used

Before a term has been taught, a concrete plain-English description is the right
way to introduce the role. **After it has been taught, use it.**

A unit may briefly reactivate a term's meaning where the learner needs it. It
may **not** retreat to an invented substitute because the substitute sounds
simpler — *network* does not become "group" once network has been established,
and *MAC address* does not become "factory identity" once MAC address has been
taught. A substitute introduced after the real term is earned is a second
vocabulary the learner has to maintain, and it makes the later missions read as
though a different author wrote them.

Plain English remains correct for a role the course has not yet named.

### What review can and cannot decide

Automated checks can enforce structural properties: required content present,
ordering, stable ids, schema conformance, banned vocabulary, disclosure of a
named value, and duplicate ownership of an authored field across rendering
regions.

They **cannot** decide whether prose makes sense, whether two differently worded
passages are semantically redundant, whether context is sufficient, whether a
paragraph is cognitively overloaded, whether pacing is natural, or whether the
learner feels guided. Those are Architect review and Founder UAT, per section
14a. No semantic or paraphrase detector may be built to stand in for them.

### What this looks like under review

Not acceptable:

> A workstation on one network needs to reach a system on another. Router-1 is
> holding its traffic, addressed to a machine Router-1 is not, in a group
> Router-1 is not in.

Acceptable:

> PC-A needs to send a packet to PC-C on another network. The packet has now
> reached Router-1. Router-1 examines the destination address, 192.168.2.20,
> and determines that the packet is not addressed to Router-1 and does not
> belong to the network on which it arrived. Router-1 must decide where to
> forward the packet next.

The second is not a template to copy. It is the clarity standard to meet.

### Tier placement

This is a **Tier 3** requirement under section 14a. Ambiguity is a judgement
about whether a *particular* reader can resolve a *particular* referent, and no
pattern engine can make it — a density-of-pronouns count would fail correct
prose and pass incorrect prose, which is exactly the invented numeric threshold
doctrine §29.5 forbids.

Tier 1 may pin narrow, objectively checkable instances (a heading that reads
"What Router-1 did with it"). Tier 2 may flag suspected ambiguity for human
attention. Neither may auto-pass this domain.

### It applies to every learner-facing surface

Step prose, interaction captions, stage narration and decisions, prediction and
knowledge-check prompts and options, device notes, remediation observations,
confirmations, quick-reference labels, and the text equivalent. The text
equivalent is held to the same standard as the visible prose, because for some
learners it is the only prose there is.

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
| 1.3 | 2026-09-05 | Added hands-on practice to section 12 — Definition of Done — recording that a course teaching a domain the learner can perform does not reach final instructional approval while its core activities remain read-only. Applies to Networking Foundations by DEC-062. Assessed within the existing section 14a tiers, which are unchanged. No new gate, threshold or numeric score introduced. |
| 1.4 | 2026-09-05 | Added guided instruction to section 12 — Definition of Done — recording that a curriculum unit must not require the learner to reconstruct the lesson, that predictions and knowledge checks resolve differently, and that simplified language may not create a false model. See DEC-063. Assessed within the existing section 14a tiers, which are unchanged. No new gate, threshold or numeric score introduced. |
| 1.5 | 2026-09-05 | Recorded the three instructional mechanisms — prediction, knowledge check and hands-on performance — as distinct and non-substitutable. See DEC-064. Assessed within the existing section 14a tiers, which are unchanged. No new gate, threshold or numeric score introduced. |
| 1.6 | 2026-09-05 | Recorded one-beat-at-a-time delivery: a persistent workspace beside a single-focus instructional pane, with prior beats reviewable but secondary. See DEC-065. Assessed within the existing section 14a tiers, which are unchanged. No new gate, threshold or numeric score introduced. |
| 1.7 | 2026-09-06 | Added Technical writing to section 12: technical prose must reduce linguistic ambiguity, not technical rigor — explicit subjects, actions and objects wherever a pronoun could point at more than one device, address, interface, network, packet, frame, command, result or setting — and clarity may never be bought by removing terminology, oversimplifying, talking down or retreating into vague everyday language. Records concrete before abstract, one primary instructional job per paragraph, reactivation rather than re-teaching, no premature reveal of the diagnosis, repetition only for a new instructional purpose, and terms earned then used; binding on every learner-facing surface including the accessible text equivalent. See DEC-067, with DEC-066 as its presentation half. Also cross-references CURR-010 §8.2 as the canonical owner of the prediction, knowledge-check and near-transfer boundary this document applies. Assessed within the existing section 14a tiers, which are unchanged. No new gate, threshold or numeric score introduced. |

---

# Curriculum Engine Specification Status

After Founder approval of CURR-004 through CURR-009, all initial Curriculum Engine Features are specified.

Next Engine:

`Knowledge & Notes Engine`
