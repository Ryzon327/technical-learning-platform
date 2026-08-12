import { describe, expect, it } from "vitest";
import { normalizeBlockText, normalizeTagName } from "@tlp/shared-types";

describe("note organization API contracts", () => {
  it("keeps terminal output inert text", () => {
    expect(normalizeBlockText("$ sudo reboot\n")).toBe("$ sudo reboot\n");
  });

  it("rejects markup-like tag names", () => {
    expect(() => normalizeTagName("<b>networking</b>")).toThrow();
  });
});
