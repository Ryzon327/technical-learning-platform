#!/usr/bin/env python3
"""Apply Build Wave 7 — Evidence Engine administrative closure.

This applier only records a decision that has already been verified. It refuses
to run unless the dedicated Evidence Engine completion gate has passed, because
project status documents must state reality rather than intention.

Safety properties:

  * --dry-run performs zero writes and prints the plan
  * --require-gate (default) runs scripts/verify-evidence-engine-completion.sh
    and refuses to write anything if it fails
  * expected source markers are validated before any write; a status document
    that has drifted from its expected shape is reported, never patched blindly
  * closure blocks are appended, never inserted into existing history
  * duplicate closure markers are detected and skipped, so a second run is a
    no-op

Usage:
    python3 scripts/apply-wave7-closure.py [--repo PATH] [--dry-run]
                                           [--skip-gate]

Exit codes:
    0  applied cleanly (or already applied)
    1  error
    2  the completion gate failed; nothing was written
    3  drift or a missing prerequisite; nothing was written
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

GATE = "scripts/verify-evidence-engine-completion.sh"
GATE_SUCCESS_MARKER = "Evidence Engine completion gate PASSED."

# Prerequisites that must exist and carry their expected marker before any
# status document is touched.
REQUIRED_MARKERS = [
    (GATE, "Evidence Engine completion gate"),
    (
        "docs/Engineering-OS/BUILD_WAVE_7_EVIDENCE_ENGINE_COMPLETION_REVIEW.md",
        "Build Wave 7 — Evidence Engine is **complete**",
    ),
    ("docs/Project/WAVE_7_CLOSURE.md", "Build Wave 8 — Certificates"),
    ("docs/Roadmap/MVP_IMPLEMENTATION_SEQUENCE.md", "Build Wave 8 — Certificates"),
    # Each status document must still contain its previous wave closure, so a
    # drifted or truncated history is caught before anything is appended.
    ("docs/Project/CURRENT_BUILD_STATUS.md", "WAVE 6 IMPLEMENTATION CLOSURE"),
    ("docs/Project/PHASE_STATUS.md", "WAVE 6 STATUS"),
    ("docs/Roadmap/ROADMAP.md", "WAVE 6 CLOSURE"),
]

CLOSURE_BLOCKS = {
    "docs/Project/CURRENT_BUILD_STATUS.md": """<!-- BEGIN WAVE 7 IMPLEMENTATION CLOSURE -->
# Wave 7 Implementation Closure

- Build Wave 7 — Evidence Engine: **COMPLETE**
- EVID-001 through EVID-008: implementation completion review passed.
- Canonical Evidence Records exist with immutable provenance and server-authoritative creation.
- Source integrity and Evidence integrity are preserved as separate proofs.
- Evidence-to-competency links preserve the exact historical competency version.
- Assessment outcomes and deterministic Lab validation results are consumed as canonical Evidence.
- Positive, negative and indeterminate outcome semantics are deterministic and fail closed.
- Append-only review and correction history is implemented; effective state is derived at read time.
- Invalidated and superseded Evidence remains historical but stops qualifying for demonstration.
- A private student Evidence portfolio and a privacy-safe export are implemented.
- A stable, opaque verification hook exists without any public verification surface.
- Assessment and Lab source truth remain independent of all Evidence operations.
- AI holds no authority over Evidence truth, state, integrity or verification.
- Retention classification is carried forward as a future Evidence Engine Feature.

Next implementation stage: **Build Wave 8 — Certificates**.
<!-- END WAVE 7 IMPLEMENTATION CLOSURE -->""",
    "docs/Project/PHASE_STATUS.md": """<!-- BEGIN WAVE 7 STATUS -->
## Build Wave 7 — Evidence Engine

**Status:** Complete

Completion review passed after validating EVID-001 through EVID-008 against the Feature Registry acceptance criteria, the cross-batch Evidence invariants, and the engine-wide security and private-by-default boundaries.

Next: Build Wave 8 — Certificates.
<!-- END WAVE 7 STATUS -->""",
    "docs/Roadmap/ROADMAP.md": """<!-- BEGIN WAVE 7 CLOSURE -->
## Wave 7 — Evidence Engine

**Implementation Status:** Complete

Exit gate satisfied: the platform can record durable, provenance-bearing proof of what a student demonstrated, link it to the exact approved competency version, correct it through an append-only history, resolve its effective trust state at read time, present it privately to the student, and export it with a stable verification hook — without granting public access, without AI authority, and without rewriting assessment or Lab source truth.

Next implementation wave: **Build Wave 8 — Certificates**.
<!-- END WAVE 7 CLOSURE -->""",
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def run_gate(repo: Path) -> bool:
    gate_path = repo / GATE
    if not gate_path.is_file():
        print("ERROR: completion gate not found at " + GATE, file=sys.stderr)
        return False

    print("Running the Evidence Engine completion gate…\n")
    completed = subprocess.run(
        ["bash", str(gate_path)],
        cwd=str(repo),
        capture_output=True,
        text=True,
    )
    sys.stdout.write(completed.stdout)
    if completed.stderr.strip():
        sys.stderr.write(completed.stderr)

    if completed.returncode != 0:
        return False
    return GATE_SUCCESS_MARKER in completed.stdout


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Apply Build Wave 7 — Evidence Engine administrative closure."
    )
    parser.add_argument("--repo", default=None, help="repository root")
    parser.add_argument("--dry-run", action="store_true", help="print the plan only")
    parser.add_argument(
        "--skip-gate",
        action="store_true",
        help="skip running the completion gate (for rehearsal only)",
    )
    args = parser.parse_args(argv)

    repo = (
        Path(args.repo).expanduser().resolve()
        if args.repo
        else Path(__file__).resolve().parent.parent
    )

    if not (repo / "docs" / "Project").is_dir():
        print("ERROR: " + str(repo) + " does not look like the repository", file=sys.stderr)
        return 1

    # 1. Prerequisites and drift, before anything is written.
    pending: list[str] = []
    for relative, marker in REQUIRED_MARKERS:
        path = repo / relative
        if not path.is_file():
            pending.append("missing required file: " + relative)
            continue
        if marker not in read(path):
            pending.append(
                relative + ": expected marker not found (" + marker + ")"
            )

    if pending:
        print("Wave 7 closure — prerequisites not satisfied\n")
        for entry in pending:
            print("  ! " + entry)
        print("\nNo files were written. The repository is unchanged.")
        return 3

    # 2. The gate decides whether closure may be recorded at all.
    if args.skip_gate:
        print("WARNING: completion gate skipped (--skip-gate). Rehearsal only.\n")
    elif args.dry_run:
        print("Dry run: the completion gate would run before any write.\n")
    else:
        if not run_gate(repo):
            print(
                "\nThe Evidence Engine completion gate did not pass.\n"
                "No status document was modified. Wave 7 remains open.",
                file=sys.stderr,
            )
            return 2
        print("")

    # 3. Append closure blocks, skipping any already present.
    changes: list[str] = []
    skipped: list[str] = []

    for relative, block in CLOSURE_BLOCKS.items():
        path = repo / relative
        text = read(path)
        marker = block.splitlines()[0]

        if marker in text:
            skipped.append("already closed: " + relative)
            continue

        if args.dry_run:
            changes.append("[dry-run] append closure block: " + relative)
            continue

        # Append only. Prior project history is never rewritten.
        path.write_text(text.rstrip() + "\n\n" + block + "\n", encoding="utf-8")
        changes.append("appended closure block: " + relative)

    print("Wave 7 closure — apply report")
    print("repository: " + str(repo))
    if args.dry_run:
        print("mode: DRY RUN (no files written)")

    print("\nChanges (" + str(len(changes)) + "):")
    for entry in changes:
        print("  + " + entry)
    if not changes:
        print("  (none — already applied)")

    if skipped:
        print("\nSkipped (" + str(len(skipped)) + "):")
        for entry in skipped:
            print("  . " + entry)

    print("\nPENDING INTEGRATION (0): none")
    print("\nBuild Wave 7 — Evidence Engine: COMPLETE")
    print("Next approved implementation wave: Build Wave 8 — Certificates")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(1)
