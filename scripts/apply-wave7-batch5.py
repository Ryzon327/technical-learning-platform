#!/usr/bin/env python3
"""Apply Wave 7 / Batch 5 — Evidence Review and Correction History (EVID-006).

Package layout:

    payload/                    new files and replacement versions
    scripts/apply-wave7-batch5.py

Nothing is copied over the repository until the whole repository state has been
validated. Every file this batch replaces is checked against the SHA-256 of its
known pre-Batch-5 content first; if any of them has drifted, the script reports
the exact file and writes nothing at all.

Deterministic and idempotent:

  * validation runs to completion before the first write
  * every write is content-compared, so a second run reports zero changes
  * drifted files are reported, never silently overwritten (--force overrides)
  * originals are copied to .w7b5-backup/<timestamp>/ unless --no-backup
  * --dry-run performs zero writes and prints the plan

Usage:
    python3 scripts/apply-wave7-batch5.py [--repo PATH] [--dry-run]
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
    "packages/shared-types/src/evidence-correction.ts",
    "packages/shared-types/src/evidence-correction.test.ts",
    "services/api/src/evidence-correction.ts",
    "services/api/src/evidence-correction.test.ts",
    "supabase/migrations/20260813000500_evidence_correction_history.sql",
    "docs/Engineering-OS/BUILD_WAVE_7_BATCH_5_EVIDENCE_REVIEW_CORRECTION_EFFECTIVE_STATE.md",
    "scripts/apply-wave7-batch5.py",
]

# Files this batch replaces, mapped to the SHA-256 of the pre-Batch-5 content.
MODIFIED_FILES = {
    "packages/shared-types/src/index.ts": "911c4185a3c862e1bd6976f4d3449522e7e41af8fee4e81a79fb79e111be8008",
    "packages/shared-types/src/evidence-competency.ts": "bd65b7cbc444361e884875a2aebde8bbc6b7e6e9724a412bcdeffbf1125a44b1",
    "services/api/src/evidence.ts": "4ee10e8ff44607887075d82a65d6756b345194efd00c35c5fd0507d277f71bec",
    "services/api/src/evidence-competency.ts": "5856fd0d8a261f03be25a77a6901fbf8f42c59a0b512d95d7216e3e5f0dcd824",
    "services/api/src/server.ts": "d4105a3333541c1d85283c6c00aef91d0915aad2b42c7123b72d245c9155c429",
    "scripts/verify-wave7.sh": "28539d3fad6166448b490fd3767866ee9f4f94d99fb166f1409ad42d774a937a",
    "scripts/smoke-api.sh": "02aad7e8ee54d2b90d3fcd136e94c512d253a8f62b989edab3bf72c9202fda6b",
    "supabase/README.md": "f08673fa494457ba9a223563ee3b5a7f02e4d67702f36c2f72168446b1d01afa",
}

EXECUTABLE_FILES = [
    "scripts/verify-wave7.sh",
    "scripts/smoke-api.sh",
    "scripts/apply-wave7-batch5.py",
]

# Batch 1 and Wave 3/4 artefacts this batch must find intact and leave alone.
REQUIRED_BASELINE = [
    (
        "supabase/migrations/20260811000200_authentication_foundation.sql",
        "check (role in ('student', 'founder_admin'))",
    ),
    (
        "supabase/migrations/20260813000100_evidence_foundation.sql",
        "Canonical Evidence provenance is immutable",
    ),
    (
        "supabase/migrations/20260813000200_evidence_competency_linking.sql",
        "create table if not exists public.evidence_competency_links",
    ),
    ("services/api/src/authorization.ts", "requireFounderAdmin"),
    ("services/api/src/evidence.ts", "export function mapEvidenceRecordRow"),
    (
        "services/api/src/evidence-competency.ts",
        "export async function getQualifyingCompetencyEvidenceReferences",
    ),
]

# Post-conditions asserted against the repository after applying.
REQUIRED_CONTENT = [
    (
        "packages/shared-types/src/index.ts",
        [("correction types exported", 'export * from "./evidence-correction";')],
        [],
    ),
    (
        "packages/shared-types/src/evidence-correction.ts",
        [
            ("correction event model", "export interface EvidenceCorrectionEvent"),
            ("effective state resolver", "export function resolveEffectiveEvidenceState"),
            ("transition rules", "export function evaluateCorrectionTransition"),
            ("trust guard", "export function isEffectivelyTrustedEvidence"),
            ("reason requirement", "export function validateCorrectionReason"),
            ("privileged authority", "EVIDENCE_CORRECTION_AUTHORITY"),
        ],
        [("competing state vocabulary", '"under_review"')],
    ),
    (
        "packages/shared-types/src/evidence-competency.ts",
        [
            ("effective state on references", "evidenceEffectiveState"),
            ("review flag on references", "evidenceUnderReview"),
        ],
        [],
    ),
    (
        "services/api/src/evidence-correction.ts",
        [
            ("privileged guard", "requireCorrectionAuthority"),
            ("server-authoritative writes", "createServerSupabaseClient()"),
            ("student-scoped reads", "createUserScopedSupabaseClient(accessToken)"),
            ("stale-state guard", "expectedPreviousState"),
            ("idempotent retry", "findByIdempotencyKey"),
            ("ownership from the record", "user_id: record.userId"),
            ("correction audit", "evidence.review."),
        ],
        [
            ("history mutation", ".update("),
            ("history deletion", ".delete("),
            ("mastery mutation", "student_competency_state"),
            ("certificate work", "certificate"),
        ],
    ),
    (
        "services/api/src/evidence-competency.ts",
        [
            ("read-time correction load", "loadCorrectionEventsByEvidence"),
            ("effective state resolution", "resolveEffectiveEvidenceState"),
            ("trust gate", "isEffectivelyTrustedEvidence"),
        ],
        [],
    ),
    (
        "services/api/src/evidence.ts",
        [
            ("student effective state", "withEffectiveEvidenceState"),
            ("correction load", "loadCorrectionEventsByEvidence"),
        ],
        [],
    ),
    (
        "supabase/migrations/20260813000500_evidence_correction_history.sql",
        [
            ("correction table", "create table if not exists public.evidence_correction_events"),
            ("row level security", "alter table public.evidence_correction_events enable row level security"),
            ("student select policy", "for select to authenticated"),
            ("append-only guard", "append-only and cannot be updated"),
            ("privileged authority", "actor_role in ('founder_admin')"),
            ("sequence concurrency", "unique (evidence_id, sequence_number)"),
            ("idempotency", "unique (evidence_id, idempotency_key)"),
            ("no self supersession", "superseding_evidence_id <> evidence_id"),
            ("no circular supersession", "Circular Evidence supersession is not permitted"),
        ],
        [
            ("evidence record alteration", "alter table public.evidence_records"),
            ("provenance trigger weakening", "guard_evidence_record_provenance"),
            ("destructive statement", "drop table"),
        ],
    ),
    (
        "services/api/src/server.ts",
        [
            ("student history route", "evidenceCorrectionsMatch"),
            ("privileged correction route", "adminEvidenceCorrectionsMatch"),
            ("existing founder guard", "await founder(request)"),
        ],
        [],
    ),
    (
        "scripts/verify-wave7.sh",
        [
            ("batch 1 checks preserved", "PASS: AI holds no Evidence authority"),
            ("batch 2 checks preserved", "PASS: AI holds no competency mapping authority"),
            ("batch 3 checks preserved", "PASS: AI holds no assessment Evidence authority"),
            ("batch 4 checks preserved", "PASS: AI holds no Lab Evidence authority"),
            ("batch 5 checks added", "PASS: AI holds no Evidence correction authority"),
        ],
        [],
    ),
    (
        "scripts/smoke-api.sh",
        [
            ("student correction read protected", "assert_status GET /evidence/test-evidence/corrections 401"),
            ("privileged correction route protected", "assert_status GET /admin/evidence/test-evidence/corrections 401"),
            ("batch 4 smoke retained", "assert_status GET /lab-sessions/test-session/evidence 401"),
            ("batch 1 smoke retained", "assert_status GET /evidence 401"),
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
        self.backup_dir = repo_root / ".w7b5-backup" / stamp

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
                + ": local content differs from the expected pre-Batch-5 file "
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
            label = "new file" if relative in NEW_FILES else "wave 7 batch 5 update"
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
        print("Wave 7 / Batch 5 — apply report")
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
        print("\nBatch 5 applied. Next: bash scripts/verify-wave7.sh")
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
        description="Apply Wave 7 / Batch 5 (Evidence review and correction history)."
    )
    parser.add_argument("--repo", default=None, help="repository root (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--no-backup", action="store_true", help="do not write .w7b5-backup/")
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
