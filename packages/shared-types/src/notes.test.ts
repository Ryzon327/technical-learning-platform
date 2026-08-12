import { describe,expect,it } from "vitest";
import { normalizeNoteBody,normalizeNoteTitle,noteContainsUnsafeMarkup } from "./notes";
describe("notes contracts",()=>{it("preserves student text",()=>{expect(normalizeNoteTitle("  VLAN notes  ")).toBe("VLAN notes");expect(normalizeNoteBody("show interfaces trunk\n")).toBe("show interfaces trunk\n");});it("detects unsafe active markup",()=>{expect(noteContainsUnsafeMarkup("<script>alert(1)</script>")).toBe(true);expect(noteContainsUnsafeMarkup("Native VLAN mismatch")).toBe(false);});});
