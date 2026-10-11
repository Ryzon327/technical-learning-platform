import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * WP-005 / Founder direction G-001 — the fail-closed boundary of
 * `scripts/test-db-apply-migrations.sh`. It must refuse, BEFORE psql runs,
 * every database URL whose effective libpq destination could be anything but
 * a single localhost / 127.0.0.1 host.
 *
 * A stand-in `psql` on PATH records each invocation, so these tests never
 * connect to anything and prove whether the real client would have run.
 */
const SCRIPT = fileURLToPath(new URL("../../../scripts/test-db-apply-migrations.sh", import.meta.url));

let bin: string;
let log: string;

beforeEach(() => {
  bin = mkdtempSync(join(tmpdir(), "tlp-fake-psql-"));
  log = join(bin, "psql.log");
  writeFileSync(join(bin, "psql"), `#!/usr/bin/env bash\necho "$*" >> "${log}"\n`, { mode: 0o755 });
});

afterEach(() => {
  rmSync(bin, { recursive: true, force: true });
});

function run(url: string, extraEnv: Record<string, string> = {}) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    TLP_TEST_DATABASE_URL: url,
    TLP_TEST_DATABASE_DISPOSABLE: "1",
    ...extraEnv
  };
  for (const name of ["PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"]) {
    if (!(name in extraEnv)) delete env[name];
  }
  return spawnSync("bash", [SCRIPT], { env, encoding: "utf8" });
}

function psqlRan(): boolean {
  return existsSync(log) && readFileSync(log, "utf8").length > 0;
}

describe("test-db-apply-migrations.sh destination guard", () => {
  it.each([
    "postgres://postgres@localhost:5432/tlp_test",
    "postgresql://postgres@127.0.0.1:5432/tlp_test",
    "postgres://postgres:secret@localhost:5432/tlp_test"
  ])("accepts the single local URL %s", (url) => {
    const result = run(url);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(psqlRan()).toBe(true);
  });

  it.each([
    "postgres://postgres@localhost:5432/tlp_test?host=remote.example",
    "postgres://postgres@localhost:5432/tlp_test?hostaddr=203.0.113.7",
    "postgres://postgres@localhost:5432/tlp_test?service=prod",
    "postgres://postgres@localhost:5432/tlp_test?sslmode=disable&host=remote.example",
    "postgres://postgres@localhost:5432/tlp_test#host=remote.example",
    "postgres://postgres@localhost:5432,remote.example:5432/tlp_test",
    "postgres://postgres@localhost:5432/tlp_test,remote.example",
    "postgres://postgres@remote.example:5432/tlp_test",
    "postgres://postgres@localhost.remote.example:5432/tlp_test",
    "postgres://postgres@localhost:5432/",
    "postgres://x@localhost:1/@remote.example:5432/tlp_test",
    "host=remote.example dbname=tlp_test postgres://postgres@localhost:5432/tlp_test"
  ])("refuses %s before psql runs", (url) => {
    const result = run(url);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("TEST-DB FAIL");
    expect(psqlRan()).toBe(false);
  });

  it.each([
    ["PGHOSTADDR", "203.0.113.7"],
    ["PGSERVICE", "prod"],
    ["PGSERVICEFILE", "/tmp/pg_service.conf"]
  ])("refuses a local URL when %s could redirect it, before psql runs", (name, value) => {
    const result = run("postgres://postgres@localhost:5432/tlp_test", { [name]: value });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(name);
    expect(psqlRan()).toBe(false);
  });

  it("refuses a local URL unless the database is marked disposable", () => {
    const result = run("postgres://postgres@localhost:5432/tlp_test", {
      TLP_TEST_DATABASE_DISPOSABLE: "0"
    });
    expect(result.status).not.toBe(0);
    expect(psqlRan()).toBe(false);
  });
});
