#!/usr/bin/env python3
"""Apply Wave 7 / Batch 1 — Canonical Evidence Foundation.

Deterministic and idempotent:

  * every write is content-compared first, so a second run reports no changes
  * every file this batch modifies is checked against the SHA-256 of its known
    pre-Batch-1 content before it is replaced; unexpected local drift is
    reported, never clobbered (--force overrides deliberately)
  * originals are copied to .w7b1-backup/<timestamp>/ unless --no-backup
  * --dry-run performs zero writes and prints the plan
  * no regex mutation is applied to existing routes or exports: modified files
    are replaced wholesale from verified pre-images

Usage:
    python3 scripts/apply-wave7-batch1.py [--repo PATH] [--dry-run]
                                          [--no-backup] [--force]

Exit codes:
    0  applied cleanly (or already applied)
    1  error
    3  applied, but manual integration points remain (see report)
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
    "packages/shared-types/src/evidence.ts",
    "packages/shared-types/src/evidence.test.ts",
    "services/api/src/evidence.ts",
    "services/api/src/evidence.test.ts",
    "supabase/migrations/20260813000100_evidence_foundation.sql",
    "scripts/verify-wave7.sh",
    "scripts/apply-wave7-batch1.py",
    "docs/Engineering-OS/BUILD_WAVE_7_BATCH_1_CANONICAL_EVIDENCE_FOUNDATION.md",
]

# Files this batch modifies, mapped to the SHA-256 of the pre-Batch-1 content
# they are expected to have.
MODIFIED_FILES = {
    "packages/shared-types/src/index.ts": "6e106e903debe116611ec8d6fe190c86626cdd7d6b607f1f9cc9031c344f2e89",
    "services/api/src/server.ts": "9c019b6ab959efb88e302946fb1ef9e49e04f3c8040766e93baaba3f12a2489c",
    "scripts/smoke-api.sh": "2a8952aa94be32fad7d176633a0733a19c3fdc342573eb7eb8a97731778167d5",
    "supabase/README.md": "dcaa960b2ae8d933ab18cad7cbe95196a10fe36eb19d3deff2723a8be05c7810",
    "package.json": "900ebacb6c3ea8d168ff48a007fedf04b5b3fa88324d994fac4b31ba1520b184",
}

EXECUTABLE_FILES = [
    "scripts/verify-wave7.sh",
    "scripts/apply-wave7-batch1.py",
]

# Post-conditions asserted against the repository after applying.
REQUIRED_CONTENT = [
    (
        "packages/shared-types/src/index.ts",
        [('evidence types are exported', 'export * from "./evidence";')],
        [],
    ),
    (
        "packages/shared-types/src/evidence.ts",
        [
            ("canonical Evidence Record type", "export interface EvidenceRecord"),
            ("provenance type", "export interface EvidenceProvenance"),
            ("trusted intake type", "export interface CreateCanonicalEvidenceInput"),
            ("deterministic canonical string", "export function buildEvidenceCanonicalString"),
            ("idempotency decision", "export function evaluateExistingEvidenceRecord"),
        ],
        [
            ("competency advancement instruction", "markCompetencyDemonstrated"),
            ("eligibility instruction", "evidenceEligible"),
        ],
    ),
    (
        "services/api/src/evidence.ts",
        [
            ("server-authoritative creation", "createServerSupabaseClient()"),
            ("user-scoped student reads", "createUserScopedSupabaseClient(accessToken)"),
            ("SHA-256 evidence digest", 'createHash("sha256")'),
            ("creation audit event", "evidence.record.created"),
            ("fail-closed conflict", '"CONFLICT"'),
        ],
        [
            ("assessment handoff consumption", "assessment_evidence_handoffs"),
            ("lab validation consumption", "lab_validation_runs"),
            ("competency evidence rewrite", "student_competency_evidence_refs"),
        ],
    ),
    (
        "services/api/src/server.ts",
        [
            ("evidence list route", 'pathname === "/evidence"'),
            ("evidence read route", "evidenceRecordMatch"),
            ("authenticated identity", "resolveTrustedRequestIdentity(request)"),
        ],
        [("Evidence creation reachable from HTTP", "createCanonicalEvidence")],
    ),
    (
        "supabase/migrations/20260813000100_evidence_foundation.sql",
        [
            ("evidence_records table", "create table if not exists public.evidence_records"),
            ("row level security", "alter table public.evidence_records enable row level security"),
            ("student select policy", "for select to authenticated"),
            ("logical identity key", "unique (user_id, source_type, source_reference)"),
            ("immutable provenance guard", "Canonical Evidence provenance is immutable"),
        ],
        [],
    ),
    (
        "scripts/smoke-api.sh",
        [
            ("evidence list is protected", "assert_status GET /evidence 401"),
            ("evidence read is protected", "assert_status GET /evidence/test-evidence 401"),
            ("no student evidence creation route", "assert_status POST /evidence 404"),
            ("wave 6 smoke coverage retained", "assert_status GET /lab-sessions 401"),
        ],
        [],
    ),
]


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class Applier:
    def __init__(self, package_root: Path, repo_root: Path, args: argparse.Namespace):
        self.package_root = package_root
        self.repo_root = repo_root
        self.dry_run = args.dry_run
        self.backup = not args.no_backup
        self.force = args.force
        self.changes: list[str] = []
        self.skipped: list[str] = []
        self.pending: list[str] = []
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        self.backup_dir = repo_root / ".w7b1-backup" / stamp

    # -------------------------------------------------- helpers

    def rel(self, path: Path) -> str:
        try:
            return str(path.relative_to(self.repo_root))
        except ValueError:
            return str(path)

    @staticmethod
    def read(path: Path) -> str:
        return path.read_text(encoding="utf-8")

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

    # -------------------------------------------------- steps

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

    def payload_text(self, relative: str) -> str | None:
        source = self.package_root / relative
        if not source.is_file():
            self.pending.append("payload file missing from package: " + relative)
            return None
        return self.read(source)

    def copy_new_files(self) -> None:
        for relative in NEW_FILES:
            content = self.payload_text(relative)
            if content is None:
                continue
            destination = self.repo_root / relative
            if destination.exists() and (self.package_root / relative).samefile(destination):
                self.skipped.append("in place: " + relative)
                continue
            self.write(destination, content, "new file")

    def replace_modified_files(self) -> None:
        for relative, pre_image_hash in MODIFIED_FILES.items():
            content = self.payload_text(relative)
            if content is None:
                continue
            destination = self.repo_root / relative
            if not destination.is_file():
                self.pending.append("expected repository file not found: " + relative)
                continue
            if destination.samefile(self.package_root / relative):
                self.skipped.append("in place: " + relative)
                continue

            current = self.read(destination)
            current_hash = sha256(current)

            if current == content:
                self.skipped.append("already applied: " + relative)
                continue
            if current_hash == pre_image_hash or self.force:
                self.write(destination, content, "wave 7 batch 1 update")
                continue

            self.pending.append(
                relative
                + ": local content differs from the expected pre-Batch-1 file "
                + "(sha256 "
                + current_hash[:12]
                + " vs expected "
                + pre_image_hash[:12]
                + "). Review and re-run with --force to replace it."
            )

    def set_executable(self) -> None:
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

    def run(self) -> int:
        self.validate_repo()
        self.copy_new_files()
        self.replace_modified_files()
        self.set_executable()
        if not self.dry_run:
            self.audit_post_conditions()

        print("Wave 7 / Batch 1 — apply report")
        print("repository: " + str(self.repo_root))
        if self.dry_run:
            print("mode: DRY RUN (no files written)")
        elif self.backup and self.backup_dir.exists():
            print("backups:    " + self.rel(self.backup_dir))

        print("\nChanges (" + str(len(self.changes)) + "):")
        for entry in self.changes:
            print("  + " + entry)
        if not self.changes:
            print("  (none — already applied)")

        if self.skipped:
            print("\nSkipped (" + str(len(self.skipped)) + "):")
            for entry in self.skipped:
                print("  . " + entry)

        if self.pending:
            print("\nPENDING INTEGRATION (" + str(len(self.pending)) + "):")
            for entry in self.pending:
                print("  ! " + entry)
            return 3

        print("\nPENDING INTEGRATION (0): none")
        print("\nBatch 1 applied. Next: bash scripts/verify-wave7.sh")
        return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply Wave 7 / Batch 1 (canonical Evidence foundation)."
    )
    parser.add_argument("--repo", default=None, help="repository root (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--no-backup", action="store_true", help="do not write .w7b1-backup/")
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
