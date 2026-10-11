import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TEST_DB_GUARD,
  createTestDatabasePsql
} from "../test-support/test-db-psql";

/**
 * WP-005 / Founder direction G-003 — the ONE disposable-test-database guard,
 * `scripts/test-db-guard.sh`, on the real-database tests' path.
 *
 * `curriculum-step-search.db.test.ts` reaches the database only through
 * `createTestDatabasePsql`, which runs the guard before any psql. A stand-in
 * `psql` on PATH records each invocation, so these tests never connect to
 * anything and prove whether the real client would have run.
 *
 * The migration script's use of the same guard is covered by
 * `test-db-apply-migrations-guard.test.ts`.
 */
const LIBPQ_OVERRIDES = ["PGHOST", "PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"];
const LOCAL_URL = "postgres://postgres@localhost:5432/tlp_test";

let bin: string;
let log: string;

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "tlp-fake-psql-"));
  log = join(bin, "psql.log");
  // Reads its whole input first, as psql does, so the caller's write never
  // meets a closed pipe.
  writeFileSync(join(bin, "psql"), `#!/usr/bin/env bash\ncat > /dev/null\necho "$*" >> "${log}"\n`, {
    mode: 0o755
  });
});

afterEach(() => {
  rmSync(bin, { recursive: true, force: true });
});

function environment(url: string, extraEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    TLP_TEST_DATABASE_URL: url,
    TLP_TEST_DATABASE_DISPOSABLE: "1",
    ...extraEnv
  };
  for (const name of LIBPQ_OVERRIDES) {
    if (!(name in extraEnv)) delete env[name];
  }
  return env;
}

/** Builds the database tests' psql client and runs one statement through it. */
function connect(url: string, extraEnv: Record<string, string> = {}): void {
  createTestDatabasePsql(environment(url, extraEnv))("select 1;");
}

function psqlRan(): boolean {
  return existsSync(log) && readFileSync(log, "utf8").length > 0;
}

describe("the real-database tests run the shared guard before psql", () => {
  it("is the same guard script the migration script runs", () => {
    const script = readFileSync(
      fileURLToPath(new URL("../../../scripts/test-db-apply-migrations.sh", import.meta.url)),
      "utf8"
    );
    expect(TEST_DB_GUARD.endsWith("/scripts/test-db-guard.sh")).toBe(true);
    expect(script).toContain("bash scripts/test-db-guard.sh");
  });

  it("the database tests reach psql only through the guarded client", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./curriculum-step-search.db.test.ts", import.meta.url)),
      "utf8"
    );
    expect(source).toContain("createTestDatabasePsql(process.env)");
    expect(source).not.toContain("node:child_process");
  });

  it.each([
    LOCAL_URL,
    "postgresql://postgres@127.0.0.1:5432/tlp_test",
    "postgres://postgres:secret@localhost:5432/tlp_test"
  ])("connects to the single local URL %s", (url) => {
    connect(url);
    expect(psqlRan()).toBe(true);
  });

  it.each([
    ["PGHOST", "localhost"],
    ["PGHOST", "127.0.0.1"],
    ["PGHOST", "/var/run/postgresql"],
    ["PGHOSTADDR", "127.0.0.1"],
    ["PGHOSTADDR", "::1"]
  ])("accepts %s=%s, which stays local", (name, value) => {
    connect(LOCAL_URL, { [name]: value });
    expect(psqlRan()).toBe(true);
  });

  it.each([
    "postgres://postgres@localhost:5432/tlp_test?host=remote.example",
    "postgres://postgres@localhost:5432/tlp_test?hostaddr=203.0.113.7",
    "postgres://postgres@localhost:5432/tlp_test?service=prod",
    "postgres://postgres@localhost:5432/tlp_test?sslmode=disable&host=remote.example",
    "postgres://postgres@localhost:5432/tlp_test#host=remote.example",
    "postgres://postgres@localhost:5432,remote.example:5432/tlp_test",
    "postgres://postgres@remote.example:5432/tlp_test",
    "postgres://postgres@localhost.remote.example:5432/tlp_test",
    "postgres://x@localhost:1/@remote.example:5432/tlp_test",
    "host=remote.example dbname=tlp_test",
    ""
  ])("refuses %j before psql runs", (url) => {
    expect(() => connect(url)).toThrow(/TEST-DB FAIL/);
    expect(psqlRan()).toBe(false);
  });

  it.each([
    ["PGHOST", "remote.example"],
    ["PGHOST", "localhost,remote.example"],
    ["PGHOST", "/tmp,remote.example"],
    ["PGHOSTADDR", "203.0.113.7"],
    ["PGSERVICE", "prod"],
    ["PGSERVICEFILE", "/tmp/pg_service.conf"]
  ])("refuses a local URL when %s=%s could redirect it, before psql runs", (name, value) => {
    expect(() => connect(LOCAL_URL, { [name]: value })).toThrow(new RegExp(`TEST-DB FAIL: .*${name}`));
    expect(psqlRan()).toBe(false);
  });

  it.each([["0"], [""], ["true"]])(
    "refuses a local URL unless TLP_TEST_DATABASE_DISPOSABLE is exactly 1 (got %j), before psql runs",
    (marker) => {
      expect(() => connect(LOCAL_URL, { TLP_TEST_DATABASE_DISPOSABLE: marker })).toThrow(
        /TEST-DB FAIL: TLP_TEST_DATABASE_DISPOSABLE=1 is required/
      );
      expect(psqlRan()).toBe(false);
    }
  );

  it("refuses when the marker is absent altogether", () => {
    const env = environment(LOCAL_URL);
    delete env.TLP_TEST_DATABASE_DISPOSABLE;
    expect(() => createTestDatabasePsql(env)).toThrow(/TLP_TEST_DATABASE_DISPOSABLE=1 is required/);
    expect(psqlRan()).toBe(false);
  });

  it("connects with the environment the guard approved, whatever changes afterwards", () => {
    const env = environment(LOCAL_URL);
    const psql = createTestDatabasePsql(env);
    env.TLP_TEST_DATABASE_URL = "postgres://postgres@remote.example:5432/tlp_test";
    env.PGHOSTADDR = "203.0.113.7";

    psql("select 1;");
    expect(readFileSync(log, "utf8")).toContain(LOCAL_URL);
    expect(readFileSync(log, "utf8")).not.toContain("remote.example");
  });
});
