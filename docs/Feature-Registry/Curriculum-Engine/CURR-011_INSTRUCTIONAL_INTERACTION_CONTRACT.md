# CURR-011 — Instructional Interaction Contract

- **Feature ID:** CURR-011
- **Feature Name:** Instructional Interaction Contract
- **Feature Level:** Level 1 — Core
- **Lifecycle Status:** Specified
- **Owning Platform Engine:** Curriculum Engine
- **Governing Company Operating System:** Learning Operating System
- **Product Owner:** Founder

---

# 1. Feature Summary

Instructional Interaction Contract defines the single authoritative contract for
learner-manipulable instructional experiences referenced by a
`CURR-010` `interaction` step.

It owns the **closed interaction type vocabulary**, the **parameter contract per
type**, and the **shared observation model** that every interaction renderer
consumes.

**Packet Journey** is the first registered interaction type.

The contract exists so that cause-and-effect learning — manipulate a system,
observe the consequence — has one definition that authoring, publication and
every rendering path agree on.

---

# 2. Problem Statement

The approved instructional model requires the learner to configure something and
observe what happens. Three failure modes have to be designed out before any such
experience is built.

**A second source of truth.** A visualization that computes whether a network
works becomes a second answer to a question the deterministic validator already
owns. Two answers is the failure mode the platform's validation boundary exists
to prevent.

**A rewrite when the real lab arrives.** An interaction built directly against
authored parameters would have to be rebuilt when authoritative environment
observations become available, and the instructional content model would be
reopened with it.

**A learner who can only watch.** An interaction whose accessible alternative is
a description of what happened turns a participant into a spectator. If the
instructional task is to predict, configure and troubleshoot, a learner who
cannot perform those actions cannot complete the mission at all — an accessibility
failure and a BEGINNER-COMPLETE-1 failure at the same time.

Without one shared contract, a fourth failure follows: an arbitrary interaction
payload becomes the undocumented escape hatch that `CURR-010` and DEC-054
deliberately close.

---

# 3. Student Value

Students manipulate a system and see the consequence, instead of reading a
description of what would happen.

Correct state produces observable success. Incorrect state produces an
understandable failure the learner can investigate, rather than a verdict.

**Every student can perform the instructional task, not merely observe it.** A
student using a screen reader, or otherwise unable to use the visual
representation, inspects the same state, makes the same instructionally
meaningful choice, receives the same consequence, and continues troubleshooting
through an accessible path. A description of the visual experience is not the
accessible experience.

---

# 4. Founder Value

One contract serves every future domain. Adding a Linux, Windows, Security or
Cloud interaction later adds a registry entry, a parameter schema and a renderer.
It does not change the step model, the payload discriminator, the accessibility
rules, the projection contract or the publication validator.

The accessibility invariant is defined once, in the contract, so it cannot be
forgotten per interaction type.

---

# 5. Included Scope

- A closed interaction type vocabulary.
- A parameter contract per interaction type.
- The shared `ObservationModel` consumed by every interaction renderer and by
  every accessible interaction path.
- The teaching-mode Packet Journey contract.
- The authored source discriminator distinguishing teaching mode from future live
  mode.
- The progressive-support level carried by an interaction.
- **Accessible interaction equivalence**, including the required authored text
  trace.
- Publication-time validation of interaction parameters.

---

# 6. Explicitly Excluded Scope

- Live-lab observation adapters (future `WP-K`).
- Any `LabProvider` contract change.
- Independent computation of networking, forwarding, routing or VLAN behaviour.
- Any competency judgement, score or evidence.
- Lab provisioning, session lifecycle or access delivery.
- Interaction types for Linux, Windows, Security or Cloud.
- General-purpose scripting or authored executable behaviour.

---

# 7. Ownership Boundaries

There is **one** authoritative contract. There is no second registry.

| Concern | Owner | Location |
|---|---|---|
| Interaction type vocabulary (the closed set) | **Shared, authoritative** | `packages/shared-types` |
| Parameter contract and validation | **Shared** | `packages/shared-types` |
| `ObservationModel` definition | **Shared** | `packages/shared-types` |
| Publication validation | **Server, using the shared validators** | `services/api` |
| Learner-safe projection and protected-content withholding | **Server** | `services/api` |
| PROVE IT enforcement | **Server** | `services/api` |
| Mapping a validated interaction type to a renderer | **Application** | `apps/web` |
| Presentation, interaction UI and the accessible interaction path | **Application** | `apps/web` |

**The client is never the security boundary.** Withholding, projection and
support-level enforcement are server-side. A control the browser still holds is
not withheld.

The application side is a **renderer mapping**, not a registry: it maps an
already-validated shared type to a component. A renderer missing for a valid
shared type is an application defect. An interaction type absent from the shared
contract is a **publication failure**.

---

# 8. The Observation Model Seam

This is the anti-rewrite constraint recorded by DEC-058.

**The renderer consumes a shared `ObservationModel` and never authored parameters
directly.**

```text
teaching mode:  authored curriculum      → projection → ObservationModel → renderer
future live:    Lab Engine observations  → projection → ObservationModel → renderer
```

The `ObservationModel` carries typed observations, a stop point where applicable,
and the authored or derived text trace.

**The renderer must contain no independent forwarding, routing, VLAN or
competency-success model** in either mode. It renders what the projection gives
it.

**The accessible interaction path consumes the same `ObservationModel`.** It is a
second presentation of one truth, never a second simulation.

Building teaching mode against this shape is what makes live mode an adapter
rather than a rewrite of the instructional content model and the renderer. It is
also the test of whether the seam was implemented correctly: adding live mode
should not require redesigning either presentation.

---

# 9. Two Modes

An interaction declares its source. Only the authored source is implemented now.

| | **A. Teaching mode** | **B. Live lab confirmation / diagnostic mode** |
|---|---|---|
| Status | Implemented by this Feature | **Future — `WP-K`, not authorized here** |
| Driven by | Authored curriculum data | Lab Engine authoritative observations |
| On-screen identity | **Clearly identified as instructional simulation** | Identified as live, with session identity |
| Path source | Authored expected path and authored fault | Observed state only |
| Unavailable state | Not possible — authored | **Fails closed: "state unavailable"** |
| Fabricates plausible state | Never | **Never** |
| Computes correctness | **Never** | **Never** |
| Produces competency evidence | **No** | **No** — the validator does |

**Teaching mode does not represent a live environment and must never claim that a
real environment was configured.**

An interaction type whose source is live is rejected at publication until its
adapter exists.

---

# 10. Packet Journey — Teaching Mode Contract

Packet Journey is the first registered interaction type. Its authored parameters
describe:

- **Topology** — nodes with roles (host, switch, router), interfaces, links,
  addresses and prefix lengths, VLANs where relevant.
- **Traffic** — the unit represented, its source, its destination, and the label
  of the action that starts it.
- **Expected path** — the authored sequence of hops and the decision made at
  each.
- **Authored fault** — an optional intentional fault with its location and the
  symptom the learner is shown.
- **Inspectable state** — what the learner may examine.
- **Learner actions** — the enumerated changes the learner may make.
- **Support level** — the progressive-support level for this interaction.
- **Text trace** — the required ordered plain-language account.

**Inspectable state and learner actions are authored as structured data
precisely because both presentations need them.** They are what makes the
accessible interaction path in section 14 possible without inventing a parallel
model.

## 10.1 What Packet Journey does NOT model

This scope fence is part of the Feature, so the interaction cannot grow into a
network simulator.

- No real packet forwarding and no protocol stack.
- No ARP, MAC learning, spanning tree, DHCP or DNS.
- No routing protocols and no routing-table computation.
- No timing, latency, throughput, congestion or MTU.
- No IPv6, NAT, ACLs, QoS, firewalls or wireless.
- **No inference.** The path is authored; where a fault is authored, the stop
  point is authored with it.
- No arbitrary learner configuration — only the enumerated learner actions.
- **No pass, no fail, no score, no evidence.**

---

# 11. Progressive Support

An interaction carries an authored support level:

```text
SHOW ME → HELP ME → ASK ME → CHALLENGE ME → PROVE IT
```

Support levels are enforced **server-side**, per DEC-059.

**PROVE IT withholds instructional assistance. It does not withhold the
environment required to demonstrate competency.**

A **teaching-mode** interaction that would reveal the solution may be withheld at
PROVE IT, because it is instructional assistance by definition. A future
**live-lab** interaction is not withheld at PROVE IT; it renders authoritative
observations with the expected path, authored fault and hints removed.

**A support level must never become an authority for lab availability.** Lab
availability is owned by the Lab Engine and the mission's lab contract.

**Both presentations obey the same support level identically.** The accessible
path must never expose information the visual path withholds, and must never
withhold operation the visual path allows.

---

# 12. Deterministic Validation Boundary

- **An interaction never becomes a second validator.**
- Teaching mode produces **no competency evidence** and must not imply it does.
- Live mode renders authoritative observations and **never invents them**.
- When authoritative state is unavailable, live mode **fails closed** and says
  so, rather than drawing a plausible path.
- **Deterministic validation remains the authority for competency success and
  failure.**

---

# 13. Security and Integrity

- Interaction parameters are **inert authored data**, validated against the
  shared contract for the declared type. They are never executable and never
  scripting.
- The security boundary is the same one `CURR-010` section 10 establishes:
  inertness and renderer escaping, **never keyword or pattern matching against
  code-like strings.** Address text, interface names, VLAN identifiers and
  configuration fragments are ordinary instructional content.
- Parameters must never carry credentials, live endpoints, session identifiers or
  provider names.
- **An unregistered interaction type is a hard publication failure.** This is what
  keeps the interaction step from becoming an arbitrary-content escape hatch.
- Withholding and projection are server-side; no presentation enforces anything.

---

# 14. Accessibility Requirements — Accessible Interaction Equivalence

**Every registered interaction type must provide an accessible interaction path
that preserves the essential instructional operation.**

An interaction is something the learner *does*. An accessible alternative that
only describes what happened removes learner agency and is not equivalent.

## 14.1 The invariant

For Packet Journey, a learner using a screen reader — or otherwise unable to use
the visual and animated representation — must be able to:

1. **inspect the same instructionally relevant state** available to the visual
   learner;
2. **understand the current topology and state** through a structured nonvisual
   representation;
3. **identify the available learner actions**;
4. **make the same instructionally meaningful prediction, selection or
   configuration choice**;
5. **submit and commit that action**;
6. **receive the resulting authoritative or authored observation or
   consequence**;
7. **determine where the journey proceeded or stopped** through accessible state
   and output;
8. **continue troubleshooting and remediation** through that accessible path.

## 14.2 Equivalence is functional, not visual

The accessible representation is **not** required to be visually identical to the
animated one. It is required to be **functionally and instructionally
equivalent**: the learner must be able to perform the same essential learning
task and receive the same instructionally relevant consequence.

## 14.3 The text trace remains required — and is not a substitute

The authored text trace stays mandatory. It remains valuable for narration, state
description, reduced-motion presentation and observation history.

**It is an observation and narration representation. It must never be defined as
a substitute for learner agency when the visual interaction itself requires
learner action.**

## 14.4 Keyboard operability is necessary and not sufficient

Keyboard operation of every learner action remains mandatory. On its own it does
not satisfy this section: a keyboard-operable control the learner cannot perceive
or interpret is not an accessible interaction path.

## 14.5 Reduced motion preserves information and operation

Reduced-motion support must preserve **both** the information and the operation.
Where learner action is required, a reduced-motion learner must still be able to
take it.

## 14.6 Constraints on the accessible path

The accessible path:

- **must use the same validated interaction parameters and the same
  `ObservationModel`**;
- **must not create a second simulation or a second source of truth**;
- **must not expose information that the learner's current support level
  withholds**;
- **must obey PROVE IT and server-side projection exactly like the visual
  renderer**;
- **must never depend on AI**;
- **must be publication-blocking where an interaction cannot provide the required
  accessible equivalent.**

## 14.7 Additional rules

- Consequences must never be conveyed by colour or motion alone.
- **Accessibility alternatives are authored or derived from authored data, and
  never depend on AI.**

---

# 15. AI Usage

A future AI Instructor may receive an interaction's setup and available
affordances. It may **not** receive the authored fault or the expected path below
review context, and receives nothing from a mission under protected
demonstration. The projection rules are owned by `AIGW-011`.

AI never adjudicates an interaction's outcome, never substitutes for the
deterministic validator, and **is never part of the accessibility path**.

---

# 16. Failure Behavior

- An unregistered interaction type, or parameters invalid for a registered type,
  **blocks publication**.
- An interaction that cannot provide the required accessible equivalent
  **blocks publication**.
- At read time, an interaction step that fails validation is handled by
  `CURR-010` section 13: the Mission's instructional-content read fails safely
  and surfaces a content-unavailable state. **The step is never silently omitted
  and the Mission is never rendered partially.**
- A renderer missing for a valid registered type renders nothing and reports the
  defect. It never falls back to raw payload output.
- Future live mode, on unavailable authoritative state, shows unavailable.

---

# 17. Acceptance Criteria

## Founder can

- author an interaction against one documented parameter contract.
- publish only when the required accessible equivalent and text trace exist.
- see exactly which parameter or accessibility requirement failed validation.

## Student can

- manipulate an authored system and observe the consequence.
- investigate a failure rather than being told the cause.
- operate the interaction by keyboard.

## Student using an accessible path can

- **inspect the same instructionally relevant state** as the visual learner.
- **understand the current topology and state** through a structured nonvisual
  representation.
- **identify and take the same instructionally meaningful action** — prediction,
  selection or configuration — and commit it.
- **receive the resulting observation or consequence**, and determine where the
  journey proceeded or stopped.
- **continue troubleshooting and remediation to completion** through that path.
- do all of the above **without receiving any information the current support
  level withholds from the visual learner.**

## Platform can

- validate interaction parameters deterministically against the shared contract.
- reject an unregistered interaction type at publication.
- reject an interaction that cannot provide the required accessible equivalent.
- enforce support levels server-side, identically for both presentations.
- guarantee that no interaction produces competency evidence.
- **accept a future live observation source without redesigning either
  presentation.**

---

# 18. Definition of Done

CURR-011 is complete when:

- one shared authoritative interaction contract exists, with a closed vocabulary.
- parameter validation is shared and used by both authoring and publication.
- the `ObservationModel` exists, and the visual renderer and the accessible path
  both consume only it.
- neither presentation contains a forwarding, routing, VLAN or success model.
- Packet Journey teaching mode is registered, with its scope fence enforced.
- the authored source discriminator exists and rejects live mode until its
  adapter exists.
- the required text trace is publication-blocking.
- **the required accessible interaction equivalent is publication-blocking.**
- support levels are enforced server-side.

**Tests must verify accessible interaction equivalence for Packet Journey,
covering:**

- **accessible state inspection** — the same instructionally relevant state is
  reachable nonvisually;
- **equivalent learner action** — the same instructionally meaningful prediction,
  selection or configuration can be made and committed;
- **consequence and observation** — the resulting observation, and where the
  journey proceeded or stopped, are conveyed accessibly;
- **continued troubleshooting** — remediation can be carried through to
  completion on the accessible path;
- **support-level withholding parity** — the accessible path withholds exactly
  what the visual path withholds at every level, including PROVE IT;
- **no additional answer-revealing information** — the accessible path exposes
  nothing the visual path does not;
- **same `ObservationModel` and source-of-truth boundary** — one model, one
  truth, no second simulation.

Tests must also cover valid and invalid parameters, unregistered types, the
withholding rules, and the no-evidence guarantee.

Founder approval is recorded.

---

# 19. Dependencies

## Depends On

- CURR-010 — Mission Instructional Steps
- CURR-005 — Curriculum Publication Workflow

## Integrates With

- Lab Engine — future live observations only; **no contract change here**
- LAB-008 — Deterministic Lab Validation (remains the sole competency authority)
- AIGW-011 — Curriculum Projection and Protected-Content Withholding
- CURR-009 — Curriculum Quality Checklist

---

# 20. Future Extensions

- **`WP-K` — Live-Lab Packet Journey Adapter.** Connects authoritative Lab Engine
  observations to the `ObservationModel`. Depends on this Feature and on a real
  applicable lab provider. It is what eventually makes the applicable
  Router-on-a-Stick experience fully SIGNATURE-LEARNING complete, through
  simulation → real environment → authoritative observation → learner
  remediation → deterministic confirmation. **The accessible interaction
  equivalence invariant applies to live mode unchanged.**
- Additional interaction types for Linux, Windows, Security and Cloud, each
  subject to the same accessibility invariant.

Not part of the MVP unless separately approved.

---

# 21. Founder Approval

**Should this Feature exist?**

- [x] Approved
- [ ] Deferred
- [ ] Rejected

Approved by DEC-058, with the support-level contract from DEC-059.

---

# 22. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-30 | Initial Feature specification. One shared authoritative contract with application-side renderer mapping; the `ObservationModel` seam is a required design constraint; teaching mode produces no evidence and live mode is deferred to `WP-K`. Accessibility requires accessible interaction equivalence — the learner performs the instructional task, not merely reads a description of it — with the authored text trace retained as narration rather than as a substitute for learner agency. |
