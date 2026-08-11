#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")
START = "<!-- BEGIN WAVE 1 IMPLEMENTATION CLOSURE -->"
END = "<!-- END WAVE 1 IMPLEMENTATION CLOSURE -->"

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
# Wave 1 Implementation Closure — 2026-08-11

- Build Wave 0 — Engineering Foundation: **COMPLETE**
- Build Wave 1 — Platform Kernel and Authentication: **COMPLETE**
- Authentication Engine AUTH-001 through AUTH-007: **MVP IMPLEMENTED**
- Current implementation stage: **Wave 2 — Curriculum Foundation**

Authentication is now considered closed for MVP implementation unless reopened by a verified defect or approved requirement.

Completion review:

`docs/Engineering-OS/BUILD_WAVE_1_AUTHENTICATION_COMPLETION_REVIEW.md`
"""
)

upsert(
    "docs/Project/PHASE_STATUS.md",
    """
# Wave 1 Closure

**Wave 1 — Platform Kernel and Authentication:** COMPLETE

## Current Phase

**Wave 2 — Curriculum Foundation**

Authentication Engine implementation is closed for the MVP baseline after successful completion verification.
"""
)

upsert(
    "docs/Roadmap/ROADMAP.md",
    """
# Implementation Progress — Wave 1 Closed

Completed:

- Wave 0 — Repository and Engineering Foundation
- Wave 1 — Platform Kernel and Authentication

Current:

- **Wave 2 — Curriculum Foundation**

Authentication should not expand further unless implementation reveals a genuine approved requirement or defect.
"""
)
