# Build Wave 9 — Batch 7

## Personal Notes Search Integration (SEARCH-006)

**Status:** implemented, pending independent architecture review
**Checkpoint before this batch:** `9db81d9` — docs: record SEARCH-005 implementation completion

---

## 1. Purpose

Let a learner find their own private notes from the Search experience *"while
preserving strict note ownership"* (SEARCH-006 §1).

This is a privacy boundary, not another searchable content type.

---

## 2. Reuse, not a second authority

`searchStudentNotes` already existed and already satisfied §9's security
requirements: authenticated identity, ownership enforced at source, and no
caller-supplied owner. `GET /notes/search` already existed and already used
`resolveTrustedRequestIdentity`.

**SEARCH-006 composes both rather than rebuilding either.** A second
private-notes search path would be exactly the parallel authority SEARCH-003 §4
forbids, and would double the surface where a privacy mistake could occur.

The verifier pins that **exactly one** `searchStudentNotes` implementation
exists and that no `/search/notes`, `/admin/notes/search` or `/public/notes`
route was added.

---

## 3. Ownership stays with the database

```
trusted authentication
  → createUserScopedSupabaseClient(accessToken)
  → PostgreSQL row level security  (auth.uid() = user_id)
  → only the caller's own note rows
  → projection → count → learner
```

**There is exactly one ownership mechanism.** The service builds no owner
predicate — `user_id`, `userId`, `ownerId`, `studentId` and `learnerId` appear
nowhere in it, and the verifier fails if any does. An application-level filter
would be a second mechanism that could drift from the policy actually protecting
the rows.

A note the caller may not read is **never returned**, so it cannot be filtered
out downstream, cannot reach a count, a snippet, a facet or a suggestion, and
cannot be distinguished from a note that does not exist.

---

## 4. Student A / Student B evidence — two tiers, honestly separated

### Layer 1 — caller-scoped executable proof

The test harness models **what row level security returns to each caller**: an
access token selects which note rows the source exposes, exactly as
`auth.uid() = user_id` does. Student B's note contains `zarquonimplosion`, a
phrase that exists nowhere else.

| Test | Result |
|---|---|
| Student A searches `zarquonimplosion` | no results (`N2`) |
| Student B searches the same phrase | their own note (`N3`) |
| Contribution to Student A's count | none (`N4`) |
| Marker, placeholder or withheld indicator | none (`N5`) |
| Snippet, title or id from the other note | none (`N6`) |
| Token used to scope the source | the caller's own (`N7`) |

The harness deliberately **does not** hand an unauthorized row to downstream
code and expect it to inspect the owner. The design has one ownership
mechanism; inventing a second one in a test would misrepresent the architecture.

### Layer 2 — structural proof

Caller-scoped client only · no service-role client · no owner predicate · no
identity request parameter · route authenticated · notes absent from
`SEARCH_INDEXED_SOURCE_ENGINES` · no shared index or cache · no hidden counts.

### Live RLS — still not proven

**There is no live PostgreSQL harness.** That the policy is correctly enforced
*by PostgreSQL* remains a real-environment/integration requirement under the
pre-MVP and DEC-047 governance. Nothing in this batch is a live-RLS claim.

This closes SEARCH-003's deferred criterion *as far as the repository can
honestly prove it*, and no further.

---

## 5. Notes stay out of the shared Search Document

`SEARCH_INDEXED_SOURCE_ENGINES` still names only `curriculum`. Private notes
keep their own `NoteSearchResult` contract and are searched by **live
source-authoritative query composition**, per §8: private content *"must not be
placed into a broadly shared index that relies only on filters for safety."*

**A notable confirmation:** every pre-existing guard forbidding notes from
leaking into the Search foundation (verifier §4, §27, §44) still passes
**unchanged**. None needed narrowing — because notes never enter the curriculum
Search modules at all. That is a stronger result than loosening them would have
been.

---

## 6. Result groups, counts and facets

One Search workspace, two labelled sections — **Curriculum** and **My notes** —
rendered as semantic `<section>`s with headings. No internal engine name reaches
the learner; the verifier fails on `sourceEngine`, `student_notes`, `supabase`
or `rls` in the learner-facing wording.

**Notes do not join the SEARCH-004 curriculum facet.** `results`, `count` and
`facets.contentTypes` on `/search/curriculum` are unchanged, and their invariant
`sum(facet counts) == count` still holds over one authorized curriculum set.
Notes carry their **own** count over the caller's own returned notes. There is no
`globalTotal`, `combinedCorpusTotal`, `hiddenCount`, `withheldCount`,
`unauthorizedCount` or `otherUserCount`.

A note result exposes only what its owner may already see: `noteId`, `title`,
`excerpt`, `matchedIn`, `pinned`, `updatedAt` — asserted exactly by `N9`.

---

## 7. Independent failure

The two sources are settled with `Promise.allSettled`, so **neither can erase
the other's results**. A failed notes search shows an honest unavailable message
— *"Your notes could not be searched right now. They are unchanged and still
available in your notes workspace."* — and is **never** rendered as
"no matching notes". `Q4` asserts that distinction directly.

---

## 8. SEARCH-005 composition

**Applied:** static normalization and approved static aliases. Searching `AD`
also matches the learner's own Active Directory note (`O1`); `kubectl?`
normalizes (`O2`).

**Not applied:** SEARCH-005B typo recovery. Its trigger is a zero-result
condition, which becomes ambiguous once Search reads two independent sources —
zero curriculum, zero notes, or zero combined. That is a cross-source policy
decision this Feature does not need and must not establish. `O3` asserts
`kubctl` reaches the note query unchanged.

**This is not a defect in SEARCH-005**, which is complete for its approved
Curriculum Search implementation. Future cross-source recovery policy is
deliberately unassigned to any Feature.

**The privacy invariant that matters most:** variants come from static
repository-approved vocabulary and nothing else. No note is read to build them,
so one learner's note text can never influence another learner's query
interpretation (`O5`). Every variant is escaped before ILIKE (`O7`).

---

## 9. A pre-existing behaviour found, not a defect

`DELETE /notes/search` returns **401**, not 404: it matches the parameterised
`/notes/:id` route with the id `"search"`. It is authenticated and
ownership-scoped, and note ids are UUIDs so no real note is shadowed. The smoke
assertion was corrected to expect 401 — the meaningful property is that it is
never reachable unauthenticated. **No code was changed for this.**

---

## 10. Boundaries held

No migration · no schema or RLS change · no database extension · no dependency ·
no lockfile change · no `SearchDocument` change · no `server.ts` change · no
api-client change · no index · no cache · no queue · no worker · no cron · no
FTS · no search provider · no AI.

**SEARCH-007 and SEARCH-008 remain unimplemented.** §14's caching/index boundary
requirement is satisfied by proving unsafe cache and index behaviour **does not
exist**, not by building a safe one.

Search Human UAT has **not** been performed. Per DEC-047 it occurs after
SEARCH-001 through SEARCH-008 and the automated Search Engine completion gate.

CERT-008's migration remains unexecuted.

---

## 11. Known limitations

- **No live PostgreSQL/RLS harness.** Ownership evidence is caller-scoped and
  structural, not live-database proof.
- **No DOM harness.** Result-group structure is asserted in the verifier as
  source assertions; every learner-facing string is unit tested.
- **No seeded notes or curriculum**, so Human UAT remains blocked.
- Notes search is query-time and unindexed; scale is a future concern and is
  deliberately not assigned to SEARCH-007 here.
- SEARCH-005B typo recovery is not composed into notes, by ruling.
