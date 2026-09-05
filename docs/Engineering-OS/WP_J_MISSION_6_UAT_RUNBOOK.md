# WP-J7 Mission 6 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 3 — Reaching Another Network
**Mission:** M6 *Routers, and the journey end to end*

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first

This is the real authored course, parsed by the same parser and projected by the
same projection a learner's browser receives. Teaching quality is under review.

### What is new in this round

**Mission 6 only.** Missions 1 to 5 are unchanged and have already passed.

**Mission 6 completes Module 3, and it is the integration mission.** It is the
only mission in the course that develops no new competency. Everything in it is
something the learner has already met — arranged, for the first time, into one
continuous trip.

### The two things to judge above everything else

**First: does it feel like a payoff, or like a recap?**

Mission 6 deliberately re-walks Missions 1 to 5. That is its purpose — five
missions of separate pieces finally becoming one story. But the failure mode of
an integration mission is that it reads as revision, and only you can tell the
difference. If at any point you think *"I already know this"* in a bored way
rather than a satisfied way, name the step.

**Second: does the round trip hold together as one story?**

This is the longest journey in the course: eight stages, out and back, across
two networks. It was deliberately **not** split into two journeys, because the
reply is the second half of one exchange rather than a separate exercise. Judge
whether that holds — or whether it becomes a long sequence you are waiting to
end.

### The idea the mission is built around

The description calls it *"the single most useful idea in this course"*:

- **What survives the whole trip** — where the exchange is ultimately going.
  `192.168.2.20`, decided by PC-A before anything moved, unchanged at every hop.
- **What is thrown away and rebuilt at every step** — the local delivery, made
  to a hardware identity on that leg's own network. Four legs, four different
  identities.

If that distinction lands, the mission worked. If it does not, nothing else
about the mission matters much.

### What has NOT been done

No curriculum published, no migration, no lab, no live environment, no AI.
Missions 7 and 8 remain unauthored.

---

## 1. Before you start

Web app and API, as before. No Supabase project and no lab needed.

Instructional UAT surface → **Networking Foundations** → **Mission 6 — Routers,
and the journey end to end**.

**Re-read Mission 5's last step first.** Mission 6 opens on the question Mission
5 ended with, and whether that handoff still feels live is the first thing under
test.

---

## 2. The main sequence

### 2.1 Step 1 — what Router-1 did with it

Reopens Mission 5: Router-1 was holding something addressed to a machine it is
not, in a group it is not in, and nothing had arrived anywhere.

- **Does the question still feel live** after a mission's gap?
- The step tells you to watch for *what stays the same and what gets replaced*.
  **Was that instruction useful, or did it give too much away?** It is a
  deliberate choice to prime you; judge whether it helps or spoils.

### 2.2 Step 2 — the round trip

Eight stages. Work it end to end, and **commit both predictions before
revealing** — get one wrong on purpose to see how the correction reads.

Watch for these specifically:

- **Stage 2, the first leg.** Switch-1 delivers to Router-1's hardware
  identity and *"has never heard of 192.168.2.20"*. Two things true at once.
  **Is that confusing or clarifying?** It is the mission's hinge.
- **Stage 3, at Router-1.** The prediction. Router-1 has a connection in the
  destination's network. **Did you see the answer before it was offered?**
- **Stage 4, the second leg.** A new local delivery on the far network.
  **Was it clear that the first wrapper had ended and a new one begun?**
- **Stage 5, PC-C replies.** The second prediction, and the mission's
  near-transfer: PC-C applies the same rule PC-A applied, in reverse. **Could
  you answer it without help?** If yes, Missions 4 and 5 did their job.
- **Stages 6 to 8, the return.** **Does the return feel necessary, or does it
  outstay its welcome?** Report honestly — this is the single most likely place
  for the mission to be too long.

Inspect the devices as you go. Router-1 is the only one in both networks, and
that is visible in its two addresses.

### 2.3 Step 3 — what survived, and what did not

Lays the four deliveries side by side against the one unchanged destination.

- **Is the comparison clear?** This paragraph is doing the heaviest lifting in
  the mission.
- Does the claim *"every hard part of networking gets easier once those two stop
  being the same thing in your head"* feel earned, or oversold?

### 2.4 Step 4 — the two units

Names **frame** (already known from Mission 2) and **packet** (new). One packet,
four frames.

- **Does "packet" arrive as a name for something you watched**, or as a
  definition?
- Is *"the packet is the trip, a frame is one leg of it"* accurate and useful, or
  too neat? A memorable phrase that creates a wrong model is worse than none.

### 2.5 Step 5 — what Router-1 was doing

Names **routing**, and deliberately deflates it: *"less clever than it looks."*

- **Does routing feel like a name for something you understand**, or like the
  start of a bigger topic you have not been given?
- The step says routing needed a device belonging to more than one network.
  **Is that the right thing to emphasise?**

### 2.6 Step 6 — two kinds of decision

Names **Layer 2** and **Layer 3**, as shorthand for two kinds of decision you
have already sorted.

- **Do the labels feel like names for behaviour**, or like the beginning of a
  framework?
- The step says formal numbered models exist and that this course has not given
  you a reason to need one. **Is that honest and reassuring, or does it feel like
  the course dodging something?** This is a deliberate deferral and worth your
  ruling.

### 2.7 Step 7 — the question to carry forward

Closes on: everything you concluded, you concluded because you were shown it. In
front of a real network nobody shows you.

- **Do you want to know how to find out for yourself?** That is Mission 7.

---

## 3. Judged as a whole

- **Payoff or recap?** The headline question.
- **One story, or a long sequence?** The second one.
- **Length.** Roughly 65 minutes with the longest journey in the course. If it is
  too long, say where you would cut.
- **Beginner completeness.** Anything assumed but never taught is blocking.
- **Does it become a routing lecture?** It should not. If it starts to feel like
  one, name the paragraph.

---

## 4. Accessibility

Keyboard only — **Tab, Shift-Tab, Enter, Space**:

- Walk all eight stages, out and back.
- Commit both predictions.
- Reach and read every device, including PC-C and both of Router-1's connections.

With your screen reader: the journey carries a long text equivalent covering the
whole round trip. **The hardest thing for it to convey is that the wrapper
changes per leg while the destination does not** — check that the accessible path
makes that distinction as clearly as the picture does. If it does not, that is a
finding, and an important one, because the accessible path must let a learner
perform the same reasoning rather than merely read about it.

---

## 5. What the automated gates already checked

- Mission 6 is authored under its approved identity, in Module 3, position 1.
- All six competency links are `reinforces`; **it develops nothing**, and each
  competency it reinforces was developed in an earlier mission.
- One continuous journey; the trip reaches PC-C **and returns to PC-A**; both of
  Router-1's connections are used; every stage proceeds; no fault, no repair.
- Nothing ever reaches PC-B or the Printer.
- Both halves of the comparison are authored facts: the surviving destination is
  stated repeatedly and never changes in transit, and four separate per-leg
  deliveries are stated, to at least three different hardware identities, across
  both networks.
- Routing, packet, Layer 2 and Layer 3 are each named only **after** the journey.
- The step naming "packet" also names "frame" and cites Mission 2.
- **No numbered layer model**: no OSI, TCP/IP, seven-layer, protocol stack,
  encapsulation, Layer 1 or Layer 4–7.
- Every address and hardware identity from Missions 2 to 5 is unchanged; the two
  new values are pinned; all identities are distinct and in the established
  scheme.
- Mission 5 still says what it said about `192.168.2.1`, and Mission 6 does not
  restate it as invalid.
- No ping, ICMP, test, verify, prove, troubleshoot, fault or repair language.
- No certification word appears anywhere a learner can see.
- Missions 7 and 8 remain unauthored.

**None of that shows the mission teaches**, and none of it can tell payoff from
recap. That is what you are for.

---

## 6. Recording the result

No verdict in this file. Report findings in your own words, worst first.

Six questions worth answering explicitly:

1. Does the round trip feel like one coherent story rather than a long sequence?
2. Does "what survives versus what is rebuilt" become clear?
3. Does the reuse of Missions 1–5 feel like payoff rather than repetition?
4. Do routing, packet, Layer 2 and Layer 3 feel like names for behaviour you had
   already understood?
5. Is the return trip educationally necessary, and understandable?
6. Does the mission avoid becoming a routing lecture?
