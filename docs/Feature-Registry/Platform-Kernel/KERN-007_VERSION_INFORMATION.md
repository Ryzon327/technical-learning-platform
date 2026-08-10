# KERN-007 — Version Information

**Feature ID:** KERN-007  
**Feature Name:** Version Information  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** Platform Kernel  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Version Information provides a consistent way to identify the exact build, release, environment, and source revision running across the Technical Learning Platform.

It supports troubleshooting, rollback, release management, and Founder visibility.

---

# 2. Problem Statement

As the platform evolves, multiple versions may exist across:

- Local development.
- Test.
- Preview.
- Private beta.
- Production.
- Student application.
- Founder application.
- Lab services.

Without consistent version metadata, it becomes difficult to determine exactly what code is running when a problem occurs.

---

# 3. Student Value

Students benefit indirectly because support and troubleshooting can identify the exact release associated with an issue.

A student-facing version may be displayed only where useful, such as an About or Support view.

---

# 4. Founder Value

The Founder can quickly answer:

- What version is running?
- Was the latest release deployed?
- Which Git commit produced this build?
- Which environment is affected?
- Is the Founder application on the same release?

This reduces troubleshooting uncertainty.

---

# 5. Business Value

Version Information supports:

- Release discipline.
- Faster incident resolution.
- Rollback confidence.
- Change traceability.
- Support.
- Future deployment automation.

---

# 6. Included Scope

KERN-007 includes:

- Platform semantic version.
- Build identifier.
- Git commit or revision identifier.
- Build timestamp.
- Environment.
- Application identifier.
- Optional release channel.
- Safe public version summary.
- Detailed authenticated diagnostic version information.
- Version consistency checks where practical.

---

# 7. Explicitly Excluded Scope

KERN-007 does not include:

- Full release automation.
- Deployment orchestration.
- Changelog generation.
- Automatic rollback.
- Package publishing.
- Infrastructure version management.
- Database migration orchestration.

---

# 8. Version Model

The platform should use a consistent versioning convention.

Recommended initial approach:

```text
MAJOR.MINOR.PATCH
```

Example:

```text
0.1.0
```

Pre-1.0 versions represent MVP and beta development.

Release metadata may include:

```text
0.1.0
build: 20260810.3
commit: abc1234
environment: preview
```

---

# 9. Version Contract

A shared type may include:

```typescript
export interface PlatformVersion {
  version: string;
  buildId: string;
  commitSha?: string;
  builtAt: string;
  environment: string;
  application: string;
}
```

---

# 10. Dependencies

## Depends On

- KERN-001 — Platform Configuration

## Integrates With

- KERN-003 — Application Health Monitoring
- Founder Operations
- Deployment workflows
- Error Handling Framework

## Unlocks

- Reliable release diagnostics.
- Build-to-incident correlation.
- Future deployment dashboards.
- Version-aware support.

---

# 11. Security Requirements

Public version information must not expose:

- Internal repository URLs.
- Sensitive infrastructure names.
- Branch secrets.
- Credentials.
- Internal network addresses.

Detailed revision metadata should be restricted when exposing it publicly would create unnecessary risk.

---

# 12. Privacy Requirements

Version metadata contains no student personal data.

---

# 13. Accessibility Requirements

Any displayed version information must:

- Be text readable.
- support screen readers.
- be copyable.
- avoid color-only indicators.
- use understandable labels.

---

# 14. AI Usage

## AI Used

Optional.

## Responsible AI Agent

Platform Engineer.

## AI Responsibilities

AI may:

- Compare versions.
- identify deployment mismatch.
- correlate an error with a release.
- explain version information to the Founder.
- recommend rollback investigation.

## Human Approval Required

Yes for any rollback or deployment action.

## AI Limitations

AI may not:

- alter version metadata to hide changes.
- claim a deployment occurred without evidence.
- initiate production rollback without approval.

---

# 15. Operational Requirements

## Logging

Startup logs may safely record:

- Application.
- Environment.
- Platform version.
- Build ID.
- Sanitized revision identifier.

## Monitoring

Health endpoints may include safe version metadata for authorized diagnostics.

## Alerts

A version mismatch alert may be appropriate when tightly coupled services require compatible releases.

## Recovery

Rollback processes must be able to identify the previously known-good version.

---

# 16. Performance Considerations

Version information should be generated at build time and read cheaply at runtime.

It must not require external network requests during normal use.

---

# 17. Estimated Operational Cost

**Negligible.**

---

# 18. Risks and Mitigations

## Risk: Incorrect metadata

**Mitigation:** Generate automatically during build.

## Risk: Excessive public detail

**Mitigation:** Separate public and internal diagnostic views.

## Risk: Version drift between services

**Mitigation:** Surface version information in health and operational diagnostics.

## Risk: Manual version updates forgotten

**Mitigation:** Automate version metadata generation.

---

# 19. Acceptance Criteria

## Founder can

- identify the running platform version.
- identify the environment.
- identify the source revision when authorized.
- compare versions during troubleshooting.

## Platform can

- expose consistent version metadata.
- include version information in diagnostics.
- generate metadata automatically during build.
- distinguish applications and environments.

## Failure cases

- Missing optional Git metadata does not crash the application.
- Public views do not expose sensitive internal details.
- Invalid version metadata fails validation during build where practical.

---

# 20. Definition of Done

KERN-007 is complete when:

- Shared version type exists.
- Build process generates version metadata.
- Both application shells can report their version.
- Environment is included.
- Safe public and internal representations are defined.
- Health integration is documented.
- Tests pass.
- Security review passes.
- Accessibility checks pass.
- Founder approval is recorded.

---

# 21. Success Metrics

Success is demonstrated when:

- Every running application can identify its version.
- Founder can quickly correlate issues with releases.
- Manual version editing is unnecessary.
- Build metadata is reliable.
- Future rollback and deployment systems can consume the same metadata.

---

# 22. Implementation References

**Recommended Milestone:** `KERN-M7 — Version Information Foundation`  
**Roadmap Phase:** Phase 3 — MVP Development

Expected source areas:

```text
packages/shared-types/
packages/configuration/
apps/web/
apps/founder-admin/
scripts/
tests/
```

---

# 23. Future Extensions

Future extensions may include:

- Release channels.
- Automated changelog linkage.
- Deployment history.
- Service compatibility checks.
- Founder release dashboard.
- Automated rollback metadata.

These are outside the MVP.

---

# 24. Founder Approval

**Should this Feature exist?**

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

**Founder Notes:**

---

# 25. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-10 | Initial Feature specification |

---

# Platform Kernel Specification Status

After Founder approval of KERN-007, all initial Platform Kernel Features are specified.

Next Engine:

`Authentication Engine`
