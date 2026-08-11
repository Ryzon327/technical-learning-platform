import { describe, expect, it } from "vitest";
import type { IdentityContext, PlatformRole } from "./auth";

describe("authentication contracts", () => {
  it("supports the founder admin role without making it implicit", () => {
    const role: PlatformRole = "founder_admin";
    const identity: IdentityContext = {
      userId: "user-1",
      email: "founder@example.test",
      role,
      emailVerified: true,
      mfaVerified: true
    };

    expect(identity.role).toBe("founder_admin");
    expect(identity.mfaVerified).toBe(true);
  });
});
