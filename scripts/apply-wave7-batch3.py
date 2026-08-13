#!/usr/bin/env python3
"""Apply Wave 7 / Batch 3 — Assessment Evidence (EVID-005).

Package layout:

    payload/                    new files and replacement versions
    scripts/apply-wave7-batch3.py

Nothing is copied over the repository until the whole repository state has been
validated. Every file this batch replaces is checked against the SHA-256 of its
known pre-Batch-3 content first; if any of them has drifted, the script reports
the exact file and writes nothing at all.

Deterministic and idempotent:

  * validation runs to completion before the first write
  * every write is content-compared, so a second run reports zero changes
  * drifted files are reported, never silently overwritten (--force overrides)
  * originals are copied to .w7b3-backup/<timestamp>/ unless --no-backup
  * --dry-run performs zero writes and prints the plan

Usage:
    python3 scripts/apply-wave7-batch3.py [--repo PATH] [--dry-run]
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
    "packages/shared-types/src/assessment-evidence.ts",
    "packages/shared-types/src/assessment-evidence.test.ts",
    "services/api/src/assessment-evidence.ts",
    "services/api/src/assessment-evidence.test.ts",
    "supabase/migrations/20260813000300_assessment_evidence_consumption.sql",
    "docs/Engineering-OS/BUILD_WAVE_7_BATCH_3_ASSESSMENT_EVIDENCE.md",
    "scripts/apply-wave7-batch3.py",
]

# Files this batch replaces, mapped to the SHA-256 of the pre-Batch-3 content.
MODIFIED_FILES = {
    "packages/shared-types/src/index.ts": "cf03d599c7ce1f6e21579d61b82258e776f5d9d8f38fc5023db2934056e85b8a",
    "packages/shared-types/src/evidence-competency.ts": "7fbd23cff8b5903096ebd016e5a37dd575d9109bbcd267869910c09255ea8de8",
    "services/api/src/evidence-competency.ts": "793ccc0e8d7a4648653d816b5b2e7cc4810a71927466b4aa1a06afde9aa6524e",
    "services/api/src/assessment-attempts.ts": "b89d691815b7cbf09b66815664ad88d4256f067a26d29429f0aec8f6f354bdc1",
    "services/api/src/server.ts": "9240affeb9accbfca29b43692e5f8bb3d0c6008f38111f5d2d28f54ded118414",
    "scripts/verify-wave7.sh": "e69412e8cb18738b0456ad2c318d1328ec9b5c43b1f6df9f3d4be6392dbb9644",
    "scripts/smoke-api.sh": "57a27a383506615becc04fe078f2b4708d51010783c6d3b271182d4d6d496016",
    "supabase/README.md": "c074f2ecbc5dc014f0e51e34af81cbd20eb12b92fff77cc2a5fd5573009e1ac8",
}

EXECUTABLE_FILES = [
    "scripts/verify-wave7.sh",
    "scripts/smoke-api.sh",
    "scripts/apply-wave7-batch3.py",
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
        "supabase/migrations/20260812000400_assessment_recovery_integrity.sql",
        "create table if not exists public.assessment_evidence_handoffs",
    ),
    (
        "services/api/src/assessment-recovery.ts",
        "export async function buildAssessmentEvidenceHandoff",
    ),
    ("services/api/src/evidence.ts", "export async function createCanonicalEvidence"),
    (
        "services/api/src/evidence-competency.ts",
        "export async function linkEvidenceToCompetency",
    ),
]

# Post-conditions asserted against the repository after applying.
REQUIRED_CONTENT = [
    (
        "packages/shared-types/src/index.ts",
        [("assessment evidence types exported", 'export * from "./assessment-evidence";')],
        [],
    ),
    (
        "packages/shared-types/src/assessment-evidence.ts",
        [
            ("eligibility rule", "export function evaluateAssessmentEvidenceEligibility"),
            ("bounded metadata builder", "export function buildAssessmentEvidenceMetadata"),
            ("relationship mapping", "export function toEvidenceCompetencyRelationship"),
        ],
        [("answer key exposure", "correctOptionIds:")],
    ),
    (
        "packages/shared-types/src/evidence-competency.ts",
        [
            ("evidence outcome contract", "export type EvidenceOutcome"),
            ("outcome derivation", "export function deriveEvidenceOutcome"),
            ("demonstration guard", "qualifiesForDemonstration"),
        ],
        [],
    ),
    (
        "services/api/src/evidence-competency.ts",
        [
            ("outcome reported on references", "qualifiesForDemonstration"),
            (
                "mastery-safe accessor",
                "export async function getQualifyingCompetencyEvidenceReferences",
            ),
        ],
        [("assessment handoff coupling", "assessment_evidence_handoffs")],
    ),
    (
        "services/api/src/assessment-evidence.ts",
        [
            ("server-authoritative ingestion", "createServerSupabaseClient()"),
            ("canonical evidence creation", "createCanonicalEvidence("),
            ("competency linking", "linkEvidenceToCompetency("),
            ("upstream digest preserved", "sourceIntegrityDigest: facts.resultDigest"),
            ("exact competency versions", "competency_stable_id,competency_version,required"),
            ("non-throwing submission wrapper", "export async function tryConsumeAssessmentEvidenceHandoff"),
            ("durable retry", "export async function retryFailedAssessmentEvidenceConsumption"),
            ("consumption audit", "assessment.evidence.consumed"),
        ],
        [
            ("scoring recomputation", "calculateAssessmentResultDigest"),
            ("answer key access", "assessment_attempt_answers"),
            ("selected answer access", "selected_option_ids"),
        ],
    ),
    (
        "services/api/src/assessment-attempts.ts",
        [("submission triggers ingestion", "tryConsumeAssessmentEvidenceHandoff")],
        [("throwing ingestion on the submission path", "consumeAssessmentEvidenceHandoff(")],
    ),
    (
        "supabase/migrations/20260813000300_assessment_evidence_consumption.sql",
        [
            ("consumption state table", "create table if not exists public.assessment_evidence_consumptions"),
            ("row level security", "alter table public.assessment_evidence_consumptions enable row level security"),
            ("bounded states", "state in ('consumed', 'skipped', 'failed')"),
        ],
        [
            ("student policy on internal state", "create policy"),
            ("upstream table alteration", "alter table public.assessment_evidence_handoffs"),
            ("destructive statement", "drop table"),
        ],
    ),
    (
        "services/api/src/server.ts",
        [
            ("attempt evidence read route", "assessmentEvidenceMatch"),
            ("authenticated identity", "resolveTrustedRequestIdentity(request)"),
        ],
        [("ingestion reachable from HTTP", "consumeAssessmentEvidenceHandoff")],
    ),
    (
        "scripts/verify-wave7.sh",
        [
            ("batch 1 checks preserved", "PASS: AI holds no Evidence authority"),
            ("batch 2 checks preserved", "PASS: AI holds no competency mapping authority"),
            ("batch 3 checks added", "PASS: AI holds no assessment Evidence authority"),
        ],
        [],
    ),
    (
        "scripts/smoke-api.sh",
        [
            ("attempt evidence read protected", "assert_status GET /assessment-attempts/test-attempt/evidence 401"),
            ("no student mutation route", "assert_status POST /assessment-attempts/test-attempt/evidence 404"),
            ("batch 2 smoke retained", "assert_status GET /evidence/test-evidence/competencies 401"),
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
        self.backup_dir = repo_root / ".w7b3-backup" / stamp

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
                + ": local content differs from the expected pre-Batch-3 file "
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
            label = "new file" if relative in NEW_FILES else "wave 7 batch 3 update"
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
        print("Wave 7 / Batch 3 — apply report")
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
        print("\nBatch 3 applied. Next: bash scripts/verify-wave7.sh")
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
        description="Apply Wave 7 / Batch 3 (assessment Evidence)."
    )
    parser.add_argument("--repo", default=None, help="repository root (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--no-backup", action="store_true", help="do not write .w7b3-backup/")
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
