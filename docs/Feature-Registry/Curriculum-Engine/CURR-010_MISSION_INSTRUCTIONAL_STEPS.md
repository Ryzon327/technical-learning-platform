# CURR-010 — Mission Instructional Steps

- **Feature ID:** CURR-010
- **Feature Name:** Mission Instructional Steps
- **Feature Level:** Level 1 — Core
- **Lifecycle Status:** Specified
- **Owning Platform Engine:** Curriculum Engine
- **Governing Company Operating System:** Learning Operating System
- **Product Owner:** Founder

---

# 1. Feature Summary

Mission Instructional Steps defines the ordered, typed instructional content that
lives **beneath** a Mission.

A step is the unit of "teach a little, then apply it". A Mission is composed of
an authored sequence of steps, each with a declared type that determines how it
renders, what accessibility alternative it requires, and what a future AI
Instructor may receive.

Steps are **content**, not curriculum nodes.

---

# 2. Problem Statement

`missions.description` is a single untyped text column. It is the only
instructional surface the platform has, and it cannot carry:

- a diagram;
- an interaction;
- a learner prediction;
- an authentic command and its output;
- a placed practice check;
- an optional reference.

The Router-on-a-Stick learner surface currently reconstructs structure by
splitting that column on blank lines and inferring a list when every line begins
with a dash. That is a convention, not a contract, and it cannot express the
approved instructional cycle at all.

The consequence is the failure mode BEGINNER-COMPLETE-1 exists to prevent: a
Mission can only be *described in prose*, which produces exactly the textbook
wall the Founder has prohibited, while the platform has no way to detect it.

---

# 3. Student Value

Students receive small instructional units followed quickly by meaningful
application, rather than long passive reading before an eventual activity.

Students also receive a reliable accessibility path, because every visual or
interactive step is required to carry an authored text equivalent before it can
publish.

---

# 4. Founder Value

The Founder can author an instructional sequence without changing application
code, and the platform can mechanically detect structural instructional defects —
including missing accessibility alternatives — before a learner ever sees them.

---

# 5. Included Scope

- An ordered instructional step collection belonging to one Mission.
- A closed step-type vocabulary.
- Type-discriminated payload contracts.
- Authored text-equivalent alternatives for visual and interactive steps.
- Authored progressive-support level for interactive steps.
- Publication-time structural validation.
- A learner read path for published steps.

---

# 6. Explicitly Excluded Scope

- Independent step publication state.
- Independent step versioning or supersession.
- Per-step learner progress.
- Step-level competency mapping.
- Step-level evidence of any kind.
- Cross-mission or cross-course step reuse.
- Any raw-HTML or markup-interpreting rendering mode.
- Executable authored payloads.
- A rich-text editor or content management system.
- A Lesson curriculum node.

---

# 7. Position in the Hierarchy

```text
Learning Path
└── Course
    └── Module
        └── Mission              ← progress, competency, prerequisite, lab, completion
            ├── mission.description   (the brief: objective and professional context)
            ├── instructional steps   (ordered content — THIS FEATURE)
            ├── competency links
            └── lab reference
```

**Mission remains the authoritative unit** for learner progress, resume and
navigation, prerequisite evaluation, competency relationship, lab association and
completion.

Steps sit **below the progress grain**. They introduce no new curriculum node
type, no new progress node type, and no new publication target.

---

# 8. Step Type Vocabulary

The vocabulary is **closed at seven types** (DEC-054).

| Type | Instructional purpose |
|---|---|
| `concept` | One idea, stated plainly. The unit of "teach a little". |
| `diagram` | A picture that carries instructional meaning. |
| `command` | Authentic device or shell interaction: what is typed, what comes back. |
| `prediction` | The learner commits to an expected outcome before observing. |
| `interaction` | Manipulate a system and observe the consequence. |
| `practice` | Place an existing assessment where it becomes fair to ask. |
| `reference` | Concise optional material the learner may open when needed. |

## 8.1 Semantic boundaries

- An **example** is `concept` content. A separate type would change no rendering,
  accessibility, validation or projection behaviour.
- **`command`** carries a displayed command and/or displayed output. They are one
  instructional unit and are not split across two steps. Either half may be
  omitted, so authentic output can be shown without a command.
- **`checkpoint` is deliberately not a step type.** The curriculum-defined
  reinforcement checkpoint recorded in `LEARN-008` is a Learning Engine trigger
  keyed on mission and competency. Representing it as curriculum content would
  place a Learning Engine concept in a Curriculum Engine structure.
- **`practice`** carries an assessment reference only. It never duplicates
  question, option or answer content.
- **`reference` is optional enrichment and may never carry prerequisite
  instruction required to satisfy BEGINNER-COMPLETE-1.** If a learner must read
  it to proceed, it is a `concept`, and the quality gate treats it as one.

---

# 9. Ordering, Publication and Versioning

- **Ordering** is by authored position, ascending, unique within a Mission.
- **Publication is inherited.** A step has no publication state; it is readable
  when its owning Mission is published, using the same pattern
  `curriculum_assets` already follows.
- **Versioning is inherited.** A step belongs to a Mission at a specific version.
  Re-versioning a Mission carries its steps forward.
- **Supersession does not exist at step level.** `curriculum_version_lineage`
  remains a node-level concept.
- **Deletion cascades** from the owning Mission.

A step identity is referenceable and stable within its Mission, for deep-linking,
AI context addressing, review reporting and content migration. It is **not** a
curriculum node identity and must never appear in publication events, version
lineage, prerequisite rules or learner progress.

---

# 10. Security and Integrity

The boundary is **inertness and escaping**, not keyword matching.

## 10.1 Authored content is inert

- Authored plain-text and code-bearing fields are **inert content**. The renderer
  escapes them.
- **No instructional field may request or cause arbitrary HTML or markup
  interpretation.** There is no authored mechanism to opt into markup rendering.
- **No raw-HTML rendering mode is supported** anywhere in the instructional
  surface.
- **Executable script payloads and executable authored markup are prohibited.**

## 10.2 Code-looking text is valid instructional content

The platform must be able to teach HTML, JavaScript, shell syntax, configuration
syntax, security examples and other code-bearing material.

**Strings that resemble markup or code — including tags, script text, shell
metacharacters and configuration fragments — are valid instructional content** in
`concept`, `command`, `reference` and other appropriate plain-text fields. They
must never be treated as structurally prohibited.

**The boundary is enforced by payload validation and renderer escaping, never by
keyword or pattern matching against markup-like or script-like strings.** A
validator that rejected `<script>` in prose would make the platform unable to
teach its own subject matter.

## 10.3 Remaining integrity rules

- **Payload is validated by step type.** An unknown or malformed payload is
  rejected at authoring and blocks publication.
- **A `command` step is a display artefact.** Nothing renders it executable and
  no surface may offer to run it.
- A payload must never carry credentials, live endpoints, session identifiers or
  provider names.
- **Writes are server-authorized only**, through the existing curriculum
  authoring operations. Learners have read access to published content only.
- Steps carry no evidence path and no competency mapping, so no step can
  contribute to a competency claim.

---

# 11. Accessibility Requirements

- Every step has an accessible text path.
- A `diagram` step requires an authored text alternative describing **what it
  teaches**, not what it looks like. **Publication is blocked without it.**
- An `interaction` step requires an authored text equivalent describing what the
  learner can do and what they would observe. **Publication is blocked without
  it.**
- Interactive steps must be keyboard operable.
- Reduced-motion users must receive an equivalent instructional path.
- Consequences must never be communicated by colour or animation alone.
- **Accessibility alternatives are authored and must never depend on AI.**

---

# 12. AI Usage

A future AI Instructor consumes authored steps rather than duplicated
hand-written lesson prompts. Which content it may receive per step type is owned
by `AIGW-011`.

AI may not author curriculum, may not manufacture competency, and may not
substitute for a missing foundation. **A concept absent from the authored steps
is absent from the course**, and the BEGINNER-COMPLETE-1 gate judges the authored
steps only.

---

# 13. Failure Behavior

Instructional content fails **safely and visibly**, never partially.

## 13.1 Publication is the primary defence

Hard structural validation must normally prevent an invalid step from publishing
at all. Invalid step content keeps the curriculum in draft and refuses
publication.

## 13.2 Read-time failure fails the Mission's instructional content

If published content nevertheless contains a structurally invalid step at read
time:

- **The Mission's instructional-content read fails safely.** A clear
  content-unavailable / content-error state is surfaced to the learner.
- **The invalid step is never silently omitted while the rest of the Mission
  continues to render.** A partial Mission looks complete and is not, which would
  leave the learner with a structurally incomplete lesson and violate
  BEGINNER-COMPLETE-1.
- **Malformed content is never rendered raw and never rendered partially.**
- The defect is surfaced operationally so it can be corrected at the source.

## 13.3 No optional-step omission policy

**This Feature introduces no policy permitting an invalid step to be omitted
because it is considered optional.** A narrowly defined future exception for
genuinely optional enrichment may be considered separately and requires its own
approval.

## 13.4 Missions with no steps are unaffected

A Mission that has **no** instructional steps continues to render from
`mission.description`, preserving backward compatibility with existing published
content.

This is deliberately distinct from a Mission that **has** instructional steps and
contains an invalid one. The first is a supported legacy shape; the second is a
content defect and fails per section 13.2.

---

# 14. Acceptance Criteria

## Founder can

- author an ordered instructional sequence for a Mission.
- see exactly which structural check failed and where.
- publish only when required accessibility alternatives exist.
- identify a read-time content defect operationally rather than by learner report.

## Student can

- read a Mission as a progressive sequence rather than a wall of prose.
- reach every instructional step through an accessible text path.
- operate interactive steps by keyboard.
- **be told plainly that a Mission's content is unavailable, rather than being
  shown a lesson that is silently missing a step.**

## Platform can

- validate step structure and payload deterministically.
- inherit publication and versioning from the Mission.
- expose published steps through a stable read contract.
- guarantee that no step produces competency evidence.
- **fail a Mission's instructional-content read safely when any published step is
  structurally invalid, without rendering a partial Mission.**

---

# 15. Definition of Done

CURR-010 is complete when:

- the ordered step model exists with the closed seven-type vocabulary.
- payload contracts are type-discriminated and validated.
- accessibility alternatives are required and publication-blocking.
- publication and versioning are inherited from the Mission.
- a learner read path exists for published steps.
- structural validation is wired into publication.
- **read-time failure surfaces a content-unavailable state for the Mission and
  never renders a partial Mission or omits an invalid step.**
- **a Mission with no steps still renders from `mission.description`.**
- **authored code-bearing text — including markup-like and script-like strings —
  is preserved as instructional content and escaped at render, with no validator
  rejecting it by pattern.**
- tests cover valid and invalid structures, the read-time fail-safe, the
  no-steps legacy path, code-bearing content, and the no-evidence guarantee.
- Founder approval is recorded.

---

# 16. Dependencies

## Depends On

- CURR-001 — Curriculum Hierarchy and Stable IDs
- CURR-003 — Course, Module, and Mission Definition
- CURR-005 — Curriculum Publication Workflow

## Integrates With

- CURR-007 — Content Asset References
- CURR-009 — Curriculum Quality Checklist
- CURR-011 — Instructional Interaction Contract
- Learning Engine (progress remains at Mission grain)
- AI Gateway (AIGW-011 projection contract)

---

# 17. Relationship to Existing Features

`CURR-003` section 5 records that a Mission defines instructional references,
demonstration references and activities. That establishes intent and direction.
It does **not** specify an ordered, typed step model, so CURR-010 is recorded as
genuinely new architecture rather than as completion of CURR-003.

`CURR-003` section 16's success metric — curriculum can be created without
modifying application code — is addressed by DEC-056, not by this Feature.

---

# 18. Future Extensions

- Cross-mission or cross-course step reuse.
- Step-position resume as presentation state.
- A narrowly defined omission policy for genuinely optional enrichment steps.
- Authoring tooling over the curriculum data substrate.

Not part of the MVP unless separately approved.

---

# 19. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

Approved by DEC-054.

---

# 20. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-30 | Initial Feature specification. Approved by DEC-054 following the BEGINNER-COMPLETE-1 architecture review. Read-time failure is fail-safe at Mission granularity; the security boundary is inertness and renderer escaping rather than pattern matching, so code-bearing instructional content remains teachable. |
