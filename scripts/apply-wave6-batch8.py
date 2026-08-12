from pathlib import Path
import json

# ============================================================
# 1. Add Container Provider canary admin command.
# ============================================================

p = Path("services/api/package.json")
data = json.loads(p.read_text())

scripts = data.setdefault("scripts", {})

scripts.setdefault(
    "lab:container:canary",
    "tsx src/admin/run-container-canary.ts"
)

p.write_text(json.dumps(data, indent=2) + "\n")
print("UPDATED: services/api/package.json")


# ============================================================
# 2. Document the new Supabase migration.
# ============================================================

p = Path("supabase/README.md")
t = p.read_text()

marker = "20260812001500_container_provider_canary_gate.sql"

addition = (
    "- `20260812001500_container_provider_canary_gate.sql` — "
    "server-only Container Provider canary history and explicit "
    "activation-state gate."
)

if marker not in t:
    p.write_text(t.rstrip() + "\n" + addition + "\n")
    print("UPDATED: supabase/README.md")
else:
    print("UNCHANGED: supabase/README.md already contains Batch 8 migration")


print("Wave 6 Batch 8 apply step complete.")
