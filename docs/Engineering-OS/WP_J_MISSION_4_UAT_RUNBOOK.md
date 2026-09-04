# WP-J5 Mission 4 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 2 — Addresses and Boundaries
**Mission:** M4 *The prefix, and the decision every host makes*

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first

This is the real authored course, parsed by the same parser and projected by the
same projection a learner's browser receives. Teaching quality is the thing
under review.

### What is new in this round

**Mission 4 only.** Missions 1 to 3 are unchanged and have already passed. Give
them a quick regression glance, then spend your time here.

### The one thing to judge above everything else

**Mission 4 is the largest mission in the course.** Sixty-five minutes, two
journeys, and five new ideas: prefix length, network portion, host portion, ARP,
broadcast. Missions 1 to 3 each introduced one idea and had room to breathe.

It was deliberately **not** split, because the five concepts form a single causal
chain — each one exists to answer the question the previous one raised. The
intended experience is:

```
I saw a machine behave differently for two destinations
        ↓  why?
the number after the address
        ↓  so is this destination local?
yes → but the switch needs the other identity
        ↓  where do I get it?
ARP
        ↓  why did everyone hear it?
broadcast
        ↓  and when it is NOT local?
it goes to Router-1
        ↓  why Router-1?
Mission 5
```

**Your judgement is whether it actually feels like that.** If at any point it
stops feeling like one question leading to the next and starts feeling like
"here are five networking concepts", that is the finding this whole review
exists to produce. Say exactly where it tipped over.

### What has NOT been done

No curriculum published, no migration executed, no lab, no live environment, no
AI. Missions 5 to 8 remain unauthored.

---

## 1. Before you start

The web app and API, as in previous rounds. No Supabase project and no lab are
needed — Mission 4 is authored teaching the harness reads from the file.

Go to the instructional UAT surface, select **Networking Foundations**, then
**Mission 4 — The prefix, and the decision every host makes**.

---

## 2. The main sequence — one sitting, in order

Read as a beginner would. Your own networking knowledge is the main risk to this
review: if you find yourself filling a gap from experience, that gap is a
finding.

### 2.1 Step 1 — two destinations

PC-A is going to be asked to reach `192.168.1.11` and then `192.168.2.20`, and
you are told the two look like the same kind of thing.

- **Does the setup make you curious, or does it feel like an announcement?**
- The step deliberately does not hint at the answer. Check that it does not: if
  you can already predict the whole mission from step 1, the tension is spent.

### 2.2 Step 2 — the first journey, PC-A to PC-B

Work the journey. There is a prediction partway through — **commit to it before
revealing**, and get it wrong on purpose at least once to see how the correction
reads.

- **Stage 1–2:** PC-A decides the destination is in its own group, and the panel
  shows what it concluded. Does the decision feel like something the machine
  did, or like something the course asserted?
- **Stage 3:** the mission points out PC-A still cannot deliver, because Mission
  2's switch works on hardware identity. **Did you feel that gap yourself before
  it was explained?** That moment is the hinge of the whole mission.
- **Stage 4:** the question goes to every machine at once. Watch the Printer and
  Router-1 receive it.
- **Stage 5–6:** PC-B answers, and delivery finishes exactly as Mission 2.

Judge: **does the last stage feel like a reward for remembering Mission 2, or
like a repetition of it?** It is meant to feel like the former.

### 2.3 Step 3 — the prefix length

The term arrives here, after you have watched the decision.

- **Is "network portion / host portion" clear from the worked example**, or does
  it need a second one?
- **Does it stay conceptual?** There is deliberately no binary, no mask
  conversion, no arithmetic. If it reads as if it *wants* to become arithmetic,
  say so.
- Does this finally settle the `/24` that Mission 3 left you staring at? That
  payoff is the point of the two missions being separate.

### 2.4 Step 4 — ARP

- **Does ARP feel like an answer to a question you had?** It should. If it reads
  as a definition dropped in, the sequencing has failed.
- The claim being made is that Mission 2's identity and Mission 3's identity
  finally connect here. **Does that connection land?**

### 2.5 Step 5 — broadcast

- The mission distinguishes broadcast from Mission 2's flooding. **Is that
  distinction clear, or confusing?** They look identical on the picture, which
  is exactly why it is drawn. This is the paragraph most likely to need work.

### 2.6 Step 6 — the changed destination

You are asked to work out for yourself what PC-A will do with `192.168.2.20`
before watching.

- **Could you?** If yes, the mission has taught what it set out to teach. If
  not, say what was missing.

### 2.7 Step 7 — the second journey

- Commit the prediction first.
- **Watch what does NOT happen:** nobody is asked for `192.168.2.20`, nothing
  goes to PC-B or the Printer, and nothing arrives at the destination.
- The traffic goes to Router-1 and the journey stops there.

### 2.8 Steps 8 and 9 — nothing is broken, and the open question

- **Does "working as designed" convince you here?** This is the second time the
  course has asked that question and the first time you have had enough to
  answer it.
- **Do you finish wanting to know why Router-1?** That is the handoff to Mission
  5. If you finish satisfied, the handoff has not landed — report it.

---

## 3. Judged as a whole

- **Cognitive load — the headline question.** Where, precisely, did it get
  heavy? Naming the step is more useful than a general impression.
- **Pacing against Missions 1–3.** Mission 3 was quiet reading; this is two
  journeys and five concepts. Is the change of gear right?
- **Beginner completeness.** Any point assuming something never taught is a
  blocking finding.
- **Two journeys or one?** The mission was built as two deliberately, so the
  second is a changed context rather than a continuation. Judge whether that
  reads as intended or as repetition.

---

## 4. Accessibility

Keyboard only — **Tab, Shift-Tab, Enter, Space**:

- Reach every step and both journeys.
- Commit **all three** predictions (one in the first journey, two in the second).
- Reach and read every device in both topologies, including PC-C.
- Walk both journeys end to end.

Then with your screen reader: both journeys carry a long text equivalent. Check
that the *second* one makes clear the traffic went to Router-1 and **not** to the
destination — that is the hardest fact for the accessible path to convey, and it
is the mission's whole conclusion.

---

## 5. What the automated gates already checked

So you do not spend review time on it:

- Mission 4 is authored under its approved identity, in Module 2, position 1.
- Its five competency relationships are exactly as approved, and it is the only
  mission developing addressing and subnet boundaries.
- Two journeys exist; the local one reaches PC-B, the remote one never reaches
  PC-C.
- The prefix, ARP and broadcast are each named only **after** the journey that
  shows them.
- The local and remote conclusions are **authored facts** — nothing computes
  whether two addresses share a network, in the curriculum or the renderer.
- PC-A and PC-B keep the addresses and factory identities from Missions 2 and 3;
  PC-A is byte-identical between the two journeys.
- No Mission 5+ vocabulary appears: no gateway, routing, route, packet, ping,
  Layer 2/3 — and no binary, mask or CIDR arithmetic.
- Router-1 is named, its role is not.
- No certification word appears anywhere a learner can see.
- Mission 4 authors no fault, no remediation, no assessment and no lab surface,
  so it produces no competency evidence.
- Missions 5 to 8 remain unauthored.

**None of that is evidence that the mission teaches**, and none of it can see
whether five concepts in 65 minutes is too many. That is what you are for.

---

## 6. Recording the result

Do not record a verdict in this file. Report findings in your own words, worst
first.

Three questions worth answering explicitly whatever else you report:

1. Did the five concepts arrive as one chain, or as a list?
2. Did you feel the "the switch needs the other identity" gap before it was
   pointed out?
3. Did you finish wanting to know why Router-1?
