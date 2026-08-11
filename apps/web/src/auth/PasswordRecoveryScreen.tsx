import { type FormEvent, useState } from "react";
import { AuthUiError, updateRecoveredPassword } from "./auth-service";
import { useAuth } from "./AuthProvider";

export function PasswordRecoveryScreen() {
  const { finishRecovery, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      await updateRecoveredPassword(password);
      await signOut();
      finishRecovery();
    } catch (caught) {
      setError(
        caught instanceof AuthUiError
          ? caught.message
          : "Unable to update the password. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="recovery-title">
        <p className="eyebrow">Account recovery</p>
        <h1 id="recovery-title">Choose a new password</h1>
        <p className="auth-intro">
          Enter your new password below. After it is updated, sign in again.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
            />
          </label>

          <label>
            Confirm new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
            />
          </label>

          {error && (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </main>
  );
}
