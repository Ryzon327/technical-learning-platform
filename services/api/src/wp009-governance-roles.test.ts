import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * WP-009 — the 2026-10-11 role decision is recorded in TLP governance.
 *
 * Criterion 1: the ledger carries the new entry, its date, the role list and
 * the superseded entry ids.
 * Criterion 2: no canonical governance file still assigns architect,
 * curriculum authorship or rendered review to ChatGPT. Historical ledger
 * entries are excluded.
 * Criterion 3: every earlier ledger entry is byte-for-byte what `main` held
 * at f8251f6 when WP-009 started.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const LEDGER_PATH = "docs/Project/DECISION_LEDGER.md";
const ledger = readFileSync(join(ROOT, LEDGER_PATH), "utf8");

const NEW_ENTRY = "## DEC-075\n";
const FOOTER = "# Future Decisions";

/** The body of one `## DEC-nnn` entry, up to the next horizontal rule. */
function entry(id: string): string {
  const start = ledger.indexOf(`## ${id}\n`);
  if (start < 0) return "";
  const end = ledger.indexOf("\n---\n", start);
  return ledger.slice(start, end < 0 ? undefined : end);
}

function field(body: string, name: string): string {
  const match = new RegExp(`\\*\\*${name}\\*\\*\\n\\n([^\\n]+)`).exec(body);
  return match?.[1]?.trim() ?? "";
}

/** The prose of one bold-labelled section of an entry, whitespace collapsed. */
function section(body: string, name: string): string {
  const start = body.indexOf(`**${name}**\n`);
  if (start < 0) return "";
  const rest = body.slice(start + name.length + 5);
  const next = /\n\*\*[A-Z][A-Za-z ]+\*\*\n/.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).replace(/\s+/g, " ").trim();
}

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

describe("criterion 1: the ledger records the 2026-10-11 role decision", () => {
  const body = entry("DEC-075");

  it("DEC-075 is a single new entry after DEC-074 and before Future Decisions", () => {
    expect(body, "DEC-075 is missing").not.toBe("");
    expect(ledger.split(NEW_ENTRY)).toHaveLength(2);
    expect(ledger.indexOf(NEW_ENTRY)).toBeGreaterThan(ledger.indexOf("## DEC-074\n"));
    expect(ledger.indexOf(NEW_ENTRY)).toBeLessThan(ledger.indexOf(FOOTER));
  });

  it("is dated 2026-10-11, sourced to the Founder, and Approved", () => {
    expect(field(body, "Date")).toBe("2026-10-11");
    expect(field(body, "Source")).toBe("Founder decision");
    expect(field(body, "Status")).toBe("Approved");
  });

  it("states every role the Founder chose", () => {
    const decision = section(body, "Decision");
    for (const role of [
      "**Founder** — final product authority: product, business, UAT, spending, security exceptions, and approval of work packages and guidance.",
      "**Claude (planning seat)** — architect, work-package and guidance author, and curriculum drafter.",
      "**Claude Code (isolated agent account)** — builder.",
      "**Codex** — independent reviewer of code and of curriculum technical accuracy (unchanged).",
      "**Rendered review** — automated UAT checks plus Founder UAT.",
      "Orchestration is n8n with the agent runner.",
      "**Builder ≠ reviewer ≠ approver.**"
    ]) {
      expect(decision).toContain(role);
    }
  });

  it("names the earlier entries whose role assignments it supersedes", () => {
    const supersedes = section(body, "Supersedes");
    for (const id of ["DEC-050", "DEC-060", "DEC-068"]) {
      expect(supersedes).toContain(id);
    }
    expect(supersedes).toContain("No earlier entry is edited.");
  });

  it("marks no earlier entry Superseded in place", () => {
    expect(ledger).not.toMatch(/\*\*Status\*\*\n\nSuperseded/);
  });
});

/**
 * Every Markdown file in the repository except the ledger, whose historical
 * entries legitimately record what was decided at the time.
 */
function canonicalMarkdown(): string[] {
  const skip = new Set([".git", "node_modules", "dist", "build", "coverage"]);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(item.name)) continue;
      const path = join(dir, item.name);
      if (item.isDirectory()) walk(path);
      else if (item.name.endsWith(".md")) found.push(relative(ROOT, path));
    }
  };
  walk(ROOT);
  return found.filter((path) => path.split("\\").join("/") !== LEDGER_PATH);
}

/**
 * The only ChatGPT mentions governance may still carry. None of them gives
 * ChatGPT a role; each names it among AI systems a rule applies to.
 */
const NON_ROLE_MENTIONS = [
  /Claude, Anthropic, ChatGPT, OpenAI or any other AI system must never appear as a commit author/,
  /never paste one into Claude or ChatGPT\./,
  /Do not treat imported Claude, Codex, or ChatGPT conversations as repository authority\./,
  /^The ChatGPT seat holds no TLP governance role\.$/
];

/** Each sentence that mentions ChatGPT, whitespace collapsed. */
function chatGptSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?](?:\*\*)?)\s+/)
    .filter((sentence) => /chat\s*gpt/i.test(sentence));
}

describe("criterion 2: no canonical governance file assigns a role to ChatGPT", () => {
  const files = canonicalMarkdown();

  it("scans the governance files the role decision touches", () => {
    for (const path of [
      "CLAUDE.md",
      "AGENTS.md",
      "docs/Learning-OS/Learning-OS.md",
      "docs/Engineering-OS/Engineering-OS.md",
      ".github/ISSUE_TEMPLATE/work-package.md"
    ]) {
      expect(files.map((f) => f.split("\\").join("/"))).toContain(path);
    }
  });

  it.each(canonicalMarkdown())("%s mentions ChatGPT only outside any role", (path) => {
    const offending = chatGptSentences(readFileSync(join(ROOT, path), "utf8")).filter(
      (sentence) => !NON_ROLE_MENTIONS.some((allowed) => allowed.test(sentence))
    );
    expect(offending).toEqual([]);
  });

  it("the new ledger entry's decision mentions ChatGPT only to remove its role", () => {
    const offending = chatGptSentences(section(entry("DEC-075"), "Decision")).filter(
      (sentence) => !NON_ROLE_MENTIONS.some((allowed) => allowed.test(sentence))
    );
    expect(offending).toEqual([]);
  });

  it("the role statements point to DEC-075", () => {
    for (const path of [
      "CLAUDE.md",
      "AGENTS.md",
      "docs/Learning-OS/Learning-OS.md",
      ".github/ISSUE_TEMPLATE/work-package.md"
    ]) {
      expect(readFileSync(join(ROOT, path), "utf8"), path).toContain("DEC-075");
    }
  });
});

describe("criterion 3: earlier ledger entries are byte-for-byte unchanged from main", () => {
  // sha256 of DECISION_LEDGER.md at main f8251f6: everything before
  // "# Future Decisions" (DEC-001 through DEC-074), and the footer onward.
  const MAIN_ENTRIES_SHA256 = "6a10d82760b00cb136c62c975bbc95d8b18f57d7a24a7a0dc06e1470f78aea22";
  const MAIN_FOOTER_SHA256 = "fca59eaa3821f7a2320bb4091fd1e8ac75158a458c65f305894362adf889c113";

  it("everything before DEC-075 is what main held before WP-009", () => {
    expect(sha256(ledger.slice(0, ledger.indexOf(NEW_ENTRY)))).toBe(MAIN_ENTRIES_SHA256);
  });

  it("the Future Decisions footer is unchanged", () => {
    expect(sha256(ledger.slice(ledger.indexOf(FOOTER)))).toBe(MAIN_FOOTER_SHA256);
  });
});
