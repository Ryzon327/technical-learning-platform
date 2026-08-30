# Product Company Operating System

**Technical Learning Platform**
**Version:** 1.0

---

# Mission

The Product Company Operating System defines **what** the company builds.

It ensures every feature, course, lab, AI capability, and business initiative aligns with the company's mission, constitution, and long-term vision.

This document is the authoritative guide for product strategy and product decisions.

---

# Product Mission

Create the most practical, encouraging, and immersive technical learning platform for IT and cybersecurity professionals.

Students should leave the platform with real capability, confidence, and evidence of their skills—not just course completion.

---

# Product Principles

Every product decision must support one or more of these principles:

* Respect the student's time.
* Teach practical skills.
* Encourage rather than shame.
* Build confidence through competency.
* Reduce founder workload.
* Automate repetitive work.
* Prioritize clarity over complexity.
* Build modularly.
* Stay accessible.
* Stay secure.
* Avoid unnecessary scope.

---

# Product Boundaries

The product exists to help students learn technical skills through structured, practical experiences.

The product does **not** exist to maximize:

* Screen time.
* Daily active users through manipulation.
* Addictive engagement.
* Artificial competition.
* Vanity metrics.

Student success is the primary metric.

---

# Primary Customer

The initial customer is an adult learner who wants practical skills in:

* IT
* Networking
* Windows Administration
* Linux Administration
* Virtualization
* Cybersecurity
* SOC Operations
* Detection Engineering
* Ethical Hacking

Many students will:

* Work full time.
* Have families.
* Be veterans.
* Be career changers.
* Be self-taught.
* Be returning to education after years away.

The product should respect these realities.

---

# Product Promise

Every course should answer:

* Why does this matter?
* When would I use it?
* How is it used professionally?
* How do I prove I can do it?
* What comes next?

Students should never wonder why they are learning something.

---

# Learning Philosophy

Learning progresses through competency rather than content consumption.

Preferred flow within a single learning experience:

```text
Understand
→ Practice
→ Apply
→ Troubleshoot
→ Validate
→ Reflect
→ Demonstrate Competency
```

Watching videos alone is never the objective. Learning by doing is the default
instructional model, not an enhancement layered on top of content.

Across learning experiences, demonstrated competencies are deliberately reused
and combined rather than left behind:

```text
Learn → Practice → Demonstrate → Reuse → Connect → Troubleshoot → Retain
```

Course completion alone is not evidence of durable learning.

The authoritative treatment of this lifecycle, of reinforcement through reuse and
of cross-domain integration is `docs/Learning-OS/Learning-OS.md`.

---

# Product Structure

The product follows this hierarchy:

```text
Learning Path
└── Course
    └── Module
        └── Mission
            ├── Lesson
            ├── Demonstration
            ├── Activity
            ├── Lab
            ├── Validation
            ├── Reflection
            └── Evidence
```

Every level exists to prepare the student for meaningful technical work.

---

# MVP Learning Paths

The first release proves **one connected technical-foundations experience**, not a
catalog of separate courses.

Working learning path: **IT & Cybersecurity Foundations**

| # | Experience | Role in the path |
|---|---|---|
| 01 | **Networking Foundations** | **develops** the reusable foundational `net.*` competencies |
| 02 | **Router-on-a-Stick / Build the Network** | the substantive networking course; **applies and reinforces** the foundations |
| 03 | **Linux Fundamentals** | focused hands-on experience; **reuses** networking |
| 04 | **Windows Fundamentals** | focused hands-on experience; reinforces networking, compares with Linux |
| 05 | **Security Fundamentals / Secure the Environment** | intentionally integrates networking, Linux and Windows |
| 06 | **Integrated Challenge** | a fresh deterministic environment combining prior competencies |

> **Amended by DEC-053.** Networking Foundations was inserted ahead of
> Router-on-a-Stick after the BEGINNER-COMPLETE-1 audit established that
> Router-on-a-Stick begins above the floor the Zero-Assumption Learning Gate
> sets. This also brings the MVP path into agreement with
> `PLATFORM_BLUEPRINT.md` section 6.1, which already placed Networking
> Foundations ahead of enterprise networking work.

The point of this sequence is the **connection between the experiences**, not the
count of courses.

* Networking Foundations teaches what a network is made of, how to talk to a
  device, addresses and subnet boundaries, how to prove something works, and how
  a switch moves traffic. It **develops** the foundational competencies every
  later course reuses.
* Router-on-a-Stick covers VLANs, access versus trunk behaviour, 802.1Q,
  inter-VLAN routing, connectivity verification and practical troubleshooting,
  with hands-on labs proving configuration and troubleshooting capability. It
  **reinforces** the foundational addressing, gateway and subnet competencies in
  context rather than teaching them for the first time.
* Linux and Windows are focused hands-on experiences rather than long survey
  courses. Each **requires** the networking competency already demonstrated
  instead of treating it as forgotten history.
* Security Fundamentals is not a collection of definition videos. It introduces
  foundational security concepts and requires learners to apply prior
  networking, Linux and Windows knowledge.
* The Integrated Challenge presents a realistic problem **without telling the
  learner which technology is being tested**.

Detailed lesson plans, module breakdowns and completion-time estimates are
deliberately **not** specified here. They require separate Founder approval.

Proxmox may execute applicable labs as an infrastructure provider beneath the Lab
Engine abstraction. **It is not a student course, not the learning domain model,
and students never receive hypervisor administrative access.**

Future pathways are intentionally deferred; see `docs/Project/NOT_NOW.md`.

---

# Product Differentiators

The platform differentiates itself by combining:

* Practical labs.
* Platform-provided environments.
* AI mentoring.
* Competency validation.
* Structured progression.
* Student-owned notes.
* Evidence of capability.
* Encouraging learning experience.
* Founder automation.

The differentiator is the complete experience—not a single feature.

---

# Success Metrics

Product success is measured by outcomes rather than activity.

Examples:

* Students complete courses.
* Students complete labs.
* Students demonstrate competency.
* Students earn certificates.
* Students return because the platform provides value.
* Students obtain technical employment.
* Students recommend the platform.

The product should avoid optimizing for metrics that do not improve learning.

---

# Product Lifecycle

Every feature progresses through:

```text
Idea
→ Approved
→ Planned
→ Design
→ Implementation
→ Testing
→ Review
→ Complete
→ Maintenance
→ Retirement
```

Only approved features may enter implementation.

---

# Feature Ownership

Every feature must:

* Have one owning engine.
* Have one business purpose.
* Have defined acceptance criteria.
* Have documented dependencies.
* Have a current lifecycle state.

No feature may exist without an owner.

---

# Scope Control

Scope expansion is prohibited during implementation.

New ideas must be evaluated using these questions:

1. Does it improve learning?
2. Does it reduce founder workload?
3. Does it improve reliability?
4. Does it improve accessibility?
5. Does it improve security?
6. Does it support the current roadmap?

If the answer is no, the idea belongs in `NOT_NOW.md`.

---

# Product Decision Process

Product decisions follow this sequence:

1. Identify the problem.
2. Validate the need.
3. Evaluate alternatives.
4. Confirm alignment with the Blueprint.
5. Record the decision if necessary.
6. Schedule the work.
7. Implement.
8. Measure results.

The product should evolve intentionally rather than reactively.

---

# Long-Term Product Vision

Future expansion may include:

* AWS Cloud Engineering
* Kubernetes
* Databases
* DevOps
* GRC
* Software Development
* Career Simulation
* Recruitment
* Employer Portal
* Contract-to-Hire
* Direct Hire
* Enterprise Training

These initiatives remain outside the MVP until the LMS proves itself.

---

# Product Definition of Success

The product succeeds when students say:

> "I can actually do this job now."

That statement is more valuable than any completion percentage, engagement statistic, or vanity metric.

---

# Ownership

**Primary Owner:** Founder

The founder defines:

* Vision
* Priorities
* Product direction
* Student experience
* Roadmap

Claude and future contributors implement the approved vision but do not redefine it.

---

# Revision Policy

This Company Operating System is a living document.

It should evolve carefully as the company grows while remaining consistent with the Platform Blueprint.

