# Lab Engine Features

**Platform Engine:** Lab Engine  
**Status:** Approved

---

# Purpose

The Lab Engine provides safe, repeatable, provider-independent hands-on technical environments that let students practice real skills.

It separates the learning application from the underlying infrastructure so the platform can begin with the existing Dell R620 / Proxmox environment and later move workloads to other cost-effective providers without redesigning the LMS.

Students interact with labs through the platform. They do not need to understand or administer the underlying virtualization platform.

---

# Engine Responsibilities

The Lab Engine owns:

- Lab definitions.
- Lab provider abstraction.
- Lab session lifecycle.
- Provisioning requests.
- Session startup and shutdown.
- Session reset and cleanup.
- Resource limits.
- Student-to-lab isolation.
- Lab health state.
- Connection/access metadata.
- Deterministic lab validation hooks.
- Lab expiration.
- Capacity-aware provisioning.
- Provider adapters such as Mock, Container, Proxmox, and future cloud providers.

---

# Non-Responsibilities

The Lab Engine does not own:

- Student competency truth.
- Evidence records.
- Curriculum content.
- Authentication.
- Notes.
- Certificate issuance.
- AI provider routing.
- Underlying Proxmox administration outside approved provider operations.
- General infrastructure monitoring unrelated to student labs.

Evidence Engine consumes validated lab outcomes. Platform/Operations systems monitor the infrastructure itself.

---

# Design Principles

Labs must be:

- Safe by default.
- Isolated by default.
- Repeatable.
- Resettable.
- Provider-independent.
- Cost-conscious.
- Accessible where technically possible.
- Easy for students to launch.
- Easy for the Founder to oversee.
- Automated wherever practical.
- Observable without overwhelming the Founder.
- Designed so the Founder is not the routine troubleshooting bottleneck.

A student should be able to click **Start Lab**, perform the work, validate it, and leave without manually contacting the Founder for routine provisioning.

---

# Lab Provider Progression

The platform should support this progression:

```text
Mock Provider
→ Local/Container Provider
→ Proxmox Provider on Dell R620 cluster
→ Additional cost-effective infrastructure providers
→ Optional cloud providers
```

Business logic must not depend directly on Proxmox.

---

# Current MVP Features

| Feature ID | Feature | Level | Status |
|---|---|---|---|
| LAB-001 | Lab Definition Model | Core | Specified |
| LAB-002 | Lab Provider Interface | Core | Specified |
| LAB-003 | Lab Session Lifecycle | Core | Specified |
| LAB-004 | Lab Provisioning and Capacity Control | Core | Approved |
| LAB-005 | Lab Access and Connection Delivery | Core | Approved |
| LAB-006 | Lab Reset, Cleanup, and Expiration | Core | Approved |
| LAB-007 | Lab Isolation and Safety Controls | Core | Approved |
| LAB-008 | Deterministic Lab Validation | Core | Approved |
| LAB-009 | Lab Health and Failure Recovery | Essential | Approved |
| LAB-010 | Mock Lab Provider | Core | Approved |
| LAB-011 | Container Lab Provider | Core | Approved |
| LAB-012 | Proxmox Lab Provider | Core | Approved |

---

# Feature Summary

## LAB-001 — Lab Definition Model

Defines a portable lab specification describing topology, resources, objectives, validation references, access methods, limits, and provider requirements.

## LAB-002 — Lab Provider Interface

Creates one provider contract so the LMS can request labs without knowing whether they run on a mock environment, containers, Proxmox, or a future cloud.

## LAB-003 — Lab Session Lifecycle

Tracks each student lab from request through provisioning, active use, validation, expiration, cleanup, and termination.

## LAB-004 — Lab Provisioning and Capacity Control

Allocates resources safely and prevents the lab platform from overcommitting available infrastructure.

## LAB-005 — Lab Access and Connection Delivery

Provides students with the approved connection information and access path for their assigned lab.

## LAB-006 — Lab Reset, Cleanup, and Expiration

Returns labs to a known state, removes abandoned sessions, and safely reclaims infrastructure.

## LAB-007 — Lab Isolation and Safety Controls

Separates student environments and prevents unintended access to other students, management systems, or protected networks.

## LAB-008 — Deterministic Lab Validation

Checks objective technical outcomes using explicit rules rather than AI-only judgment.

## LAB-009 — Lab Health and Failure Recovery

Detects failed or degraded sessions and supports safe recovery or reprovisioning.

## LAB-010 — Mock Lab Provider

Lets the full LMS lab workflow be developed and tested before real infrastructure is required.

## LAB-011 — Container Lab Provider

Supports lightweight labs for networking and Linux scenarios where containers are sufficient.

## LAB-012 — Proxmox Lab Provider

Connects the Lab Engine to the initial Dell R620 / Proxmox training infrastructure through an adapter.

---

# Dependencies

The Lab Engine depends on:

- AUTH-007 — Authentication Identity Context
- KERN-001 — Platform Configuration
- KERN-003 — Application Health Monitoring
- KERN-004 — Error Handling Framework
- KERN-005 — Audit Logging Foundation
- CURR-001 — Stable Curriculum IDs

It integrates with:

- Learning Engine
- Curriculum Engine
- Evidence Engine
- Operations Engine
- Notification Engine
- AI Orchestration Engine

---

# Founder Operating Principle

The Lab Engine should favor:

```text
Detect
→ Diagnose
→ Safe automated recovery when predefined
→ Prepare recommendation
→ Escalate only when necessary
```

The Founder should not routinely SSH into infrastructure to repair individual student labs.

---

# Next Feature

`LAB-001 — Lab Definition Model`
