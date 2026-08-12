#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")
START = "<!-- BEGIN WAVE 5 IMPLEMENTATION CLOSURE -->"
END = "<!-- END WAVE 5 IMPLEMENTATION CLOSURE -->"

def upsert(path: str, block: str) -> None:
    p = ROOT / path
    if not p.exists():
        print(f"SKIP missing: {path}")
        return

    text = p.read_text()
    wrapped = f"{START}\n{block.strip()}\n{END}"
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)

    if pattern.search(text):
        text = pattern.sub(wrapped, text)
    else:
        if text and not text.endswith("\n"):
            text += "\n"
        text += "\n" + wrapped + "\n"

    p.write_text(text)
    print(f"UPDATED: {path}")

upsert(
    "docs/Project/CURRENT_BUILD_STATUS.md",
    """
# Wave 5 Implementation Closure — 2026-08-12

- Build Wave 0 — Engineering Foundation: **COMPLETE**
- Build Wave 1 — Platform Kernel and Authentication: **COMPLETE**
- Build Wave 2 — Curriculum Engine: **COMPLETE**
- Build Wave 3 — Learning Engine / Core Learning Experience: **COMPLETE**
- Build Wave 4 — Assessments and Test-Out: **COMPLETE**
- Build Wave 5 — Knowledge and Notes: **COMPLETE**

Wave 5 now provides private student notes, technical content blocks, stable learning-context links, tags, deterministic private retrieval, bookmarks, export, and privacy hardening without requiring AI.

Next implementation work:

**Wave 6 — Lab Engine MVP**
"""
)

upsert(
    "docs/Project/PHASE_STATUS.md",
    """
# Wave 5 Closure

**Wave 5 — Knowledge and Notes:** COMPLETE

Implemented:

- private student notes;
- technical content blocks;
- stable learning-context references;
- tags and lightweight organization;
- private deterministic retrieval;
- bookmarks;
- Markdown/JSON export;
- RLS-backed ownership;
- no normal-operation Founder/admin note-content access;
- no premature AI dependency.

Platform-wide search integration remains intentionally deferred to Wave 9.

AI-assisted notes remain intentionally deferred until the AI Gateway exists.

Next: Wave 6 — Lab Engine MVP.
"""
)

upsert(
    "docs/Roadmap/ROADMAP.md",
    """
# Implementation Progress — Wave 5 Closed

Completed:

- Wave 0 — Engineering Foundation
- Wave 1 — Platform Kernel and Authentication
- Wave 2 — Curriculum Foundation
- Wave 3 — Core Learning Experience
- Wave 4 — Assessments and Test-Out
- Wave 5 — Knowledge and Notes

Current:

- Wave 6 — Lab Engine MVP

Wave 5 remains closed unless reopened by a verified defect or unmet approved requirement.
"""
)
