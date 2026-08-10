# Certificate Engine Features

**Platform Engine:** Certificate Engine  
**Status:** Approved

---

# Purpose

The Certificate Engine issues, stores, verifies, presents, and manages certificates backed by trusted competency evidence.

A certificate represents verified achievement. It is not itself the evidence.

---

# Engine Responsibilities

The Certificate Engine owns:

- Certificate definitions.
- Eligibility requirements.
- Deterministic issuance.
- Certificate records.
- Certificate lifecycle.
- Verification.
- Student certificate portfolio.
- Export and sharing.
- Revocation/correction.
- Branding and presentation.

---

# Non-Responsibilities

The Certificate Engine does not own:

- Lab validation.
- Assessment scoring.
- Evidence creation.
- Competency definitions.
- Student progress.
- AI grading.
- Curriculum publication.

It consumes trusted evidence and competency state from approved Engines.

---

# Design Principles

Certificates must be:

- Evidence-backed.
- Deterministically issued.
- Versioned.
- Verifiable.
- Student-owned in presentation.
- Privacy-conscious.
- Revocable/correctable without deleting history.
- Portable.
- Independent from AI-only judgment.

A student does not earn a certificate merely by reaching 100% course completion.

---

# Current MVP Features

| Feature ID | Feature | Level | Status |
|---|---|---|---|
| CERT-001 | Certificate Definition Model | Core | Specified |
| CERT-002 | Certificate Eligibility Rules | Core | Specified |
| CERT-003 | Deterministic Certificate Issuance | Core | Specified |
| CERT-004 | Certificate Record and Lifecycle | Core | Approved |
| CERT-005 | Certificate Verification | Core | Approved |
| CERT-006 | Student Certificate Portfolio | Essential | Approved |
| CERT-007 | Certificate Export and Sharing | Essential | Approved |
| CERT-008 | Certificate Revocation and Correction | Core | Approved |
| CERT-009 | Certificate Branding and Presentation | Essential | Approved |

---

# Feature Summary

## CERT-001 — Certificate Definition Model

Defines the certificate identity, title, issuer, version, required competencies, evidence policy, and presentation metadata.

## CERT-002 — Certificate Eligibility Rules

Determines whether all approved competency/evidence requirements are satisfied.

## CERT-003 — Deterministic Certificate Issuance

Creates a certificate only after deterministic eligibility checks succeed.

## CERT-004 — Certificate Record and Lifecycle

Maintains active, superseded, expired, revoked, or corrected certificate state.

## CERT-005 — Certificate Verification

Allows authenticity and current status to be verified without exposing unnecessary private data.

## CERT-006 — Student Certificate Portfolio

Provides students with a private view of earned certificates.

## CERT-007 — Certificate Export and Sharing

Supports portable certificate files and future student-controlled share links.

## CERT-008 — Certificate Revocation and Correction

Preserves transparent history when a certificate must be invalidated, corrected, or superseded.

## CERT-009 — Certificate Branding and Presentation

Controls consistent certificate appearance, issuer information, competency summaries, and accessibility.

---

# Dependencies

The Certificate Engine depends on:

- AUTH-007 — Authentication Identity Context
- CURR-004 — Competency Definitions
- LEARN-003 — Competency State and Advancement
- EVID-001 through EVID-008
- KERN-005 — Audit Logging Foundation

---

# Certificate Principle

The platform should always be able to answer:

> Why was this certificate issued, which competencies were required, and which trusted evidence satisfied those requirements?

If that cannot be answered, issuance is not valid.

---

# AI Boundary

AI may:

- Explain certificate requirements.
- Summarize competencies.
- Help with student-facing descriptions.
- Explain why eligibility is incomplete.

AI may not:

- Mark a student eligible.
- Issue a certificate.
- Override missing evidence.
- Revoke or restore a certificate without approved workflow.

---

# Next Feature

`CERT-001 — Certificate Definition Model`
