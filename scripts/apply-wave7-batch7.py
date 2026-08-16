#!/usr/bin/env python3
"""Apply Wave 7 / Batch 7 — Evidence Export and Verification Hooks (EVID-008).

Package layout:

    payload/                    new files and replacement versions
    scripts/apply-wave7-batch7.py

Nothing is copied over the repository until the whole repository state has been
validated. Every file this batch replaces is checked against the SHA-256 of its
known pre-Batch-7 content first; if any of them has drifted, the script reports
the exact file and writes nothing at all.

Deterministic and idempotent:

  * validation runs to completion before the first write
  * every write is content-compared, so a second run reports zero changes
  * drifted files are reported, never silently overwritten (--force overrides)
  * originals are copied to .w7b7-backup/<timestamp>/ unless --no-backup
  * --dry-run performs zero writes and prints the plan

Usage:
    python3 scripts/apply-wave7-batch7.py [--repo PATH] [--dry-run]
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
    "packages/shared-types/src/evidence-export.ts",
    "packages/shared-types/src/evidence-export.test.ts",
    "packages/shared-types/src/evidence-routing.ts",
    "packages/shared-types/src/evidence-routing.test.ts",
    "services/api/src/evidence-export.ts",
    "supabase/migrations/20260813000600_evidence_verification_references.sql",
    "apps/web/src/evidence/EvidenceExportPanel.tsx",
    "docs/Engineering-OS/BUILD_WAVE_7_BATCH_7_EVIDENCE_EXPORT_VERIFICATION_HOOKS.md",
    "scripts/apply-wave7-batch7.py",
]

# Files this batch replaces, mapped to the SHA-256 of the pre-Batch-7 content.
MODIFIED_FILES = {
    "packages/shared-types/src/index.ts": "e7e9ed34f11900687d92779ccd00d8eaee78d15ed6fc393b9dca41051dc6f3f8",
    "services/api/src/server.ts": "692fbeab3f4497824de956b18b34a3d5262178eb36eca57f400806411aacbc67",
    "apps/web/src/evidence/EvidencePortfolioView.tsx": "aee875ac83b82f45916cd8c5fe7dada4e6545bb34b91c5d5b86e08af7cece10c",
    "apps/web/src/evidence/evidence-portfolio-service.ts": "17e68a4ef0ae409962dcb4d14fc25f409d6a26e24b20ba63d56d1aeef6fa4812",
    "scripts/verify-wave7.sh": "9dc5acf9f5f281d7134243dbe14a1b85a17a7f85154b9d01d6ac3a5d9c2feeda",
    "scripts/smoke-api.sh": "fcd755d170b278a5998f0b2c80ebce39f703e81a174d4e47d3ae7859460b2b0a",
    "supabase/README.md": "69d9608278144ff9b2f122925936345f95f58fef61680ccf0198470b65a2e26e",
}

EXECUTABLE_FILES = [
    "scripts/verify-wave7.sh",
    "scripts/smoke-api.sh",
    "scripts/apply-wave7-batch7.py",
]

# Batch 1 and Wave 3/4 artefacts this batch must find intact and leave alone.
REQUIRED_BASELINE = [
    (
        "services/api/src/evidence-portfolio.ts",
        "export async function getStudentEvidencePortfolio",
    ),
    (
        "packages/shared-types/src/evidence-portfolio.ts",
        "export function competencyReferenceKey",
    ),
    (
        "packages/shared-types/src/evidence-correction.ts",
        "export function resolveEffectiveEvidenceState",
    ),
    (
        "supabase/migrations/20260813000100_evidence_foundation.sql",
        "Canonical Evidence provenance is immutable",
    ),
    ("apps/web/src/lib/api-client.ts", "Authorization"),
    ("apps/web/src/auth/AuthProvider.tsx", "session"),
]

# Post-conditions asserted against the repository after applying.
REQUIRED_CONTENT = [
    (
        "packages/shared-types/src/index.ts",
        [("export types exported", 'export * from "./evidence-export";')],
        [],
    ),
    (
        "packages/shared-types/src/evidence-export.ts",
        [
            ("export projection", "export function toExportedEvidenceItem"),
            ("verification status rule", "export function deriveVerificationStatus"),
            ("verification payload design", "export function toVerificationPayload"),
            ("exact competency version", "competencyReferenceKey"),
        ],
        [
            ("integrity digest exposure", "integrityDigest"),
            ("provider exposure", "providerSessionId"),
            ("correction mechanics", "lastCorrectionReason"),
        ],
    ),
    (
        "services/api/src/evidence-export.ts",
        [
            ("reuses the portfolio projection", "getStudentEvidencePortfolio"),
            ("cryptographic identifier", "randomBytes("),
            ("stable identity", 'onConflict: "evidence_id"'),
            ("export audit", "evidence.export.requested"),
        ],
        [
            ("direct evidence access", 'from("evidence_records")'),
            ("record mutation", ".update("),
        ],
    ),
    (
        "supabase/migrations/20260813000600_evidence_verification_references.sql",
        [
            ("verification table", "create table if not exists public.evidence_verification_references"),
            ("row level security", "alter table public.evidence_verification_references enable row level security"),
            ("student select policy", "for select to authenticated"),
            ("immutable reference", "immutable once minted"),
            ("ownership guard", "must match the Evidence owner"),
        ],
        [
            ("evidence table alteration", "alter table public.evidence_records"),
            ("destructive statement", "drop table"),
        ],
    ),
    (
        "packages/shared-types/src/evidence-routing.ts",
        [
            ("reserved segment rule", "export function isReservedEvidencePathSegment"),
            ("export reserved", '"export"'),
            ("portfolio reserved", '"portfolio"'),
        ],
        [],
    ),
    (
        "services/api/src/server.ts",
        [
            ("export route", 'pathname === "/evidence/export"'),
            ("authenticated identity", "resolveTrustedRequestIdentity(request)"),
            ("reserved segment guard", "!isReservedEvidencePathSegment("),
        ],
        [("anonymous verification route", "publicVerification")],
    ),
    (
        "apps/web/src/evidence/EvidenceExportPanel.tsx",
        [
            ("export request", "requestEvidenceExport"),
            ("explains contents", "describeExportContents"),
            ("accessible table", "<caption>"),
            ("live region", "aria-live"),
        ],
        [("manual bearer header", "Bearer ")],
    ),
    (
        "apps/web/src/evidence/EvidencePortfolioView.tsx",
        [("export panel mounted", "EvidenceExportPanel")],
        [],
    ),
    (
        "scripts/verify-wave7.sh",
        [
            ("batch 1 checks preserved", "PASS: AI holds no Evidence authority"),
            ("batch 6 checks preserved", "PASS: Evidence portfolio read model exists and is exported"),
            ("batch 7 checks added", "PASS: Evidence export representation exists and is exported"),
        ],
        [],
    ),
    (
        "scripts/smoke-api.sh",
        [
            ("export protected", "assert_status POST /evidence/export 401"),
            ("no anonymous verification", "assert_status GET /verify/test-verification-id 404"),
            ("batch 6 smoke retained", "assert_status GET /evidence/portfolio 401"),
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
        self.backup_dir = repo_root / ".w7b7-backup" / stamp

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
                + ": local content differs from the expected pre-Batch-7 file "
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
            label = "new file" if relative in NEW_FILES else "wave 7 batch 7 update"
            self.write(self.repo_root / relative, content, label)

        if self.dry_run:
            return

        for relative in EXECUTABLE_FILES:
            target = self.repo_root / relative
            if target.exists():
                target.chmod(target.stat().st_mode | 0o111)

    # Batch 6 introduces a required runtime configuration value. The canonical
    # template already declares it, so no file is modified; this verifies the
    # contract still holds rather than silently depending on it.
    ENVIRONMENT_TEMPLATE_CANDIDATES = (
        ".env.example",
        ".env.sample",
        ".env.template",
    )

    def audit_environment_contract(self) -> None:
        for candidate in self.ENVIRONMENT_TEMPLATE_CANDIDATES:
            path = self.repo_root / candidate
            if not path.is_file():
                continue
            if "VITE_API_BASE_URL=" in self.read(path):
                self.skipped.append(
                    "environment contract satisfied: " + candidate
                )
                return
            self.pending.append(
                candidate
                + ": VITE_API_BASE_URL must be declared for the web application"
            )
            return

        self.pending.append(
            "no canonical environment template found declaring VITE_API_BASE_URL"
        )

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
        print("Wave 7 / Batch 7 — apply report")
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
        print("\nBatch 7 applied. Next: bash scripts/verify-wave7.sh")
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
            self.audit_environment_contract()

        return self.report()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply Wave 7 / Batch 7 (Evidence export and verification hooks)."
    )
    parser.add_argument("--repo", default=None, help="repository root (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--no-backup", action="store_true", help="do not write .w7b7-backup/")
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
