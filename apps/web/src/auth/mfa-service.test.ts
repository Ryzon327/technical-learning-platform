import { describe, expect, it } from "vitest";
import { verifyTotpCode } from "./mfa-service";

describe("Founder/admin MFA input", () => {
  it("rejects a malformed TOTP code before contacting Supabase", async () => {
    await expect(
      verifyTotpCode("factor-1", "123")
    ).rejects.toThrow("Enter the 6-digit authenticator code.");
  });
});
