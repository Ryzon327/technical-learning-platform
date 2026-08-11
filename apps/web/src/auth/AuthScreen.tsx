import { type FormEvent, useState } from "react";
import {
  AuthUiError,
  registerStudent,
  signInStudent
} from "./auth-service";

type Mode = "sign-in" | "register";

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

        if (result.requiresEmailVerification) {
          setNotice(
            "Account created. Check your email to verify your address before signing in."
          );
        } else {
          setNotice("Account created and signed in.");
        }
      } else {
        await signInStudent(email, password);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">Technical Learning Platform</p>
        <h1 id="auth-title">
          {mode === "sign-in" ? "Welcome back" : "Create your student account"}
        </h1>

        <p className="auth-intro">
          {mode === "sign-in"
            ? "Sign in to continue your learning."
            : "Create an account to begin tracking your learning progress."}
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

          <label>
            Password
            <input
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
          </label>

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
                : "Create account"}
          </button>
        </form>

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode((current) =>
              current === "sign-in" ? "register" : "sign-in"
            );
            setError("");
            setNotice("");
          }}
          disabled={busy}
        >
          {mode === "sign-in"
            ? "Need an account? Register"
            : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
