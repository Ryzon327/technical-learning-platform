<!--
Implementation evidence for one work package. The architect reviews this PR;
the Founder merges it.

Report what was actually executed. Never claim a gate passed unless it ran, and
never hide a failing gate. A pre-existing failure may be reported as such only
with evidence that this work did not introduce it.
-->

## Work package

Closes #

## Implementation summary

<!-- What changed and why, in plain language. -->

## Files changed

<!-- Exact inventory. Added / Modified / Deleted with counts. -->

```
A
M
D
```

## Architecture and contracts preserved

<!-- Name what this work could have broken and did not: closed engines, provider
neutrality, deterministic validation authority, authorization shapes,
publication lifecycles, forbidden-field prohibitions. -->

## Validation

| Gate | Result |
|---|---|
| Targeted tests | |
| Full test suite | |
| Typecheck | |
| Build | |
| Security scan | |
| `npm audit` | |
| API smoke | |
| Verifier / completion gate | |
| Mutation testing (if applicable) | |

**CI status:** <!-- link or state the run conclusion for this exact commit -->

## Migration changes

- [ ] None — migration count unchanged (state the count)
- [ ] Migration added — **FOUNDER GATE, not executed**

## Dependency changes

- [ ] None
- [ ] Changed — **FOUNDER GATE** (list them)

## Security implications

<!-- Authorization, RLS, secrets, provider access, isolation. "None" is a valid
answer when it is true and you have checked. -->

## Known limitations

<!-- What is not proven. Live RLS, rendered accessibility, unmeasured scale,
anything mocked. Be specific. -->

## Deferred work

<!-- Discovered but deliberately out of scope, with where it is recorded. -->

## Human UAT status

- [ ] Not required for this package
- [ ] Required and **PENDING** — Founder browser UAT (DEC-047)
- [ ] Required and complete

## Consequential Founder gates still pending

<!-- Migration execution, deployment, provider configuration, dependency change,
architecture decision, UAT, merge. State "none beyond merge" if that is true. -->

---

## Confirmations

- [ ] No unauthorized scope expansion — only the approved work package was implemented
- [ ] No unauthorized architecture redesign; no completed engine was reopened
- [ ] No real database migration was executed
- [ ] No production deployment was performed
- [ ] No force push, rebase, squash or history rewriting
- [ ] No secrets, credentials or `.env` content included
- [ ] No AI co-author or attribution trailer on any commit; authorship is the Founder only
- [ ] Deterministic validators remain authoritative; AI explains results and never determines them
- [ ] No verifier or guardrail was weakened to make a gate pass
