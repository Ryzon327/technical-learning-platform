import { describe, expect, it } from "vitest";
import {
  describeDatabaseError,
  describeUnexpectedError,
  redactSecrets
} from "./db-diagnostics";

/**
 * DB-SERVICE-ROLE-1 — diagnostics must be useful AND safe.
 *
 * Two properties are in tension here, and both are load-bearing:
 *
 *  1. The SQLSTATE must survive. `42501` is the single field that would have
 *     named this work package's defect immediately instead of after a full
 *     static-analysis pass.
 *  2. Nothing credential-shaped may survive. These paths print to terminals and
 *     CI transcripts, and an operator pastes those into bug reports.
 *
 * The redaction tests are deliberately adversarial: a redactor that only catches
 * the shapes a developer remembered is the kind that leaks.
 */

const SYNTHETIC_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.not-real";

describe("DB-SERVICE-ROLE-1 redaction", () => {
  it("redacts a JWT anywhere in a string", () => {
    const redacted = redactSecrets(`failed with apikey ${SYNTHETIC_JWT} attached`);
    expect(redacted).not.toContain(SYNTHETIC_JWT);
    expect(redacted).not.toContain("eyJ");
    expect(redacted).toContain("[redacted]");
  });

  it("redacts both generations of Supabase API key", () => {
    for (const key of ["sb_secret_abc123XYZ", "sb_publishable_abc123XYZ"]) {
      const redacted = redactSecrets(`key was ${key}`);
      expect(redacted).not.toContain(key);
      expect(redacted).toContain("[redacted]");
    }
  });

  it("redacts a Postgres connection string, which embeds the password", () => {
    const conn = "postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres";
    const redacted = redactSecrets(`connect failed: ${conn}`);
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("db.example.supabase.co");
  });

  it("redacts the project URL, which names the project", () => {
    const redacted = redactSecrets("GET https://abcdefgh.supabase.co/rest/v1/x");
    expect(redacted).not.toContain("abcdefgh");
    expect(redacted).not.toContain("supabase.co");
  });

  it("redacts an Authorization header however it was stringified", () => {
    const redacted = redactSecrets(`Bearer ${SYNTHETIC_JWT}`);
    expect(redacted).not.toContain(SYNTHETIC_JWT);
  });

  it("leaves ordinary diagnostic text intact", () => {
    const message = "permission denied for table learning_paths";
    expect(redactSecrets(message)).toBe(message);
  });
});

describe("DB-SERVICE-ROLE-1 database error description", () => {
  it("PRESERVES the SQLSTATE — the field that names the real defect", () => {
    const described = describeDatabaseError({
      code: "42501",
      message: "permission denied for table learning_paths",
      hint: null
    });

    expect(described).toContain("42501");
    expect(described).toContain("permission denied for table learning_paths");
  });

  it("includes a hint when one is offered", () => {
    expect(
      describeDatabaseError({ code: "42P01", message: "no", hint: "check the schema" })
    ).toContain("hint: check the schema");
  });

  it("EXCLUDES details, where transport stack traces and hosts live", () => {
    const described = describeDatabaseError({
      code: "",
      message: "TypeError: fetch failed",
      // `details` is not part of DatabaseErrorLike; if a future edit widened the
      // type, this asserts the value still cannot reach the output.
      ...({
        details:
          "Error: connect ECONNREFUSED\n    at https://abcdefgh.supabase.co/rest/v1/"
      } as Record<string, unknown>)
    });

    expect(described).not.toContain("ECONNREFUSED");
    expect(described).not.toContain("abcdefgh");
  });

  it("redacts a credential that arrived inside the message", () => {
    const described = describeDatabaseError({
      code: "PGRST301",
      message: `JWT ${SYNTHETIC_JWT} is invalid`
    });

    expect(described).not.toContain(SYNTHETIC_JWT);
    expect(described).toContain("PGRST301");
  });

  it("says so plainly when there is nothing to report", () => {
    expect(describeDatabaseError(null)).toBe("no diagnostic detail was returned");
    expect(describeDatabaseError({})).toBe("no diagnostic detail was returned");
    expect(describeDatabaseError({ code: "", message: "" })).toBe(
      "no diagnostic detail was returned"
    );
  });
});

describe("DB-SERVICE-ROLE-1 unexpected error description", () => {
  it("names what actually threw", () => {
    const described = describeUnexpectedError(
      new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.")
    );

    expect(described.name).toBe("Error");
    expect(described.message).toContain("Invalid supabaseUrl");
  });

  it("carries a stack, truncated", () => {
    const described = describeUnexpectedError(new Error("boom"));
    expect(described.stack).toBeDefined();
    expect(described.stack!.split("\n").length).toBeLessThanOrEqual(8);
  });

  it("redacts credentials that reached a stack or message", () => {
    const described = describeUnexpectedError(
      new Error(`request to https://abcdefgh.supabase.co failed with ${SYNTHETIC_JWT}`)
    );

    expect(described.message).not.toContain(SYNTHETIC_JWT);
    expect(described.message).not.toContain("abcdefgh");
  });

  it("handles a thrown non-Error without crashing the log path", () => {
    expect(describeUnexpectedError("just a string").name).toBe("NonError");
    expect(describeUnexpectedError({ weird: true }).message).toContain(
      "non-Error value"
    );
    expect(describeUnexpectedError(undefined).name).toBe("NonError");
  });
});
