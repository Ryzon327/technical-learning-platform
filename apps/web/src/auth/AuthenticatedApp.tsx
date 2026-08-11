import { useState } from "react";
import { AuthUiError } from "./auth-service";
import { useAuth } from "./AuthProvider";

export function AuthenticatedApp() {
  const { user, signOut } = useAuth();
  const [error, setError] = useState("");

  async function handleSignOut() {
    setError("");

    try {
      await signOut();
    } catch (caught) {
      setError(
        caught instanceof AuthUiError
          ? caught.message
          : "Unable to sign out. Please try again."
      );
    }
  }

  return (
    <main className="shell">
      <section className="card" aria-labelledby="app-title">
        <p className="eyebrow">Authenticated learning workspace</p>
        <h1 id="app-title">Technical Learning Platform</h1>
        <p>
          You are signed in as <strong>{user?.email ?? "student"}</strong>.
        </p>

        <dl className="status-grid">
          <div>
            <dt>Authentication</dt>
            <dd>Active session</dd>
          </div>
          <div>
            <dt>Current Wave</dt>
            <dd>Wave 1 — Authentication</dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd>Learning workspace</dd>
          </div>
        </dl>

        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}

        <button type="button" onClick={handleSignOut}>
          Sign out
        </button>
      </section>
    </main>
  );
}
