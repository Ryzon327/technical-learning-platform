# WP-J Mission 2 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 1 — One Network
**Mission:** M2 *Inside one network: how a switch delivers*

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first

This is the real authored course, parsed by the same parser and projected by the
same projection a learner's browser receives.

### What is new in this round

Mission 2 has been repaired following the second Founder UAT round. Mission 1 is
unchanged.

Missions 3 and 4 received bounded terminology and continuity repairs required by
Mission 2's corrected MAC model. Mission 2 now teaches the term **MAC address**,
and CURR-009 §12 holds that a term, once earned, is used rather than replaced by
an invented substitute. Mission 4's learner-facing text and interface labels
previously said "factory identity" and "hardware identity"; those now say MAC
address, and the Architect authored replacement wording for the stages and steps
where the substitution carried more than a noun. Mission 3's repairs are to
comments and documentation only — no Mission 3 learner-facing curriculum
changed. Missions 5 to 8 are unchanged.

Their rendered learner experience has not been reviewed or approved in this
round. If you exercise Mission 4, treat it as unreviewed.

Six things about the mission are different, and each of them changes what you
are asked to do rather than only how it looks:

1. **The walkthrough is now required.** The steps that follow it stay hidden
   until you have finished it. Previously they were on screen from the start.
2. **The question about what the switch has recorded moved.** It used to be
   asked as a prediction, before you had been shown a switch record anything. It
   is now a knowledge check on the flooding stage, asked after the arrival that
   supplies the answer.
3. **The stage where the copies land no longer asks anything.**
4. **The Printer is marked when its copy reaches it**, not only the connection
   it crossed.
5. **The reply is named as the reply** while it is travelling back, rather than
   continuing to be described as the original delivery.
6. **The mission ends the way Mission 1 does** — a four-question activity on a
   network you have not seen, then a handoff to Mission 3.

### What has NOT been done

No curriculum published, no migration, no lab, no live environment, no AI. No
learner state is recorded anywhere by anything in this mission.

---

## 1. Before you start

Web app and API, as before. No Supabase project and no lab needed.

Instructional UAT surface → **Networking Foundations** → **Mission 2 — Inside
one network: how a switch delivers**.

Have Mission 1 fresh in mind, or re-walk it first: Mission 2's description
states that reading a small network and naming its devices is its prerequisite.

---

## 2. The main sequence

### 2.1 Step 1 — one local delivery, two machines

Sets up PC-A, PC-B and the Printer on Switch-1, and tells you what to watch.

- Read what it asks you to do before the activity, and note whether you knew
  what you were being asked to look for.
- It says PC-A already has the identity it needs for PC-B, and that how PC-A
  learned it comes later. Note how that deferral reads.

### 2.2 Step 2 — the walkthrough

Eight stages, in two passes with a reply between them. **Work it end to end.**

Before starting, look at what is on screen below the activity. Then:

- **Commit the first prediction (d2) deliberately wrongly**, and read what
  happens next. Note whether you were told you were wrong, told nothing, or
  shown something.
- **Answer the knowledge check on that same stage.** It appears after the
  reveal. Answer it wrongly the first time you meet it, if you can, and read the
  explanation.
- **At the stage where the copies land**, look at the Printer specifically.
  Note what the Printer shows, whether anything says why it did not accept the
  copy, and whether the moment reads as two copies at once or as two events.
- **Follow the reply back.** Read the live-region text and the stage text while
  the reply is travelling, and note what each says is moving.
- **Commit the second prediction (d7).** Note what you are told about your
  answer, and whether you are told why.
- **Watch what "What Switch-1 has recorded" says at each stage**, from the first
  stage to the last.

Inspect devices as you go — PC-A, PC-B, the Printer and Switch-1.

### 2.3 Progression

At some point before you finish the walkthrough, look below it.

- Note what is visible, what is not, and whether anything explains why.
- Try to reach the later steps without finishing the activity.
- Then finish the activity and note what appears, and when.

### 2.4 Steps 3 to 7 — the naming

These steps name what you watched: the local identity on an interface, reading
it on a machine, the unit that moved, and why the first delivery looked wrong
and was not.

- Note whether each name arrives for something you had already seen.
- Note anything that is named before you were shown it.

### 2.5 Step 8 — a different switch

A four-question activity on Switch-2, Workstation-A, Workstation-B and a Camera
— a network you have not seen.

- Answer all four. Get at least one wrong on purpose and read the feedback.
- Note whether you could answer them from the mission, or whether any of them
  needed something you were not given.
- Note what happens between committing an answer and moving to the next
  question, and what the counter says at each point.
- Press **Finish** and note what appears.

### 2.6 Step 9 — what comes next

The handoff to Mission 3.

- Note when this became visible relative to the activity above it.

---

## 3. Judged as a whole

- **Length.** Roughly 55 minutes as estimated. If it runs long, say where.
- **Beginner completeness.** Anything assumed but never taught is blocking.
- **The comparison.** The mission's whole shape is one delivery compared with a
  later delivery between the same two machines. Note whether that comparison
  arrived, and where.
- **The Printer.** Note whether its refused copy read as ordinary behaviour or
  as something going wrong.
- **Being made to finish the activity.** Note how that felt, in your own words.
- **Vocabulary.** Note any word you met before it was explained.

---

## 4. Accessibility

Keyboard only — **Tab, Shift-Tab, Enter, Space**:

- Start the activity, commit both predictions, answer the knowledge check, and
  reveal all eight stages.
- Reach and read every device, including the Printer.
- Answer all four near-transfer questions and reach Finish.

With your screen reader:

- Listen to the live region at every stage. Note what it says at the stage where
  two copies move at once, and what it says while the reply is travelling.
- Read the activity's text equivalent and the near-transfer topology's text
  equivalent. Note whether either lets you answer what the picture answers.

With **reduced motion** enabled in your operating system:

- Walk the whole activity again and note how it behaves when you advance a
  stage, and whether anything moves that you did not expect.

---

## 5. What the automated gates already checked

- Mission 2 is authored under its approved identity, in Module 1, position 1,
  and every Mission 2 step sits inside Mission 2.
- Exactly one journey, declared authored teaching, and declared required before
  the later steps appear.
- The journey names what is moving as one local-network delivery; the two return
  stages each name PC-B's reply separately.
- The flooding stage's prediction carries **no** answer key; its knowledge check
  carries one, with a reason.
- The arrival stage carries **no** prediction, and names both the Printer's
  connection and the Printer itself.
- The second-pass prediction carries an answer key and an explanation.
- The near-transfer activity asks exactly its four approved questions, and the
  handoff to Mission 3 is the last step.
- No fault, no repair, no assessment, no evidence, no scoring, no certification,
  no lab, no AI.
- The concept ledger gives Mission 2 exactly its six approved concepts, and does
  not give it `broadcast`.
- Every other mission is still present with its authored steps. Missions 1 and
  5 to 8 are unchanged; Missions 3 and 4 carry the bounded continuity repair
  described above, and Mission 4's corrected MAC model is asserted by its own
  suite. No dependency, migration or publication changed.

**None of that shows the mission teaches.** That is what you are for.

---

## 6. Recording the result

No verdict in this file. Report findings in your own words, worst first.

Questions worth answering explicitly:

1. What did the first prediction and its knowledge check leave you thinking?
2. What did you understand about the Printer's copy at the moment it arrived?
3. What was moving, in your reading, during the return leg?
4. What did the second prediction tell you about your own answer?
5. What did being unable to read on until you finished the activity feel like?
6. What could you answer, and not answer, on the different switch?
