import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WP-005 acceptance criterion 10 — the Decision Ledger records the Founder's
 * four convergence decisions (2026-10-09) as new entries, dated the day WP-005
 * recorded them, with source "Founder decision, WP-003 review", superseding
 * nothing silently.
 */

const ledger = readFileSync(
  new URL("../../../docs/Project/DECISION_LEDGER.md", import.meta.url),
  "utf8"
);

const RECORDED_ON = "2026-10-10";
const SOURCE = "Founder decision, WP-003 review";

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

const EXPECTED = [
  {
    id: "DEC-069",
    says: [
      "single source of truth",
      "Lovable (`learning-foundation`) is a design sandbox",
      "never synced into the\ncanonical repository"
    ]
  },
  {
    id: "DEC-070",
    says: ["canonical stack is kept", "its design, not its\nframework"]
  },
  {
    id: "DEC-071",
    says: [
      "seeded from Lovable's 14 acronym groups",
      "acronyms in course content",
      "Claude proposes the data, Codex\nreviews it, and the Founder spot-checks it"
    ]
  },
  {
    id: "DEC-072",
    says: ["DHCP content is delivered by a later content\nwork package"]
  }
];

describe("criterion 10: the Decision Ledger carries the four convergence decisions", () => {
  it.each(EXPECTED)("$id is recorded with today's date and its source", ({ id, says }) => {
    const body = entry(id);

    expect(body, `${id} is missing`).not.toBe("");
    expect(field(body, "Date")).toBe(RECORDED_ON);
    expect(field(body, "Source")).toBe(SOURCE);
    expect(field(body, "Status")).toBe("Approved");
    expect(field(body, "Supersedes")).toMatch(/^Nothing\./);
    // Compared with whitespace collapsed, so re-wrapping prose cannot fail it.
    const prose = body.replace(/\s+/g, " ");
    for (const statement of says) {
      expect(prose).toContain(statement.replace(/\s+/g, " "));
    }
  });

  it("each is a NEW entry, numbered after DEC-068 and placed before Future Decisions", () => {
    const footer = ledger.indexOf("# Future Decisions");
    let previous = ledger.indexOf("## DEC-068\n");

    expect(previous).toBeGreaterThan(-1);
    for (const { id } of EXPECTED) {
      const at = ledger.indexOf(`## ${id}\n`);
      expect(at).toBeGreaterThan(previous);
      expect(at).toBeLessThan(footer);
      expect(ledger.split(`## ${id}\n`)).toHaveLength(2);
      previous = at;
    }
  });

  it("supersedes nothing silently: no entry anywhere was marked Superseded", () => {
    expect(ledger).not.toMatch(/\*\*Status\*\*\n\nSuperseded/);
  });
});
