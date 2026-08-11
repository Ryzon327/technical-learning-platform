#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")
START = "<!-- BEGIN WAVE 2 IMPLEMENTATION CLOSURE -->"
END = "<!-- END WAVE 2 IMPLEMENTATION CLOSURE -->"

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
# Wave 2 Implementation Closure — 2026-08-11

- Build Wave 0 — Engineering Foundation: **COMPLETE**
- Build Wave 1 — Platform Kernel and Authentication: **COMPLETE**
- Build Wave 2 — Curriculum Engine: **COMPLETE**

The Curriculum Engine is closed for the MVP baseline after successful completion verification.

Next implementation stage must follow:

`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md`
"""
)

upsert(
    "docs/Project/PHASE_STATUS.md",
    """
# Wave 2 Closure

**Wave 2 — Curriculum Engine:** COMPLETE

Curriculum implementation is closed for the MVP baseline unless reopened by a verified defect or unmet approved requirement.

Continue with the next approved implementation wave in the MVP implementation sequence.
"""
)

upsert(
    "docs/Roadmap/ROADMAP.md",
    """
# Implementation Progress — Wave 2 Closed

Completed:

- Wave 0 — Engineering Foundation
- Wave 1 — Platform Kernel and Authentication
- Wave 2 — Curriculum Engine

Current:

- Advance to the next approved wave defined in `MVP_IMPLEMENTATION_SEQUENCE.md`.

Do not expand Curriculum scope by default after closure.
"""
)
