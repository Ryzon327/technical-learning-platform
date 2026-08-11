import { AuthenticatedApp } from "./auth/AuthenticatedApp";
import { AuthScreen } from "./auth/AuthScreen";
import { useAuth } from "./auth/AuthProvider";

export function App() {
  const { loading, authState } = useAuth();

  if (loading) {
    return (
      <main className="shell">
        <section className="card" aria-live="polite">
          <p className="eyebrow">Technical Learning Platform</p>
          <h1>Loading your session…</h1>
        </section>
      </main>
    );
  }

  if (!authState.authenticated) {
    return <AuthScreen />;
  }

  return <AuthenticatedApp />;
}
