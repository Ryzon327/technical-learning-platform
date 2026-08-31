import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  FIXTURE_CONTENT_ROOT,
  PRODUCTION_CONTENT_ROOT,
  resolveProductionContentPath
} from "./curriculum-content-path";

/**
 * WP-G — which files the publisher will read.
 *
 * Built on a real temporary directory rather than a mock filesystem, because
 * the property under test is what `realpath` reports, and a mock would be
 * asserting the mock. Nothing here touches the repository or a database.
 *
 * The root is deliberately created under the OS temp directory, which on macOS
 * is itself reached through a symlink (`/tmp` -> `/private/tmp`). That is not an
 * inconvenience to work around — it is the case that proves legitimate paths
 * behind links are still accepted.
 */

const root = mkdtempSync(join(tmpdir(), "wpg-content-"));

const production = join(root, PRODUCTION_CONTENT_ROOT);
const fixtures = join(root, FIXTURE_CONTENT_ROOT);
const outsideRepo = mkdtempSync(join(tmpdir(), "wpg-outside-"));

mkdirSync(production, { recursive: true });
mkdirSync(fixtures, { recursive: true });
mkdirSync(join(root, "content", "curriculum-scratch"), { recursive: true });

writeFileSync(join(production, "course.json"), "{}");
writeFileSync(join(production, "notes.md"), "not json");
writeFileSync(join(fixtures, "example.json"), "{}");
writeFileSync(join(root, "content", "curriculum-scratch", "draft.json"), "{}");
writeFileSync(join(root, "elsewhere.json"), "{}");
writeFileSync(join(outsideRepo, "stolen.json"), "{}");

// A link inside the production root pointing at a file elsewhere in the
// repository, and another pointing outside the repository entirely. Both spell
// a path that every string-level check accepts.
symlinkSync(join(root, "elsewhere.json"), join(production, "linked-inside.json"));
symlinkSync(
  join(outsideRepo, "stolen.json"),
  join(production, "linked-outside.json")
);
symlinkSync(
  join(fixtures, "example.json"),
  join(production, "linked-fixture.json")
);
symlinkSync(join(production, "missing.json"), join(production, "broken.json"));

afterAll(() => {
  // Deliberately left in place. The directories are under the OS temp root and
  // removing a tree recursively is a destructive operation this test has no
  // reason to perform.
});

function decide(candidate: string) {
  return resolveProductionContentPath(root, candidate);
}

function expectRefused(candidate: string, fragment: string) {
  const decision = decide(candidate);
  expect(decision.allowed).toBe(false);
  if (decision.allowed) return;
  expect(
    decision.reason.includes(fragment),
    `expected a reason containing "${fragment}", received: ${decision.reason}`
  ).toBe(true);
}

describe("production curriculum paths", () => {
  it("1. accepts a production JSON document", () => {
    const decision = decide(`${PRODUCTION_CONTENT_ROOT}/course.json`);

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.relativePath).toBe(
      `${PRODUCTION_CONTENT_ROOT}/course.json`
    );
  });

  it("accepts an absolute path to the same document", () => {
    expect(decide(join(production, "course.json")).allowed).toBe(true);
  });

  it("2. refuses an architecture fixture", () => {
    expectRefused(
      `${FIXTURE_CONTENT_ROOT}/example.json`,
      "architecture fixture"
    );
  });

  it("3. refuses a path that escapes the repository", () => {
    expectRefused("../outside/course.json", "inside the repository");
  });

  it("refuses an absolute path outside the repository", () => {
    expectRefused(join(outsideRepo, "stolen.json"), "inside the repository");
  });

  it("refuses a traversal that climbs out and back in by name", () => {
    expectRefused(
      `${PRODUCTION_CONTENT_ROOT}/../../../etc/passwd`,
      "inside the repository"
    );
  });

  it("4. refuses a sibling directory sharing the root's prefix", () => {
    // `startsWith("content/curriculum")` would accept this. It is a different
    // directory.
    expectRefused(
      "content/curriculum-scratch/draft.json",
      `read only from ${PRODUCTION_CONTENT_ROOT}/`
    );
  });

  it("5. refuses a non-JSON file", () => {
    expectRefused(`${PRODUCTION_CONTENT_ROOT}/notes.md`, "is JSON");
  });

  it("6. fails closed when the file does not exist", () => {
    expectRefused(
      `${PRODUCTION_CONTENT_ROOT}/absent.json`,
      "could not be resolved on disk"
    );
  });

  it("fails closed on a broken symlink", () => {
    expectRefused(
      `${PRODUCTION_CONTENT_ROOT}/broken.json`,
      "could not be resolved on disk"
    );
  });

  it("7. refuses a symlink pointing outside the repository", () => {
    expectRefused(
      `${PRODUCTION_CONTENT_ROOT}/linked-outside.json`,
      "resolves through a link"
    );
  });

  it("refuses a symlink pointing elsewhere inside the repository", () => {
    // Inside the repo but outside the production root: still not where the
    // path said the content was.
    expectRefused(
      `${PRODUCTION_CONTENT_ROOT}/linked-inside.json`,
      "resolves through a link"
    );
  });

  it("refuses a symlink pointing into the fixture root", () => {
    // The fixture refusal must survive being reached through a link, or the
    // production directory becomes a way to publish fixtures.
    expectRefused(
      `${PRODUCTION_CONTENT_ROOT}/linked-fixture.json`,
      "resolves through a link"
    );
  });

  it("8. accepts a legitimate document even when the root is behind a link", () => {
    // The temp root is itself reached through /tmp -> /private/tmp on macOS.
    // Realpathing only the candidate would make every path here look like an
    // escape; realpathing both is what keeps this case correct.
    expect(decide(`${PRODUCTION_CONTENT_ROOT}/course.json`).allowed).toBe(true);
  });

  it("refuses the production directory itself", () => {
    // `isInside` is strict about identity: a directory is not inside itself, so
    // the root is refused by the production-root rule before the JSON rule is
    // reached. Pin that behavior so future reordering is deliberate.
    expectRefused(
      PRODUCTION_CONTENT_ROOT,
      `read only from ${PRODUCTION_CONTENT_ROOT}/`
    );
  });

  it("refuses the repository root", () => {
    expectRefused(".", "inside the repository");
  });
});
