import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * WP-005 / Founder direction G-003 — the real-database tests' only way to
 * reach the test database.
 *
 * `createTestDatabasePsql` runs the shared guard, `scripts/test-db-guard.sh`
 * (the same one `scripts/test-db-apply-migrations.sh` runs), BEFORE anything
 * connects, and throws if it refuses. The returned function then runs psql
 * with exactly the environment the guard approved, so nothing changed
 * afterwards can redirect it.
 *
 * Lives outside `src`, so it is never part of the API build.
 */
export const TEST_DB_GUARD = fileURLToPath(
  new URL("../../../scripts/test-db-guard.sh", import.meta.url)
);

export function assertDisposableLocalTestDatabase(env: NodeJS.ProcessEnv): void {
  const result = spawnSync("bash", [TEST_DB_GUARD], { env, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "TEST-DB FAIL: the test-database guard refused");
  }
}

export function createTestDatabasePsql(
  env: NodeJS.ProcessEnv = process.env
): (script: string) => string {
  const approved = { ...env };
  assertDisposableLocalTestDatabase(approved);
  const url = approved.TLP_TEST_DATABASE_URL ?? "";
  return (script: string) =>
    execFileSync("psql", [url, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], {
      input: script,
      encoding: "utf8",
      env: approved,
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
}
