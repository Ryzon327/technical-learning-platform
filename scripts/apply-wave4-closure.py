#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")
START = "<!-- BEGIN WAVE 4 IMPLEMENTATION CLOSURE -->"
END = "<!-- END WAVE 4 IMPLEMENTATION CLOSURE -->"

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
# Wave 4 Implementation Closure — 2026-08-12

- Build Wave 0 — Engineering Foundation: **COMPLETE**
- Build Wave 1 — Platform Kernel and Authentication: **COMPLETE**
- Build Wave 2 — Curriculum Engine: **COMPLETE**
- Build Wave 3 — Learning Engine / Core Learning Experience: **COMPLETE**
- Build Wave 4 — Assessments and Test-Out: **COMPLETE**

Wave 4 now provides the deterministic assessment path required by the Learning Engine while preserving the Evidence Engine boundary.

Next implementation work:

**Wave 5 — Knowledge and Notes**
"""
)

upsert(
    "docs/Project/PHASE_STATUS.md",
    """
# Wave 4 Closure

**Wave 4 — Assessments and Test-Out:** COMPLETE

Implemented:

- deterministic assessment definitions;
- persisted attempts and answers;
- deterministic scoring;
- retry enforcement;
- technical interruption recovery;
- readiness/test-out;
- competency/prerequisite advancement;
- review recommendation;
- integrity metadata;
- Evidence Engine source handoff.

Canonical Evidence Records remain intentionally deferred to Wave 7.

Next: Wave 5 — Knowledge and Notes.
"""
)

upsert(
    "docs/Roadmap/ROADMAP.md",
    """
# Implementation Progress — Wave 4 Closed

Completed:

- Wave 0 — Engineering Foundation
- Wave 1 — Platform Kernel and Authentication
- Wave 2 — Curriculum Foundation
- Wave 3 — Core Learning Experience
- Wave 4 — Assessments and Test-Out

Current:

- Wave 5 — Knowledge and Notes

Wave 4 remains closed unless reopened by a verified defect or unmet approved requirement.
"""
)
