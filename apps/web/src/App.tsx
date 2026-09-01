import { Suspense, lazy } from "react";
import {
  CertificateVerificationView,
  readVerificationReferenceFromPath
} from "./certificates/CertificateVerificationView";
import { AuthenticatedApp } from "./auth/AuthenticatedApp";
import { AuthScreen } from "./auth/AuthScreen";
import { PasswordRecoveryScreen } from "./auth/PasswordRecoveryScreen";
import { useAuth } from "./auth/AuthProvider";
import { readUatTargetFromPath } from "./uat/uat-target";

/**
 * WP-I — the development-only instructional UAT surface.
 *
 * The `import.meta.env.DEV` guard is the isolation mechanism, and it is written
 * as a module-level constant so there is exactly one place to read it. Vite
 * replaces `import.meta.env.DEV` with `false` in a production build, so this
 * folds to `null`, the `lazy(() => import(...))` is eliminated, and neither the
 * harness nor the architecture fixture it imports is emitted into the learner
 * bundle.
 *
 * The import is dynamic for that reason and must stay dynamic: a static import
 * would put fixture curriculum in front of learners.
 *
 * `readUatTargetFromPath` matches one exact path and returns `null` for every
 * other, so this can never intercept a learner route even in development.
 */
const UatHarness = import.meta.env.DEV
  ? lazy(() => import("./uat/UatHarness"))
  : null;

export function App() {
  const { loading, authState, recoveryMode, profileError, user } = useAuth();

  // Development UAT, checked before the auth branches for the same reason the
  // verification surface is: it needs no session, and waiting on one would put
  // a sign-in prompt in front of a reviewer who has no account.
  //
  // It is unreachable in production, where `UatHarness` is null.
  const uatTarget = readUatTargetFromPath(window.location.pathname);

  if (uatTarget !== null && UatHarness !== null) {
    return (
      <Suspense
        fallback={
          <main className="shell">
            <section className="card" aria-live="polite">
              <p className="eyebrow">Development UAT surface</p>
              <h1>Loading the review harness…</h1>
            </section>
          </main>
        }
      >
        <UatHarness />
      </Suspense>
    );
  }

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
