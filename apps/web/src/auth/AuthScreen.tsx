import { type FormEvent, useState } from "react";
import {
  AuthUiError,
  registerStudent,
  requestPasswordReset,
  resendSignupConfirmation,
  signInStudent
} from "./auth-service";

type Mode = "sign-in" | "register" | "forgot-password";

function errorMessage(error: unknown): string {
  if (error instanceof AuthUiError) return error.message;
  return "Something went wrong. Please try again.";
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (mode === "register") {
        const result = await registerStudent({
          email,
          password,
          displayName
        });

        setVerificationPending(result.requiresEmailVerification);

        if (result.requiresEmailVerification) {
          setNotice(
            "Account created. Check your email to verify your address before signing in."
          );
        } else {
          setNotice("Account created and signed in.");
        }
      } else if (mode === "forgot-password") {
        await requestPasswordReset(email);
        setNotice(
          "If the account is eligible for password recovery, a recovery email will arrive shortly."
        );
      } else {
        await signInStudent(email, password);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleResendVerification() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await resendSignupConfirmation(email);
      setNotice(
        "If the account is awaiting verification, a new verification email will arrive shortly."
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "sign-in"
      ? "Welcome back"
      : mode === "register"
        ? "Create your student account"
        : "Reset your password";

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Technical Learning Platform</p>
        <h1 id="auth-title">{title}</h1>

        <p className="auth-intro">
          {mode === "sign-in"
            ? "Sign in to continue your learning."
            : mode === "register"
              ? "Create an account to begin tracking your learning progress."
              : "Enter your email and we will send password recovery instructions."}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <label>
              Display name
              <input
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                disabled={busy}
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </label>

          {mode !== "forgot-password" && (
            <label>
              Password
              <input
                type="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </label>
          )}

          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}

          {notice && (
            <p className="form-message success-message" role="status">
              {notice}
            </p>
          )}

          <button type="submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "sign-in"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : "Send recovery email"}
          </button>
        </form>

        {verificationPending && (
          <button
            type="button"
            className="text-button"
            onClick={handleResendVerification}
            disabled={busy}
          >
            Resend verification email
          </button>
        )}

        {mode === "sign-in" && (
          <>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode("forgot-password");
                setError("");
                setNotice("");
              }}
              disabled={busy}
            >
              Forgot password?
            </button>

            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode("register");
                setError("");
                setNotice("");
              }}
              disabled={busy}
            >
              Need an account? Register
            </button>
          </>
        )}

        {mode !== "sign-in" && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode("sign-in");
              setError("");
              setNotice("");
              setVerificationPending(false);
            }}
            disabled={busy}
          >
            Back to sign in
          </button>
        )}
      </section>
    </main>
  );
}
