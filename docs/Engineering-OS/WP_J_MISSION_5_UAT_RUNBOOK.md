# WP-J6 Mission 5 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 3 — Reaching Another Network
**Mission:** M5 *The default gateway*

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first

This is the real authored course, parsed by the same parser and projected by the
same projection a learner's browser receives. Teaching quality is under review.

### What is new in this round

**Mission 5 only.** Missions 1 to 4 are unchanged and have already passed.

**Mission 5 opens Module 3.** Modules 1 and 2 were about one network and the
addresses inside it. Module 3 is about what happens when the answer is
"somewhere else".

### The one thing to judge above everything else

**Mission 5 is deliberately the smallest mission in the course.** Five steps, one
new idea, one piece of output. Mission 4 was five concepts and two journeys in
sixty-five minutes; this is one concept in forty-five.

That is a design decision, not an omission. The course was built to change pace
here, and the repository's own description says so: *"This is the smallest
mission in the course, and deliberately so. It introduces one idea and one line
of output."*

**Your judgement is whether it reads as focused — or as thin.** Those are
different failures and only you can tell them apart. If it feels like relief
after Mission 4, the design worked. If it feels like the mission ended before it
started, say so plainly.

### What has NOT been done

No curriculum published, no migration executed, no lab, no live environment, no
AI. Missions 6 to 8 remain unauthored.

---

## 1. Before you start

The web app and API, as before. No Supabase project and no lab needed.

Instructional UAT surface → **Networking Foundations** → **Mission 5 — The
default gateway**.

**Do Mission 4's last step again first.** Mission 5 is built on the question
Mission 4 ended with, and the handoff is the first thing being tested.

---

## 2. The main sequence

Read as a beginner would, top to bottom, without letting your own networking
knowledge fill a gap the text left.

### 2.1 Step 1 — PC-A already knew

Returns to Mission 4: PC-A handed to Router-1 without searching, pausing or
asking. The step argues that PC-A therefore already held the answer, and sends
you to look at the machine.

- **Does the argument land?** The claim is that *no hesitation* implies *prior
  knowledge*. Is that convincing, or does it feel like a rhetorical trick?
- The term "gateway" does not appear here. Check that nothing gives the answer
  away before you have looked.

### 2.2 Step 2 — the machine's configuration

Two lines of output from `ip route show`.

**Before reading the caption's last sentence, do what it asks:** work out which
line tells PC-A where to send something that is not in its own group.

- **Could you find it?** The answer is the `default via 192.168.1.1` line.
- **Did the second line get in the way, or was it obviously not the answer?**
  This is the question that matters most in this mission. The repository claims
  learning to find the relevant line *is itself a skill*. Judge whether the
  output has enough in it to make that real, without being so noisy it reads as
  hostile.
- **The command is `ip route show`.** That word is not explained anywhere in
  Mission 5, and the mission tells you that you do not need it yet. **Judge
  whether that sits comfortably or nags at you** — it is a deliberate choice and
  is flagged for your ruling.

### 2.3 Step 3 — the line that answered it

The address is read plainly first, then recognised as Router-1's, and only then
named a **default gateway**.

- **Did you recognise `192.168.1.1` before being told?** You saw it on Router-1
  in Mission 4, deliberately unexplained. That payoff is the reason the two
  missions are separate.
- **Did the meaning arrive before the term?** The intended order is: read the
  line → realise it is Router-1 → *then* get the name. If the name landed first,
  the sequencing has failed.
- The last paragraph says explicitly that most of the output is not the answer
  and you do not need to understand every word. **Does that reassure, or does it
  read as the course dodging?**

### 2.4 Step 4 — why it has to be one of your own

The constraint: a default gateway must be an address the machine can already
reach directly, so it has to be in the machine's own group.

This is the intellectual centre of the mission. It asks whether `192.168.2.1`
could have been configured instead, and resolves it with **Mission 4's rule
only** — no new theory.

- **Did the argument feel like something you worked out, or something you were
  told?** It should feel like the former: you already had the rule.
- The circularity — *the machine would need the gateway in order to reach the
  gateway* — is the crux. **Is it clear, or does it need another pass?**
- Note there is **no broken network here**. Mission 5 teaches the rule; Mission
  8 may later make you diagnose a violation of it. Judge whether the rule stands
  on its own without a fault to motivate it.

### 2.5 Step 5 — what happens after the hand-off

Closes on: Router-1 now holds something addressed to a machine it is not, in a
group it is not in — **what does it actually do with it?**

- **Do you want the answer?** That is the test.
- Does the mission feel finished, or unfinished? It should feel *complete but
  not final*.

---

## 3. Judged as a whole

- **Focused or thin?** The headline question. Name the step where it tipped, if
  it did.
- **Pace against Mission 4.** Is the drop in density welcome, or jarring?
- **Beginner completeness.** Anything assumed but never taught is a blocking
  finding.
- **Is one idea enough for 45 minutes?** If the mission is short, say whether
  that is a virtue or a gap.

---

## 4. Accessibility

Keyboard only — **Tab, Shift-Tab, Enter, Space**: reach every step and read the
output block. Mission 5 has no journey and no controls, so this pass should be
quick; anything unreachable is a finding.

With your screen reader: the output block is the risk. Confirm both lines are
announced as readable content and that the caption reaches you *before* the
output it describes — otherwise the "find the line" task is impossible.

---

## 5. What the automated gates already checked

- Mission 5 is authored under its approved identity, in Module 3, position 0.
- Its three competency relationships are exactly as approved, and it is the only
  mission developing `net.default-gateway`.
- The address is shown **before** the term is named, and Router-1 is connected
  to it **before** "default gateway" appears.
- `192.168.1.1` is pinned at **both** ends — Mission 5 uses it, and Mission 4
  still shows it on Router-1, so the "you have seen this before" claim cannot
  silently become false.
- The output shows more than the answer, with exactly one line carrying the
  gateway address, and the noise stays bounded.
- Mission 5 authors **no journey, no prediction control, no assessment, no lab
  surface**, and is **smaller than Mission 4** — asserted, because that pace
  change is the design.
- No Mission 6+ vocabulary: no routing, next hop, packet, Layer 2/3, ping, ICMP.
  The word `route` appears only as the name of the command displayed.
- No fault, break or troubleshooting language — Mission 8's payoff is preserved.
- No certification word appears anywhere a learner can see.
- Missions 6 to 8 remain unauthored.

**None of that shows the mission teaches**, and none of it can tell focused from
thin. That is what you are for.

---

## 6. Recording the result

No verdict in this file. Report findings in your own words, worst first.

Six questions worth answering explicitly:

1. Did Mission 4's unanswered question make you genuinely want to know how PC-A
   knew to use Router-1?
2. When reading the output, did finding the relevant line feel like a useful
   skill rather than arbitrary noise?
3. Did the meaning become clear before the term "default gateway" was introduced?
4. Did Mission 4's local-delivery rule make the "gateway must be locally
   reachable" constraint feel logical rather than memorised?
5. Does the mission feel refreshingly focused after Mission 4, rather than
   incomplete?
6. At the end, do you understand where PC-A hands remote traffic while still
   genuinely **not** knowing what Router-1 does next?
