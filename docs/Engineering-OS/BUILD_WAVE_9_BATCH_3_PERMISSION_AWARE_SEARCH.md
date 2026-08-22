# Build Wave 9 — Batch 3

## Permission-Aware Search (SEARCH-003)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `0033374` — build: add curriculum search

---

## 1. Purpose

Ensure search results never expose records — **or even sensitive record
existence** — outside the caller's approved access scope, without Search
becoming a second authorization system.

SEARCH-003 §1: *"Search filtering is defense-in-depth; authoritative access
checks remain with the owning Engine."* §4: search must expand *"without
becoming a parallel authorization system."*

---

## 2. What this batch is, and is not

It is **one thin pure contract** plus its adoption. It is not a permission
engine, an ACL system, a policy layer or a cache.

Every searchable source in this repository is already authorized by row level
security. Inspection found exactly two authorization shapes across all
migrations — `auth.uid() = user_id` (29 policies) and
`publication_state = 'published'` (7 policies), with the multi-line policies
reducing to the same two. **No role-based RLS policy exists anywhere.**

Re-implementing any of that in Search would create a second authority that can
drift from the first — precisely what §4 forbids.

---

## 3. The permission contract

```ts
type SearchPermissionDecision =
  | { outcome: "authorized" }
  | { outcome: "unauthorized" }
  | { outcome: "unavailable"; internalReason?: string };
```

A discriminated union rather than a boolean, so `unavailable` cannot be read as
"denied" in one place and "allowed" in another. `maySurface` returns true for
exactly one literal, so **an outcome the contract does not recognise is denied,
not allowed** — proven by a test that casts an invented `partially_authorized`
state and asserts it cannot surface.

The module contains **zero owning-engine policy**. It does not know what
publication state means, who owns a note, what a role is, or how enrollment
works. A test asserts its exported names contain none of `publication`,
`published`, `owner`, `userid`, `role`, `enrollment`, `note`, `curriculum`,
`certificate` or `evidence`.

---

## 4. Why missing collapses into unauthorized

`decideFromAuthoritativeRead({ readFailed, found })`:

| Input | Decision |
|---|---|
| read succeeded, row found | `authorized` |
| read succeeded, row absent | `unauthorized` |
| read failed | `unavailable` |

A row that does not exist and a row the caller may not read produce the **same
value**. This is a type-level collapse, not a formatting choice: downstream code
cannot branch on the difference even by accident, because the difference is not
represented. Discovering that something was *withheld* is itself the disclosure
§2 forbids.

---

## 5. `internalReason` is internal only

It exists solely on the `unavailable` branch, for diagnostics. It is absent from
`authorized` and `unauthorized` entirely, and omitted when no reason is given.

Proven not to leak: `surfaceAuthorized` returns values only, so an unavailable
candidate contributes nothing; a test asserts a reason string like
`"secret source detail"` appears nowhere in surfaced output. The verifier
additionally fails the build if `internalReason` appears in `search-document.ts`,
`curriculum-search.ts` (shared or service), the search view or the web service.

The learner-facing unavailable message contains none of "hidden", "denied",
"permission", "access" or "withheld" — it distinguishes *"Search could not be
completed"* from *"nothing matched"* without revealing why.

---

## 6. Curriculum Search adoption — behaviour unchanged

`searchOneType` now pairs every row with the decision Curriculum's RLS already
made, and `searchCurriculum` surfaces only `authorized` candidates. A failed
read becomes `unavailable`, which cannot surface, and the whole search fails
retryably rather than returning an empty set.

**All 34 SEARCH-002 tests pass unchanged.** The integration is structural: no
publication rule is re-implemented, no ownership rule is added, and the verifier
fails on `auth.uid`, `user_id ===`, `role ===`, `isOwner` or `hasPermission`
appearing in the service.

---

## 7. Result-count, snippet and metadata privacy

`count` remains authorized results actually surfaced. Withheld candidates are
dropped silently — no placeholder, no marker, no "N results hidden", no
withheld count, no over-fetch count, no global total. Snippets, titles, stable
ids, source references and content-type labels exist only for authorized
results.

`SEARCH_PERMISSION_FORBIDDEN_FIELDS` holds the prohibition as data, including
`hiddenCount`, `withheldCount` and `unauthorizedCount`.

---

## 8. `SearchDocument` unchanged

No ACL array, user id, owner id, role id, raw permission rule, hidden-content
marker or internal UUID was added. `accessScope` and `publicationState` remain
**candidate-filtering hints only**, and `canServeSearchDocument(resolution)`
still takes a resolution — never a document — so index-based authorization
remains unexpressible.

---

## 9. Cache and index security contract

`SEARCH_CACHE_SECURITY_CONTRACT` records five rules as reviewable, assertable
data:

1. A cache or index must never become the permission authority.
2. Cache entries must never cross security scopes or users.
3. A cached or indexed candidate must be re-authorized against source authority
   before being served.
4. An authorization change must invalidate or reconcile affected derived data.
5. Stale permission metadata must fail closed.

**No cache, index, queue, worker or invalidation system was built.** SEARCH-007
inherits these rules.

---

## 10. Not currently executable — recorded honestly

**A. "Student A cannot find Student B's notes" (§14).** Not executable:
SEARCH-006 has not made notes searchable, and there is no live-RLS harness. No
fake notes search path was created. **This becomes a mandatory executable
security test when SEARCH-006 is implemented.**

**B. Role-restricted filtering (§14).** Not currently applicable: no
learner-searchable role-gated content and no role-based RLS policy exists. No
role tables, fixtures or schema were invented.

**C. Cache-boundary runtime testing (§15).** Not currently applicable: no Search
cache or materialized index exists. The architectural contract above is the
SEARCH-003 deliverable.

None of these three is claimed to be runtime-proven.

---

## 11. Enrollment

Re-verified: no enrollment model exists anywhere in migrations, API or shared
types. Enrollment-specific permission-aware behaviour is **not currently
applicable**, and none was invented.

---

## 12. Boundaries held

No route · no frontend change · no migration · no schema · no ACL or role table ·
no permission cache · no dependency · no notes implementation · no SEARCH-004
filters · no SEARCH-005 tolerance · no SEARCH-007 pipeline · no SEARCH-008
ranking · no AI · Curriculum, Notes, Evidence, Certificate and Lab authorization
untouched · CERT-008 migration still unexecuted.

The SEARCH-005 ↔ SEARCH-008 circular dependency remains unresolved; SEARCH-003
adds no information that changes it.
