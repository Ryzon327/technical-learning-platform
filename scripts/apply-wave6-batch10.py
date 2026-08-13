#!/usr/bin/env python3
"""Apply Wave 6 / Batch 10 — Provider-Aware Student Runtime.

Safe, deterministic and idempotent:

  * every file write is content-compared first, so a second run is a no-op
  * every file this batch modifies is verified against the known pre-image
    before it is replaced; unexpected local drift is reported, never clobbered
  * originals are backed up under .w6b10-backup/<timestamp>/ unless --no-backup
  * --dry-run performs zero writes and prints the plan
  * the completion verifier is patched with an explicit, marker-guarded block

Usage:
    python3 scripts/apply-wave6-batch10.py [--repo PATH] [--dry-run]
                                           [--no-backup] [--force]

Exit codes:
    0  applied cleanly (or already applied)
    1  error
    3  applied, but manual integration points remain (see report)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

SH_MARKER_BEGIN = "# >>> TLP WAVE 6 / BATCH 10 (provider-aware student runtime) >>>"
SH_MARKER_END = "# <<< TLP WAVE 6 / BATCH 10 <<<"

GAP_MARKER = "controlled Container Provider rollout is not wired"

API_SRC = "services/api/src"

# Files this batch adds. They have no pre-image.
NEW_FILES = [
    "services/api/src/lab-provider-rollout.ts",
    "services/api/src/lab-provider-selection.ts",
    "tests/wave6-batch10/lab-provider-rollout.w6b10.test.ts",
    "tests/wave6-batch10/lab-provider-selection.w6b10.test.ts",
    "tests/wave6-batch10/lab-session-lifecycle.w6b10.test.ts",
    "tests/wave6-batch10/lab-integration-wiring.w6b10.test.ts",
    "scripts/lib/w6b10-provider-wiring-checks.sh",
    "scripts/verify-wave6-batch10.sh",
    "scripts/apply-wave6-batch10.py",
    "docs/Engineering-OS/BUILD_WAVE_6_BATCH_10_PROVIDER_AWARE_STUDENT_RUNTIME.md",
]

# Files this batch replaces, mapped to the SHA-256 of the pre-Batch-10 content
# they are expected to have. A repository file that matches neither the
# pre-image nor the post-image has diverged and is reported instead of
# overwritten (use --force to override deliberately).
MODIFIED_FILES = {
    "packages/shared-types/src/labs.ts": "cbb498dff813884fa33cf509af346039a84bfdf478305896f6935d81855b5416",
    "services/api/src/lab-provider-registry.ts": "b2ba385f62d02f795b382c7a07ee22f6355dca0fd4ceed615b01ddd7df6fb0e0",
    "services/api/src/lab-sessions.ts": "b98fc8d98f897dc41e4db9ce5b0b69e2254c3a1f7e2335df4e35b0892eb67f8f",
    "services/api/src/lab-runtime.ts": "f2a75e8f7463d6ab8b523daf66c1cf6054374edc6338bd730c36f5d4fb283fb7",
    "services/api/src/lab-operations.ts": "2182d0e002f4b4ec6c93754793ecdac54d7d28f7267cc2eff9911ce4d10bccc8",
    "services/api/src/lab-automation.ts": "4ca33004018f80f4b09735b01559c486dc783479eeb5c75a0fcb6225174dd15f",
}

EXECUTABLE_FILES = [
    "scripts/verify-wave6-batch10.sh",
    "scripts/lib/w6b10-provider-wiring-checks.sh",
    "scripts/apply-wave6-batch10.py",
]

TEST_FILES = [
    "tests/wave6-batch10/lab-provider-rollout.w6b10.test.ts",
    "tests/wave6-batch10/lab-provider-selection.w6b10.test.ts",
    "tests/wave6-batch10/lab-session-lifecycle.w6b10.test.ts",
    "tests/wave6-batch10/lab-integration-wiring.w6b10.test.ts",
]

NPM_SCRIPTS = {
    "verify:wave6-batch10": "bash scripts/verify-wave6-batch10.sh",
    "test:wave6-batch10": "tsx --test " + " ".join(TEST_FILES),
}

# Post-conditions asserted against the real service files after applying.
CALL_SITE_EXPECTATIONS = [
    (
        "services/api/src/lab-sessions.ts",
        [
            ("requestLabSession must select a provider", r"chooseLabProviderOrNull\("),
            ("provisioning must use the selected provider", r"await provider\.provision\("),
            ("start must use the persisted provider", r"await provider\.start\("),
            ("end must use the persisted provider", r"await provider\.destroy\("),
            ("persisted provider must be resolved", r"providerForRef\("),
        ],
        [
            ("direct mockLabProvider calls", r"mockLabProvider"),
            ("Mock-only provider guard", r"providerId\s*!==\s*[\"']mock[\"']"),
        ],
    ),
    (
        "services/api/src/lab-runtime.ts",
        [
            ("providerRef must resolve the persisted provider", r"getLabProvider\("),
            ("providerRef must expose providerSessionId", r"providerSessionId"),
            ("access delivery must be provider-aware", r"ref\.provider\.getConnection\("),
            ("reset must be provider-aware", r"ref\.provider\.reset\("),
            ("validation must use the provider probe", r"ref\.provider\.runValidationProbe\("),
        ],
        [
            ("direct mockLabProvider calls", r"mockLabProvider"),
            ("Mock-only provider guard", r"provider_id\)\s*!==\s*[\"']mock[\"']"),
        ],
    ),
    (
        "services/api/src/lab-operations.ts",
        [
            ("isolation attestation must be provider-aware", r"provider\.getIsolationStatus\("),
            ("isolation mode must be provider-specific", r"labProviderIsolationMode\("),
            ("cleanup must use the persisted provider", r"getLabProvider\(ref\.providerId\)\.destroy\("),
        ],
        [
            ("direct mockLabProvider calls", r"mockLabProvider"),
            ("Mock-only provider guard", r"providerId\s*!==\s*[\"']mock[\"']"),
            ("Container rejected as unsupported", r"Unsupported provider for cleanup"),
        ],
    ),
    (
        "services/api/src/lab-automation.ts",
        [
            ("queued provisioning must select a provider", r"chooseLabProviderOrNull\("),
            ("queued provisioning must persist the selected provider", r"provider_id: providerId"),
        ],
        [("direct mockLabProvider provisioning", r"mockLabProvider\s*\.\s*provision")],
    ),
    (
        "services/api/src/lab-provider-registry.ts",
        [
            ("registry must read the control plane", r"lab_provider_registry"),
            ("runtime enablement gate must exist", r"TLP_CONTAINER_PROVIDER_ENABLED"),
            ("selection must be exposed", r"export async function chooseLabProvider\("),
            ("resolution must be exposed", r"export function getLabProvider\("),
            ("DEPENDENCY_UNAVAILABLE contract preserved", r"DEPENDENCY_UNAVAILABLE"),
        ],
        [("Container hardcoded as enabled", r"providerId: \"container\",[\s\S]{0,160}enabled: true")],
    ),
    (
        "packages/shared-types/src/labs.ts",
        [
            ("isolation contract must exist", r"export interface LabProviderIsolationStatus"),
            ("LabProvider must declare getIsolationStatus", r"getIsolationStatus\(sessionId: string\)"),
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
        self.backup_dir = repo_root / ".w6b10-backup" / stamp

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
        required = [Path(API_SRC), Path("packages/shared-types/src")]
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
                self.write(destination, content, "provider-aware rewrite")
                continue

            self.pending.append(
                relative
                + ": local content differs from the expected pre-Batch-10 file "
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

    def patch_completion_verifier(self) -> None:
        path = self.repo_root / "scripts" / "verify-lab-engine-completion.sh"
        if not path.is_file():
            self.pending.append(
                "scripts/verify-lab-engine-completion.sh not found; cannot retire the "
                "controlled-rollout gap message"
            )
            return

        source = self.read(path)
        original = source

        if "w6b10-provider-wiring-checks.sh" not in source:
            lines = source.splitlines(keepends=True)
            insert_at = 0
            for index, line in enumerate(lines[:20]):
                stripped = line.strip()
                if index == 0 and stripped.startswith("#!"):
                    insert_at = 1
                elif stripped.startswith("set "):
                    insert_at = index + 1
            block = (
                "\n"
                + SH_MARKER_BEGIN
                + "\n"
                + 'W6B10_CHECKS_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)'
                + '/lib/w6b10-provider-wiring-checks.sh"\n'
                + 'if [ -f "$W6B10_CHECKS_LIB" ]; then\n'
                + "  # shellcheck source=/dev/null\n"
                + '  . "$W6B10_CHECKS_LIB"\n'
                + "else\n"
                + "  tlp_w6b10_provider_wiring_unwired() { return 0; }\n"
                + "fi\n"
                + SH_MARKER_END
                + "\n"
            )
            lines.insert(insert_at, block)
            source = "".join(lines)

        lines = source.splitlines(keepends=True)
        rebuilt: list[str] = []
        wrapped = 0
        for line in lines:
            if GAP_MARKER in line and "tlp_w6b10_provider_wiring_unwired" not in line:
                if rebuilt and "tlp_w6b10_provider_wiring_unwired" in rebuilt[-1]:
                    rebuilt.append(line)
                    continue
                indent = line[: len(line) - len(line.lstrip())]
                rebuilt.append(indent + "if tlp_w6b10_provider_wiring_unwired; then\n")
                rebuilt.append("  " + line if line.strip() else line)
                rebuilt.append(indent + "fi\n")
                wrapped += 1
            else:
                rebuilt.append(line)
        source = "".join(rebuilt)

        if wrapped == 0 and GAP_MARKER not in original:
            self.pending.append(
                "no controlled-rollout gap message found in "
                "scripts/verify-lab-engine-completion.sh — confirm the verifier "
                "actually checks the provider wiring"
            )

        if source != original:
            self.write(path, source, "completion verifier: gap now conditional")
        else:
            self.skipped.append(
                "already patched: scripts/verify-lab-engine-completion.sh"
            )

    def patch_package_json(self) -> None:
        path = self.repo_root / "package.json"
        if not path.is_file():
            self.skipped.append("no package.json at repository root")
            return
        raw = self.read(path)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as error:
            self.pending.append("package.json is not valid JSON (" + str(error) + ")")
            return

        scripts = data.get("scripts")
        if not isinstance(scripts, dict):
            scripts = {}
            data["scripts"] = scripts

        changed = False
        for name, command in NPM_SCRIPTS.items():
            if scripts.get(name) != command:
                scripts[name] = command
                changed = True

        if not changed:
            self.skipped.append("package.json scripts already present")
            return

        indent: object = 2
        match = re.search(r"\n(\s+)\"", raw)
        if match:
            candidate = match.group(1)
            indent = "\t" if "\t" in candidate else len(candidate)

        self.write(path, json.dumps(data, indent=indent, ensure_ascii=False) + "\n", "npm scripts")

    def audit_call_sites(self) -> None:
        for relative, required, forbidden in CALL_SITE_EXPECTATIONS:
            path = self.repo_root / relative
            if not path.is_file():
                self.pending.append("expected file not found: " + relative)
                continue
            text = self.read(path)
            for label, pattern in required:
                if not re.search(pattern, text):
                    self.pending.append(relative + ": " + label)
            for label, pattern in forbidden:
                if re.search(pattern, text):
                    self.pending.append(relative + ": remove " + label)

    # -------------------------------------------------- driver

    def run(self) -> int:
        self.validate_repo()
        self.copy_new_files()
        self.replace_modified_files()
        self.set_executable()
        self.patch_completion_verifier()
        self.patch_package_json()
        if not self.dry_run:
            self.audit_call_sites()

        print("Wave 6 / Batch 10 — apply report")
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
        print("\nBatch 10 applied. Next: bash scripts/verify-wave6-batch10.sh")
        return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply Wave 6 / Batch 10 (provider-aware student runtime)."
    )
    parser.add_argument("--repo", default=None, help="repository root (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="print the plan, write nothing")
    parser.add_argument("--no-backup", action="store_true", help="do not write .w6b10-backup/")
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
        if (candidate / API_SRC).is_dir() and (candidate / "packages").is_dir():
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
