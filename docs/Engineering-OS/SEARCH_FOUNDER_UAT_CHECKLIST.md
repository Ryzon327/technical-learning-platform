# Search Engine — Founder UAT Checklist

**Package:** SEARCH-UAT-HANDOFF-1
**Covers:** SEARCH-001 through SEARCH-008, as committed
**Companions:** `SEARCH_UAT_RUNBOOK.md` (the full step list),
`SEARCH_RENDERED_REVIEW_RECORD.md` (what was verified before this handoff, and
how), `BUILD_WAVE_9_SEARCH_ENGINE_COMPLETION_REVIEW.md` (the engineering review)
**Governed by:** DEC-047, DEC-068

This is the short list. It holds only the judgments that need Founder eyes, and
it says what to exercise, never what to conclude. The long runbook is still
there when more depth is wanted; nothing here duplicates the engineering
evidence, which is in the review record.

---

## 0. Two decisions come before any of it

Both of these are Founder gates, and until they are answered a Search UAT run
cannot produce much.

### 0.1 Is there anything to find?

Search returns only database rows whose `publication_state` is `published`, read
through the signed-in account's own row level security. It never reads
repository content files, so `content/curriculum/networking-foundations.json`
being authored does not make it searchable. No seed file and no migration
inserts curriculum, and whether anything has been published to the UAT project
cannot be determined from the repository.

Publishing is a database write and a Founder gate:

```
npm run admin:publish-curriculum -- content/curriculum/networking-foundations.json --publish
```

Both publication commands are dry runs unless `TLP_UAT_BOOTSTRAP_CONFIRM` equals
`SUPABASE_URL`, and both refuse a production project.

**Decision:** publish a corpus to the non-production project, or accept that
sections 1–4 below will be exercised against an empty one.

### 0.2 Where should a result go?

Result links point at `/learning-paths/…`, `/courses/…`, `/missions/…` and
`/competencies/…`. The application has no router and no handler for those paths:
Search is a workspace view selected by a button in the signed-in navigation, and
the other views are selected the same way. This is recorded in the completion
review as finding 4.5 and has been open since Batch 2.

It was **not** repaired in this package. Routing those four destinations means
adding a router and four detail surfaces that do not exist — a new product
surface, not a bounded defect fix, and Lovable remains the canonical
presentation direction for that work.

**Decision:** whether Search results should navigate anywhere yet, and if so,
whose work package builds the destinations.

---

## 1. The script — about ten minutes, once 0.1 is answered

Sign in, then open **Search** from the workspace navigation. Search has no URL of
its own. A Founder account passes through `FounderMfaGate` first.

| # | Do this | Observe |
|---|---|---|
| 1 | Search a word you know is in a published title. Then a word you know is only in a description. | Whether the result set reads as something a learner would call useful, and whether the content type shown on each result means anything to a beginner. |
| 2 | Search `AD`, then `Active Directory`. Then `show vlan brief`, then `show vln brief`. | The sentence describing the adjustment: whether it is clear what was searched, whose wording was used, and whether the offer to return to your own wording reads as an offer. |
| 3 | Run a query matching more than one content type. Select one filter, then a second, then clear. | Whether the counts beside the filters are understandable as "in these results" and not as a platform total, and whether clearing feels like it did what it said. |
| 4 | Search a nonsense term. | Whether the empty state reads as "nothing matched" rather than "something broke", and whether the published-paths list beneath it is a useful next step or just filler. |
| 5 | Stop the API, search again, then restart it and search again without reloading. | Whether the unavailable state reads as a search problem rather than an empty curriculum, and whether recovery is obvious without a reload. |
| 6 | Do steps 1–3 again with the keyboard only, then at a narrow viewport and at 200% zoom. | Focus order, whether the focus indicator is visible enough to follow, what a screen reader announces when counts and states change, and whether anything reflows badly or clips. |

Step 6 is the part no automation in this repository can stand in for. The DOM
suite added by this package proves the element semantics and that every state
above is reachable; it cannot see a focus ring, hear a screen reader, or judge
readability.

If a second ordinary learner account exists, one more worth doing: search a
broad term as the Founder and as the learner, and compare what each receives.
That is the only part of a run that exercises live row level security — the
automated suite does not.

---

## 2. What is already established, so it need not be re-tested

Observed on this branch head, and recorded with commands and results in
`SEARCH_RENDERED_REVIEW_RECORD.md`:

- The Search implementation under review is unchanged. The application, package
  and service sources on PR #55's head are byte-identical to `main`.
- `verify` passed on PR #55's exact head.
- The Search Engine completion gate passes, as does the dependency policy gate,
  typecheck, the full suite and the production build.
- The accepted `brace-expansion` security closure is intact, and this branch
  carries the identical accepted commit.
- Each state in the table above renders the documented semantics in a real DOM —
  labelled form, native filter controls, ordered results, separated note group,
  polite live regions — and a search that *could not run* is never shown as a
  search that matched nothing.
- One low-severity state defect was found while establishing that and repaired in
  the same package: a rejected query used to leave the previous query's notes on
  screen beside the validation message. Section 3.1.1 of the review record has
  the reproduction, the five-line repair, and the two dispositions not taken — if
  you prefer one of those, say so and it is a one-line change.

None of that is product acceptance, and none of it is a substitute for step 6.

---

## 3. Recording a finding

Classify it before anyone proposes a fix: curriculum/content, technical writing,
functional interaction, UI/visual, UX/usability, accessibility,
state/progression, architecture, security, or regression. Give exact
reproduction steps and the account used. Material findings return through a
scoped work package.

---

## 4. The recommendation

If the answer to 0.1 is "not yet", then **no meaningful Founder Search judgment
remains in this package.** Sections 1–4 of the script would run against an empty
corpus and would tell you about the empty state, which is already covered
mechanically; step 6 is the only part still worth a human, and it can be done at
any time against the empty and unavailable states alone.

In that case the recommendation under existing authority is to merge PR #55 and
this package, and to open Search Human UAT as its own work package once a corpus
is published and the 0.2 decision is made. Search Human UAT remains **pending**
either way, and nothing in this document grants Search product acceptance.
