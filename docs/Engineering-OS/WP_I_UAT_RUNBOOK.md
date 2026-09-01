# WP-I — Instructional Quality Human UAT Runbook

**Status:** **ACCEPTED.** WP-I slices I1–I4, the correction slices I6A–I6I, the
final bounded correction and the final flow correction. Written for the Founder.

This is the review that decides whether the instructional system built through
WP-H actually *teaches*. Automated gates have already proved what can be proved
deterministically — that content is withheld correctly, that controls are real
buttons, that nothing computes networking truth. **None of that is evidence
that the experience is good.** That part is this document, and it needed a human.

It has now had one.

---

## 0. UAT acceptance record

**Result: PASS.** Recorded 2026-09-01. Reviewer: Founder. Surface reviewed:
`/uat/instruction`, the architecture fixture, through the real parser, the real
learner projection and the real renderer.

This is the fourth and final review. The first three produced findings; this one
produced none.

### What passed

- **Downward instructional flow felt continuous.** The learner reads and acts in
  one direction, with the progression control beneath the latest journey event.
- **The Packet Journey topology remained visible while scrolling.** The pinned
  observation surface stayed on screen throughout.
- **The topology could be referenced while answering each step.** The picture
  was usable as a reference for the decision in front of the learner, rather
  than something to scroll back to.
- **The packet visualisation continued through the complete journey**, to PC-B
  and back along the authored reply, to final confirmation.
- **No backward scrolling was needed to locate progression controls.** This was
  the third review's one blocking defect and it is resolved.

### Reviewer statement

Recorded verbatim as UAT evidence:

> "that was flawless i loved how i scrolled but the packet life diagram stayed.
> i could reference the diagram for each answer and the diagram worked to the
> end"

### What this acceptance does and does not cover

It covers the **instructional machinery**: the interaction, the topology, the
progression flow, the support levels as presented, and the accessibility and
responsive behaviour a human can judge.

It does **not** cover, and must not be read as covering:

- **Instructional quality of real curriculum.** This was the architecture
  fixture, which exercises the contract rather than teaching well. Whether the
  product teaches is decided when WP-J authors Networking Foundations.
- **The persisted path.** The harness renders from a file; the
  authored → published → database → API → browser round-trip is unproven here.
- **Screen-reader operation**, beyond what the Founder exercised.
- **Dark mode**, which remains a known, recorded, deliberate absence.
- **The real PROVE IT experience**, which needs the lab environment that does
  not exist yet (WP-K and the LabProvider work).

### Findings carried forward

Two items were confirmed during UAT as belonging elsewhere, and are **not**
defects against WP-I:

| Item | Owner |
|---|---|
| The fixture assumes prior networking knowledge | WP-J |
| CHALLENGE ME is withholding-only; a genuinely harder scenario needs authoring | WP-J |

The rest of this document is the review as it was run, retained as the record of
what was checked.

---

## 0.1 Correction history — what changed across the four reviews

Retained as the record of what was found and what was done about it.

Your first review produced eight findings. Seven were acted on; one was
confirmed as belonging to WP-J and deliberately left alone. §7.5 is the
per-finding checklist for that round.

| Your finding | What was done |
|---|---|
| 1. The figure is meaningless | The fixture pointed at `example.test`, a hostname reserved by standard to **never** resolve — so the browser showed the alt text where a diagram should have been. There is now a real, local figure, and an image that fails to load says so instead of leaving a stray sentence |
| 2. The topology is not adequate | There is now a drawn topology: devices, roles, ports, wires, and the packet moving along them |
| 3. Connections are hard to understand | Every connection now reads **PC-A eth0 to Switch-1 Fa0/1** — both devices and both ports — in the picture and in the written list, resolved once so they cannot disagree |
| 4. The fixture assumes prior knowledge | **Confirmed and deliberately not fixed.** The fixture exercises the contract; teaching networking from nothing is WP-J, and this correction was not allowed to become it |
| 5. Not interactive enough | Partly. You now inspect devices and open a full workspace. Entering configuration yourself is a future decision, not this correction |
| 6. Wrong prediction appeared to reset | Fixed, and it was never a reset — see §7.5. The commitment now stays on screen and pairs with what actually happened |
| 7. Feedback too subtle | Every action now changes something visible, and the announcement changes on commitment — it previously did not, so a screen reader was told nothing at all |
| 8. Success confirmation is good | Kept and given more room |

Your second review then found three bounded mechanics still outstanding. The
final correction addressed all three, and preserved one observation:

| Your finding | What was done |
|---|---|
| A. Action and consequence were spatially disconnected | The columns were re-split by ROLE. Column one is now the whole DECIDE → ACT → OBSERVE loop — topology, a current-event line under it, the decision, the controls, the history. Column two is reference only. The topology also stays pinned in the workspace, and a calm one-shot ring marks the device that just changed |
| B. VLAN context was not visible enough | Device faces now show the facts the AUTHOR flagged, so VLAN 10 can be followed from PC-A to the access port to the trunk to the router subinterface without opening a panel. Figure 1 shows the same chain, including that Router-1 has nothing for VLAN 20 |
| C. Success stopped at Router-1 | The authored journey now continues to PC-B and the reply comes back to PC-A, and the journey can no longer be clicked past the failure |
| D. Connections competed with the topology | Moved into the reference rail behind a disclosure. Nothing removed; the connection crossed is now named in the event line where you are already looking |
| PROVE IT hides the workspace | **Correct, unchanged.** See §7.6 step 11 |
| The passive prediction looked broken | The UAT harness now says so. See §7.6 step 1 |

Your third review found one blocking defect: the progression control sat above
the journey history, so continuing meant scrolling up to click and back down to
read, once per remaining stage. It moved to sit beneath the latest event, and
the observation surface was pinned instead of the learner being scrolled to it.
§7.7 is that round's regression.

Your fourth review found nothing, and is recorded in §0.

**One thing deliberately unchanged:** nothing tells you whether your prediction
was right. There is no answer key in the authored content and there must not be
one — you are shown what you predicted beside what actually happened, and the
network behaviour is what teaches.

---

## 0.2 Read this first — what you are looking at

You will be reviewing the **architecture fixture**, not real curriculum.

The fixture was written to exercise the *contract*: it deliberately contains one
of every step type and one complete packet journey, so that every code path has
something to render. It was **not** written to be excellent teaching, and it is
structurally prevented from ever reaching a learner.

That distinction matters for every finding you record. If the prose is thin or
the scenario is contrived, that is a **fixture/content** finding and it does not
mean the platform is broken. If the *machinery around* the content is confusing,
inaccessible or ugly, that is a real platform finding. §7 gives you the
classification to use.

**What this review cannot tell you:** whether real curriculum will teach well.
That needs real curriculum, which is WP-J.

---

## 1. Pre-UAT health

### 1.1 What must be true before you start

```
git status
```

For the **re-UAT**, the working tree is expected to be **dirty**: the WP-I
implementation and its correction are uncommitted by design, pending review.
That is normal here and is not a problem to report.

```
git log --oneline -1
```

Expect the last merged commit at the top, with the WP-I work on top of it in
the working tree.

### 1.2 What you need running — and what you do NOT

**You need one thing: the web app.**

```
npm run dev
```

That is the whole setup. Leave it running.

**You do not need any of this, and should not start it:**

| Not needed | Why |
|---|---|
| The API (`npm run dev:api`) | The UAT surface makes no network call |
| Supabase | It reads no database |
| `.env.api` / `.env.local` | It needs no configuration |
| Sign-in | The surface renders before any authentication branch |
| Publishing curriculum | It reads a file, not the catalog |
| Any migration | **The five pending migrations stay pending** |

If you find yourself being asked to sign in, you are on the wrong URL.

### 1.3 Where to go

```
http://localhost:5173/uat/instruction
```

### 1.4 What tells you it worked

You should see, immediately and without signing in:

- [ ] The eyebrow text **"Development UAT surface"**
- [ ] The heading **"Instructional review harness"**
- [ ] A highlighted notice saying this renders the **architecture fixture** and
      is not learner curriculum
- [ ] A **Mission** row with two buttons
- [ ] A **Support level** row with five buttons: SHOW ME, HELP ME, ASK ME,
      CHALLENGE ME, PROVE IT
- [ ] A **Reset the interaction** button
- [ ] Below that, the rendered mission
- [ ] **Figure 1 is a real diagram**, showing PC-A, Switch-1, Router-1 and PC-B
      with their ports. If you see a broken-image icon or a box reading
      *"This figure could not be loaded"*, the dev server is not serving it —
      confirm you are on port **5173**, and report it if you are

The figure is served by the development server only. It is deliberately absent
from any production build, exactly like the harness itself, so it can never
reach a learner.

If the page says *"The architecture fixture does not parse"*, stop and report
it — that is a **BLOCKING PLATFORM** finding, and the errors on screen are the
report.

### 1.5 A note on what this surface proves

The harness runs the fixture through the **real** curriculum parser, the **real**
learner projection and the **real** renderer. What you see is what a learner
would see, given that content.

One honest limit: because the harness selects the support level locally, it
demonstrates **what each level presents**. It does not, by itself, prove that a
*server* withholds — that is enforced in the projection and proved by automated
tests. Do not treat a clean visual review as a security result.

---

## 2. Beginner-Complete review

The gate, restated:

> **Could an intelligent, motivated learner who knows nothing about this
> technical subject understand the instruction, complete the practice, and
> progress without needing an outside source to supply prerequisite knowledge
> that the platform failed to teach?**

Select **Mission: arch-fixture-m1-every-step-type** and **SHOW ME**. Read from
the top as though you know nothing about networking.

### 2.1 Terminology and prerequisites

- [ ] Every technical term is either **explained here** or was **explained
      earlier**. Write down any term used cold.
- [ ] No concept is **used before it is taught**. Note the step where a concept
      first appears versus where it is explained.
- [ ] Where the method calls for it, **behaviour is shown before vocabulary** —
      you see what a thing does before being told its name.
- [ ] Nothing assumes you have used a router, a switch or a terminal before.

### 2.2 Shape of the instruction

- [ ] Each step **teaches a little and then applies it** — you are not reading
      five paragraphs before doing anything.
- [ ] Prose is as long as it needs to be and **no longer**. Note any wall of
      text.
- [ ] The **next action is unambiguous**. Note every moment you thought
      "…what now?".
- [ ] Feedback after acting is **specific to what you did**, not generic
      encouragement.

### 2.3 Where you got confused

- [ ] Write down **every** moment of confusion, even small ones, and what you
      expected instead. This is the single most valuable output of the review.
- [ ] At the end of the mission: do you know **what happens next**?

---

## 3. Packet Journey review — the five support levels

Stay on the mission with the interaction. Change the **Support level** buttons
and re-walk the journey each time. Use **Reset the interaction** between runs.

For each level, check what you SEE, what you KNOW, what you can DO, and what you
MUST NOT receive.

**Your finding 8 said the three lower levels felt the same. They were the
same** — the payload is byte-identical at SHOW ME, HELP ME and ASK ME, because
none of them withholds anything. What changed is **sequencing**: how much you
are asked to do before the system shows you the next hop. The content is
unchanged; the demand on you is not.

The two protected levels are untouched. What they withhold is decided on the
server, and the browser never receives it.

### 3.1 SHOW ME — the system demonstrates

- **SEE:** full topology, every interface attribute, every stage's narration and
  its *reason*, the fault's symptom and its explanation, all remediation
  choices, the confirmation.
- **KNOW:** why each hop decided what it decided; why the fault causes the
  symptom.
- **DO:** advance freely, predict if you want to, apply any remediation, reset.
- **MUST NOT RECEIVE:** nothing is withheld at this level.

Checks:
- [ ] The journey reads as a **demonstration you could follow**
- [ ] You **can** advance without committing a prediction — the prediction is
      offered, not demanded
- [ ] The "why" for each hop is genuinely explanatory, not a restatement

### 3.2 HELP ME — guided, with the reason one click away

- **SEE / KNOW / DO:** the same content as SHOW ME.
- **MUST NOT RECEIVE:** nothing.

Checks:
- [ ] You are **prompted to inspect a device** before continuing
- [ ] The reason for each hop is behind a **"Why this happened"** disclosure
      rather than sitting in front of you
- [ ] You can still advance without committing a prediction
- [ ] Is it **meaningfully different from SHOW ME** now? If it still is not,
      say so — the honest answer matters more than the feature

### 3.3 ASK ME — you commit first

- **SEE:** the same content, but you must participate to reach it.
- **KNOW:** the expected result only **after** you commit a prediction.
- **DO:** commit a prediction, then advance.
- **MUST NOT RECEIVE:** the next stage's outcome before you commit.

Checks:
- [ ] You **cannot** advance past a prediction without committing
- [ ] Committing feels like a **commitment** — you cannot change your mind
- [ ] The prediction asks something you could actually **get wrong**
- [ ] Seeing your prediction beside the outcome is useful
- [ ] Compared with SHOW ME, this feels like being **asked**, not like being
      given less

### 3.4 CHALLENGE ME — look hardest here

> **Deliberately unchanged by the correction.** The Architect ruled that
> withholding stays exactly as it is, and that making CHALLENGE ME genuinely
> harder needs a **separately authored scenario** — content, which is WP-J.
> Removing controls can only ever make a level emptier, never harder. Your
> answers below are the input to that WP-J decision, so they still matter.

- **SEE:** topology, interface attributes, stage narration, the fault's
  **symptom**, the predictions.
- **KNOW:** that the journey stopped, and where.
- **DO:** advance, predict, inspect, reset.
- **MUST NOT RECEIVE:** the reason for each hop, the fault explanation, **the
  remediation choices**, and the confirmation.

WP-H withholds the remediation controls at this level because every authored fix
states whether it works and what it produces — shipping them and merely not
drawing them would hand over the answer. The consequence is that you reach the
failure and there is **nothing to click**.

**This is the open product question of WP-I. Do not assume it is right or
wrong — answer from what you experience:**

- [ ] Does reaching the failure without a remediation control feel like
      **rigor**, or like an **unfinished feature**?
- [ ] Is the withholding message *"Guided fixes are not offered at this level.
      Work out from what you can observe why the journey stopped here."*
      **motivating or frustrating**?
- [ ] Do you still know **what you are expected to do**?
- [ ] Does CHALLENGE ME feel **harder**, or merely **less functional**?
- [ ] Would a **separately authored Challenge scenario** — one whose fix is not
      obvious from labels alone — be a better answer than removing the controls?
- [ ] Is the level ordering still coherent when CHALLENGE ME removes an
      affordance that ASK ME had?

### 3.5 PROVE IT

- **SEE:** the authored text account of the interaction, and a notice that the
  walkthrough is withheld.
- **KNOW:** the objective.
- **DO:** nothing inside the interaction.
- **MUST NOT RECEIVE:** the interaction itself, in any form.

Checks:
- [ ] The **text equivalent is still present** — accessibility is not tutoring
      and must not disappear
- [ ] The notice makes clear that your **environment and objective are
      unchanged**, and that you have not lost something you need
- [ ] Nothing on screen hints at the answer

---

## 4. Signature learning method review

Walk the full sequence once at SHOW ME, then once at ASK ME:

```
learn enough to act → predict → interact → observe consequence
→ troubleshoot → correct → receive confirmation → reuse later
```

- [ ] **Learn enough to act** — you had what you needed before being asked to do
      anything
- [ ] **Predict** — the prediction was meaningful, not a click-through
- [ ] **Interact** — you were doing, not watching
- [ ] **Observe consequence** — the observation made **cause and effect** clear
- [ ] **Troubleshoot** — the failure was understandable **from what you can
      see**, not delivered as a verdict
- [ ] **Correct** — choosing the fix required **reasoning**, not elimination.
      Deliberately choose a **wrong** remediation first: does it teach you
      something, or just say no?
- [ ] **Receive confirmation** — see below
- [ ] **Reuse later** — not reviewable yet; the fixture has no second context.
      Note it as an **OBSERVATION** and defer to WP-J.

### 4.1 The confirmation moment — judge this carefully

The Founder principle is that successful correction should visibly make the
system **start working**, not merely report success.

- [ ] After the correct fix, does the packet **visibly proceed**?
- [ ] Do you get the **"it works now"** feeling?
- [ ] Is the confirmation the **authored explanation of what was wrong and why
      the fix works** — or does it read as a generic "Correct"?
- [ ] Would a learner feel they **earned** it?

A generic success message is a **BLOCKING** finding against the signature
method, even if everything else works.

---

## 5. Accessibility Human UAT

Automated gates already check that controls are real buttons, that a live region
exists, that outcomes are stated in words, and that reduced motion is supported.
**None of that proves the experience is usable.** These checks do.

### 5.1 Keyboard only

Put the mouse away.

- [ ] `Tab` reaches **every** control: mission buttons, support-level buttons,
      reset, prediction radios, commit, advance, remediation, start over
- [ ] **Focus is always visible** — you can always tell where you are
- [ ] Focus order matches reading order; nothing jumps backwards
- [ ] Arrow keys move between prediction options; `Space` selects
- [ ] After advancing a stage, focus goes somewhere **sensible**, not back to
      the top of the page
- [ ] You can complete the entire journey — predict, commit, advance, remediate,
      confirm — **without a mouse**

### 5.2 Screen reader (VoiceOver on macOS)

Turn on with `Cmd + F5`. Navigate with `Ctrl + Option + arrows`.

- [ ] The topology is **comprehensible as a list** — you can tell which
      interfaces belong to which device, and what their addresses are
- [ ] Each stage announces the device, what happened, and the **outcome in
      words**
- [ ] When you advance, the **live region announces the new observation** —
      once, not repeatedly, and not the whole page
- [ ] The prediction group announces its **question** and its options
- [ ] The withheld-interaction notice at PROVE IT is reachable and makes sense
- [ ] Nothing important is announced **only** by the decorative network strip
      (it should be silent — it is marked hidden)

### 5.3 No colour-only meaning

- [ ] Enable macOS greyscale (System Settings → Accessibility → Display →
      Colour Filters → Greyscale)
- [ ] A **stopped** stage is still identifiable — the words "Stopped here"
      should carry it, not the red border
- [ ] Selected support level and selected mission are still identifiable

### 5.4 Reduced motion

- [ ] Enable System Settings → Accessibility → Display → **Reduce motion**
- [ ] Reload and walk the journey again
- [ ] **Exactly the same information** is available
- [ ] **Exactly the same controls** are available
- [ ] Only the movement is gone

### 5.5 Zoom and viewport

- [ ] **200% zoom** (`Cmd +`): nothing clipped, no horizontal page scroll
- [ ] **400% zoom**: still operable, even if cramped
- [ ] **~360px wide** (phone): usable; the topology and any wide block scroll
      *inside their own container*, not the page
- [ ] **~768px** (tablet): usable
- [ ] **Desktop**: line length comfortable, not edge-to-edge

Note: the stylesheet currently has **no width-based breakpoints**. Responsive
behaviour relies on intrinsic CSS. If a narrow width is unusable, that is an
**INTERFACE** finding worth recording precisely.

---

## 6. Visual quality review

Judge the *product*, and separate it from the fixture's prose.

- [ ] **Hierarchy** — does your eye land on the right thing first?
- [ ] **Density** — too tight, too loose, or right?
- [ ] **Typography** — is the scale coherent? Are headings distinguishable?
- [ ] **Spacing** — is it intentional or accidental?
- [ ] **Line length** — comfortable for reading, or too wide?
- [ ] **Nested containers** — the packet journey is a bordered panel inside the
      mission panel. Does that read as structure or as boxes-in-boxes?
- [ ] **Instructional emphasis** — is the teaching emphasised over the chrome?
- [ ] **Packet Journey comprehension** — can you understand the network from
      what is on screen?
- [ ] **The decorative network strip** — does it help, or is it noise? It
      carries no information of its own and could be removed.
- [ ] **Generic appearance** — does this read as a template LMS or an "AI
      dashboard"? It should not.
- [ ] **Calm / premium / intentional** — the target is closer to Linear,
      Stripe, Vercel or Notion than to a traditional LMS. Is it close?

### 6.1 Light mode and dark mode

- [ ] **Light mode:** review as above.
- [ ] **Dark mode:** switch macOS to Dark Appearance and reload.

> **Known absence, recorded deliberately.** The application stylesheet currently
> contains **no dark-mode support at all** — no `prefers-color-scheme` and no
> `color-scheme` declaration. In dark system appearance the product will render
> in its light palette.
>
> **Dark mode remains a required product capability.** It is not optional, and
> WP-I acceptance does not waive it. It was excluded from slices I1–I4 only
> because retrofitting a themed palette across the whole product is a bounded
> design project of its own, and the Architect will decide its implementation
> path after this review.
>
> Record what you observe: how bad is it in practice, and how urgent does it
> feel relative to everything else you found?

---

## 7. Recording findings

Every finding gets a **classification** and a **severity**. The classification
matters because the fixture is not production curriculum — without it, weak
fixture prose gets reported as a platform defect and the wrong thing gets fixed.

### 7.1 Classification

| Classification | Means | Likely owner |
|---|---|---|
| **INSTRUCTIONAL / AUTHORED CONTENT** | The words, the scenario, the teaching order | Fixture, or WP-J curriculum |
| **INTERFACE / PRESENTATION** | Layout, wording of controls, focus, feedback | Learner surface |
| **PLATFORM / ARCHITECTURE** | Contracts, projection, state, failure behaviour | Engine work package |
| **ACCESSIBILITY** | Keyboard, screen reader, contrast, motion, zoom | Learner surface |
| **VISUAL DESIGN** | Hierarchy, typography, spacing, theme, dark mode | Design work package |
| **SUPPORT-LEVEL PRODUCT DECISION** | Whether a level's behaviour is right | Architect decision |

### 7.2 Severity

| Severity | Means |
|---|---|
| **BLOCKING** | WP-I cannot be accepted with this outstanding |
| **IMPORTANT** | Should be fixed before WP-J curriculum is authored |
| **POLISH** | Worth doing, not urgent |
| **OBSERVATION** | Not a defect; worth recording |

### 7.3 What to write down

For each finding: where you were (mission, support level, step), what you
expected, what happened, and how it made you feel about the product. The last
one is not fluff — it is the part automated gates can never recover.

---

## 7.5 Re-UAT checklist — the corrections, one section per finding

**Start here if you are re-reviewing.** Each block corresponds to one of your
original findings. Work through them at **SHOW ME** unless a block says
otherwise, and use **Reset the interaction** between blocks.

### 8.1 Finding 6 — the wrong prediction (do this one first)

Select the mission with the interaction. The first stage asks you to predict.

**Deliberately choose the wrong option again** — *"Straight to PC-B, because
they share a switch"* — and press **Commit this prediction**.

- [ ] Your prediction **stays on screen**, under **YOUR PREDICTION**, with a
      note that nothing has been observed yet
- [ ] The announcement line **changes** — it now names what you predicted
- [ ] The button below reads **"Send the ping from PC-A"**, not "Start"
- [ ] Nothing looks like it went back to the beginning
- [ ] **Start over** is small, quiet, and clearly not the next step

Now press **Send the ping from PC-A**.

- [ ] You see **YOUR PREDICTION** and **WHAT ACTUALLY HAPPENED** together
- [ ] Nothing says you were wrong
- [ ] Reading the two side by side, **you can tell you were wrong** — and why

> **The question worth your judgement:** is being shown the contrast enough, or
> did you want the system to say it plainly? There is no answer key in the
> authored content, so saying "wrong" would mean inventing a verdict the
> curriculum never wrote. If the contrast is not enough, that is a real finding
> and it changes what WP-J has to author.

### 8.2 Findings 2, 3 and 11 — the topology

- [ ] You can see **PC-A, Switch-1, Router-1 and PC-B** as devices, not pills
- [ ] Each shows its **role** (HOST / SWITCH / ROUTER) and its **ports**
- [ ] Wires visibly **connect** the devices
- [ ] The **Connections** list reads *"PC-A eth0 to Switch-1 Fa0/1"* — both
      devices, both ports
- [ ] Walking the journey, the **current device** is unmistakable
- [ ] The **link the traffic just crossed** is highlighted, in the picture and
      in the connections list
- [ ] **Could you explain this network to someone else from the picture alone?**

### 8.3 Finding 12 — following the packet

Walk the journey from the start.

- [ ] Before you send anything, the packet sits at **PC-A**
- [ ] It **moves** as you advance
- [ ] At Router-1 it **stops**, visibly, and the stop is also stated in words
- [ ] After the correct fix, the path **completes**
- [ ] Does it feel like **following a packet**?

### 8.4 Findings 9 and 10 — the workspace

Press **Open the network workspace** part-way through the journey — after
committing a prediction and revealing at least one stage.

- [ ] The network becomes the main thing on screen
- [ ] **Everything you had is still there**: your prediction, the stages you
      revealed, any remediation, the device you had selected
- [ ] Press **Escape**, or the close button
- [ ] Back in the lesson, **nothing was lost and nothing was repeated**
- [ ] Open and close it several times mid-journey. It must never restart

> This is one interaction shown at two sizes, not two copies. If anything at all
> differs between the two views beyond layout, that is a **BLOCKING PLATFORM**
> finding.

### 8.5 Finding 5 — inspecting a device

- [ ] Clicking a device opens an inspector showing its interfaces, addresses and
      what it is connected to
- [ ] Clicking it again closes it
- [ ] The topology **stays readable** — you are not looking at every attribute of
      every device at once
- [ ] Selecting **Router-1** shows its single subinterface, which is the thing
      you need to notice to diagnose the fault
- [ ] The full listing is still reachable under **"Every device and interface,
      in full"**

### 8.6 Finding 7 — did that do anything?

Through a whole run, at each action — committing, advancing, inspecting,
remediating:

- [ ] Something **visibly changed** every single time
- [ ] You never once wondered whether the click registered

### 8.7 Finding 1 — the figure

- [ ] **Figure 1** shows a real diagram of the fixture network
- [ ] Its caption and the paragraph beneath it still read sensibly

### 8.8 Accessibility of the new parts

- [ ] `Tab` reaches **every device** in the topology, and the workspace toggle
- [ ] Pressing `Enter` or `Space` on a device selects it
- [ ] Focus is visible on devices
- [ ] With the workspace open, `Tab` **stays inside it** and `Escape` closes it
- [ ] Closing returns focus to the control you opened it with
- [ ] VoiceOver: the topology devices announce their **name, role and state**
- [ ] VoiceOver: committing a prediction **is announced**
- [ ] Greyscale: current, stopped and completed devices are still tellable apart
      — the words should carry it, not the colour
- [ ] Reduced motion: the packet no longer glides, but is **still in the right
      place**, and every control and every word is unchanged

### 8.9 Responsive

- [ ] **~360px**: the topology scrolls **inside its own box**; the page itself
      never scrolls sideways
- [ ] **~768px**: the workspace stacks rather than squeezing into a narrow split
- [ ] **Desktop**: the workspace puts the network beside the controls
- [ ] **200%** and **400%** zoom: nothing clipped, still operable

### 8.10 Visual quality

- [ ] Does the instructional surface now read as **calm, modern and
      intentional**?
- [ ] Is the **next step** always obvious — one filled button and nothing
      competing with it?
- [ ] Is it still boxes-inside-boxes, or does it read as structure now?
- [ ] Dark mode is **still absent and still deliberately so**. The new work is
      built on tokens so a future theme is a small change, but enabling it for
      this surface alone would make one page dark inside a light product.
      Re-record how urgent it feels.

---

## 7.6 FINAL re-UAT — one sequence, in order

**This is the last WP-I review if it passes.** Everything else in this document
remains valid, but if you are short of time, do only this: it is one continuous
run through the three mechanics that were still outstanding, in the order a
learner meets them.

Start with **Reset the interaction**, mission
**arch-fixture-m1-every-step-type**, support level **SHOW ME**.

**1. The passive prediction is identified.**
- [ ] Above the rendered mission there is a note reading **"Renderer example —
      no response required"**
- [ ] The step with *"decide which interface would answer a request to
      10.0.0.5"* has nothing selectable — and you now know that is correct

**2. Figure 1 shows the VLAN chain.**
- [ ] PC-A shows **VLAN 10**
- [ ] Switch-1 shows **Fa0/1 access, VLAN 10** and **Fa0/24 trunk, VLANs 10,20**
- [ ] Router-1 shows **Gi0/0.10 dot1Q 10** and **no subinterface for VLAN 20**
- [ ] PC-B shows **VLAN 20**

**3. Enter the workspace.**
- [ ] Press **Open the network workspace**
- [ ] The network fills the left; reference material is on the right

**4. Correlate the VLAN chain in the interactive topology.**
Without opening any panel, read it off the device faces:
- [ ] PC-A `eth0` — **VLAN 10**
- [ ] Switch-1 `Fa0/1` — **Mode access, VLAN 10**
- [ ] Switch-1 `Fa0/24` — **Mode trunk, Allowed VLANs 10,20**
- [ ] Router-1 `Gi0/0.10` — **Encapsulation dot1Q 10**
- [ ] PC-B `eth0` — **VLAN 20**
- [ ] **Can you see the gap?** VLAN 20 exists on PC-B and on the trunk, and
      nowhere on Router-1. That is the fault, visible before you send anything

**5. Predict, and watch where the change happens.**
- [ ] Commit the first prediction
- [ ] The current-event line **directly under the topology** changes
- [ ] Press the progression button — it is directly beneath that line
- [ ] **You did not have to look around for what changed.** The picture, the
      statement of what happened, and the button you pressed are one group
- [ ] A calm ring appears once at the device the traffic reached. It is not
      required to understand anything — the headline says the same thing

**6. Follow the packet to the failure.**
- [ ] Each advance names the connection crossed — *"Across PC-A eth0 to
      Switch-1 Fa0/1"* — in words as well as in the highlighted wire
- [ ] The topology stays on screen as you work; it does not scroll away
- [ ] At Router-1 the journey **stops**, visibly and in words
- [ ] **You cannot advance past it.** There is no next-step button until you fix
      something. Try it

**7. Choose a wrong fix first, then the right one.**
- [ ] A wrong fix leaves the journey stopped and tells you what it observed
- [ ] Press **Start over** and walk back to the failure
- [ ] Apply **Add subinterface Gi0/0.20 for VLAN 20**
- [ ] The event line reads **"Repaired at Router-1. The journey can continue."**
- [ ] The progression control comes back

**8. Watch it work — this is the part that was missing.**
- [ ] The packet continues **past Router-1**, not stopping there
- [ ] It reaches **Switch-1** again, tagged for VLAN 20
- [ ] It reaches **PC-B**, and you read **"PC-B received the request."**
- [ ] The reply comes back through Switch-1, Router-1, Switch-1
- [ ] It arrives at **PC-A**: **"Reply received from PC-B."**
- [ ] The final state reads **"The journey is complete."** and is visibly
      different from having merely reached the failed router
- [ ] **Did you get the "it works now" feeling?**

> There are six advances between the repair and the end. That is the trunk being
> crossed twice in each direction, which is the whole shape of
> router-on-a-stick. If it felt long rather than satisfying, say so — the number
> of authored stages is a fixture decision and is cheap to change.

**9. Connections are available but subordinate.**
- [ ] The **Every connection, in full** list is in the right-hand rail, closed
- [ ] Opening it shows every connection with both devices and both ports
- [ ] Closed, it no longer competes with the topology for your attention
- [ ] You did not need it mid-journey, because the event line named the
      connection each time

**10. State continuity.**
- [ ] Select a device, then close the workspace
- [ ] Everything is intact: revealed stages, the repair, the selected device
- [ ] Re-open it. Still intact

**11. PROVE IT still withholds.**
- [ ] Switch to **PROVE IT**
- [ ] The Packet Journey and its workspace are **gone**, replaced by a notice
      saying so
- [ ] The notice makes clear this is **deliberate**, not a fault
- [ ] The text equivalent above it is still there
- [ ] **This is correct and is not a finding.** The real PROVE IT experience
      needs the actual lab environment, which does not exist yet — that is WP-K
      and the LabProvider work, not WP-I

**12. Reduced motion.**
- [ ] Enable System Settings → Accessibility → Display → **Reduce motion**
- [ ] Walk the journey again
- [ ] The packet no longer glides and the ring is gone
- [ ] **Every fact is still there**: position, connection crossed, headline,
      narration, device state, and every control

---

## 7.7 FINAL regression — does the journey flow downward?

**This is the only new target.** Everything else in §7.6 passed; one thing did
not, and this checks that one thing.

**What was wrong.** The **Show what happens next** button sat above the journey
history, up beside the topology. But the history grows *downward*. Once you had
read as far as Router-1, continuing meant scrolling up to click, scrolling back
down to read what happened, and scrolling up again — once for every remaining
stage. That is not a flow; it is a shuttle.

**What changed.** The button moved. It now sits immediately **after** the
journey history, so it is always directly beneath the newest thing you have
read. The prediction and the remediation choices moved with it, for the same
reason. There is still exactly one of each — nothing was duplicated.

The topology did not move, and does not scroll away: from tablet width upwards
it stays pinned at the top while you read and act below it.

**The run.**

1. [ ] Open the Packet Journey, then **Open the network workspace**
2. [ ] Work down to Router-1 as usual — predict, advance, predict, advance
3. [ ] At the failure, the symptom, the explanation and **What will you change?**
       are all directly below the Router-1 entry. You did not scroll up
4. [ ] Apply **Add subinterface Gi0/0.20 for VLAN 20**
5. [ ] **Show what happens next** is right there, below where you just read
6. [ ] Press it. The new entry appears **above the button**, and the button is
       still immediately below it
7. [ ] Keep going the same way to PC-B — **"PC-B received the request."**
8. [ ] Keep going through the authored reply, the same way
9. [ ] The reply reaches PC-A — **"Reply received from PC-B."**
10. [ ] **"The journey is complete."** and the authored conclusion. No button
        left to press
11. [ ] Look up: the topology is still on screen, and it moved with you
12. [ ] **Did you ever scroll up to continue?** You should not have, once

> **The single question:** did that feel continuous, or did it still feel like
> "scroll up, click, scroll down"? If you scrolled up even once to find the
> button, say where.

Also check once at a narrow window (~360px): the topology is not pinned there,
so it scrolls away — but the new explanation still appears directly above the
button, so you still never have to go back up to continue.

---

## 8. Result template

Paste this back to the Architect.

```
WP-I HUMAN UAT RESULT   (first review / re-UAT after correction)

Date:
Reviewer: Founder
Baseline commit:
Browser / OS:

ENVIRONMENT
- npm run dev started cleanly:            yes / no
- /uat/instruction rendered:              yes / no
- Development UAT banner visible:         yes / no

BEGINNER-COMPLETE GATE
Could a motivated beginner progress without an outside source?
  yes / no / partially
Terms used without explanation:
Concepts used before taught:
Moments of confusion:

SUPPORT LEVELS
SHOW ME       - demonstrates; advance without predicting? notes:
HELP ME       - inspect prompt + "why" behind a disclosure? notes:
              - meaningfully different from SHOW ME now? notes:
ASK ME        - prediction gate worked? notes:
CHALLENGE ME  - rigor or unfinished? notes:
              - withholding message motivating or frustrating?
              - would a separate Challenge scenario be better?
PROVE IT      - text equivalent retained? notes:

FINAL REGRESSION (section 7.7)
Progression control was where I was reading:       yes / no
Never scrolled up to continue:                     yes / no
Topology stayed visible while advancing:           yes / no
Flow felt continuous rather than shuttling:        yes / no
If you did scroll up, where:

FINAL RE-UAT (section 7.6)
 1. Passive prediction identified as read-only:    yes / no
 2. Figure 1 shows the VLAN chain:                 yes / no
 4. VLAN correlated across the topology:           yes / no
 5. Change was obvious without looking around:     yes / no
 6. Could not advance past the failure:            yes / no
 8. Packet visibly continued past Router-1:        yes / no
    Reached PC-B and said so:                      yes / no
    Reply returned to PC-A:                        yes / no
    "It works now" feeling:                        yes / no
    Six advances after the repair felt:            right / too long
 9. Connections available but subordinate:         yes / no
10. Workspace preserved all state:                 yes / no
11. PROVE IT still withholds (expected):           yes / no
12. Reduced motion kept every fact:                yes / no

EARLIER CORRECTIONS (section 7.5)
8.1 Wrong prediction stays visible, no reset:     yes / no
    Prediction vs observation contrast enough:    yes / no
8.2 Topology understandable on its own:           yes / no
    Connections name both devices and ports:      yes / no
8.3 Felt like following a packet:                 yes / no
8.4 Workspace preserved exactly the same state:   yes / no
8.5 Device inspection useful, not overwhelming:   yes / no
8.6 Every action visibly did something:           yes / no
8.7 Figure 1 renders a real diagram:              yes / no
8.8 New parts keyboard + screen-reader usable:    yes / no
8.9 Usable at 360px / 768px / desktop / 400%:     yes / no
8.10 Reads as calm, modern, intentional:          yes / no

SIGNATURE METHOD
Predict felt meaningful:                  yes / no
Failure understandable from observation:  yes / no
Wrong remediation taught something:       yes / no
Confirmation created "it works now":      yes / no
Confirmation was authored, not generic:   yes / no

ACCESSIBILITY
Keyboard-only completion:                 yes / no
Focus always visible:                     yes / no
VoiceOver topology comprehensible:        yes / no
Live region announced progression:        yes / no
Greyscale: no colour-only meaning:        yes / no
Reduced motion: same info and controls:   yes / no
200% zoom / 400% zoom:                    ok / not ok
360px / 768px / desktop:                  ok / not ok

VISUAL
Calm / premium / intentional:             yes / no
Reads as generic template:                yes / no
Dark mode absence — practical severity:   BLOCKING / IMPORTANT / POLISH
Notes:

FINDINGS
1. [CLASSIFICATION] [SEVERITY] where / expected / actual
2.
3.

OVERALL
Ready to accept WP-I and begin WP-J:      yes / no
If no, what must change first:
```

---

## 9. What this UAT still cannot cover

- **Real curriculum.** The fixture exercises the contract; WP-J authors the
  teaching. Instructional findings here are about the machinery, not the course.
- **The persisted path.** The harness renders from a file. Nothing here proves
  the authored → published → database → API → browser round-trip, because
  `mission_steps` is not deployed and no publishable document contains an
  interaction. That is WP-J UAT.
- **Competency reuse across contexts.** Needs a second course.
- **Live lab confirmation.** WP-K.
- **Automated browser regression.** Deferred pending a separate Architect
  decision on browser-test tooling.
