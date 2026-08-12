from pathlib import Path
import json

# Shared type export.
p = Path("packages/shared-types/src/index.ts")
text = p.read_text()

export_line = 'export * from "./lab-rollout";'

if export_line not in text:
    p.write_text(text.rstrip() + "\n" + export_line + "\n")
    print("UPDATED: packages/shared-types/src/index.ts")

# API admin command.
p = Path("services/api/package.json")
data = json.loads(p.read_text())
scripts = data.setdefault("scripts", {})

scripts.setdefault(
    "lab:container:rollout",
    "tsx src/admin/manage-container-rollout.ts"
)

p.write_text(json.dumps(data, indent=2) + "\n")
print("UPDATED: services/api/package.json")

# Migration documentation.
p = Path("supabase/README.md")
text = p.read_text()
marker = "20260812001600_container_provider_controlled_rollout.sql"

addition = (
    "- `20260812001600_container_provider_controlled_rollout.sql` — "
    "explicit Container Provider activation guard, allowlist/percentage/all "
    "rollout modes, and suspension-safe rollback."
)

if marker not in text:
    p.write_text(text.rstrip() + "\n" + addition + "\n")
    print("UPDATED: supabase/README.md")
