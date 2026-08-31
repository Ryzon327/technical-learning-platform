import { describe, expect, it } from "vitest";
import {
  BootstrapEnvironmentError,
  resolveBootstrapEnvironment
} from "@tlp/shared-types";
import {
  PUBLISH_FLAG,
  parseCommandArguments
} from "./curriculum-command-args";

/**
 * WP-G — the operator boundary of the import command.
 *
 * Two halves, both provable without spawning a process: what argv means, and
 * what the environment permits. The second reuses ROAS-4's guard rather than
 * reimplementing it, so these assert the behaviour WP-G inherits at the seam it
 * actually calls.
 */

const SAFE_ENV = {
  appEnv: "development",
  supabaseUrl: "https://dev-project.supabase.co",
  serviceRoleKey: [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    // A service_role claim. Never a real credential; the classifier only reads
    // the role from the payload.
    Buffer.from(
      JSON.stringify({ role: "service_role", iss: "supabase" })
    ).toString("base64url"),
    "signature"
  ].join("."),
  actorUserId: "11111111-1111-4111-8111-111111111111"
};

describe("command arguments", () => {
  it("5. reports usage when no document is given", () => {
    const parsed = parseCommandArguments([]);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain("usage:");
  });

  it("accepts a single document path and defaults to not publishing", () => {
    const parsed = parseCommandArguments(["content/curriculum/course.json"]);

    expect(parsed).toEqual({
      ok: true,
      documentPath: "content/curriculum/course.json",
      publish: false
    });
  });

  it("1. treats publication as opt-in, never the default", () => {
    const parsed = parseCommandArguments(["content/curriculum/course.json"]);
    expect(parsed.ok && parsed.publish).toBe(false);
  });

  it("accepts the publish flag before or after the path", () => {
    for (const argv of [
      ["content/curriculum/course.json", PUBLISH_FLAG],
      [PUBLISH_FLAG, "content/curriculum/course.json"]
    ]) {
      const parsed = parseCommandArguments(argv);
      expect(parsed).toEqual({
        ok: true,
        documentPath: "content/curriculum/course.json",
        publish: true
      });
    }
  });

  it("2. never mistakes the publish flag for the document path", () => {
    const parsed = parseCommandArguments([PUBLISH_FLAG]);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain("usage:");
  });

  it("3. refuses an unrecognised option rather than ignoring it", () => {
    for (const flag of ["--force", "--yes", "--dry-run", "-p", "--publsh"]) {
      const parsed = parseCommandArguments([
        "content/curriculum/course.json",
        flag
      ]);

      expect(parsed.ok, `${flag} should be refused`).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.reason).toContain(flag);
    }
  });

  it("names every unrecognised option, not only the first", () => {
    const parsed = parseCommandArguments([
      "content/curriculum/course.json",
      "--force",
      "--yes"
    ]);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain("--force");
    expect(parsed.reason).toContain("--yes");
  });

  it("4. refuses two document paths rather than silently choosing one", () => {
    const parsed = parseCommandArguments([
      "content/curriculum/a.json",
      "content/curriculum/b.json"
    ]);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toContain("received 2");
    expect(parsed.reason).toContain("a.json");
    expect(parsed.reason).toContain("b.json");
  });

  it("accepts a repeated publish flag as one intent", () => {
    const parsed = parseCommandArguments([
      "content/curriculum/course.json",
      PUBLISH_FLAG,
      PUBLISH_FLAG
    ]);

    expect(parsed.ok && parsed.publish).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * The environment guard, at the seam WP-G calls
 * ------------------------------------------------------------------ */

describe("the inherited environment guard", () => {
  it("1. defaults to a dry run when no confirmation is supplied", () => {
    const decision = resolveBootstrapEnvironment(SAFE_ENV);
    expect(decision.mode).toBe("dry_run");
  });

  it("11. executes only when the confirmation equals SUPABASE_URL exactly", () => {
    const decision = resolveBootstrapEnvironment({
      ...SAFE_ENV,
      confirmation: SAFE_ENV.supabaseUrl
    });

    expect(decision.mode).toBe("execute");
  });

  it("11. refuses a confirmation that names a different project", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        ...SAFE_ENV,
        confirmation: "https://other-project.supabase.co"
      })
    ).toThrow(BootstrapEnvironmentError);
  });

  it("11. refuses a confirmation that is merely truthy", () => {
    for (const confirmation of ["yes", "true", "confirm", "1"]) {
      expect(() =>
        resolveBootstrapEnvironment({ ...SAFE_ENV, confirmation })
      ).toThrow(BootstrapEnvironmentError);
    }
  });

  it("9. refuses production APP_ENV outright, confirmation or not", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        ...SAFE_ENV,
        appEnv: "production",
        confirmation: SAFE_ENV.supabaseUrl
      })
    ).toThrow(BootstrapEnvironmentError);
  });

  it("refuses an unrecognised APP_ENV rather than assuming development", () => {
    for (const appEnv of ["", "staging", "prod", "dev"]) {
      expect(() =>
        resolveBootstrapEnvironment({ ...SAFE_ENV, appEnv })
      ).toThrow(BootstrapEnvironmentError);
    }
  });

  it("10. refuses a production-looking URL even when APP_ENV disagrees", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        ...SAFE_ENV,
        appEnv: "development",
        supabaseUrl: "https://prod-project.supabase.co"
      })
    ).toThrow(BootstrapEnvironmentError);
  });

  it("12. refuses a credential that is not a service-role key", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        ...SAFE_ENV,
        confirmation: SAFE_ENV.supabaseUrl,
        serviceRoleKey: "not-a-jwt"
      })
    ).toThrow(BootstrapEnvironmentError);
  });

  it("12. refuses an actor that is not a real account id", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        ...SAFE_ENV,
        confirmation: SAFE_ENV.supabaseUrl,
        actorUserId: "roas4-uat-bootstrap"
      })
    ).toThrow(BootstrapEnvironmentError);
  });

  it("never echoes the credential in a refusal", () => {
    try {
      resolveBootstrapEnvironment({
        ...SAFE_ENV,
        confirmation: SAFE_ENV.supabaseUrl,
        serviceRoleKey: "super-secret-value"
      });
      throw new Error("expected a refusal");
    } catch (caught) {
      expect(caught).toBeInstanceOf(BootstrapEnvironmentError);
      expect((caught as Error).message).not.toContain("super-secret-value");
    }
  });
});
