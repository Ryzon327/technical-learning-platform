# Build Wave 5 Batch 3 — Private Retrieval, Context Filtering, and Bookmarks

**Date:** 2026-08-12

## Scope

Implements the deterministic private retrieval foundation for KNOW-005 and the
bookmarking foundation from KNOW-006.

## Delivered

Private note retrieval supports:

- title/body search;
- technical block search;
- tag filtering;
- pinned filtering;
- learning-context filtering;
- bounded result sets;
- useful excerpts;
- match-source metadata.

Bookmarks support stable references to learning paths, courses, modules, missions,
competencies, content assets, labs, lab sessions, and notes.

## Privacy Boundary

All retrieval is executed through the user's scoped Supabase client. RLS remains the
authoritative privacy boundary. Search never indexes or returns another student's notes.

Bookmarks are private student records and never grant authorization to a target resource.

## Search Boundary

This is deterministic baseline retrieval, not the platform-wide Search Engine. Wave 9
will integrate authorized private-note search into the broader search experience.

## Deferred

- note export;
- final deletion/privacy hardening;
- end-user notes UI polish;
- AI-assisted note actions.

Those remain for Wave 5 Batch 4 and later AI Gateway integration.
