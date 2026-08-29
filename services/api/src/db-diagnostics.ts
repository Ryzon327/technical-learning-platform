/**
 * DB-SERVICE-ROLE-1 — safe diagnostics for database and unexpected failures.
 *
 * ## Why this module exists
 *
 * Two real Founder-UAT incidents were made unnecessarily expensive by the same
 * habit: catching an error, throwing away everything it said, and reporting a
 * generic sentence.
 *
 *  - `GET /curriculum/paths/:id` returned `500 "Unexpected server error"` for a
 *    malformed `SUPABASE_URL`. The catch block logged only its own normalized
 *    `AppError`, so the underlying `Error: Invalid supabaseUrl` never reached
 *    any log and the cause had to be inferred from static analysis.
 *  - `npm run admin:publish-roas-curriculum` reported `Unable to inspect
 *    existing learning_paths "connected-learning-mvp"` for what was almost
 *    certainly `42501 insufficient_privilege`. The SQLSTATE — the one field that
 *    would have named the problem outright — was discarded.
 *
 * The fix is not "log everything". A database error can quote a row value, and
 * a transport error's `details` field is where postgrest-js puts a stack trace
 * and cause chain, which can carry the project host. So this module renders a
 * deliberately narrow view and then redacts what it renders.
 *
 * ## What it never emits
 *
 * `redactSecrets` is applied to every string that leaves here. Nothing in this
 * module reads `process.env`, and no caller passes it a credential — the
 * redaction is defence in depth against a value that arrived inside an error
 * message from somewhere else.
 */

/**
 * Shapes that must never appear in output, whatever produced them.
 *
 * Ordered longest-match-first so a connection string is redacted whole rather
 * than leaving its host behind.
 */
const SECRET_SHAPES: readonly RegExp[] = [
  // Postgres connection strings — these embed the database password.
  /postgres(?:ql)?:\/\/\S+/gi,
  // JSON Web Tokens: anon keys, service-role keys, learner access tokens.
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
  // Current-generation Supabase API keys, publishable and secret alike.
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,
  // Project URLs. Not a credential, but it names the project and there is no
  // diagnostic value in repeating it.
  /https?:\/\/[A-Za-z0-9-]+\.supabase\.(?:co|net|in)\S*/gi,
  // Authorization headers, however they were stringified.
  /(?:bearer|apikey)\s+\S+/gi
];

/** Replace every credential-shaped substring with a fixed marker. */
export function redactSecrets(value: string): string {
  let redacted = value;

  for (const shape of SECRET_SHAPES) {
    redacted = redacted.replace(shape, "[redacted]");
  }

  return redacted;
}

/** The subset of a PostgREST error that is safe to surface. */
export interface DatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  hint?: string | null;
}

/**
 * Render a database error for an operator.
 *
 * `code`, `message` and `hint` only.
 *
 * **`details` is deliberately excluded.** For a transport failure postgrest-js
 * builds it from the fetch error's stack and cause chain, which can contain the
 * project host and request URL. It is the one field with a routine path to
 * leaking environment specifics, and it adds nothing that `code` and `message`
 * do not already say for the failures this project actually hits.
 *
 * The SQLSTATE matters most: `42501` names a privilege problem outright and is
 * exactly what would have identified this work package's defect in seconds.
 */
export function describeDatabaseError(
  error: DatabaseErrorLike | null | undefined
): string {
  if (!error) return "no diagnostic detail was returned";

  const parts: string[] = [];

  const code = error.code?.toString().trim();
  const message = error.message?.toString().trim();
  const hint = error.hint?.toString().trim();

  if (code) parts.push(`[${redactSecrets(code)}]`);
  if (message) parts.push(redactSecrets(message));
  if (hint) parts.push(`hint: ${redactSecrets(hint)}`);

  if (parts.length === 0) return "no diagnostic detail was returned";

  return parts.join(" ");
}

/**
 * Render an unexpected non-`AppError` exception for a **server-side log only**.
 *
 * The client response stays exactly as generic as it was — the caller keeps
 * sending `INTERNAL_ERROR / "Unexpected server error"` and this string never
 * reaches it. Without this the server has no record at all of what actually
 * threw, which is what turned a one-line configuration mistake into a full
 * static-analysis pass.
 *
 * The stack is included because this is a server log, and truncated because a
 * full Node stack is mostly framework frames.
 */
export function describeUnexpectedError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    const stack = error.stack
      ? redactSecrets(error.stack).split("\n").slice(0, 8).join("\n")
      : undefined;

    return {
      name: redactSecrets(error.name),
      message: redactSecrets(error.message),
      ...(stack ? { stack } : {})
    };
  }

  return {
    name: "NonError",
    message: redactSecrets(
      typeof error === "string" ? error : "a non-Error value was thrown"
    )
  };
}
