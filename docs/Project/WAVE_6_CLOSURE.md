# Wave 6 Closure — Lab Engine MVP

**Project:** Technical Learning Platform  
**Wave:** Build Wave 6  
**Engine:** Lab Engine  
**Closure Date:** 2026-08-12  
**Status:** Pending completion-review verification

## Closure Rule

This document may be committed as an implementation closure only after:

```bash
bash scripts/verify-lab-engine-completion.sh
```

returns:

```text
LAB ENGINE COMPLETION CHECK PASSED
```

## Exit Criterion

Wave 6 requires a governed real practical-lab loop through the LMS:

- request/launch;
- student-owned session;
- provider-neutral orchestration;
- safe access;
- deterministic validation;
- bounded reset;
- expiration;
- cleanup;
- recovery;
- no provider administrative access for the student.

A Mock Provider alone is not sufficient for the Wave 6 exit criterion.

## Provider Strategy

The Lab Engine remains provider-independent.

The Mock Provider proves orchestration without infrastructure dependencies.

The Container Provider supplies the first real runtime adapter. It is hardened, canary-gated, and subject to explicit rollout controls.

Proxmox remains a provider-specific extension unless a selected MVP course requires virtual-machine or network-device capabilities that the Container Provider cannot satisfy.

## Evidence Boundary

Lab Engine owns objective validation truth.

Wave 7 Evidence Engine will convert trusted Lab validation results into durable competency evidence.

Lab Engine must not prematurely own canonical Evidence Records.
