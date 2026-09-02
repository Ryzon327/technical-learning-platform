# WP-J — Networking Foundations to Router-on-a-Stick transition record

**Status:** recorded, not executed. Nothing in this document has happened.

J1 authors the Networking Foundations curriculum architecture and is explicitly
forbidden from mutating Router-on-a-Stick. This file records what must change
later, so that the gap between the two courses is a written plan rather than an
undocumented inconsistency somebody discovers at publication.

---

## 1. Why a transition is needed at all

DEC-053 approved the hybrid model: Networking Foundations **develops** the
foundational `net.*` competencies, and Router-on-a-Stick **reinforces** them in
a VLAN context rather than teaching them for the first time.

Router-on-a-Stick's source already anticipates this in a comment on Mission 1:

> *"DEC-053 will move that accountability to Networking Foundations, at which
> point these become `reinforces` — but marking them so BEFORE that course
> exists would assert a dependency on nothing."*

That course now exists. The marking has still not moved, because J1's scope
stops at the boundary of Router-on-a-Stick.

---

## 2. The state today, and why it is not yet wrong

With J1 landed and Router-on-a-Stick untouched, four competencies are claimed as
`develops` by **two** missions in the same learning path:

| Competency | Networking Foundations | Router-on-a-Stick |
|---|---|---|
| `net.ip-addressing` | develops (M4) | develops (M1) |
| `net.subnet-boundaries` | develops (M4) | develops (M1) |
| `net.default-gateway` | develops (M5) | develops (M1) |
| `net.connectivity-verification` | develops (M7) | develops (M5) |

Neither course is published, so no learner is affected and no database holds a
contradiction. But the path-level invariant — *a competency is developed exactly
once in the learning path* — is not satisfied by the current source, and would
not be satisfied at publication.

`scripts/lib/wpj-course-transition.txt` is the machine-readable declaration of
what resolves it, and `scripts/verify-wpj.sh` proves the resolution is coherent
without applying it. The verifier also asserts Router-on-a-Stick still holds its
current relationships, so this document cannot quietly become out of date.

---

## 3. T1 — Competency relationship transition

Four links change from `develops` to `reinforces`. Nothing else about them
changes: `required` stays as authored, and no competency identity, title or
description moves.

| Mission | Competency | From | To |
|---|---|---|---|
| `ros-m1-understand-the-network` | `net.ip-addressing` | develops | reinforces |
| `ros-m1-understand-the-network` | `net.subnet-boundaries` | develops | reinforces |
| `ros-m1-understand-the-network` | `net.default-gateway` | develops | reinforces |
| `ros-m5-verify-the-network` | `net.connectivity-verification` | develops | reinforces |

**Blocked by an in-course validator.** `validateRoasCurriculum` requires every
Router-on-a-Stick competency to be developed exactly once *inside
Router-on-a-Stick*. Applying T1 as written produces four
`no mission develops this competency` errors, because the developing mission is
now in another course entirely.

This is the D3 problem, and it is a real architectural question rather than a
nuisance: the rule is correct and valuable, and its **scope** is what is wrong.
It reasons about a course when the thing it protects is a learning path.

Three resolutions were considered. Recorded here so the decision is made once:

1. **Re-scope the rule to the learning path.** `validateRoasCurriculum` gains
   knowledge of competencies developed elsewhere in the path. Correct, and the
   largest change — Router-on-a-Stick's validator currently imports nothing
   about other courses, and giving it that reach is a validator refactor that
   needs Architect review in its own right.
2. **Move the rule up.** Retire the in-course check in favour of the path-level
   check `verify-wpj.sh` already performs, extended to run over every course.
   Cleanest long-term, and it means the check lives with the invariant instead
   of with one course.
3. **Exempt the four competencies.** Rejected. A per-competency exception list
   is an exception to an invariant, which is how invariants stop being true.

**Recommendation: option 2**, as its own bounded slice, before T1 is applied.

`net.fault-isolation` is deliberately absent from T1. Per D1 and D9 it stays
developed in Router-on-a-Stick Mission 6: Networking Foundations teaches a
learner to reason about a failure whose stopping point they are shown, which is
a different and smaller capability than narrowing an unlocated fault across
several boundary types.

---

## 4. T2 — Course position transition

`connected-learning-mvp` currently holds Router-on-a-Stick at `position: 0`.
DEC-053 places Networking Foundations first, and this document's course is
authored at `position: 0` accordingly.

**Router-on-a-Stick must move to `position: 1`.**

Not applied here for the same reason as T1. Nothing is published, so the two
zeroes conflict on paper only — but publishing either course before this is
settled would make the change a published-content mutation, which the importer
refuses outright.

---

## 5. T3 — Learning path effort metadata

The Router-on-a-Stick bootstrap authors the learning path node with
`estimatedMinutes` equal to the Router-on-a-Stick course's own estimate, which
was true when the path held one course.

This document deliberately **omits** `estimatedMinutes` on the learning path
rather than repeating a figure that a second course makes wrong, or asserting a
new figure that would conflict with the bootstrap's. Omission asserts nothing;
both alternatives assert something false.

**Required later:** one owner for the path node's effort metadata, and a value
that reflects every course in the path. Until then the two representations must
not both be published.

---

## 6. T4 — The Router-on-a-Stick entry prerequisite

DEC-053's promise is that Router-on-a-Stick may assume the foundations. That
should be expressed as a prerequisite rule on the Router-on-a-Stick course.

**Not authored in J1, and not authorable today.** A prerequisite rule may only
require a competency that is declared in the *same document*
(`curriculum-document.ts`: *"prerequisite rule requires a competency that is not
in this document"*). Router-on-a-Stick is compiled content and has no document;
Networking Foundations has a document but is the wrong side of the relationship.

Authoring it here would mean either declaring Router-on-a-Stick's competencies
inside the Networking Foundations document — claiming ownership of curriculum
this course does not own — or pointing a rule at a target this document does not
contain. Both are the invalid workaround D6 forbids.

**Required later, and the shape it must take.** When the rule is authored it
must use `requirementType: "competency"`, never `"content_completion"`. A
competency requirement is satisfied by demonstrating the competency through any
route, including a future readiness assessment (LEARN-005). A content-completion
requirement would force an experienced learner to sit through a course whose
competencies they already hold, which is the trap D6 exists to prevent.

Recorded target, for whoever authors it:

```
targetNodeType:      course
targetStableId:      router-on-a-stick
requirementType:     competency
requirementStableId: net.subnet-boundaries
```

`net.subnet-boundaries` is proposed as the single gating competency rather than
all six: it is the one Router-on-a-Stick Mission 1 genuinely cannot proceed
without, and gating on all six would make the entry barrier wider than the need.

---

## 7. Dependencies this transition does not resolve

Recorded so they are not mistaken for WP-J work. Each is a separate bounded
decision (see the WP-J discovery report, §21).

| Gap | Effect on this transition |
|---|---|
| G1 — five unapplied migrations | Neither course can be imported or read until applied |
| G2 — learner surface hard-wired to Router-on-a-Stick | Networking Foundations has no navigation even once published |
| G3 — no curriculum asset hosting | Networking Foundations is authored without diagram steps |
| G5 — assessments not publishable as documents | Practice steps can name an assessment but not resolve one |
| G6 — no-fault Packet Journey stop wording | Affects PJ3's authoring choice, not this transition |
| G8 — course position and publication ordering | Is T2 |

---

## 8. Execution order, when authorised

1. Resolve D3 — decide where the "developed exactly once" invariant lives.
2. Apply that decision as its own slice.
3. Apply **T1** and **T2** to Router-on-a-Stick, and re-run both course gates.
4. Settle **T3** ownership of the path node's effort metadata.
5. Author **T4** once a representation exists that can express it.

Steps 1 and 2 must precede step 3, or Router-on-a-Stick's own gate fails on a
change that is correct.
