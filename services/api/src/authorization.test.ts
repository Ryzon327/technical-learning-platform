import { describe, expect, it } from "vitest";
import { AppError } from "@tlp/shared-types";
import type { TrustedRequestIdentity } from "./auth-context";
import { requireFounderAdmin } from "./authorization";

function trusted(
  role: "student" | "founder_admin",
  mfaVerified: boolean,
  emailVerified = true
): TrustedRequestIdentity {
  return {
    accessToken: "test-token",
    identity: {
      userId: "user-1",
      email: "user@example.test",
      role,
      emailVerified,
      mfaVerified
    },
    profile: {
      userId: "user-1",
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
}

describe("Founder administrator authorization", () => {
  it("rejects a student", () => {
    expect(() => requireFounderAdmin(trusted("student", true))).toThrow(AppError);
  });

  it("rejects a Founder/admin session without AAL2", () => {
    expect(() =>
      requireFounderAdmin(trusted("founder_admin", false))
    ).toThrow("Multi-factor authentication required");
  });

  it("rejects an unverified Founder/admin email", () => {
    expect(() =>
      requireFounderAdmin(trusted("founder_admin", true, false))
    ).toThrow("Verified email required");
  });

  it("accepts a verified AAL2 Founder/admin session", () => {
    expect(
      requireFounderAdmin(trusted("founder_admin", true)).identity.role
    ).toBe("founder_admin");
  });
});
