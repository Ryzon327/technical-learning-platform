# WP-J Module 1 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 1 — One Network
**Missions:** M1 *What a network is, and what is in it* · M2 *Inside one network: how a switch delivers*

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first — what you are looking at, and what is new

Every previous UAT on this surface reviewed the **architecture fixture**: a
document written to exercise the curriculum contract, never to teach. You were
told explicitly not to judge teaching quality against it.

**That instruction is now reversed.** This review is of
`content/curriculum/networking-foundations.json` — the real authored course, the
same file the publication command reads, parsed by the same parser and projected
by the same projection a learner's browser would receive. There is no copy and
no mock.

**So teaching quality is the thing under review.** If the instruction is
confusing, too long, out of order, or assumes something it never taught, that is
a finding, and it is the most valuable kind this review can produce.

### Read this before anything else — what changed in THIS round

One area, from your last review: **clicking a device.**

1. **A device now explains itself before it lists itself.** Selecting a device
   used to open its whole technical inventory — every port, every connection,
   every attribute — at a beginner who had asked a much smaller question. The
   panel now answers that question first, in this order:
   * the device's name and category, once;
   * one sentence on what that KIND of device is;
   * a short paragraph on what THIS device is doing in this scenario, which for
     Router-1 includes why the print request does not use it;
   * where it stands in this walkthrough;
   * a **View technical details** disclosure holding everything that used to be
     dumped on you. Nothing was deleted — it moved.
2. **"Not reached yet" is gone.** You said it sounded like an instruction to
   wait for something that was never coming, and on PC-B and Router-1 that is
   exactly what it meant. A device now reads *"Not involved so far"* while the
   walkthrough is still running, and — only once the print request has actually
   been delivered — *"Not part of the path the print request took."* Before you
   press Start it says the print request has not been sent yet.
3. **Forward references are now on the devices too.** Switch-1's explanation
   points at Mission 2; Router-1's points at Mission 5. You said you liked this
   pattern at the end of the walkthrough, so it is now also where a curious
   learner goes looking.

**The thing to judge hardest this round:** click Router-1 cold, as somebody who
has never seen a network diagram. Can you say what it is and why it is on the
screen within about ten seconds, without feeling lectured or buried?

### What changed in the round before this one

Two things, both from the review before that.

1. **The print request now reaches the printer.** The walkthrough used to stop
   at Switch-1 and send you to Mission 2. It now runs PC-A → Switch-1 →
   Printer, and ends with the printer accepting the print job. At Switch-1 the
   lesson says Switch-1 has to work out which port leads to the printer, that
   Mission 2 explains how, and invites you to continue — so you SEE the outcome
   without being taught the mechanism yet.
2. **Successful delivery is now a real state.** The marker turns from the blue
   in-transit treatment to the product's green success treatment, the printer's
   card turns green with a check mark and reads **"Delivered here"**, and the
   right pane says **"The print request was delivered to Printer."** The colour
   is reinforcement — every one of those facts is also in words.
3. **The prediction question no longer overlaps the answer box.** The question
   is its own block above the choices, and the choices have their own bordered
   container. Nothing is offset or hidden to achieve it.

**The things to judge hardest this round:** does the ending feel like the story
finished, and is the question now positioned cleanly?

### What changed in the round before this one

You approved the split view — *"this is a lot better!"* — and it is unchanged.
This round is writing and information hierarchy.

1. **"Send something from PC-A" is gone, and so is the abstract scenario.**
   Someone at PC-A wants to print a document on the network printer, so PC-A
   sends **a print request**. Every learner-facing sentence in the interaction
   now names it: the orientation, the Start instruction, the prediction, the
   button, the result and the conclusion.
2. **The rejected PC-A prose is gone.** *"PC-A is a machine someone uses. PC-A
   has one network interface, and one link leaves that interface."* is now
   *"PC-A represents a user's computer on the network. It has one network
   interface and one link, so everything PC-A sends leaves the same way."*
3. **The "why" moved into the right pane.** The explanation for the step you
   just took now appears beside the picture, at the moment it matters —
   together with the diagnosis and the conclusion.
4. **Nothing important expands below the workspace any more.** The growing
   account is behind one closed disclosure, and the long text description that
   used to lead the activity is behind another, below it. Both are complete and
   both are still reachable — they simply no longer run as a second lesson you
   were not watching.
5. **Device inspection moved into the right pane.** Select a device and its
   details appear where you are already looking; deselect and they go away.

**The things to judge hardest this round:** does any sentence still feel vague
or artificial, and can you complete the whole activity without reading anything
below the split view?

### What changed in the round before this one

You asked for a side-by-side layout — "the lab on one side and the instructions
on another at scale of course. This would include an obvious start button as
well." The Architect approved it, and this round builds it.

Nothing you have approved was thrown away. The topology, the Local network
boundary, Router-1 at the edge, the device symbols, the packet visualisation
and the Professional Plain Language are all unchanged. What changed is
composition:

1. **Two panes on a wide screen.** Left: the interactive environment. Right:
   the current instruction, your response, and the primary action. One short
   orientation spans both, so they read as one workspace rather than two cards.
   The interaction is now wider than the reading column — deliberately, because
   the environment and the instruction both need room.
2. **An obvious Start.** Nothing begins because the page rendered. You get a
   short sentence and one prominent **Start** button, and nothing else to
   press. It reveals no answer — no prediction, no device name, no outcome.
3. **The right pane then evolves.** Start → predict → send → observe →
   continue, one current step at a time. Earlier steps do not pile up above the
   next action.
4. **Reference moved below the workspace.** It used to sit beside the current
   task, in prime space. Nothing was deleted — every connection, every device
   and interface and the full text account are all still there, below.
5. **One set of controls at every width.** Below the wide breakpoint the same
   tree reflows to a single column. Nothing is duplicated to build a second
   layout.

**The thing to judge hardest this round:** at 100% zoom, on your normal
screen — is Start obvious without scrolling, and do the two panes read as one
workspace?

### What changed in the round before this one

You approved the topology last time: *"its a lot better"*, *"I love how it
flows"*, *"its really nice"*. **None of that was redesigned.** The hierarchy,
the Local network field, Router-1 at the edge, the device symbols, the packet
flow and the Professional Plain Language are all as you left them.

What failed was the instructional flow around them, and that is what changed:

1. **The picture and the task are now one workspace.** Orientation, topology,
   what just happened, and what to do next are a single block, and that block
   is what gets pinned. The control that advances the journey can no longer
   disappear while the topology stays on screen — they are the same element.
2. **Two short lines now sit above the picture** saying what this is and what
   to do, so the first thing you read answers "what am I supposed to do".
3. **The journey history moved below the workspace.** Everything you have
   already read is still there in full; it simply can no longer grow downward
   and push the next action off the screen.
4. **The topology is smaller.** Same three rows, same grouping, same
   relationships — tighter spacing and slightly smaller cards, so the drawing
   and the task fit together without zooming out. Two redundant lines were
   removed from the device faces in Mission 1 (the symbol and the category word
   already said it); the attributes are still in the inspector.
5. **The reference column is labelled "Reference" and is quieter.** Nothing was
   deleted — every connection, every device and interface and the full text
   account are all still there.

**The one thing to judge hardest this round:** open the lesson at 100% browser
zoom and, without scrolling and without zooming, answer "what am I supposed to
do?" If you cannot, that is still a BLOCKER.

### What changed in the round before this one

You reviewed this surface once already, and the result was: the **writing** was
"way, way, way better", and the **topology** was rejected on four counts — it
was still essentially a horizontal row of cards, relationships and boundaries
were not spatially obvious, the connection lines overlapped and crossed, and the
moving traffic marker sat on top of the text inside a device card.

**The writing has deliberately not been touched.** It is the version you
approved. If you find a wording problem now it is a new finding, not a
regression, and it is worth saying so.

**The topology has been rebuilt.** Five things changed:

1. **The drawing is now a hierarchy, not a row.** Module 1 draws Router-1 at
   the top, Switch-1 in the middle beneath it, and PC-A, PC-B and the Printer
   branching below Switch-1. Where a device is drawn comes from its authored
   category and from the connections the author declared — nothing works out
   where traffic goes in order to draw a line.
2. **Every connection has its own line, and its own point on each device.** The
   three host links fan out across the bottom edge of Switch-1 rather than
   meeting at one spot. No line is drawn through a device card, at any window
   width.
3. **The traffic marker rides the link.** It is now placed on the wire, clear
   of both cards. Which device is currently *holding* the traffic is a separate
   thing: a ring drawn around that card, plus the caption in words on its face.
4. **Every card is the same width, and the same height as the others in its
   row.** Detailed interface attributes stay in the inspector, as before; only
   the facts the author flagged appear on the face, one per line.

### 5. The network boundary you asked for is now there

The previous round stopped short of this and explained why: saying "these four
devices are one network" is a **networking fact**, and nothing in the authored
curriculum recorded it. The renderer could only have produced a boundary by
guessing one, and a picture that invents a networking fact is the one thing this
architecture forbids.

The Architect approved the missing piece, so the curriculum now **says it**.
Module 1 authors a group called **Local network** and puts PC-A, PC-B, the
Printer and Switch-1 in it. The drawing encloses exactly those four, and nothing
else, because that is what the author wrote down.

**Router-1 is deliberately outside it.** Mission 1 states that "Router-1 marks
the point where this local network stops", and that its outward port "leads away
from this network entirely". Putting Router-1 inside the boundary would
contradict the sentence printed beside the picture. It is drawn at the edge with
its line crossing into the group — which says where it sits, and still teaches
nothing about what a router does. That remains Missions 5 and 6.

Mission 2 groups all four of its devices, for the same reason: it is titled
"Inside one network", and every device it shows is in that network. **If you
think the boundary earns its place in Mission 1 but is redundant in Mission 2,
say so** — removing it there is one line of authoring, and this is exactly the
judgement the runbook cannot make for you.

### What has NOT been published

Nothing. The course is not in any database. The five pending migrations are
still unapplied. This surface reads the authored file directly, which is
precisely why you can review the teaching before anything is published rather
than after.

### The one thing you are the only judge of

> **Could an intelligent, motivated learner who knows nothing about networking
> understand this instruction, complete it, and move on — without needing
> Google, YouTube, another course or a person to supply something the platform
> failed to teach?**

That is BEGINNER-COMPLETE-1. No test can answer it. Please answer it as though
you knew nothing, not as somebody who already knows what a switch is.

---

## 1. Pre-UAT health

### 1.1 What must be true before you start

Run these. All must pass.

```
npm run gate -- wpj-m1
npm run gate -- wpj
npm run gate -- wpi
```

If any fails, stop and report it — reviewing instruction that does not pass its
own structural gates wastes your time.

### 1.2 What you need running, and what you do NOT

You need the development server only:

```
npm run dev --workspace @tlp/web
```

You do **not** need Supabase, a database, a migration, a lab, Proxmox, a login,
or a network connection to anything. If any of those seem to be required,
that is itself a finding.

### 1.3 Where to go

```
http://localhost:5173/uat/instruction
```

This route exists only in development. It is absent from a production build.

### 1.4 Select the right document

At the top you will now see a **Document** control with two choices. Select:

> **Networking Foundations — Production curriculum — Module 1**

You should see a notice saying you are reviewing the real production curriculum
and that **teaching quality is in scope**. If you see the fixture notice
instead — "exists to exercise the curriculum contract rather than to teach
well" — you are on the wrong document.

Then set **Support level** to **SHOW ME** and **Mission** to
**Mission 1 — What a network is, and what is in it**.

Missions 3 to 8 will appear in the mission list with **(0 steps)**. That is
correct: they are not authored yet. Do not review them.

---

## 2. The main sequence — do this in one sitting, in order

Read it as a learner would: top to bottom, no skipping, no scrolling back to
work out what you missed. If you find yourself scrolling backwards, write down
where — that is a finding on its own.

### 2.1 Mission 1 — steps 1 to 4, read them

Four short concept steps, in this order:

1. Why anything is connected at all
2. The machines people use → **host**
3. Where a machine joins, and what joins them → **interface**, **port**, **link**
4. The device in the middle, and the device at the edge → **switch**, **router**

**Judge as you read.** The rule being tested here is teach-before-use: nothing
may be relied on before the platform has taught it, established it through
demonstrated prior competency, or declared it explicitly as a prerequisite.

- Did each idea arrive before it was needed?
- Was the behaviour described before the word was given, or were you handed
  vocabulary and then told what it meant?
- Is any of these four steps too long? Would you have stopped reading?
- Is any of them unnecessary?
- Does the router explanation stop where it should? It is meant to establish
  only *that it is a different device sitting at the edge* — if it starts
  explaining what routers do, that is a finding.

### 2.1b The first thirty seconds — do this before anything else

**At 100% browser zoom, maximised window. Do not zoom out. Do not scroll yet.**

Scroll the lesson so the interaction step is at the top of the window, then
stop touching the mouse and answer these, in order:

1. **What am I looking at?** The orientation line, and the environment on the
   left, should tell you.
2. **What am I supposed to do?** The right pane should tell you, and there
   should be exactly one thing to press: **Start**.
3. **Where do I do it?** You should be able to point at it without hunting.

**If Start was not obvious, or you had to scroll or zoom to find it, that is a
BLOCKER and this correction failed.** Write down what you did to find it.

**The language check — do this deliberately.** Read every sentence in the right
pane, and the line above the split view, and ask of each one:

- **Do I know exactly what PC-A is sending?** It should be a print request,
  because someone at PC-A is printing a document. If you ever find yourself
  asking "what is it sending?", that is a BLOCKER.
- Does any sentence use a word that stands in for something the sentence needed
  to name — *something*, *stuff*, *things*, or an *it* with no clear owner?
  Quote it if so.
- Does any sentence read as generated rather than written? Repeated subjects,
  odd rhythm, or a description that says nothing ("a machine someone uses")
  are the specific failures this round set out to remove.
- Is any word used that the course has not taught yet? At this point the
  learner has met host, interface, port, link, switch, router and topology —
  and nothing about packets, frames, IP or protocols.

Then, still without pressing anything:

- **Do the two panes read as ONE workspace**, or as two unrelated cards? The
  orientation spans both and there is a single hairline between them; if it
  still feels like two widgets side by side, say so.
- **Does the left pane give the environment enough room to feel intentional?**
  It should not look squeezed to make two columns fit.
- **Does Start reveal anything it should not?** You should not be able to see
  the prediction question, its options, any device the traffic will reach, or
  what happens — only that you will be asked to predict first.
- Is anything in the right pane competing with Start for attention?

Now press **Start**, and judge the sequence:

- Does the next required action become obvious immediately?
- Does Predict → Send → Watch → Continue feel natural, or did you have to work
  out what to do at any step?
- **While you work in the right pane, does the left environment stay useful?**
  You should be able to watch the traffic move without losing your place.
- Do earlier explanations pile up above the next action? They should not — the
  right pane should hold one current step, with everything already read below
  the workspace.

**The question-position check.** When the prediction appears:

- **Does the question sit cleanly above the answer box, with no part of it
  crossing a border?** Anything crossing a line is a BLOCKER.
- Are the three choices easy to scan, and calm — one quiet box, not a card
  inside a card?
- Resize the window narrower and wider and check the question stays clear of
  the border at every width.
- With the keyboard alone: Tab to the choices, move between them with the
  arrow keys, and commit. All three must work.

**The completion check — the other thing you reported.** Run the whole
walkthrough to the end and answer:

- Do you see the print request leave PC-A?
- Do you see it reach Switch-1?
- At Switch-1, are you told what happens next **without** being taught how a
  switch decides? You should be told Mission 2 explains the decision, and
  invited to continue.
- Do you then see it continue to the Printer?
- **Is successful delivery unmistakable?** The marker should change to the
  success colour, the Printer's card should turn green with a check and read
  "Delivered here", and the right pane should say the request was delivered.
- Cover the colours with your hand. **Can you still tell it succeeded from the
  words alone?** If not, that is a BLOCKER.
- Does the ending feel satisfying without feeling like a game? There should be
  no confetti, no points and no celebration language — just the goal reached.
- Turn on Reduce Motion and run it again. The final success state must be
  fully present and readable; only movement should be missing.
- Does a learner with no networking background now have a complete answer to
  "what happened to the print request I started?"

**The hierarchy check — the specific thing you reported earlier.** Complete the whole
activity from Start to the conclusion **without ever scrolling below the split
view**. Everything you need should be in the right pane at the moment you need
it: the question, the result, the reason, and the conclusion.

- Did you ever have to look below the workspace to understand what happened or
  to decide what to do next? If so, name the moment — that is a BLOCKER.
- Now scroll down. There should be two closed disclosures — the step-by-step
  account, and the full written description of the activity — plus the
  Reference region. **Do they read as optional?** If either feels like a
  second lesson you were supposed to be following, say so.
- Open each one and confirm the detail is genuinely all still there.
- Select a device in the picture. Its details should appear in the right pane,
  under the current step, and disappear when you deselect it. **Does that ever
  bury what you were doing?**

Finally:

- Scroll down through the whole interaction and back up. At any point where the
  environment is on screen, the current step should be too.
- Make the browser window shorter (drag its bottom edge up). Below a certain
  height the workspace stops being pinned — deliberately, because a pinned
  block taller than the window would hide its own controls. Check that nothing
  becomes unreachable when it unpins.
- Narrow the window until the two panes become one column. **Check that the
  same controls are still there and still work** — there must be exactly one
  Start, one prediction, one continue control, no duplicates.

### 2.2 Mission 1 — step 5, the topology and the first step

Five devices: PC-A, PC-B, a Printer, Switch-1 and Router-1. **Most of the
orientation work here is yours, by clicking** — the walkthrough itself follows
one short step and then stops.

**Do all of this, in this order:**

1. Before pressing anything, **look at the five devices without reading the
   words.** Cover the labels if it helps. You should be able to tell the two
   hosts, the switch, the router and the printer apart from their symbols
   alone. **If you cannot, that is a finding, and it is a MAJOR one** — the
   whole point of the symbols is that a beginner recognises categories before
   they can name any of them.
1b. **Still without reading the words, say what is attached to what.** This is
   the rebuilt layout, and it is the thing to judge hardest. You should be able
   to see, from the arrangement alone, that three devices hang off the one in
   the middle and that the fifth sits apart from them at the top. **If the
   picture still reads as a row of cards with lines between them, that is a
   BLOCKER and the correction failed.**
1c. **Still without reading the words, say which devices belong together.** A
   tinted field encloses four of the five, captioned **LOCAL NETWORK**, and
   Router-1 sits outside it with its line crossing in. Ask yourself:
   - Is the grouping obvious at a glance, without being heavy?
   - Is the caption readable, and does it look like part of the drawing rather
     than a label stuck on it?
   - Does the field ever hide, cut or dim a connection line? It must not.
   - Does it sit over any device card, symbol or text? It must not.
   - Does it compete with the device the traffic is at? The field is meant to
     recede; the journey state is meant to stand out.
2. Now read the labels and check the symbols did not mislead you. Each device
   shows a symbol, then its category, then its name.
3. **Click every device in the picture**, one at a time. Read what appears in
   the inspector on the right: its category, its interfaces, and what it
   connects to. Click a device a second time to deselect it. **The whole
   topology is available to explore before anything moves.**
4. Press **Send something from PC-A**.
5. Answer the prediction when it appears. **Answer it wrongly on purpose.**
6. Continue. The step ends when it arrives at Switch-1.

**Judge:**

- Does the picture stay on screen while you work through the steps below it?
- After you press the control, can you see what changed *without scrolling*?
- Is there exactly **one** control offering to continue, at any moment?
- When you predicted wrongly, was the experience useful — your answer shown
  beside what actually happened — or did it feel like being marked wrong?
- **Is the visual truthful?** This is the correction the Architect required, so
  please check it specifically. The marker should travel **once**, from PC-A
  along its own link to Switch-1, and stop. Ask yourself:
  - Did anything appear to reach the **Printer**, **PC-B** or **Router-1**?
    Nothing should.
  - Did the marker ever double back, or visit a device just because you were
    looking at it? It should not.
  - Do the device labels agree with what you saw? PC-A and Switch-1 should each
    carry a caption in **words** saying what the traffic did there. The other
    three should carry no such caption at all. **Check this by reading, not by
    colour** — that a state was readable only as a shade of background was a
    defect this correction fixed, and it is worth confirming it is gone.
  - **Do the wires meet the devices?** Look at where each line ends. It should
    terminate at the device card, not float above or below it, at every window
    width. Drag the window narrower and wider and watch the lines.
  - Did the picture ever suggest something the words did not say?
- **The four rejected defects, checked one at a time.** Please answer each
  separately rather than as an overall impression — these are the corrections
  under review:
  - **Trace PC-A to Switch-1 with your eye, immediately.** One line, one
    destination, no hunting. Then do the same for PC-B and for the Printer.
    Each should be a distinct line arriving at its own point on Switch-1.
  - **Does any line pass through a device card?** None should, at any width.
  - **Do any two lines run along each other so you cannot tell them apart?**
    None should.
  - **Watch the marker.** It should travel *along the wire* between PC-A and
    Switch-1 and stop clear of Switch-1's card. **It must never sit on top of a
    device's name, category, port information or symbol.** If it covers text at
    any point in the movement, that is a BLOCKER and it is the specific defect
    this round was meant to fix.
  - **Are "the traffic is moving" and "this device has the traffic" two
    different-looking things?** The moving dot is on the wire; the device that
    has it is ringed and captioned. If they read as one thing, say so.
- Was it clear that this is the **first step only**, and that what Switch-1 does
  next is Mission 2?
- Does Router-1 stay a shallow preview — a different device at the edge, whose
  behaviour is explicitly left to later — rather than something you were taught?
- Could you now name every device and say what it is for, mostly from clicking
  rather than from being walked?

### 2.2b Device inspection — the focus of this round

Do this **on the same screen**, without leaving the walkthrough.

**The ten-second test. Do this one first, and do it cold.**

Click **Router-1**. Start counting. Before ten seconds are up, can you say:

1. what a router is; and
2. why this one is on the screen at all?

If you can, that is the bar. If you found yourself reading a wall of text, or
scanning for the answer, or thinking "I do not know what I am looking at" —
that is a BLOCKER and it is precisely the defect this round set out to fix.

**Then judge the panel as a whole.**

- Is the device's **name and category** stated once, or repeated?
- Is there **one short explanation**, or a stack of cards and badges?
- Does the panel feel **calm**, or does it feel like a dashboard?
- Is there **exactly one** "View technical details" disclosure, closed when you
  arrive? More than one level of nesting is a finding.
- Open it. Are the **ports, connections and attributes still all there** — the
  same information you used to see immediately? Anything missing is a BLOCKER:
  simplifying the surface must not have deleted anything.

**Then check the journey status on each device, at three different moments.**

| Click this | Before you press Start | Mid-walkthrough | After delivery |
|---|---|---|---|
| PC-A | not sent yet | is here now / passed through | passed through here |
| Switch-1 | not sent yet | passed through / here now | passed through here |
| Printer | not sent yet | not involved so far | **delivered here** |
| PC-B | not sent yet | not involved so far | **not part of the path** |
| Router-1 | not sent yet | not involved so far | **not part of the path** |

Two specific things to confirm, because they are the ones that were wrong:

- **Mid-walkthrough, PC-B and Router-1 must NOT say they are off the path.**
  The walkthrough has not finished, so nothing should be claiming where the
  print request will or will not go. If it does, it is telling you the answer
  to a question you were about to be asked.
- **After delivery, they must say it plainly.** "Not part of the path the print
  request took" should read as a settled fact, not as a reason to keep waiting.

**Then judge the writing, on Router-1 above all.**

- Does it tell you what a router is FOR without teaching you how it decides
  anything? Anything about tables, gateways, prefixes or addresses at this
  point is a BLOCKER — that is Mission 5 and Mission 6.
- Does the pointer to Mission 5 read as **quiet context**, or as a sales pitch?
- Is there any placeholder language — "something", "stuff", "things", an "it"
  with no clear referent? Any is a finding.
- Does it sound like a professional explaining, or like an app being cheerful
  at you?

**Finally, PC-B.** It is the device with the least reason to exist on the
screen. After reading its explanation, do you know why it is drawn there?

### 2.3 Mission 1 — step 6, and the close

One concept step names **topology** and states what you can now do.

**Judge:** does it name something you had already understood, or does it
introduce an idea you had not met?

### 2.4 Mission 2 — set up

Switch **Mission** to **Mission 2 — Inside one network: how a switch delivers**.
Leave the support level at **SHOW ME**.

Read step 1. It sets up two machines on one network and — deliberately — tells
you that *how PC-A knows the identity it is addressing* is a question with an
answer that comes in Mission 4.

**Judge:** is that deferral honest and satisfying, or does it feel like being
fobbed off? A beginner who feels fobbed off goes to Google, which is exactly
what this course exists to prevent.

### 2.5 Mission 2 — the two deliveries

This is the centre of the review. Step 2 is a walkthrough with **two passes**.

**Pass one:**

1. Press **Send the first message from PC-A**.
2. When asked what Switch-1 does with a message for a destination it has never
   seen, **commit a prediction**.
3. Walk through: the switch sends a copy out of its other ports; the **Printer**
   receives one, checks it, and discards it; **PC-B** receives the other and
   accepts it; PC-B replies; the switch records where the reply came from; the
   reply goes back to PC-A **by one port only**.

**Pass two:**

4. PC-A sends again. **Commit the second prediction** before continuing.
5. Watch the message go out of one port. The Printer sees nothing.

**Judge — and this is the question the whole slice turns on:**

> **Did the second delivery feel like an earned consequence, or like a slide
> advancing?**

The design bet is that watching the same message take a different path — because
the switch learned something in between — is a real payoff, and that it removes
the need for an artificial fault to repair. If it does not land, say so plainly;
that is the finding that matters most.

**Also judge:**

- Could you follow the marker through all nine stages?
- Did the topology stay usable as a reference throughout?
- Did your predictions stay visible next to what actually happened?
- Was the Printer's part clear — that it *received* a copy and *ignored* it,
  rather than never receiving anything?

### 2.6 Mission 2 — steps 3 to 7, the vocabulary

Only now do the words arrive:

3. What you just watched → **flooding**, and the switch learning
4. The identity on an interface → **MAC address**
5. A command step showing that identity on a real machine
6. The unit that moved → **frame**
7. Looks wrong, works as designed

**Judge:**

- Did each word name something you had *already seen*? That is Behavior Before
  Vocabulary, and it is the method under test.
- Step 5 shows shortened command output. The caption says it is shortened and
  why. Is that honest enough, or does it feel like being shown something fake?
- Step 6 tells you another unit exists and deliberately does **not** name it.
  Does that feel like a promise or like a tease?
- Is anything here a paragraph too long?

### 2.7 The visual system, judged as a whole

Step back from both journeys and look at the topology as a product rather than
as a diagram. The standard is not "is this acceptable" — it is **would we be
proud to sell this**.

**Judge:**

- Does the topology look like a professional engineering product built today,
  or like a developer's utility UI?
- Do the five device cards read as **one drawn system**, at one weight and one
  scale — or as icons collected from different places?
- Does your eye move in the intended order without searching: the device, then
  its category, then its name, then what just happened to it?
- Is any device card visually noisy? Is anything on a card that you never once
  needed? Card content was reviewed and reduced to symbol, category, name,
  state and the author-flagged facts — everything else is in the inspector.
  **Did you ever have to go looking for something that used to be on the
  card?** If so, say which.
- **The drawing is smaller this round.** Same rows, same grouping, same
  branches — tighter spacing and slightly smaller cards, so the picture and the
  task fit together. Judge two things separately: are the device names, the
  category words and the group caption all still comfortably readable at 100%
  zoom; and does the drawing still feel like a premium diagram rather than a
  cramped one. If it now feels tight, say so — the alternative is a wider
  lesson column, which is a layout decision nobody has taken yet.
- **Does the lesson feel active or document-heavy?** The primary path should be
  read two lines, look, predict, act, read what happened. If it still feels
  like a wall of explanation with controls attached, that is the finding that
  matters most this round.
- **Does the arrangement teach, or only decorate?** Look at Mission 2's four
  devices and Mission 1's five. In both, the arrangement should say something
  true about what is attached to what before you read anything.
- **The grouping, judged as design rather than as a feature.** It is meant to
  be the quietest thing on the page that still reads instantly: a tinted
  ground, a hairline edge and a small capital caption. **Is it obvious without
  being heavy?** A boundary that shouts would turn the topology into a
  container of cards, which is the opposite of what it is for.
- **Does the grouping teach?** Look at Mission 1 and ask whether the field
  makes "these four are one network, and that one is at its edge" easier to
  see than the prose alone made it. If it is decoration rather than
  instruction, that is a finding worth writing down.
- **Mission 2's boundary encloses everything.** Judge whether that reinforces
  "inside one network" or is simply a frame around the whole picture. Either
  answer is useful; the second one removes it.
- Does the picture stay calm while the journey runs, or does something compete
  for attention with the thing you are meant to be watching?
- Is a **selected** device clearly distinguishable from the device the
  **traffic is at**? Select the current device and check that you can still
  tell both facts.
- Does anything look cartoonish, clip-art, or like an imitation of another
  vendor's equipment? Any of those is a finding.

**The one question this section exists for:**

> Does this feel better suited to learning than a traditional simulator, or
> does it feel like a diagram with a lesson bolted beside it?

---

## 3. Support levels

Return to **Mission 1**, then repeat for **Mission 2**. Use the **Reset the
interaction** control between levels.

| Level | What you should see |
|---|---|
| **SHOW ME** | The fullest teaching. Every stage's explanation is shown as you go. |
| **HELP ME** | The reason is one click away rather than shown outright. |
| **ASK ME** | You must commit a prediction before each reveal. |
| **CHALLENGE ME** | **Look hardest here.** You can still walk the journey, still click devices, still predict — but no explanation and no closing summary. |
| **PROVE IT** | The whole teaching simulation is withheld. The written text equivalent remains. |

**Judge:**

- At **CHALLENGE ME**, could you still work out *why* the second delivery
  differed, from the observations alone? If it becomes impossible rather than
  hard, that is a finding. If it still explains everything, that is a worse one.
- At **PROVE IT**, is the message clear about *why* the simulation is gone?
- **Answer leakage:** at CHALLENGE ME, open your browser's page source or
  developer tools and search for a phrase from a "why this happened" explanation.
  It must not be there. Absence in the payload is the requirement; not drawing it
  on screen is not enough.

---

## 4. Accessibility

### 4.1 Keyboard only

Put the mouse away. Using Tab, Shift-Tab, Enter and Space only:

- Reach and select every device in both journeys.
- Commit every prediction — one in Mission 1, two in Mission 2.
- Walk both journeys end to end.
- Open and close the expanded workspace, and leave it with Escape.

Anything unreachable is a finding.

**New this round, because the layout is now two panes.** CSS places the
environment on the left and the instruction on the right, but the document
order is unchanged — so check specifically:

- Tab order runs in reading order: orientation, devices in the environment,
  then the current step's controls, then the history, then the reference
  region. Nothing should jump backwards, and nothing should depend on knowing
  which pane is on which side.
- **Start is a real button.** Reach it with Tab alone and press it with Enter
  and with Space.
- With a screen reader, the current step should be announced in words
  ("Before you begin", then "Current step: predict", and so on). You should
  never have to infer the step from which controls happen to be present.
- When a control inside the pinned workspace takes focus, it must be fully
  visible — never underneath the pinned block or cut off by it.
- Tab through to the reference column and back. The pinned workspace must not
  trap focus, and nothing below it may become unreachable.

**Also new this round, for device inspection:**

- Select a device with the keyboard, then Tab once more. Focus should land on
  **View technical details**, with a visible focus ring.
- Open it with **Enter**, close it with **Enter**, and confirm **Space** does
  the same. If either key does nothing, it is not a real disclosure.
- With the disclosure open, Tab onward. Everything inside it must be reachable
  and nothing below it may become unreachable.

### 4.2 Screen reader

With VoiceOver (Cmd-F5 on macOS):

- Is each stage announced as it is revealed?
- Is the connection that was crossed stated in words, not only drawn?
- Does the text equivalent describe the network fully enough that you could
  answer the predictions without seeing the picture? **Read it and check —
  that is the real test of the accessible path.**
- **New this round:** the arrangement AND the grouping are announced. When you
  reach the diagram your screen reader should read something like *"Local
  network contains PC-A, PC-B, Printer and Switch-1. Router-1 is drawn outside
  Local network. The diagram is drawn in 3 rows, top to bottom. Row 1:
  Router-1, a router. Row 2: Switch-1, a switch. Row 3: PC-A, a host; PC-B, a
  host; Printer, a printer. A line is drawn between PC-A and Switch-1; …"*.
- **Could you rebuild the picture in your head from that alone?** If not, that
  is a finding — the layout and the boundary now carry instruction, so neither
  may be sighted-only.
- The membership sentence comes from the same authored field the boundary is
  drawn from, so the two cannot disagree. **If the words and the picture ever
  describe different members, that is a BLOCKER.**

### 4.3 No colour-only meaning

Every state should be readable in words: "Arrived", "Continued", "The traffic
passed through here". If anything is conveyed by colour alone, that is a finding.

Two specific checks, because both were defects:

- A device the traffic **passed through** must say so in words on its own face,
  not merely change shade.
- A device the traffic has **not reached** should carry no caption on screen,
  and your screen reader should still announce *"Not involved so far"* when you
  reach that device. Confirm both halves. (That wording changed this round —
  the old one implied an arrival was still coming.)
- **In the inspector**, cover the panel's colour with your hand. The journey
  status must still be legible from the words alone — delivered, passed
  through, here now, not involved so far, or not part of the path. The green
  and blue are agreement, never the message.

The device symbols are decorative and are not announced. That is deliberate —
the category is already read aloud as a word. If your screen reader announces a
symbol, or if turning the pictures off would cost you a fact, that is a finding.

### 4.4 Reduced motion

Turn on Reduce Motion in system settings and repeat one journey. Movement should
stop; **no information or control should disappear**.

---

## 5. Narrow viewport

Resize the browser to roughly phone width, or use device emulation.

**Known and deliberate:** below about 48em the topology stops being sticky and
scrolls away. That was the existing design and this slice did not change it.

**Also known and deliberate, and new this round:** the drawing keeps its true
size at every width and **scrolls sideways inside its own box** on a narrow
screen. It is not squashed, and the cards are not shrunk. The decision behind
that is explicit: a picture whose labels have become too small to read is not a
smaller picture, it is a broken one, so the relationships are preserved and you
pan instead. The page itself must never scroll sideways — only the diagram's own
box.

**Judge:**

- With the picture scrolled away, does the narration appearing above the
  progression control still tell you what happened? Mission 2's two-pass
  structure leans on the picture harder than anything reviewed before, so this
  needs a real check rather than a glance.
- At phone width, is panning the diagram acceptable, or does it break the
  lesson? **If it breaks the lesson, say so** — the alternative is a different
  arrangement on narrow screens, which is a design decision nobody has taken
  yet.
- Are the device labels still fully readable at phone width? They should be:
  nothing shrinks.
- **New this round:** select a device at phone width. Does the explanation wrap
  cleanly, does the journey-status line stay on its own, and does the **View
  technical details** disclosure still open without the panel overflowing
  sideways? The page must never scroll sideways because of it.

---

## 6. What must never be true

Check each. Any one of these is a serious finding.

- [ ] Nothing implies this is a real or live lab. Both journeys should read as
      instructional walkthroughs.
- [ ] No term appears before it is taught. Watch especially for: *packet*,
      *routing*, *IP address*, *subnet*, *gateway*, *VLAN*, *Layer 2*,
      *Layer 3*. None should appear anywhere in Module 1.
- [ ] Nothing claims you have proved a competency or earned anything. The
      journeys produce no score, no evidence and no progress.
- [ ] No answer-bearing content is present in protected modes.
- [ ] Nothing asks you to configure real equipment.
- [ ] **A prediction that did not match is corrected factually, never
      punitively.** No shame, no guilt, no lost score, no dramatic failure
      state, no large hostile "WRONG".

### 6.1 The correction principle

> **Mistakes receive clear factual correction without punitive presentation.**

Recorded during Module 1 UAT, when a reviewer deliberately chose a prediction
that did not match, and holds for every interaction built after it.

Both halves matter, and the second is the one that gets lost:

- **Not punitive.** An ordinary learning mistake is not a failure event. No
  shame, guilt, score loss, streak break, dramatic failure treatment, or large
  hostile error state, merely because a learner predicted.
- **Not hidden either.** Once authored observation makes the outcome known, the
  learner must be able to tell whether their prediction matched it. Softening a
  correction into ambiguity is the opposite error and is just as wrong.

The form that satisfies both is **comparison**, which is what Module 1 already
does: *"Your prediction: Router-1"* beside *"What actually happened: the print
request reached Switch-1 first"*, followed by the causal explanation where one
is instructionally useful. The learner draws the conclusion; nothing grades
them, and nothing can — the authored content carries no answer key.

This is about PREDICTIONS, not about errors. Red and error treatment stays
legitimate for genuine technical failure states: an invalid command, a failed
configuration, failed deterministic validation, broken connectivity. A learner
who breaks something should see that they broke it.

---

## 7. Recording findings

### 7.1 Classify

| Class | Meaning |
|---|---|
| **CONTENT** | The teaching is wrong, unclear, out of order, or too long. Fixed by rewriting the authored curriculum. |
| **PLATFORM** | The renderer, the interaction or the harness misbehaves. Fixed in code. |
| **ARCHITECTURE** | Something the current design cannot do. Needs an Architect decision. |

The distinction matters: a CONTENT finding is cheap and expected, a PLATFORM
finding is a defect, and an ARCHITECTURE finding stops work.

### 7.2 Severity

- **BLOCKER** — a beginner could not complete this.
- **MAJOR** — a beginner could complete it but would be confused or misled.
- **MINOR** — it works; it could be better.

### 7.3 What to write down

For each finding: where you were (mission, step, support level), what you
expected, what happened, and — for CONTENT findings — **what you would have
needed to know at that moment**. That last part is the most useful sentence you
can write, because it names the missing stair rather than the stumble.

---

## 8. Result template

Copy this, fill it in, and return it. Do not fill it in on behalf of anyone
else, and do not let a green gate answer any of it.

```
WP-J MODULE 1 — FOUNDER INSTRUCTIONAL UAT

Date:
Reviewed at:            /uat/instruction, Networking Foundations
Browser / OS:

BEGINNER-COMPLETE-1
Could a true beginner complete Module 1 without outside help?   YES / NO
If NO, where exactly did they need something the platform never taught?

TEACH BEFORE USE
Did every concept arrive before it was needed?                  YES / NO

BEHAVIOR BEFORE VOCABULARY
Did you see each thing happen before you were given its name?   YES / NO

THE CONFIRMATION MOMENT  (the second delivery in Mission 2)
Did it feel earned, or like a slide advancing?                  EARNED / SLIDE
Comment:

THE WRITING
Understood nearly every sentence on the first read:             YES / NO
Reads as professionally authored, not chatty or dumbed down:    YES / NO
Ever had to re-read a sentence to work out what was meant:      YES / NO   where:

THE VISUAL SYSTEM
Told the four device categories apart from symbols alone:       YES / NO
The topology looks like a premium product, not a dev UI:        YES / NO
The five device cards read as one drawn system:                 YES / NO
Selected device distinguishable from where the traffic is:      YES / NO
Wires met their devices at every window width:                  YES / NO
Anything cartoonish, clip-art, or vendor imitation:             YES / NO   what:
Anything on a device card you never needed:                     YES / NO   what:

THE EXPERIENCE
Topology stayed a useful reference:                             YES / NO
Predictions persisted and were worth making:                    YES / NO
Ever needed to scroll backwards to continue:                    YES / NO
Exactly one progression control at any moment:                  YES / NO
Anything too long:                                              YES / NO   where:
Any step unnecessary:                                           YES / NO   which:
Any term arrived before it made sense:                          YES / NO   which:

ACCESSIBILITY
Keyboard-only completed both journeys:                          YES / NO
Screen reader conveyed each stage:                              YES / NO
Text equivalent alone was enough to answer the predictions:     YES / NO
No colour-only meaning:                                         YES / NO
Reduced motion lost no information:                             YES / NO
Narrow viewport remained understandable:                        YES / NO

SUPPORT LEVELS
CHALLENGE ME still workable but not explanatory:                YES / NO
PROVE IT withheld the simulation and said why:                  YES / NO
No answer-bearing content found in protected payloads:          YES / NO

HONESTY
Nothing implied a real or live lab:                             YES / NO

FINDINGS
  #  CLASS        SEVERITY  WHERE                    WHAT
  1
  2

OVERALL:   PASS / PASS WITH FINDINGS / FAIL
```

---

## 9. What this UAT cannot cover

Stated so that a pass is not read as more than it is.

- **Nothing is published.** This reviews authored curriculum read from a file.
  It does not prove import, publication, or that a learner reaching the real
  learner surface would see this.
- **Missions 3 to 8 do not exist.** Module 1 is two missions of eight. Whether
  the staircase holds for the whole course cannot be judged from here.
- **No real lab.** Both journeys are authored teaching. Nothing has run on
  hardware.
- **One reviewer is not a beginner.** You know more than the learner this was
  written for. The closest available proxy is to read it strictly in order and
  refuse yourself the knowledge you already have.
- **A green gate proves structure, not teaching.** Every automated check in this
  slice can pass on instruction that is accurate, well-ordered and dull. Only
  this review can catch that.
- **No browser rendered anything during verification.** This repository has no
  rendered-DOM or visual-regression harness, and this slice did not add one. The
  gate proves that each category has its own symbol, that a symbol is chosen
  from authored data alone, that every state carries wording, and that the wire
  geometry constants agree between the component and the stylesheet. It cannot
  see the result. **Whether the topology actually looks premium is visible only
  to you**, which is why section 2.7 exists.
