# WP-J8 Mission 7 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 4 — Prove It and Fix It
**Mission:** M7 *Testing whether it actually works*

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first

This is the real authored course, parsed by the same parser and projected by the
same projection a learner's browser receives. Teaching quality is under review.

### What is new in this round

**Mission 7 only.** Missions 1 to 6 are unchanged and have already passed.

**Mission 7 opens Module 4, "Prove It and Fix It."** Modules 1 to 3 built up how
a network works. Module 4 is about establishing whether it *actually* works, and
what to do when it does not. Mission 7 is the first half of that; Mission 8 —
still unauthored — is the second.

### The one thing to judge above everything else

**Does this feel like learning to reason about tests, or like learning a
command?**

Mission 7 introduces `ping`. The command is genuinely small, takes about a
minute to explain, and the mission deliberately moves past it almost
immediately. Everything else — roughly five of seven steps — is about a single
question: *what does a successful result actually entitle you to conclude?*

If the mission reads as a ping tutorial with some philosophy attached, it has
failed. If it reads as a reasoning lesson that happens to need a tool, it has
worked. **Only you can tell which.**

The specific risk is the mirror image of Mission 6's. Mission 6 risked feeling
long; Mission 7 risks feeling **thin**, because if the confirms-versus-consistent
distinction does not land there is nothing else holding the mission up.

### What has NOT been done

No curriculum published, no migration, no lab, no live environment, no AI.
**Nothing in this mission is broken** — both tests succeed. Mission 8 remains
unauthored.

---

## 1. Before you start

Web app and API, as before. No Supabase project and no lab needed.

Instructional UAT surface → **Networking Foundations** → **Mission 7 — Testing
whether it actually works**.

**Re-read Mission 6's last step first.** Mission 7 opens on the question Mission
6 ended with, and whether that handoff still feels live is the first thing under
test.

---

## 2. The main sequence

Read as a beginner would. Where the text asks you to decide something before
reading on, **actually stop and decide** — the mission's whole method depends on
you committing before the answer arrives, and skimming past it will make the
mission feel obvious when it is not.

### 2.1 Step 1 — nobody draws it for you

Removes the narrator. You understood Mission 6 only because it was drawn; on a
real network nothing is drawn, and you have to establish things from outside.

- **Does the loss of the diagram feel real?** The step is trying to make you
  notice that everything you know is second-hand.
- It names no tool. Check that nothing gives away what comes next.

### 2.2 Step 2 — the first test

A ping result from PC-A to `192.168.1.1` — Router-1, the address Mission 5 said
PC-A hands off to.

**The caption asks you to decide what it proves before reading on. Do that.**
Write your answer down if you can; you will want to compare it.

- Is the output recognisable and realistic without being overwhelming?
- Is it clear this is displayed output rather than something you ran?

### 2.3 Step 3 — what that actually proves

Names `ping`, explains ICMP in one sentence, then does the real work: what had
to be true for that reply to come back, and what it says nothing about.

- **Compare against what you wrote.** Did you overclaim? Most people do, and the
  step is built on the assumption that you will.
- **Is the ICMP sentence enough?** It should make ping non-magical and stop
  there. If it leaves you wanting a protocol lecture, that is fine — if it
  leaves you *confused*, that is a finding.
- The step says the result proves the first leg and nothing beyond it. **Is the
  reasoning convincing, or does it feel like pedantry?**

### 2.4 Step 4 — the second test

The same test against `192.168.2.20` — PC-C, on the other network. Again:
**decide before reading on** what this lets you conclude that the first did not.

- **Could you answer it?** If yes, Mission 6 did its job — you should be able to
  reason that a reply from the far side means the whole trip worked.

### 2.5 Step 5 — confirms, or merely consistent with

The heart of the mission. Both results succeeded and both look equally
reassuring, but they license completely different conclusions.

The argument: a gateway reply is *consistent with* a healthy network — and
equally consistent with the far side being unplugged, or PC-C being switched off
for a week. A reply from PC-C is not consistent with those, because they could
not have produced it.

- **Does this land?** This is the single question that decides whether the
  mission is worth its 45 minutes.
- **Or does it feel like hair-splitting?** That is the honest failure mode and
  you should say so if you feel it.
- The step ends with a portable habit: *after any result, ask what else would
  have produced exactly the same thing.* **Is that useful, or glib?**

### 2.6 Step 6 — choosing what to ask first

Poses a hypothetical: if PC-A could not reach `192.168.1.1` at all, would it be
worth testing `192.168.2.20` next?

- **Nothing is actually broken here** — this is a thought experiment, and the
  step says so.
- The intended insight: if the one device PC-A hands everything to is
  unreachable, nothing beyond it can be reachable, so that test would tell you
  only what you already knew.
- **Does the hypothetical sharpen the reasoning, or does it feel like Mission 8
  started early?** That is a real risk and worth your ruling.

### 2.7 Step 7 — the question to carry forward

Everything tested worked; you never had to act on a result. Next time something
will fail.

- **Does the mission feel finished?** It should feel complete but not final.

---

## 3. Judged as a whole

- **Reasoning lesson or command lesson?** The headline question.
- **Focused or thin?** The second one. Seven steps and one small command.
- **Beginner completeness.** Anything assumed but never taught is blocking.
- **Does it overclaim anywhere?** A mission about not overclaiming would be
  badly undermined by doing it. If any sentence asserts more than the evidence
  supports, that is the most valuable finding you could produce.

---

## 4. Accessibility

Keyboard only — **Tab, Shift-Tab, Enter, Space**: reach every step and both
output blocks. Mission 7 has no journey and no controls, so this should be quick;
anything unreachable is a finding.

With your screen reader: both captions ask you to decide something *before* the
output. Confirm the caption reaches you before the output it describes —
otherwise the commit-then-check method the whole mission runs on is impossible.
Check the ping output is announced as readable content rather than skipped.

---

## 5. What the automated gates already checked

- Mission 7 is authored under its approved identity, in Module 4, position 0.
- Its three competency relationships are exactly as approved; it develops
  `net.connectivity-verification` and is the only mission that does.
- Exactly two tests, against `192.168.1.1` then `192.168.2.20`, and no third
  invented target.
- **Both results succeed.** No failed test, no unreachable output, no fault.
- `ping` is explained only *after* a result has been shown; step 1 names neither
  ping nor ICMP.
- The ICMP explanation is a **single paragraph**, and no protocol detail appears
  in prose — no type or code numbers, no headers, no checksum, no TTL.
- The gateway explanation states **both** halves: what it proves, and that it
  says nothing about whether PC-C is reachable.
- No text anywhere claims a result proves "the network works".
- The confirms/consistent-with distinction is present, with named alternatives
  that would have produced the same gateway result, and the portable habit.
- The failed-gateway case is posed as a hypothesis; no troubleshooting,
  diagnosis, repair or root-cause language appears.
- No journey, no prediction control, no assessment, no lab surface — and nothing
  treats the learner's answer as a score.
- No certification word appears anywhere a learner can see.
- Mission 8 remains unauthored.

**None of that shows the mission teaches**, and none of it can tell a reasoning
lesson from a command lesson. That is what you are for.

---

## 6. Recording the result

No verdict in this file. Report findings in your own words, worst first.

Six questions worth answering explicitly:

1. Does the mission feel like learning how to reason about tests rather than
   learning a command?
2. Does the difference between "confirms" and "merely consistent with" actually
   make sense?
3. Does the gateway-versus-PC-C comparison make the bounded nature of evidence
   clear?
4. Does the ICMP explanation feel sufficient without becoming a protocol lecture?
5. Does the hypothetical failed-gateway question sharpen the reasoning without
   feeling like Mission 8 started early?
6. Does the mission feel focused rather than thin?
