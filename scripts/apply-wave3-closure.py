#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path("/Users/demetrius/Projects/technical-learning-platform")
START = "<!-- BEGIN WAVE 3 IMPLEMENTATION CLOSURE -->"
END = "<!-- END WAVE 3 IMPLEMENTATION CLOSURE -->"

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
# Wave 3 Implementation Closure — 2026-08-12

- Build Wave 0 — Engineering Foundation: **COMPLETE**
- Build Wave 1 — Platform Kernel and Authentication: **COMPLETE**
- Build Wave 2 — Curriculum Engine: **COMPLETE**
- Build Wave 3 — Learning Engine / Core Learning Experience: **COMPLETE**

Wave 3 completion includes the Learning Engine integration boundary for LEARN-005 readiness/test-out. The actual deterministic assessment engine remains in the later approved assessment wave.

Next implementation work must follow:

`docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md`
"""
)

upsert(
    "docs/Project/PHASE_STATUS.md",
    """
# Wave 3 Closure

**Wave 3 — Learning Engine / Core Learning Experience:** COMPLETE

Implemented:

- learning progress;
- resume/continue;
- prerequisites;
- competency state;
- next action;
- history;
- review/reinforcement;
- readiness/test-out integration boundary.

The actual assessment/test-out engine remains intentionally deferred to its approved implementation wave.

Do not expand Learning Engine scope by default after closure.
"""
)

upsert(
    "docs/Roadmap/ROADMAP.md",
    """
# Implementation Progress — Wave 3 Closed

Completed:

- Wave 0 — Engineering Foundation
- Wave 1 — Platform Kernel and Authentication
- Wave 2 — Curriculum Engine
- Wave 3 — Learning Engine / Core Learning Experience

Current:

- Advance to the next approved wave defined in `MVP_IMPLEMENTATION_SEQUENCE.md`.

The Learning Engine is closed for the MVP baseline unless reopened by a verified defect or unmet approved requirement.
"""
)
