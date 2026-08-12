import { describe, expect, it } from "vitest";
import { normalizeBlockText, normalizeTagName } from "./note-blocks";

describe("technical note blocks and tags", () => {
  it("preserves command and terminal whitespace", () => {
    expect(normalizeBlockText("show vlan brief\n  VLAN 10\n")).toBe(
      "show vlan brief\n  VLAN 10\n"
    );
  });

  it("normalizes lightweight tag labels", () => {
    expect(normalizeTagName("  active   directory ")).toBe("active directory");
  });

  it("rejects markup-like tag labels", () => {
    expect(() => normalizeTagName("<script>")).toThrow();
  });
});
