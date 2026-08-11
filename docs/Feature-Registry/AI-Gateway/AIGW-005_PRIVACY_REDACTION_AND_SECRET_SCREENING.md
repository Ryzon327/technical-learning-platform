# AIGW-005 — Privacy, Redaction, and Secret Screening

**Feature ID:** AIGW-005  
**Feature Name:** Privacy, Redaction, and Secret Screening  
**Feature Level:** Level 1 — Core  
**Lifecycle Status:** Specified  
**Owning Platform Engine:** AI Gateway  
**Governing Company Operating System:** Platform Operating System  
**Product Owner:** Founder

---

# 1. Feature Summary

Privacy, Redaction, and Secret Screening minimizes unnecessary personal data and blocks likely credentials or secrets from being sent to AI providers.

---

# 2. Problem Statement

Students may paste:

- API keys.
- passwords.
- tokens.
- private IPs.
- logs.
- emails.
- sensitive operational data.

AI features should not automatically transmit all of that externally.

---

# 3. Student Value

Students receive stronger protection from accidental data leakage.

---

# 4. Founder Value

The platform applies one privacy boundary across all AI features instead of relying on every Engine to remember the same controls.

---

# 5. Included Scope

- Privacy classification enforcement.
- minimum-context selection.
- secret-pattern screening.
- token/key/password heuristics.
- redaction.
- masking.
- local-only routing for approved classes.
- blocked-send state.
- student warning when likely secrets are detected.
- allow/deny provider policy by privacy class.

---

# 6. Explicitly Excluded Scope

- Claiming perfect DLP.
- automatically transmitting full student histories.
- logging raw secrets.
- overriding student privacy silently.
- sending Local-Only data externally as fallback.

---

# 7. Dependencies

## Depends On

- AIGW-001
- AIGW-003
- KERN-004

---

# 8. Privacy Principle

Send only the context required for the task.

If a feature can work with selected text, do not send the entire note library.

---

# 9. Secret Screening

Screening may detect patterns associated with:

- API keys.
- bearer tokens.
- passwords.
- private keys.
- connection strings.
- cloud credentials.
- session secrets.

Detection should err toward warning/blocking rather than silently transmitting obvious credentials.

---

# 10. Security Requirements

Raw detected secrets must not be placed into standard logs.

Redaction logic and privacy classification run server-side.

---

# 11. Accessibility Requirements

Secret/privacy warnings must:

- clearly explain what was blocked.
- provide accessible choices where user action is allowed.
- not rely on color alone.
- avoid exposing the secret again unnecessarily.

---

# 12. AI Usage

AI is not used to decide whether obvious secrets should be protected when deterministic screening can do so.

AI may later assist with contextual classification only as a supplemental control.

---

# 13. Failure Behavior

If privacy screening is unavailable:

- fail closed for sensitive/local-only requests.
- do not silently send raw context externally.

---

# 14. Acceptance Criteria

## Platform can

- classify request privacy.
- block or redact likely secrets.
- enforce local-only policy.
- minimize context.
- avoid raw secret logging.

## Student can

- understand when content was withheld/redacted.
- continue with a safe request where possible.

---

# 15. Definition of Done

AIGW-005 is complete when:

- Privacy classes exist.
- redaction/screening pipeline exists.
- local-only enforcement exists.
- raw secret logging is prevented.
- tests cover representative credential patterns.
- Founder approval is recorded.

---

# 16. Success Metrics

- Obvious secrets are not sent externally.
- private context is minimized.
- Local-Only policy is enforced reliably.
- privacy controls are centralized.

---

# 17. Implementation References

**Recommended Milestone:** `AIGW-M5 — AI Privacy and Secret Screening`  
**Roadmap Phase:** Phase 3 — MVP Development

---

# 18. Founder Approval

- [ ] Approved
- [ ] Deferred
- [ ] Rejected

---

# 19. Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-08-11 | Initial Feature specification |

---

# Next Artifact

`AIGW-006 — Provider Health, Retry, and Fallback`
