# Technical Learning Platform Blueprint

**Document status:** Approved architecture
**Version:** 1.0
**Current phase:** Pre-implementation
**Authority:** This document is the primary source of truth for product, architecture, learning design, AI behavior, security, accessibility, infrastructure, and implementation decisions.

Claude, Lovable, AI agents, contractors, and future employees must follow this Blueprint. They may not reinterpret the product, expand the MVP, or replace approved architecture without an explicit recorded decision.

---

# 1. Product Vision

Build a modern, immersive technical apprenticeship platform that develops competent, confident, and employable IT and cybersecurity professionals through:

* Structured learning paths.
* Interactive lessons.
* Platform-provided virtual labs.
* Automated competency validation.
* Context-aware AI mentoring.
* Evidence-based capability records.
* High-quality course-completion certificates.
* Founder-focused automation.

The platform must teach students how to perform real technical work, not merely how to watch content, memorize definitions, or pass quizzes.

The long-term platform may expand into talent recruitment, staffing, contract-to-hire, direct hire, career simulations, employer services, and additional technical pathways. Those capabilities are not part of the initial LMS MVP.

---

# 2. North Star

> Create competent, confident, and employable technical professionals without wasting their time, pressuring their pace, or ignoring the realities of adult life.

Every proposed feature must support at least one of the following:

1. Improve learning outcomes.
2. Improve student experience.
3. Improve accessibility.
4. Improve security.
5. Reduce founder workload.
6. Reduce operational cost.
7. Improve reliability.
8. Improve maintainability.
9. Support sustainable business growth.

Features that do not satisfy one of these purposes belong in `NOT_NOW.md`.

---

# 3. Product Constitution

## 3.1 Respect the student’s time

The platform recognizes that students may have:

* Jobs.
* Families.
* Military obligations.
* Health concerns.
* School responsibilities.
* Financial responsibilities.
* Unpredictable schedules.

The platform must not use:

* Daily-login pressure.
* Learning streaks.
* Guilt-based reminders.
* Punitive inactivity notices.
* Artificial deadlines.
* Unnecessary countdowns.
* Forced study schedules.
* Rankings based on speed.
* Pressure to compete with other students.

Self-paced learning is the default.

Estimated lesson and lab durations are planning guidance, not deadlines.

Timers may only be used when time is genuinely part of the competency, such as an incident-response simulation or an optional certification-style exam.

## 3.2 Respect student autonomy

The platform recommends, guides, and explains.

It does not unnecessarily control.

Students may:

* Pause and resume.
* Revisit completed material.
* Use optional study resources.
* Control AI assistance levels.
* Control reminders.
* Edit learning goals.
* Export their notes.
* Prove existing competency to advance.

Students may not bypass genuine safety, authorization, ethical-hacking, licensing, or security requirements.

## 3.3 Adapt teaching without lowering standards

Teaching methods may adapt based on:

* Prior knowledge.
* Demonstrated competency.
* Student goals.
* Assistance preference.
* Learning behavior.
* Accessibility settings.
* Student feedback.

The competency standard remains consistent.

## 3.4 Encourage rather than shame

Failure is treated as useful evidence.

The platform should say:

* “Let’s inspect the result.”
* “You completed this part correctly.”
* “Your current configuration gives us useful evidence.”
* “Here is the next troubleshooting step.”

The platform must not say:

* “You failed again.”
* “You are behind.”
* “Your performance is poor.”
* “Other students completed this faster.”

## 3.5 Build independent professionals

The goal is not to create permanent AI dependency.

The AI should gradually shift from:

* Teacher.
* To coach.
* To professional peer.

Students should become increasingly capable of:

* Researching.
* Troubleshooting.
* Reading documentation.
* Taking useful notes.
* Explaining decisions.
* Working independently.

## 3.6 The founder must not become the bottleneck

The platform must be operable by a founder who is not a professional software developer.

The system must:

* Explain technical actions in plain language.
* Automate repetitive operations.
* Provide previews before major changes.
* Preserve rollback options.
* Maintain documentation automatically.
* Present actionable alerts.
* Avoid requiring routine direct database edits.
* Avoid requiring routine command-line administration.
* Reduce founder workload over time.

## 3.7 Build like LEGO, not concrete

Major capabilities must be modular, replaceable, and independently maintainable.

No provider, platform, AI company, hypervisor, storage service, or access product should become inseparable from the application.

---

# 4. Product Boundaries

A feature enters the active roadmap only when it:

* Supports the current product phase.
* Improves learning.
* Improves security.
* Improves reliability.
* Reduces founder workload.
* Reduces cost.
* Supports approved business goals.
* Has a clearly assigned owner module.
* Has acceptance criteria.

A feature must not be implemented merely because it is modern, interesting, popular, or technically possible.

No feature may exist without an owning engine.

---

# 5. Immediate Business Scope

The first business is the LMS and technical apprenticeship platform.

The initial objective is to:

1. Build the LMS.
2. Run it locally.
3. Connect one real networking lab.
4. Connect one real Windows lab.
5. Run a controlled beta.
6. Learn how students use the platform.
7. Improve reliability and automation.
8. Establish sustainable course operations.

Recruitment, staffing, contract-to-hire, direct hire, employer portals, and talent matching are future expansions.

---

# 6. Learning Model

## 6.1 Structured competency-based progression

Learning paths are intentionally ordered based on real technical dependencies.

Students should not be presented with an unrestricted catalog where all courses appear equally appropriate.

The default progression is guided.

Example:

Computer Foundations
→ Networking Foundations
→ Windows and Linux Foundations
→ Proxmox and Virtualization
→ Windows Domain Services
→ Enterprise Networking
→ Security Monitoring
→ SOC Operations
→ Ethical Hacking

## 6.2 Competency overrides chronology

Students must not repeat material they have already mastered.

They may advance by:

* Completing the course.
* Passing a readiness assessment.
* Completing a practical challenge.
* Demonstrating validated competency.
* Receiving an approved equivalency later.

Students cannot advance merely by selecting “skip.”

Capabilities determine progression, not watch time or completion percentages.

## 6.3 Content hierarchy

The standard educational hierarchy is:

```text
Learning Path
└── Course
    └── Module
        └── Mission
            ├── Lesson content
            ├── Demonstration
            ├── Interactive activity
            ├── One or more labs
            ├── Validation
            ├── Reflection
            └── Evidence
```

Courses contain multiple modules.

Modules contain multiple missions.

Missions may contain multiple labs.

Each course ends with a capstone mission.

## 6.4 Mission-based learning

Labs and lessons should represent meaningful work.

Examples:

* Configure a VLAN.
* Repair a broken trunk.
* Deploy a Windows domain controller.
* Resolve a DNS failure.
* Investigate suspicious PowerShell activity.
* Document an approved infrastructure change.

Students should understand:

* The business context.
* The objective.
* The technical environment.
* The success criteria.
* Why the activity matters.

## 6.5 Progressive realism

Beginner missions provide context and guidance.

Intermediate missions use work tickets.

Advanced missions use operational requests.

SOC missions use alerts and incidents.

Ethical-hacking missions use approved scope and Rules of Engagement.

---

# 7. Learning Foundations and Success Center

The platform should teach students how to:

* Study technical material.
* Take useful technical notes.
* Read documentation.
* Troubleshoot methodically.
* Research effectively.
* Use AI responsibly.
* Retain information.
* Avoid burnout.
* Communicate professionally.
* Document technical work.

These resources live in an optional **Success Center**.

Students may start technical learning immediately.

The Success Center is:

* Always available.
* Never punitive.
* Never required without a genuine prerequisite.
* Recommended only when it could provide useful support.

---

# 8. Student Goals and Reflection

## 8.1 Open-ended onboarding

Onboarding begins with an open question:

> What would you love to accomplish during this learning journey?

The student may describe:

* Career goals.
* Technical goals.
* Current experience.
* Confidence concerns.
* Personal motivation.
* Constraints.
* Desired outcomes.

The platform preserves the student’s original wording.

The AI may ask a small number of meaningful follow-up questions, then stop.

## 8.2 Living goals

Goals may evolve.

Students can:

* Edit goals.
* Add goals.
* Pause goals.
* Mark goals achieved.
* View how their learning path connects to their goals.

## 8.3 Reflection must return value

Reflections are optional and never graded.

A reflection must provide value through:

* Personalized coaching.
* Suggested review.
* Goal alignment.
* Improved AI support.
* Course improvement.
* Optional support escalation.

The platform must not ask students questions that provide no meaningful benefit.

---

# 9. Notes and Knowledge Engine

The note-taking experience should feel like a focused technical version of Notion.

It supports:

* Rich text.
* Headings.
* Lists.
* Tables.
* Checklists.
* Code blocks.
* Syntax highlighting.
* Terminal output.
* Images.
* Screenshots.
* Links.
* Tags.
* Search.
* Version history.
* Lesson anchors.
* Lab anchors.
* Optional AI summaries.
* Export.

Notes support learning but must not dominate the interface.

Students can highlight content and select:

* Add to notes.
* Explain with AI.
* Save as command.
* Add to glossary.
* Bookmark.

Student notes belong to the student.

---

# 10. Student Experience

## 10.1 Landing page

The visitor should immediately understand:

* What the platform does.
* Who it serves.
* What practical outcomes it provides.

Primary message:

> Learn IT and cybersecurity by building real environments—not just watching videos.

## 10.2 Dashboard

The dashboard answers four questions:

1. What am I working on?
2. Where did I stop?
3. What have I accomplished?
4. What should I do next?

The dashboard remains calm and focused.

## 10.3 Course experience

Every course clearly displays:

* Purpose.
* Prerequisites.
* Estimated effort.
* Capabilities.
* Labs.
* Accessibility information.
* Whether anything is timed.
* The next recommended action.

## 10.4 AI Mentor

The AI Mentor is:

* Persistent.
* Context-aware.
* Optional.
* Quiet by default.
* Supportive.
* Technically precise.
* Never overbearing.

Assistance modes:

* Quiet.
* Supportive.
* Guided.

## 10.5 Hint ladder

The mentor should provide help progressively:

1. Concept reminder.
2. Observation prompt.
3. Diagnostic direction.
4. Command family.
5. Partial example.
6. Complete answer when requested or permitted.

---

# 11. Lab Platform

## 11.1 Platform-provided labs

Every required activity must be completable using resources supplied through the platform.

Student-owned hardware, Cisco CML, GNS3, Packet Tracer, and physical equipment may be optional alternatives.

They are not required for standard completion.

## 11.2 Lab types

The platform supports:

* Browser simulations.
* Container-based labs.
* Full virtual-machine labs.
* Nested virtualization only when necessary.
* External lab mode.

## 11.3 External mode

Students may use:

* Their own hardware.
* CML.
* GNS3.
* Packet Tracer where appropriate.
* Other approved environments.

External mode may use:

* Validation utilities.
* Structured configuration uploads.
* Evidence submission.
* Instructor review later.

## 11.4 Lab lifecycle

```text
Draft
→ AI-generated draft
→ Technical validation
→ Safety validation
→ Accessibility validation
→ Founder review
→ Published
→ Student launch
→ Validation
→ Evidence
→ Analytics
→ Improvement
```

## 11.5 Lab controls

Where technically feasible, labs support:

* Launch.
* Pause.
* Resume.
* Reset.
* Snapshot.
* Replay.
* Destroy.

## 11.6 Automated validation

Validation is deterministic and separate from AI.

Validation layers include:

* Configuration.
* State.
* Connectivity.
* Services.
* Security.
* Packet behavior.
* Evidence.
* Explanation.

The AI may explain validation results but cannot mark competency complete.

---

# 12. Networking Training Environment

The platform will not distribute Cisco IOS or proprietary Cisco software.

The platform will provide an original command-line training environment backed by real networking behavior.

Possible underlying components:

* FRRouting.
* Open vSwitch.
* Linux bridges.
* Linux network namespaces.
* Containerlab.
* Packet capture tools.

The interface may use familiar industry command patterns while remaining clearly identified as the platform’s own training environment.

Required networking subjects include:

* IPv4.
* Subnetting.
* ARP.
* ICMP.
* TCP and UDP.
* VLANs.
* Access ports.
* Trunks.
* 802.1Q.
* Native VLANs.
* Router-on-a-stick.
* Subinterfaces.
* SVIs.
* Inter-VLAN routing.
* Static routing.
* OSPF.
* DHCP.
* DNS.
* NAT.
* ACLs.
* Troubleshooting.
* Packet analysis.

---

# 13. Ethical-Hacking Protections

Offensive-security content requires:

* Verified account.
* Current Terms acceptance.
* Acceptable Use Policy acceptance.
* Ethical Hacking Agreement acceptance.
* Rules of Engagement acceptance.
* Ethics prerequisite.
* Authorization prerequisite.
* Safety assessment.
* Per-lab scope acknowledgment.

Technical controls must enforce:

* Student isolation.
* Default-deny networking.
* No route to the founder’s home network.
* No route to Proxmox management.
* No route to another student.
* Restricted Internet egress.
* Resource limits.
* Expiring sessions.
* Audit logging.
* Emergency termination.

Agreements support security controls but do not replace them.

Legal documents are AI-drafted and professionally reviewed before commercial publication.

---

# 14. Accessibility

Accessibility is a core engineering requirement.

The platform targets WCAG 2.1 Level AA at minimum.

It must support:

* Keyboard navigation.
* Screen readers.
* Semantic HTML.
* Visible focus.
* Proper form labels.
* Sufficient contrast.
* Resizable text.
* Reduced motion.
* Captions.
* Transcripts.
* Accessible diagrams.
* Non-color indicators.
* Accessible error messages.
* Accessible assessments.
* Pausing and resuming.
* Alternative interaction methods.

Network topologies must have structured text alternatives.

Terminals must support:

* Keyboard use.
* Copyable output.
* Font resizing.
* High contrast.
* Searchable history.
* Clear prompts.
* Non-color state indicators.
* Plain-text output alternatives where needed.

Accessibility testing is part of the Definition of Done.

---

# 15. AI Architecture

## 15.1 AI provider independence

All AI requests pass through an AI Gateway.

The application must not depend directly on one model provider.

Supported adapters may eventually include:

* Claude.
* OpenAI.
* Gemini.
* Local models.
* Future providers.

## 15.2 Initial AI agents

The MVP includes:

### Student AI Mentor

Supports learning and labs.

### Platform Engineer

Supports the founder with:

* GitHub.
* Local development.
* Docker.
* Supabase.
* Lovable.
* Deployments.
* Proxmox.
* Monitoring.
* Backups.
* Recovery.
* Plain-language diagnostics.

### Founder Analytics

Summarizes:

* Student progress.
* Course health.
* Lab health.
* Infrastructure usage.
* AI cost.
* Actionable improvements.

## 15.3 Future agents

Future agents may include:

* Study Coach.
* Knowledge Librarian.
* Lab Engineer.
* Course Maintenance AI.
* Strategic Advisor.
* AI coworkers.
* AI project managers.

## 15.4 AI guardrails

Each AI agent has:

* One defined role.
* Allowed actions.
* Prohibited actions.
* Limited tools.
* Limited memory.
* Structured outputs.
* Cost limits.
* Audit logging.
* Stop conditions.
* Human approval gates.

AI may prepare high-impact changes.

It may not publish or deploy them without approval.

---

# 16. System Architecture

The platform uses modular engines.

```text
Platform Core
├── Authentication Engine
├── Learning Engine
├── Course Engine
├── Lab Engine
├── Knowledge Engine
├── AI Gateway
├── Evidence Engine
├── Certificate Engine
├── Search Engine
├── Analytics Engine
├── Operations Engine
└── Future Engines
```

Each engine has one primary responsibility.

Modules communicate through defined interfaces.

No engine may directly manipulate another engine’s internal data without an approved contract.

---

# 17. Infrastructure Architecture

## 17.1 Application platform

The SaaS application contains:

* Marketing website.
* Authentication.
* Student portal.
* Founder portal.
* Courses.
* Notes.
* AI.
* Progress.
* Evidence.
* Certificates.
* Administration.

## 17.2 Lab platform

The lab platform contains:

* Lab API.
* Job queue.
* Scheduler.
* Proxmox Provider.
* Containerlab Provider.
* Validation service.
* Access gateway.
* Monitoring.
* Cleanup automation.

The student browser never accesses Proxmox directly.

## 17.3 Initial hardware

Three Dell R620 servers are available as the initial lab pool.

The rollout should be:

1. One-server proof.
2. Add a second worker.
3. Add resilience and backup capacity.
4. Replace or expand hardware gradually.

The R620s are the starting platform, not the permanent destination.

## 17.4 Provider pattern

Replaceable provider interfaces include:

* AIProvider.
* LabProvider.
* LabAccessProvider.
* DatabaseProvider.
* StorageProvider.
* VideoProvider.
* EmailProvider.
* PaymentProvider.
* MonitoringProvider.

## 17.5 Development progression

```text
Local prototype
→ GitHub
→ Local Supabase
→ Lovable development
→ Managed Supabase beta
→ Hosted application
→ Proxmox lab integration
→ Production expansion
```

---

# 18. GitHub and Repository Rules

GitHub is the source of truth for:

* Code.
* Blueprint.
* Prompts.
* Decisions.
* Database migrations.
* Lab definitions.
* Validation definitions.
* Infrastructure configuration.
* Documentation.
* Build status.

GitHub must never contain:

* Passwords.
* API keys.
* Private keys.
* Production secrets.
* Student information.
* Windows product keys.
* Licensed operating-system images.
* Real database backups.
* Proxmox credentials.

Every milestone ends with:

* Files inspected.
* Existing work reused.
* Files created.
* Files modified.
* Tests performed.
* Documentation updated.
* Recommended commit message.

---

# 19. Claude Implementation Rules

Claude is the implementation engineer, not the product architect.

Claude must:

1. Read this Blueprint.
2. Read `CURRENT_BUILD_STATUS.md`.
3. Read `DECISION_LEDGER.md`.
4. Read `FEATURE_REGISTRY.md`.
5. Read `NOT_NOW.md`.
6. Inspect existing files before creating anything.
7. Reuse existing components.
8. Make the smallest valid change.
9. Work on one milestone at a time.
10. Stay inside the assigned engine.
11. Update documentation.
12. Run relevant tests.
13. Stop when acceptance criteria are satisfied.

Claude must not:

* Recreate completed work.
* Regenerate unchanged files.
* Add unrequested features.
* Reopen brainstorming.
* Expand the MVP.
* Replace working architecture.
* Introduce a new framework without approval.
* Modify production directly.
* Publish content automatically.
* Store secrets.
* Hide implementation decisions.
* Say “I also added” and introduce unrelated functionality.

Suggestions belong in a separate recommendation section and must not be implemented automatically.

---

# 20. MVP Scope

The MVP must prove one complete student experience.

A student must be able to:

1. Register.
2. Describe their goals.
3. Receive a structured learning path.
4. Prove existing competency where appropriate.
5. Begin a course.
6. Complete lessons and missions.
7. Take notes.
8. Ask the AI Mentor for help.
9. Launch a platform-provided lab.
10. Complete real technical work.
11. Receive automated validation.
12. Create evidence.
13. Earn a capability-based certificate.
14. Continue to the next appropriate mission.
15. Complete this journey without routine founder intervention.

## MVP learning path

Initial Technical Foundations pathway:

1. Computer Foundations.
2. Networking Foundations.
3. Windows Foundations.
4. Linux Foundations.
5. Proxmox Foundations.
6. Windows Domain Foundations.

Courses contain multiple modules, missions, and labs.

## MVP AI agents

* Student AI Mentor.
* Platform Engineer.
* Founder Analytics.

## MVP lab modes

* Guided.
* Assisted.
* Independent.

## MVP exclusions

The following are explicitly deferred:

* Recruitment.
* Staffing.
* Employer portal.
* Contract-to-hire.
* Career Simulator.
* AI coworkers.
* Agile sprint simulations.
* AWS pathway.
* Kubernetes pathway.
* Database pathway.
* Software development pathway.
* DevOps pathway.
* Platform Engineering pathway.
* GRC pathway.
* Multiple instructors.
* Live cohorts.
* Community features.
* Mobile applications.
* Enterprise multi-tenancy.

---

# 21. Founder OS

The founder experience must provide:

* Daily operational summary.
* Founder inbox.
* Approval Center.
* Platform health.
* Lab health.
* Course health.
* Student success trends.
* AI cost summaries.
* Infrastructure capacity.
* Suggested improvements.
* Project status.
* Decision history.
* Recovery guidance.

The founder should focus on:

* Vision.
* Quality.
* Business decisions.
* Student value.
* Course direction.

The founder should not routinely:

* Provision student labs manually.
* Edit database records.
* rebuild videos manually.
* issue ordinary certificates manually.
* diagnose raw infrastructure logs.
* run complicated deployments.
* copy content between systems.
* troubleshoot repetitive platform issues.

---

# 22. Course Maintenance

Course content must be modular and versioned.

When a course changes, the system must:

1. Accept a plain-language change request.
2. Analyze impact.
3. Identify affected assets.
4. Reuse unaffected assets.
5. Regenerate only affected content.
6. Run tests.
7. Generate accessibility assets.
8. Present a preview.
9. Require approval.
10. Publish a new version.
11. Preserve rollback.

AI-generated videos must store:

* Script.
* Scene list.
* Narration.
* Audio segments.
* Captions.
* Transcript.
* Storyboard.
* Visual assets.
* Render settings.
* Version.

A small change must not regenerate the entire course.

---

# 23. Security Principles

The platform uses:

* Least privilege.
* Role-based access.
* Resource ownership.
* Row-Level Security.
* MFA for founder administration.
* Service identities.
* Secret scanning.
* Input validation.
* Output encoding.
* Secure sessions.
* Rate limiting.
* File-upload restrictions.
* Audit logging.
* Backups.
* Restore testing.
* Separate development, test, and production environments.

The public application, management environment, student labs, and home network are separate trust zones.

---

# 24. Definition of Done

A feature is complete only when:

* Acceptance criteria pass.
* Existing work was reused where appropriate.
* Tests pass.
* Type checks pass.
* Accessibility checks pass.
* Security checks pass.
* Documentation is updated.
* Feature Registry is updated.
* Current Build Status is updated.
* No secrets are included.
* No unrelated features were added.
* Founder-facing behavior is understandable.
* Recovery or rollback is documented where applicable.

A feature is not complete merely because the code was generated.

---

# 25. Build Sequence

Implementation follows this order:

1. Repository and documentation foundation.
2. Local development environment.
3. Design system.
4. Platform Core.
5. Authentication Engine.
6. Student onboarding and goals.
7. Learning Engine.
8. Course Engine.
9. Knowledge Engine.
10. AI Gateway and AI Mentor.
11. Mock Lab Provider.
12. Evidence Engine.
13. Certificate Engine.
14. Founder Operations.
15. Containerlab networking proof.
16. Proxmox Provider.
17. First Windows lab.
18. Security and accessibility validation.
19. Private beta.
20. Paid limited release.

Claude may not skip ahead without an approved dependency reason.

---

# 26. Current Status

The architecture and product plan are approved.

GitHub is configured.

The repository foundation exists.

The next required artifact is:

`MASTER_BUILD_PROMPT.md`

After that, implementation begins with the local development foundation.

---

# 27. Final Authority Rule

When sources conflict, use the following order:

1. Explicit founder instruction.
2. Platform Blueprint.
3. Decision Ledger.
4. Current Build Status.
5. Feature Registry.
6. Roadmap.
7. Existing implementation.
8. AI recommendation.

AI recommendations never override approved founder decisions.

