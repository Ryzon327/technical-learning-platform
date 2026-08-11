#!/usr/bin/env python3
from pathlib import Path

root = Path("/Users/demetrius/Projects/technical-learning-platform")

index = root / "packages/shared-types/src/index.ts"
text = index.read_text()
line = 'export * from "./curriculum-quality";'
if line not in text:
    anchor = 'export * from "./curriculum-admin";'
    if anchor not in text:
        raise SystemExit("Unable to find shared-types export anchor.")
    text = text.replace(anchor, anchor + "\n" + line)
    index.write_text(text)
    print("UPDATED: packages/shared-types/src/index.ts")

admin = root / "services/api/src/curriculum-admin.ts"
text = admin.read_text()

quality_import = 'import { buildLearningPathQualityReport } from "./curriculum-quality";'
if quality_import not in text:
    anchor = 'import { createServerSupabaseClient } from "./supabase";'
    if anchor not in text:
        raise SystemExit("Unable to find curriculum-admin import anchor.")
    text = text.replace(anchor, anchor + "\n" + quality_import)

if "Curriculum cannot be published until quality checks pass" not in text:
    marker = '    const { error: descendantsError } = await supabase.rpc('
    if marker not in text:
        raise SystemExit("Unable to find publication marker.")

    block = (
        "    const quality = await buildLearningPathQualityReport(\n"
        "      learningPathId\n"
        "    );\n\n"
        "    if (!quality.valid) {\n"
        "      throw new AppError({\n"
        '        code: "CONFLICT",\n'
        '        message: "Curriculum cannot be published until quality checks pass",\n'
        "        retryable: false,\n"
        "        details: {\n"
        "          issues: quality.issues,\n"
        "          checklist: quality.checklist\n"
        "        }\n"
        "      });\n"
        "    }\n\n"
    )
    text = text.replace(marker, block + marker)

admin.write_text(text)
print("UPDATED: services/api/src/curriculum-admin.ts")
