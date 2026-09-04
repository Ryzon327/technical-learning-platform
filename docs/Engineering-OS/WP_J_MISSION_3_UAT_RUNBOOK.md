# WP-J4 Mission 3 — Founder Instructional UAT Runbook

**Course:** Networking Foundations
**Module:** Module 2 — Addresses and Boundaries
**Mission:** M3 *IPv4 addresses: the second identity*

**Status: NOT YET REVIEWED.** No result is recorded in this document. Human UAT
is the Founder's, and nothing in the automated gates can substitute for it.

---

## 0. Read this first

This is the real authored course —
`content/curriculum/networking-foundations.json` — parsed by the same parser and
projected by the same projection a learner's browser receives. There is no copy
and no mock, so **teaching quality is the thing under review.** If the
instruction is confusing, out of order, or assumes something it never taught,
that is a finding and it is the most valuable kind this review produces.

### What is new in this round

**Mission 3 only.** Missions 1 and 2 are unchanged and have already passed.
Re-open them briefly to check nothing regressed, then spend your time on
Mission 3.

Mission 3 is the first mission of **Module 2**, and it is deliberately unlike
Module 1 in one obvious way: **there is no moving picture.** Missions 1 and 2
followed traffic across a topology because they were about traffic moving.
Mission 3 is about reading what a machine says about itself, so it shows you two
pieces of real command output instead. If it feels quieter than Module 1, that
is the intent — but whether it feels *flat* rather than *quiet* is exactly the
kind of judgement only you can make.

### The one thing this mission is really doing

Mission 3 must end **unresolved**. It teaches that a connection carries a second,
assigned identity, it teaches you to read it, and then it stops — because
knowing an address does not tell you which other addresses are nearby. That
missing piece is the whole of Mission 4.

So the mission is designed to leave you wanting something. **If you finish
Mission 3 feeling complete and satisfied, that is a finding**, not a success:
the handoff has not landed and Mission 4 will start from nowhere.

### What has NOT been done

- No curriculum has been published to any database.
- No migration has been executed.
- Missions 4 to 8 remain unauthored — titles and descriptions only.
- No lab, no live environment, no AI.

---

## 1. Pre-UAT health

### 1.1 What must be true before you start

Missions 1 and 2 already passed their UAT. Nothing in this slice changed them,
and the gates assert that. If they look different to you, stop and say so.

### 1.2 What you need running

The web app and the API, exactly as in the previous rounds. **No Supabase
project and no lab are required for this review** — the mission is authored
teaching that the harness reads from the file.

### 1.3 Where to go

The instructional UAT surface, the same one you used for Module 1. Select the
**Networking Foundations** document, then **Mission 3 — IPv4 addresses: the
second identity**.

---

## 2. The main sequence — do this in one sitting, in order

Read Mission 3 the way a beginner would: top to bottom, without skipping, and
without using what you already know about networking to fill a gap the text
left. Your expertise is the main risk to this review.

### 2.1 Step 1 — the question

You should be reminded of Mission 2's identity on PC-A's connection, and then
told why it is not enough: it says nothing about *where* the machine is.

The step ends by sending you to look at the machine rather than answering the
question itself.

- **Does the question actually land?** After reading it, do you *want* to know
  what the second identity is — or does it read as the course announcing a topic?
- **Is the criticism of the first identity fair and clear?** It should feel like
  a real limitation, not a manufactured one.
- The step must NOT contain the answer. If you can already tell what is coming
  because the text gave it away, that is a finding.

### 2.2 Step 2 — the first reading

Two lines of output from PC-A, under `ip address show eth0`.

**Before reading the caption's last sentence, try to do what it asks:** find the
line you have not seen before, and say which connection is holding it.

- **Could you find it?** The familiar line is the factory identity from
  Mission 2. The new one begins `inet`.
- **Is it obvious that this is displayed output and not a terminal?** The caption
  says nothing here offers to run anything. Does the surface support that — or
  does it look like something you should be able to type into?
- **Is showing only two lines honest or evasive?** Real output has many more.
  The caption says so. Judge whether that trade reads as protecting a beginner
  or as hiding something.

#### The `/24` is deliberate — do not report it as a leak

The address reads `192.168.1.10/24`, and **nothing in Mission 3 tells you what
the `/24` means.** That is approved and intentional, not an oversight and not a
deferred-vocabulary escape.

The line the project holds is narrow:

| | |
|---|---|
| **Visible unexplained artefact** | allowed, and required |
| **Name, explanation or interpretation** | not allowed until Mission 4 |

Trimming it would misrepresent what a machine actually prints, in the one
mission about confirming what a machine actually has. Mission 4 then returns to
the same artefact and gives meaning to something you have already looked at.

**What IS worth reporting** is the opposite failure: if anywhere in Mission 3
you can work out what the `/24` means, or the text calls it a prefix, a mask or
anything else, the handoff has been spent and Mission 4 has nothing left to
teach. Say so.

### 2.3 Step 3 — the distinction

The term **IPv4 address** arrives here, *after* you have already looked at one.

- **Does the comparison hold up?** MAC address: built in, unchanging, identifies
  the hardware. IPv4 address: assigned, changeable, says where the machine has
  been placed.
- **Is the plain-language version accurate?** "One identity is which hardware
  this is, and the other is where this machine belongs." That is deliberately
  informal. **If it is memorable but wrong, say so** — a catchy phrase that
  creates a false model is worse than no phrase.
- Does anything here feel like a definition dumped on you, rather than a name
  put to something you already saw?

### 2.4 Step 4 — the second reading

A different machine. The connection is called `enp0s3`, not `eth0`.

- **Did the different name throw you?** It is meant to — briefly. The point is
  that the connection name is where you look, not what you are looking for.
- **Is this genuinely a different case, or does it feel like the same exercise
  twice?** If it reads as filler repetition, that is a finding.

### 2.5 Step 5 — what transferred

Names the skill: you looked for four numbers separated by dots, under whichever
connection name the machine happened to use.

- Does this earn its place, or does it restate step 4 without adding anything?

### 2.6 Step 6 — the limit

This is the most important step in the mission to judge.

It asks whether you can now say which other addresses PC-A treats as local — and
the answer is that you cannot. Then it points back at the line you read in
step 2 and notes there is **a part after the address** you never accounted for.

- **Does the limit feel real, or manufactured?** You should feel you have been
  handed a genuine gap, not that the course is withholding something for effect.
- **Did you notice the unexplained part yourself before it was pointed out?**
  Either answer is useful. If you never noticed it, say so.
- **Crucially: does the mission avoid explaining it?** It must not. If you can
  work out what that part means from anything Mission 3 says, the mission has
  leaked Mission 4's content and the handoff is spent.

### 2.7 Step 7 — the handoff

Closes with the question: *what tells the machine where its local network ends?*

- **Do you want the answer?** That is the test.
- Is the closing question clear enough to be carried, or is it vague?

---

## 3. Judged as a whole

- **Cognitive load.** Seven steps, roughly 45 minutes. Is that right for what is
  taught, or is the mission thin for its length?
- **Rhythm against Module 1.** Module 1 was interactive and visual. This is
  reading. Is the change of pace welcome, or does the course lose momentum here?
- **Beginner completeness.** Is there any point where the text assumes something
  it never taught? That is BEGINNER-COMPLETE-1 and it is a blocking finding.
- **Respect for your time.** Anything here that repeats Mission 2 unnecessarily,
  or explains something twice, is a finding.

---

## 4. Accessibility

Using **Tab, Shift-Tab, Enter and Space only**:

- Reach every step in Mission 3 in order.
- Reach and read both blocks of command output.
- Confirm nothing in this mission requires a pointer.

Then read the mission with the screen reader you used for Module 1. Command
output is the risk here: confirm the output is announced as content you can read
rather than skipped as decoration, and that the caption reaches you *before* the
output it describes.

Anything unreachable or unannounced is a finding.

---

## 5. What the automated gates already checked

So you do not spend review time on them:

- Mission 3 is authored under its approved identity, in Module 2, position 0.
- Its three competency relationships are exactly as approved.
- Missions 4 to 8 remain unauthored.
- The output is shown before the term IPv4 is named.
- Two readings exist, on different connections with different addresses.
- The first reading reuses PC-A's exact factory identity from Mission 2.
- No later mission's vocabulary appears — no prefix, subnet, mask, ARP,
  broadcast, gateway, routing, packet, ping, DNS or DHCP.
- The `/24` is still shown, and still unnamed. Both halves are asserted, so
  neither a later edit that trims it nor one that explains it can pass quietly.
- PC-A is `192.168.1.10` and PC-B is `192.168.1.11`, each beside the exact
  factory identity Mission 2 showed for the same machine.
- No certification word appears anywhere a learner can see.
- Mission 3 authors no interaction, no assessment and no lab surface, so it can
  produce no competency evidence.

**None of that is evidence that the mission teaches.** That is what you are for.

---

## 6. Recording the result

Do not record a verdict in this file. Report findings in your own words, in the
order they mattered to you. If the mission is right, the most useful thing you
can say is which single step did the most work.

Two questions worth answering explicitly, whatever else you report:

1. Did you finish Mission 3 wanting to know what the rest of that line meant?
2. Was there any moment where you had to already know networking to follow it?
