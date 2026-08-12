# Supabase

Current implementation migrations include:

- `20260811000700_learning_progress_foundation.sql`
- `20260811000800_learning_resume_prerequisites.sql`

## Resume

Resume derives from current published curriculum plus meaningful progress. Retired or replaced historical targets are not returned as broken links.

## Prerequisites

Content completion is derived from Learning Progress.

Competency, readiness-assessment, and equivalent-competency satisfaction use the server-owned `learning_requirement_satisfactions` bridge. Authenticated clients have no write policy on that table.

Temporary evaluation failure remains distinct from student non-completion.

Service-role credentials remain server-only.
