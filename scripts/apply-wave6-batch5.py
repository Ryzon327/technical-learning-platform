from pathlib import Path

def append_once(path: str, marker: str, addition: str) -> None:
    p = Path(path)
    text = p.read_text()
    if marker not in text:
        p.write_text(text.rstrip() + "\n" + addition + "\n")
        print(f"UPDATED: {path}")

append_once(
    "packages/shared-types/src/index.ts",
    'export * from "./lab-automation";',
    'export * from "./lab-automation";'
)

append_once(
    "supabase/README.md",
    "20260812001200_lab_health_capacity_automation.sql",
    "- `20260812001200_lab_health_capacity_automation.sql` — provider health/capacity snapshots, automation cycle history, and uniqueness for open Lab operations."
)

p = Path("services/api/src/lab-operations.ts")
text = p.read_text()
old = '''    .eq("state", "failed")
    .lte("next_attempt_at", now)
'''
new = '''    .in("state", ["pending", "failed"])
    .lte("next_attempt_at", now)
'''
if old in text:
    text = text.replace(old, new, 1)
elif '.in("state", ["pending", "failed"])' not in text:
    raise SystemExit("ERROR: due Lab operation query anchor missing")
p.write_text(text)
print("UPDATED: services/api/src/lab-operations.ts")
