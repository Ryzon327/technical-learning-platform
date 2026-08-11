import { describe, expect, it } from "vitest";
import { AuthUiError, registerStudent, signInStudent } from "./auth-service";

describe("auth service input validation", () => {
  it("rejects an invalid registration email before contacting Supabase", async () => {
    await expect(
      registerStudent({
        email: "not-an-email",
        password: "password123"
      })
    ).rejects.toBeInstanceOf(AuthUiError);
  });

  it("rejects a short registration password before contacting Supabase", async () => {
    await expect(
      registerStudent({
        email: "student@example.test",
        password: "short"
      })
    ).rejects.toThrow("Password must be at least 8 characters.");
  });

  it("requires a password for sign in", async () => {
    await expect(
      signInStudent("student@example.test", "")
    ).rejects.toThrow("Enter your password.");
  });
});
