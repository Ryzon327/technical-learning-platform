from pathlib import Path

updates = {
    "docs/Project/CURRENT_BUILD_STATUS.md": """
<!-- BEGIN WAVE 6 IMPLEMENTATION CLOSURE -->
# Wave 6 Implementation Closure — 2026-08-12

- Build Wave 6 — Lab Engine MVP: **COMPLETE**
- LAB-001 through LAB-012: implementation completion review passed.
- Provider-independent Lab Definition and Lab Provider contracts are implemented.
- Persistent student-owned Lab Sessions are implemented.
- Mock Provider is implemented and tested before real infrastructure providers.
- Deterministic validation is authoritative and AI-independent.
- Isolation, access delivery, reset, expiration, cleanup, retry, and recovery controls are implemented.
- Health, capacity, provisioning, and lifecycle automation are implemented.
- Hardened Container Provider runtime adapter is implemented.
- Container Provider canary and explicit controlled-rollout gates are implemented.
- Real-provider student access is protected and does not expose provider administration.
- Proxmox remains provider-specific follow-on work unless separately required for an MVP course.

Next implementation stage: **Build Wave 7 — Evidence Engine**.
<!-- END WAVE 6 IMPLEMENTATION CLOSURE -->
""",
    "docs/Project/PHASE_STATUS.md": """
<!-- BEGIN WAVE 6 STATUS -->
## Build Wave 6 — Lab Engine MVP

**Status:** Complete

Completion review passed after validating LAB-001 through LAB-012 implementation boundaries and the real-provider student learning loop.

Next: Build Wave 7 — Evidence Engine.
<!-- END WAVE 6 STATUS -->
""",
    "docs/Roadmap/ROADMAP.md": """
<!-- BEGIN WAVE 6 CLOSURE -->
## Wave 6 — Lab Engine MVP

**Implementation Status:** Complete

Exit gate satisfied: the platform can support the governed lifecycle of a real practical lab through the LMS with deterministic validation, reset/cleanup, isolation, capacity controls, and no direct provider administrative access for students.

Next implementation wave: **Wave 7 — Evidence**.
<!-- END WAVE 6 CLOSURE -->
"""
}

for path_str, block in updates.items():
    p = Path(path_str)
    if not p.exists():
        raise SystemExit(f"ERROR: required project status file does not exist: {path_str}")

    text = p.read_text()
    marker = block.strip().splitlines()[0]

    if marker not in text:
        p.write_text(text.rstrip() + "\n\n" + block.strip() + "\n")
        print(f"UPDATED: {path_str}")
    else:
        print(f"UNCHANGED: {path_str}")
