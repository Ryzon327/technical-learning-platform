import {
  CertificateVerificationView,
  readVerificationReferenceFromPath
} from "./certificates/CertificateVerificationView";
import { AuthenticatedApp } from "./auth/AuthenticatedApp";
import { AuthScreen } from "./auth/AuthScreen";
import { PasswordRecoveryScreen } from "./auth/PasswordRecoveryScreen";
import { useAuth } from "./auth/AuthProvider";

export function App() {
  const { loading, authState, recoveryMode, profileError, user } = useAuth();

  // CERT-005 — public certificate verification is the one surface that must
  // render without a session. It is checked before every auth branch, including
  // the loading state, so a verifier following a link never sees a sign-in
  // prompt or waits on session resolution. It activates only for an explicit
  // /verify/:reference path.
  const verificationReference = readVerificationReferenceFromPath(
    window.location.pathname
  );

  if (verificationReference) {
    return <CertificateVerificationView reference={verificationReference} />;
  }

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

  if (recoveryMode) {
    return <PasswordRecoveryScreen />;
  }

  if (user && profileError) {
    return (
      <main className="shell">
        <section className="card" role="alert">
          <p className="eyebrow">Account state</p>
          <h1>We could not load your profile</h1>
          <p>{profileError}</p>
        </section>
      </main>
    );
  }

  if (!authState.authenticated) {
    return <AuthScreen />;
  }

  return <AuthenticatedApp />;
}
