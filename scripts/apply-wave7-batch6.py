#!/usr/bin/env python3
"""Apply Wave 7 / Batch 6 — Student Evidence Portfolio View (EVID-007).

Package layout:

    payload/                    new files and replacement versions
    scripts/apply-wave7-batch6.py

Nothing is copied over the repository until the whole repository state has been
validated. Every file this batch replaces is checked against the SHA-256 of its
known pre-Batch-6 content first; if any of them has drifted, the script reports
the exact file and writes nothing at all.

Deterministic and idempotent:

  * validation runs to completion before the first write
  * every write is content-compared, so a second run reports zero changes
  * drifted files are reported, never silently overwritten (--force overrides)
  * originals are copied to .w7b6-backup/<timestamp>/ unless --no-backup
  * --dry-run performs zero writes and prints the plan

Usage:
    python3 scripts/apply-wave7-batch6.py [--repo PATH] [--dry-run]
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
    "packages/shared-types/src/evidence-portfolio.ts",
    "packages/shared-types/src/evidence-portfolio.test.ts",
    "services/api/src/evidence-portfolio.ts",
    "apps/web/src/lib/api-client.ts",
    "apps/web/src/lib/api-client.test.ts",
    "apps/web/src/evidence/evidence-portfolio-service.ts",
    "apps/web/src/evidence/EvidencePortfolioView.tsx",
    "docs/Engineering-OS/BUILD_WAVE_7_BATCH_6_STUDENT_EVIDENCE_PORTFOLIO.md",
    "scripts/apply-wave7-batch6.py",
]

# Files this batch replaces, mapped to the SHA-256 of the pre-Batch-6 content.
MODIFIED_FILES = {
    "packages/shared-types/src/index.ts": "0211890d629da329bdda04988ba20f76dc900ddbc11833f06e5ab1bf693cd15c",
    "services/api/src/evidence-competency.ts": "8a94765616856f9bc4683e3e851b01f593296703858fad0cf53e49894c37c22b",
    "services/api/src/curriculum.ts": "257941e32f150168d1875fe4886b0aade3408556fcd105b27a224d1b77f7122c",
    "services/api/src/server.ts": "743df190dca7783161a938ac2fa986e75e56591af3158ac88078711bef35a5e7",
    "apps/web/src/auth/AuthenticatedApp.tsx": "f0e5a4128725536f18d647c2267103f4fc7ad9280b380e84422024317532264b",
    "scripts/verify-wave7.sh": "69e31d51a3549970f0960309c53ac6b3b2c32d49685799e5e18c035a8e911c29",
    "scripts/smoke-api.sh": "294892e19fd8af0bcbe40ce4e98687e9a4362a8329876173f280b8600d331c1c",
}

EXECUTABLE_FILES = [
    "scripts/verify-wave7.sh",
    "scripts/smoke-api.sh",
    "scripts/apply-wave7-batch6.py",
]

# Batch 1 and Wave 3/4 artefacts this batch must find intact and leave alone.
REQUIRED_BASELINE = [
    ("services/api/src/evidence.ts", "export async function listStudentEvidence"),
    (
        "services/api/src/evidence-competency.ts",
        "export async function listEvidenceCompetencyLinks",
    ),
    (
        "services/api/src/evidence-correction.ts",
        "export async function loadCorrectionEventsByEvidence",
    ),
    (
        "packages/shared-types/src/evidence-correction.ts",
        "export function resolveEffectiveEvidenceState",
    ),
    ("services/api/src/curriculum.ts", "export async function getPublishedLearningPathTree"),
    ("apps/web/src/auth/AuthProvider.tsx", "session"),
    ("apps/web/src/lib/supabase.ts", "import.meta.env.VITE_SUPABASE_URL"),
    ("apps/web/package.json", '"@tlp/shared-types"'),
]

# Post-conditions asserted against the repository after applying.
REQUIRED_CONTENT = [
    (
        "packages/shared-types/src/index.ts",
        [("portfolio types exported", 'export * from "./evidence-portfolio";')],
        [],
    ),
    (
        "packages/shared-types/src/evidence-portfolio.ts",
        [
            ("filtering", "export function filterPortfolioItems"),
            ("grouping", "export function groupPortfolioItemsByCompetency"),
            ("filter normalization", "export function normalizePortfolioFilters"),
            ("readable status", "export function describeEffectiveStatus"),
            ("current proof rule", "export function isCurrentProof"),
        ],
        [
            ("integrity digest exposure", "integrityDigest"),
            ("owner exposure", "userId"),
            ("EVID-008 scope", "downloadable"),
        ],
    ),
    (
        "services/api/src/evidence-portfolio.ts",
        [
            ("reuses student evidence", "listStudentEvidence"),
            ("reuses batch link loader", "listEvidenceCompetencyLinksForEvidenceIds"),
            ("reuses curriculum accessor", "resolveCompetencyCurriculumContext"),
            ("reuses effective state", "effectiveState: record.effectiveState"),
        ],
        [
            ("write access", ".insert("),
            ("curriculum traversal", 'from("mission_competencies")'),
        ],
    ),
    (
        "services/api/src/curriculum.ts",
        [("competency curriculum accessor", "export async function resolveCompetencyCurriculumContext")],
        [],
    ),
    (
        "services/api/src/evidence-competency.ts",
        [("batch link loader", "export async function listEvidenceCompetencyLinksForEvidenceIds")],
        [],
    ),
    (
        "services/api/src/server.ts",
        [
            ("portfolio route", 'pathname === "/evidence/portfolio"'),
            ("authenticated identity", "resolveTrustedRequestIdentity(request)"),
        ],
        [],
    ),
    (
        "apps/web/src/lib/api-client.ts",
        [
            ("bearer handling", "Authorization: `Bearer ${accessToken}`"),
            ("base url convention", "VITE_API_BASE_URL"),
            ("normalized errors", "export class ApiRequestError"),
        ],
        [],
    ),
    (
        "apps/web/src/evidence/EvidencePortfolioView.tsx",
        [
            ("semantic landmark", "aria-labelledby"),
            ("live region", "aria-live"),
            ("labelled controls", "<label htmlFor"),
            ("readable status", "statusLabel"),
        ],
        [("manual bearer header", "Bearer ")],
    ),
    (
        "apps/web/src/auth/AuthenticatedApp.tsx",
        [
            ("portfolio integrated", "EvidencePortfolioView"),
            ("accessible navigation", "aria-current"),
        ],
        [("routing library", "react-router")],
    ),
    (
        "scripts/verify-wave7.sh",
        [
            ("batch 1 checks preserved", "PASS: AI holds no Evidence authority"),
            ("batch 5 checks preserved", "PASS: AI holds no Evidence correction authority"),
            ("batch 6 checks added", "PASS: Evidence portfolio read model exists and is exported"),
        ],
        [],
    ),
    (
        "scripts/smoke-api.sh",
        [
            ("portfolio read protected", "assert_status GET /evidence/portfolio 401"),
            ("batch 5 smoke retained", "assert_status GET /evidence/test-evidence/corrections 401"),
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
        self.backup_dir = repo_root / ".w7b6-backup" / stamp

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
                + ": local content differs from the expected pre-Batch-6 file "
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
            label = "new file" if relative in NEW_FILES else "wave 7 batch 6 update"
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
        print("Wave 7 / Batch 6 — apply report")
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
        print("\nBatch 6 applied. Next: bash scripts/verify-wave7.sh")
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
        description="Apply Wave 7 / Batch 6 (student Evidence portfolio view)."
    )
    parser.add_argument("--repo", default=None, help="repository root (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--no-backup", action="store_true", help="do not write .w7b6-backup/")
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
