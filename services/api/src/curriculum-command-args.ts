/**
 * WP-G — reading the import command's arguments, and refusing anything unclear.
 *
 * A pure module rather than part of the command, for the same reason the
 * planner and the importer are: `admin/publish-curriculum.ts` runs `main()` at
 * import, so nothing in it can be exercised by a test. This is the operator
 * boundary for a command that writes curriculum, and it should be provable.
 */

export const PUBLISH_FLAG = "--publish";

export const COMMAND_USAGE = `usage: npm run admin:publish-curriculum -- <path-to-document.json> [${PUBLISH_FLAG}]

  Without ${PUBLISH_FLAG} a confirmed run reconciles and validates DRAFT
  curriculum and performs no lifecycle transition.`;

export type CommandArguments =
  | {
      readonly ok: true;
      readonly documentPath: string;
      readonly publish: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Read argv, and refuse anything ambiguous.
 *
 * ## Why this fails closed rather than doing its best
 *
 * The two obvious shortcuts are both quietly wrong:
 *
 *   `argv.find(arg => !arg.startsWith("--"))` takes the first path and DROPS
 *   the rest, so passing two paths imports one of them without saying which.
 *
 *   Filtering out anything beginning with `--` ignores unknown flags, so a
 *   mistyped `--publsh` reconciles without publishing, and a hopeful `--force`
 *   or `--yes` appears accepted and does nothing.
 *
 * Neither writes the wrong thing, but both leave an operator believing they
 * asked for something they did not get. On a command whose other half is "this
 * publishes curriculum", that is the wrong kind of quiet.
 *
 * A repeated `--publish` is accepted: that is someone typing twice, not an
 * ambiguity about what they meant.
 */
export function parseCommandArguments(
  argv: readonly string[]
): CommandArguments {
  // Matched on a single leading dash so `-p` is caught as unknown rather than
  // silently read as a path.
  const flags = argv.filter((arg) => arg.startsWith("-"));
  const paths = argv.filter((arg) => !arg.startsWith("-"));

  const unknown = flags.filter((flag) => flag !== PUBLISH_FLAG);

  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `Unrecognised option${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.\n\n${COMMAND_USAGE}`
    };
  }

  if (paths.length === 0) {
    return { ok: false, reason: COMMAND_USAGE };
  }

  if (paths.length > 1) {
    return {
      ok: false,
      reason: `Expected one curriculum document, received ${paths.length}: ${paths.join(", ")}.\n\nRefusing rather than guessing which one to import.`
    };
  }

  return {
    ok: true,
    documentPath: paths[0] as string,
    publish: flags.includes(PUBLISH_FLAG)
  };
}
