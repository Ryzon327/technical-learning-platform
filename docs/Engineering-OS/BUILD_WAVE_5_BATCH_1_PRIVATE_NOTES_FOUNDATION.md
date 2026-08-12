# Build Wave 5 Batch 1 — Private Notes Foundation

**Date:** 2026-08-12

Implements the KNOW-001 private student notes foundation and the stable context-reference foundation required by KNOW-003.

Delivered: stable note IDs, private ownership, title/body persistence, CRUD API, user-scoped database access, RLS isolation, stable learning-context references, active-markup rejection, updated timestamps, and authentication smoke tests.

Deliberately deferred: technical content blocks, tags, bookmarks, private search, export, and AI note assistance. AI is not required for this feature and must not silently rewrite student notes.

Normal operational logging must not contain note bodies. Context references never grant access to the referenced learning resource.
