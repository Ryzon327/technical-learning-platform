import { describe, expect, it } from "vitest";
import { isValidPublicationTransition } from "./curriculum-admin";

describe("curriculum publication transitions", () => {
  it("allows draft to review", () => {
    expect(isValidPublicationTransition("draft", "review")).toBe(true);
  });

  it("allows review to published", () => {
    expect(isValidPublicationTransition("review", "published")).toBe(true);
  });

  it("blocks draft directly to published", () => {
    expect(isValidPublicationTransition("draft", "published")).toBe(false);
  });

  it("blocks published back to review", () => {
    expect(isValidPublicationTransition("published", "review")).toBe(false);
  });

  it("allows retired curriculum to return to draft", () => {
    expect(isValidPublicationTransition("retired", "draft")).toBe(true);
  });
});
