from pathlib import Path

def append_once(path: str, marker: str, addition: str) -> None:
    p = Path(path)
    text = p.read_text()
    if marker not in text:
        p.write_text(text.rstrip() + "\n" + addition + "\n")
        print(f"UPDATED: {path}")

append_once(
    ".env.example",
    "TLP_CONTAINER_PROVIDER_ENABLED=",
    """
# Container Lab Provider — disabled unless explicitly enabled.
TLP_CONTAINER_PROVIDER_ENABLED=false
TLP_CONTAINER_RUNTIME_BINARY=docker
TLP_CONTAINER_DEFAULT_IMAGE=
TLP_CONTAINER_ALLOWED_IMAGES=
TLP_CONTAINER_MAX_SESSIONS=10
TLP_CONTAINER_CPU_LIMIT=1
TLP_CONTAINER_MEMORY_MB=512
TLP_CONTAINER_PIDS_LIMIT=128
TLP_CONTAINER_TMPFS_MB=64
TLP_CONTAINER_COMMAND_TIMEOUT_MS=10000
""".strip()
)

append_once(
    "supabase/README.md",
    "20260812001400_container_runtime_hardening.sql",
    "- `20260812001400_container_runtime_hardening.sql` — Container Provider runtime-adapter hardening metadata; provider remains disabled by default."
)
