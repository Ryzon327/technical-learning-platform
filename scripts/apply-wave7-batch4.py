#!/usr/bin/env python3
"""Apply Wave 7 / Batch 4 — Lab Validation Evidence (EVID-004).

Package layout:

    payload/                    new files and replacement versions
    scripts/apply-wave7-batch4.py

Nothing is copied over the repository until the whole repository state has been
validated. Every file this batch replaces is checked against the SHA-256 of its
known pre-Batch-4 content first; if any of them has drifted, the script reports
the exact file and writes nothing at all.

Deterministic and idempotent:

  * validation runs to completion before the first write
  * every write is content-compared, so a second run reports zero changes
  * drifted files are reported, never silently overwritten (--force overrides)
  * originals are copied to .w7b4-backup/<timestamp>/ unless --no-backup
  * --dry-run performs zero writes and prints the plan

Usage:
    python3 scripts/apply-wave7-batch4.py [--repo PATH] [--dry-run]
                                          [--no-backup] [--force]

Exit codes:
    0  applied cleanly (or already applied)
    1  error
    3  pending integration items remain (see report); nothing was written
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

API_SRC = "services/api/src"
SHARED_SRC = "packages/shared-types/src"

# Files this batch adds. They have no pre-image.
NEW_FILES = [
    "packages/shared-types/src/lab-evidence.ts",
    "packages/shared-types/src/lab-evidence.test.ts",
    "services/api/src/lab-evidence.ts",
    "services/api/src/lab-evidence.test.ts",
    "supabase/migrations/20260813000400_lab_evidence_consumption.sql",
    "docs/Engineering-OS/BUILD_WAVE_7_BATCH_4_LAB_VALIDATION_EVIDENCE.md",
    "scripts/apply-wave7-batch4.py",
]

# Files this batch replaces, mapped to the SHA-256 of the pre-Batch-4 content.
MODIFIED_FILES = {
    "packages/shared-types/src/index.ts": "a2d1159ece9afe2ab43a9d9ee7f2d93b6e0477b1f1c2dc7d4e9a2c6ea98a6bd5",
    "packages/shared-types/src/evidence-competency.ts": "cce8e11d64e61d37ee8b611e9d8592b845cac9b5cd30e8119953f70d46a722d1",
    "services/api/src/lab-runtime.ts": "3eee9e5d7bdc9b04999f7a5c7760cb59365737699f092967d47eb3ecbbde20b3",
    "services/api/src/server.ts": "6bf164b8af227bb6d3b2b9b56cbc8514d852524d07a7df7661fa1602f6bce83c",
    "scripts/verify-wave7.sh": "b92938eb7fba5b5464c69dc714a007b568a39175441f2ceb38f8e3a95776039d",
    "scripts/smoke-api.sh": "16ccf610e5451256d0ea51ace432bd6352ab86a65f215aff09f6d89684d1f275",
    "supabase/README.md": "ab763b26fdf6c532842ece0de08cfb2743d42f6c2d6bd145af4fd970f3d87fbb",
}

EXECUTABLE_FILES = [
    "scripts/verify-wave7.sh",
    "scripts/smoke-api.sh",
    "scripts/apply-wave7-batch4.py",
]

# Batch 1 and Wave 3/4 artefacts this batch must find intact and leave alone.
REQUIRED_BASELINE = [
    (
        "supabase/migrations/20260813000100_evidence_foundation.sql",
        "create table if not exists public.evidence_records",
    ),
    (
        "supabase/migrations/20260813000200_evidence_competency_linking.sql",
        "create table if not exists public.evidence_competency_links",
    ),
    (
        "supabase/migrations/20260812001000_lab_access_reset_validation.sql",
        "create table if not exists public.lab_validation_runs",
    ),
    (
        "supabase/migrations/20260812000800_lab_definition_foundation.sql",
        "create table if not exists public.lab_definitions",
    ),
    ("services/api/src/evidence.ts", "export async function createCanonicalEvidence"),
    (
        "services/api/src/evidence-competency.ts",
        "export async function linkEvidenceToCompetency",
    ),
    (
        "services/api/src/evidence-competency.ts",
        "export async function getQualifyingCompetencyEvidenceReferences",
    ),
    ("services/api/src/lab-runtime.ts", "export async function validateLabSession"),
]

# Post-conditions asserted against the repository after applying.
REQUIRED_CONTENT = [
    (
        "packages/shared-types/src/index.ts",
        [("lab evidence types exported", 'export * from "./lab-evidence";')],
        [],
    ),
    (
        "packages/shared-types/src/lab-evidence.ts",
        [
            ("eligibility rule", "export function evaluateLabEvidenceEligibility"),
            ("deterministic canonical string", "export function buildLabValidationCanonicalString"),
            ("stable source reference", "export function buildLabValidationSourceReference"),
            ("bounded metadata builder", "export function buildLabEvidenceMetadata"),
        ],
        [("json serialization hashing", "JSON.stringify")],
    ),
    (
        "packages/shared-types/src/evidence-competency.ts",
        [
            ("outcome derivation", "export function deriveEvidenceOutcome"),
            ("lab negative state recognised", '"incomplete"'),
            ("demonstration guard", "qualifiesForDemonstration"),
        ],
        [],
    ),
    (
        "services/api/src/lab-evidence.ts",
        [
            ("server-authoritative ingestion", "createServerSupabaseClient()"),
            ("canonical evidence creation", "createCanonicalEvidence("),
            ("competency linking", "linkEvidenceToCompetency("),
            ("lab source type", 'sourceType: "lab_validation"'),
            ("derived source digest", "sourceIntegrityDigest: calculateLabValidationSourceDigest(facts)"),
            ("approved curriculum mapping", "mission_competencies"),
            ("exact competency version", "competencyVersion: mapping.competencyVersion"),
            ("non-throwing validation wrapper", "export async function tryConsumeLabValidationEvidence"),
            ("durable retry", "export async function retryFailedLabEvidenceConsumption"),
            ("consumption audit", "lab.evidence.consumed"),
        ],
        [
            ("validation re-evaluation", "runValidationProbe"),
            ("validation state re-derivation", "deriveLabValidationState"),
            ("mastery mutation", "recordAuthoritativeCompetencyEvidence"),
            ("transition authority", "decideCompetencyTransition"),
            ("competency state write", "student_competency_state"),
        ],
    ),
    (
        "services/api/src/lab-runtime.ts",
        [("validation triggers ingestion", "tryConsumeLabValidationEvidence")],
        [],
    ),
    (
        "supabase/migrations/20260813000400_lab_evidence_consumption.sql",
        [
            ("consumption state table", "create table if not exists public.lab_evidence_consumptions"),
            ("row level security", "alter table public.lab_evidence_consumptions enable row level security"),
            ("bounded states", "state in ('consumed', 'skipped', 'failed')"),
            ("ownership guard", "Lab evidence consumption owner must match the validation run owner"),
        ],
        [
            ("student policy on internal state", "create policy"),
            ("lab validation alteration", "alter table public.lab_validation_runs"),
            ("lab session alteration", "alter table public.lab_sessions"),
            ("destructive statement", "drop table"),
        ],
    ),
    (
        "services/api/src/server.ts",
        [
            ("lab session evidence read route", "labSessionEvidenceMatch"),
            ("authenticated identity", "resolveTrustedRequestIdentity(request)"),
        ],
        [("ingestion reachable from HTTP", "consumeLabValidationEvidence")],
    ),
    (
        "scripts/verify-wave7.sh",
        [
            ("batch 1 checks preserved", "PASS: AI holds no Evidence authority"),
            ("batch 2 checks preserved", "PASS: AI holds no competency mapping authority"),
            ("batch 3 checks preserved", "PASS: AI holds no assessment Evidence authority"),
            ("batch 4 checks added", "PASS: AI holds no Lab Evidence authority"),
        ],
        [],
    ),
    (
        "scripts/smoke-api.sh",
        [
            ("lab evidence read protected", "assert_status GET /lab-sessions/test-session/evidence 401"),
            ("no student mutation route", "assert_status POST /lab-sessions/test-session/evidence 404"),
            ("batch 3 smoke retained", "assert_status GET /assessment-attempts/test-attempt/evidence 401"),
            ("batch 1 smoke retained", "assert_status GET /evidence 401"),
            ("wave 6 smoke retained", "assert_status GET /lab-sessions 401"),
        ],
        [],
    ),
]


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Applier:
    def __init__(self, package_root: Path, repo_root: Path, args: argparse.Namespace):
        self.package_root = package_root
        self.payload_root = package_root / "payload"
        self.repo_root = repo_root
        self.dry_run = args.dry_run
        self.backup = not args.no_backup
        self.force = args.force
        self.changes: list[str] = []
        self.skipped: list[str] = []
        self.pending: list[str] = []
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.backup_dir = repo_root / ".w7b4-backup" / stamp

    # -------------------------------------------------- helpers

    def rel(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.repo_root))
        except ValueError:
            return str(path)

    @staticmethod
    def read(path: Path) -> str:
        return path.read_text(encoding="utf-8")

    def payload_text(self, relative: str) -> str | None:
        source = self.payload_root / relative
        if not source.is_file():
            self.pending.append("payload file missing from package: " + relative)
            return None
        return self.read(source)

    def backup_file(self, path: Path) -> None:
        if not self.backup or self.dry_run or not path.exists():
            return
        target = self.backup_dir / self.rel(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)

    def write(self, path: Path, content: str, label: str) -> None:
        if path.exists() and self.read(path) == content:
            self.skipped.append("unchanged: " + self.rel(path))
            return
        action = "update" if path.exists() else "create"
        if self.dry_run:
            self.changes.append(
                "[dry-run] " + action + ": " + self.rel(path) + " (" + label + ")"
            )
            return
        self.backup_file(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        self.changes.append(action + ": " + self.rel(path) + " (" + label + ")")

    # -------------------------------------------------- validation (no writes)

    def validate_repo(self) -> None:
        required = [Path(API_SRC), Path(SHARED_SRC), Path("supabase/migrations")]
        missing = [str(p) for p in required if not (self.repo_root / p).is_dir()]
        if missing:
            raise SystemExit(
                "ERROR: "
                + str(self.repo_root)
                + " does not look like the Technical Learning Platform repository.\n"
                + "Missing: "
                + ", ".join(missing)
                + "\nPass --repo /path/to/repo."
            )

        if not self.payload_root.is_dir():
            raise SystemExit(
                "ERROR: payload directory not found at " + str(self.payload_root)
            )

    def validate_baseline(self) -> None:
        """Wave 3/4 and Batch 1 artefacts this batch depends on and preserves."""
        for relative, needle in REQUIRED_BASELINE:
            path = self.repo_root / relative
            if not path.is_file():
                self.pending.append("required baseline file not found: " + relative)
                continue
            if needle not in self.read(path):
                self.pending.append(
                    relative + ": expected baseline content is missing (" + needle + ")"
                )

    def validate_pre_images(self) -> dict[str, str]:
        """Verifies every replacement target BEFORE anything is copied."""
        planned: dict[str, str] = {}

        for relative in NEW_FILES:
            content = self.payload_text(relative)
            if content is not None:
                planned[relative] = content

        for relative, pre_image_hash in MODIFIED_FILES.items():
            content = self.payload_text(relative)
            if content is None:
                continue

            destination = self.repo_root / relative
            if not destination.is_file():
                self.pending.append("expected repository file not found: " + relative)
                continue

            current = self.read(destination)
            if current == content:
                self.skipped.append("already applied: " + relative)
                continue

            current_hash = sha256(current)
            if current_hash == pre_image_hash or self.force:
                planned[relative] = content
                continue

            self.pending.append(
                relative
                + ": local content differs from the expected pre-Batch-4 file "
                + "(sha256 "
                + current_hash[:12]
                + " vs expected "
                + pre_image_hash[:12]
                + "). Review and re-run with --force to replace it."
            )

        return planned

    # -------------------------------------------------- application

    def apply_planned(self, planned: dict[str, str]) -> None:
        for relative, content in planned.items():
            label = "new file" if relative in NEW_FILES else "wave 7 batch 4 update"
            self.write(self.repo_root / relative, content, label)

        if self.dry_run:
            return

        for relative in EXECUTABLE_FILES:
            target = self.repo_root / relative
            if target.exists():
                target.chmod(target.stat().st_mode | 0o111)

    def audit_post_conditions(self) -> None:
        for relative, required, forbidden in REQUIRED_CONTENT:
            path = self.repo_root / relative
            if not path.is_file():
                self.pending.append("expected file not found: " + relative)
                continue
            text = self.read(path)
            for label, needle in required:
                if needle not in text:
                    self.pending.append(relative + ": missing " + label)
            for label, needle in forbidden:
                if needle in text:
                    self.pending.append(relative + ": remove " + label)

    # -------------------------------------------------- driver

    def report(self, wrote_nothing_reason: str | None = None) -> int:
        print("Wave 7 / Batch 4 — apply report")
        print("repository: " + str(self.repo_root))
        if self.dry_run:
            print("mode: DRY RUN (no files written)")
        elif self.backup and self.backup_dir.exists():
            print("backups:    " + self.rel(self.backup_dir))

        print("\nChanges (" + str(len(self.changes)) + "):")
        for entry in self.changes:
            print("  + " + entry)
        if not self.changes:
            print("  (none — already applied)" if not wrote_nothing_reason else "  (none)")

        if self.skipped:
            print("\nSkipped (" + str(len(self.skipped)) + "):")
            for entry in self.skipped:
                print("  . " + entry)

        if self.pending:
            print("\nPENDING INTEGRATION (" + str(len(self.pending)) + "):")
            for entry in self.pending:
                print("  ! " + entry)
            if wrote_nothing_reason:
                print("\n" + wrote_nothing_reason)
            return 3

        print("\nPENDING INTEGRATION (0): none")
        print("\nBatch 4 applied. Next: bash scripts/verify-wave7.sh")
        return 0

    def run(self) -> int:
        self.validate_repo()
        self.validate_baseline()
        planned = self.validate_pre_images()

        if self.pending:
            # Nothing has been written yet, and nothing will be.
            return self.report(
                "No files were written. The repository is unchanged. Resolve the "
                "items above, then re-run."
            )

        self.apply_planned(planned)

        if not self.dry_run:
            self.audit_post_conditions()

        return self.report()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply Wave 7 / Batch 4 (lab validation Evidence)."
    )
    parser.add_argument("--repo", default=None, help="repository root (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--no-backup", action="store_true", help="do not write .w7b4-backup/")
    parser.add_argument(
        "--force",
        action="store_true",
        help="replace modified files even when they differ from the expected pre-image",
    )
    return parser.parse_args(argv)


def detect_repo_root(package_root: Path, override: str | None) -> Path:
    if override:
        return Path(override).expanduser().resolve()
    cwd = Path.cwd().resolve()
    for candidate in [cwd, *cwd.parents]:
        if (candidate / API_SRC).is_dir() and (candidate / SHARED_SRC).is_dir():
            return candidate
    return package_root


if __name__ == "__main__":
    args = parse_args(sys.argv[1:])
    package_root_path = Path(__file__).resolve().parent.parent
    repo_root_path = detect_repo_root(package_root_path, args.repo)
    try:
        sys.exit(Applier(package_root_path, repo_root_path, args).run())
    except SystemExit:
        raise
    except Exception as error:  # noqa: BLE001
        print("ERROR: " + str(error), file=sys.stderr)
        sys.exit(1)
