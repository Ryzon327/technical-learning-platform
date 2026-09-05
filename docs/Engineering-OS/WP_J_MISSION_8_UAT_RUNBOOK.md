# WP-J9 Mission 8 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 4 — Prove It and Fix It
**Mission:** M8 *When it does not work* — **the final mission**

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first

This is the real authored course, parsed by the same parser and projected by the
same projection a learner's browser receives. Teaching quality is under review.

### What is new in this round

**Mission 8 only.** Missions 1 to 7 are unchanged and have already passed.

**This is the last mission of Networking Foundations.** With it authored, all
eight approved missions carry instruction. That is a structural fact and nothing
more — whether the course is any *good* is what you are about to decide.

**It is also the first time anything in this course breaks.** More than that: it
is the first time any authored curriculum in this repository has used the
fault-and-repair machinery at all. Five journeys have been authored before this
one and every one of them succeeded end to end. So this round is testing two
things at once — the mission, and a piece of the platform no content has ever
exercised.

### The one thing to judge above everything else

**Does this feel like the payoff of the whole course, or like the first lesson
of a troubleshooting course?**

Mission 8 is deliberately bounded. The learner is *shown* where the message
stops; they are not asked to find a failure nobody has located. That is a
smaller skill than real troubleshooting and the mission says so out loud.

The risk runs both ways. Too bounded and it feels like a formality after seven
missions of build-up. Too loose and it becomes the opening of a course this one
was never meant to be. **Only you can tell which side it lands on.**

### The second thing

**Could you have guessed the repair without reasoning?**

The wrong setting is `192.168.2.1` — the exact value Mission 5 walked through on
paper. That reuse is deliberate: the whole point is that Mission 5's rule turns
out to be a thing you *use*, not a thing you were told. But it carries an
obvious hazard, and it is the hazard you are best placed to detect: **if you
recognised the answer instead of working it out, the transfer did not happen.**

### What has NOT been done

No curriculum published, no migration, no lab, no live environment, no AI. The
learner's repair produces no score, no evidence and no competency. The
cross-course transition to Router-on-a-Stick is still recorded and unexecuted.

---

## 1. Before you start

Web app and API, as before. No Supabase project and no lab needed.

Instructional UAT surface → **Networking Foundations** → **Mission 8 — When it
does not work**.

**Re-read Mission 7's last step first.** Mission 8 opens on the promise Mission 7
made — *"something is going to fail"* — and whether that lands is the first thing
under test.

---

## 2. The main sequence

Read as a beginner would, and where the mission asks you to decide something
before reading on, **actually stop and decide.**

### 2.1 Step 1 — a result you have to act on

Sets up the change: everything has worked so far, and you have therefore never
had to *do* anything about a result.

- Does the shift feel earned, or abrupt after seven fault-free missions?
- Nothing is named yet. Check that nothing gives away what is coming.

### 2.2 Step 2 — the test that fails

The same `ping` you read twice in Mission 7, from the same machine, against the
same far host — and this time nothing comes back.

**The caption asks you to decide what it tells you before reading on. Do that,
and write it down.**

- Is the failed output recognisable without being alarming?
- Is it still clear this is displayed output rather than something you ran?

### 2.3 Step 3 — a failure points in many directions

Mission 7's habit, applied in reverse: a success had one explanation, a failure
has many. PC-C could be off, the router's far side could be down, something
could be wrong at PC-A, a cable could be out.

- **Compare against what you wrote.** Did you jump to a cause? Most people do.
- The step then says plainly that you are going to be *shown* the stopping
  point, and that finding an unlocated failure belongs to a later course.
  **Does that read as honest, or as the course dodging the hard part?** This is
  a deliberate boundary and it deserves your ruling.

### 2.4 Step 4 — watching where it stops

The journey. Work it properly.

- **Before you start**, inspect PC-A. Its address, its hardware identity and
  what it is wired to are in the inspector; the address it is *currently
  configured to hand off to* is reported beside each step instead, because it
  is a setting rather than a fixture. **Once the first step appears, did you
  notice the wrong value on your own?** If you did, say so — it matters,
  because the mission is built assuming most people will not.
- **Follow it to the stop.** The first stage says PC-A's decision was *correct*.
  **Did that register as information, or slide past?** It is doing real work:
  it tells you the thing that failed is not the thing you might blame first.
- **At the stop:** nothing left PC-A at all. **Before you look at the repair
  options, decide what that rules out.** Switch-1, Router-1 and PC-C all
  received nothing. What does that tell you?
- **The repair options.** Three changes are offered.
  - **Do not click the right one immediately.** Read all three and decide.
  - The Printer option is the interesting one: it *is* on PC-A's network, so it
    satisfies the rule Mission 5 gave you — and it still does not work.
    **Did you catch why?** If you did, Mission 6 did its job.
  - **Try a wrong one deliberately at some point** and read the observation.
    Does it explain a consequence, or does it feel like being marked wrong?
  - **Note what happens next.** A wrong choice cannot be taken back without
    restarting the journey. **Is that acceptable, or frustrating?** It is a
    deliberate constraint — it makes clicking through impossible — but you are
    the one who has to live with it.
- **After the correct change**, the journey continues all the way to PC-C and
  back. **Does that final run feel like proof, or like watching Mission 6
  again?** This is the single most likely place for the mission to sag.
- **Check every representation of PC-A after you repair it.** The configured
  gateway is reported beside each step, as *"currently configured to hand off
  to"*, rather than sitting among PC-A's fixed details — because it is the
  thing that changes. After the repair it should read `192.168.1.1` there, and
  `192.168.2.1` should appear nowhere. **Open PC-A's inspector as well as
  reading the step panel.** If any surface still says `192.168.2.1` after you
  have repaired it, that is a blocking finding.

### 2.5 Step 5 — working backwards from the stop

Names the reasoning you just did: what was still intact, and what a device that
received nothing cannot possibly have been.

- **Does it describe what you actually did**, or does it feel like being told
  you reasoned in a way you did not?
- The Mission 5 rule is restated here as something *applied*. **Did it feel like
  using knowledge, or like being reminded of it?**

### 2.6 Step 6 — a repair you did not confirm is a hope

The mission's argument for why the confirmation is the point rather than the
formality.

- *"I changed the setting"* and *"the thing that was failing now works"* are two
  different claims. **Is that convincing, or does it feel laboured?**
- It also bounds the confirmation, the way Mission 7 bounded everything: this
  exchange worked, which is not the same as the network being healthy.

### 2.7 Step 7 — what you have, and what you have not, shown

The ending. It lists what the course taught, and then says plainly that you have
been *taught* these things and have not *demonstrated* them — that the journeys
were drawn for you, the results shown to you, and the one failure already
located before you arrived.

- **Is that honest without being deflating?** It is trying to respect you rather
  than congratulate you, and the line between those is fine.
- **Does the course feel finished?**

---

## 3. Judged as a whole

- **Payoff or the start of a troubleshooting course?** The headline question.
- **Reasoning or recognition?** Could you have guessed the repair from Mission 5
  without reading the stop?
- **Focused or overloaded?** Seven missions converge here in fifty minutes.
- **Beginner completeness.** Anything assumed but never taught is blocking.
- **Does it overclaim at the end?** A course that spent a mission on not
  overclaiming would be badly undermined by finishing with a boast.

---

## 4. Accessibility

Keyboard only — **Tab, Shift-Tab, Enter, Space**: start the journey, advance
every stage, reach and choose a repair option, reach the restart control, and
read the confirmation.

With your screen reader, this journey asks more than any before it:

- **The stop must be announced as a stop**, with the symptom, and without the
  diagnosis arriving first.
- **The repair options must be reachable and distinguishable** — three similar
  sentences about addresses is exactly the case where an accessible path can
  become unusable while the picture stays clear.
- **The observation after a choice must be announced**, or a wrong choice
  becomes a dead end rather than a lesson.
- **The continuation after the repair must be conveyed as continuation** — that
  the thing that stopped is now proceeding is the whole point, and it must not
  be available only as a change in the drawing.

If the accessible path cannot let a learner perform the same reasoning rather
than merely read about it, that is a finding, and an important one.

---

## 5. What the automated gates already checked

- Mission 8 is authored under its approved identity, in Module 4, position 1,
  and is the last mission the course declares.
- Exactly **one** journey, **one** stopping stage, **one** fault, and **one**
  change that resolves it — with at least one that does not.
- The fault is on PC-A, the value is `192.168.2.1`, the correction is
  `192.168.1.1`, and the destination is `192.168.2.20`.
- The stop is explained with Mission 5's reachability rule and states the
  circularity, rather than asserting the value is wrong.
- The symptom is shown; **no text asks the learner to find, locate, search for
  or hunt a failure**, and no troubleshooting methodology is named.
- The mission tells the learner that finding an unlocated failure belongs to a
  later course.
- A failed result opens the mission, carries the honest presentation
  convention, and asks for a commitment before the reasoning.
- No further ICMP, no ping syntax, no TTL.
- Every wrong option carries an authored observation, and none of them delivers
  a verdict.
- The journey continues past the repair to PC-C and back, uses both of
  Router-1's connections, ends in an authored confirmation, and never reaches
  PC-B or the Printer.
- Every address and hardware identity from Missions 2 to 7 is unchanged.
- **The configured gateway is reported per step, never among PC-A's fixed
  details**, so no surface can report the pre-repair value after the repair.
  No stage after the stop carries `192.168.2.1` for PC-A; the step after the
  repair and the final step both carry `192.168.1.1`.
- The fault explanation says which rule is broken and why nothing left PC-A,
  and **does not name the correct gateway or prescribe the repair**.
- Mission 8 **develops nothing**; the course still has exactly seven
  development points, and `net.fault-isolation` appears nowhere.
- No assessment, no lab, no asset, no AI, no score, no mastery, no certification
  word anywhere a learner can see.
- The ledger gives Mission 8 exactly its three concepts and no fourth.
- The staged-authoring invariant was completed rather than deleted: both states
  remain implemented, the declaration is the single authority, no positional
  anchor survives, and **no ninth mission exists**.

**None of that shows the mission teaches**, and none of it can tell a payoff
from the opening of a different course. That is what you are for.

---

## 6. Recording the result

No verdict in this file. Report findings in your own words, worst first.

Thirteen questions worth answering explicitly, the first of which is a
required correction from architecture review:

1. **After you repaired PC-A's gateway, did every visible representation of
   the machine agree that the gateway had actually changed?**
2. Did you reason from evidence, or could you simply guess the answer?
3. Did Missions 4 to 7 actually feel necessary to solve it?
4. Did the broken default gateway feel like Mission 5 knowledge being **used**,
   rather than Mission 5 being repeated?
5. Did you understand what the visible stopping point told you was still intact?
6. Did you narrow the problem before you were offered a repair?
7. Were the repair choices meaningful, rather than click-until-green?
8. After the repair, did the confirmation actually prove the intended bounded
   claim — this exchange, at that moment, and not "the network is fixed"?
9. Did the final journey feel like proof rather than a replay of Mission 6?
10. Did Mission 8 feel like the payoff of Networking Foundations rather than the
    beginning of a troubleshooting course?
11. Did the ending make clear what you had learned versus what you had actually
    demonstrated?
12. Did the course ending feel earned?
13. Was the mission focused, or overloaded by integrating seven missions at
    once?
