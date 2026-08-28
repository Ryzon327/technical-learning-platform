import { useState } from "react";
import { AuthUiError } from "./auth-service";
import { useAuth } from "./AuthProvider";
import { CertificateEligibilityView } from "../certificates/CertificateEligibilityView";
import { CertificatePortfolioView } from "../certificates/CertificatePortfolioView";
import { CurriculumSearchView } from "../search/CurriculumSearchView";
import { EvidencePortfolioView } from "../evidence/EvidencePortfolioView";
import { LearningView } from "../learning/LearningView";
import { FounderMfaGate } from "./FounderMfaGate";

type WorkspaceView =
  | "overview"
  | "learning"
  | "evidence"
  | "certificates"
  | "certificate-portfolio"
  | "search";

function Workspace() {
  const { user, profile, authState, signOut } = useAuth();
  const [error, setError] = useState("");
  // Smallest accessible navigation consistent with this shell: no routing
  // library is introduced, and each control is a native button.
  const [view, setView] = useState<WorkspaceView>("overview");

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
          Signed in as{" "}
          <strong>{profile?.displayName || user?.email || "student"}</strong>.
        </p>

        <nav aria-label="Workspace sections">
          <ul className="workspace-nav">
            <li>
              <button
                type="button"
                aria-current={view === "overview" ? "page" : undefined}
                onClick={() => setView("overview")}
              >
                Overview
              </button>
            </li>
            <li>
              <button
                type="button"
                aria-current={view === "learning" ? "page" : undefined}
                onClick={() => setView("learning")}
              >
                Learning
              </button>
            </li>
            <li>
              <button
                type="button"
                aria-current={view === "evidence" ? "page" : undefined}
                onClick={() => setView("evidence")}
              >
                Evidence portfolio
              </button>
            </li>
            <li>
              <button
                type="button"
                aria-current={
                  view === "certificate-portfolio" ? "page" : undefined
                }
                onClick={() => setView("certificate-portfolio")}
              >
                Certificates
              </button>
            </li>
            <li>
              <button
                type="button"
                aria-current={view === "certificates" ? "page" : undefined}
                onClick={() => setView("certificates")}
              >
                Certificate eligibility
              </button>
            </li>
            <li>
              <button
                type="button"
                aria-current={view === "search" ? "page" : undefined}
                onClick={() => setView("search")}
              >
                Search
              </button>
            </li>
          </ul>
        </nav>

        {view === "overview" && (
        <dl className="status-grid">
          <div>
            <dt>Role</dt>
            <dd>{authState.identity?.role ?? "Unavailable"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>
              {authState.identity?.emailVerified ? "Verified" : "Not verified"}
            </dd>
          </div>
          <div>
            <dt>Current Wave</dt>
            <dd>Wave 1 — Authentication</dd>
          </div>
        </dl>
        )}

        {view === "learning" && <LearningView />}

        {view === "evidence" && <EvidencePortfolioView />}

        {view === "certificate-portfolio" && <CertificatePortfolioView />}
        {view === "search" && <CurriculumSearchView />}

        {view === "certificates" && <CertificateEligibilityView />}

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

export function AuthenticatedApp() {
  const { authState } = useAuth();

  if (authState.identity?.role === "founder_admin") {
    return (
      <FounderMfaGate>
        <Workspace />
      </FounderMfaGate>
    );
  }

  return <Workspace />;
}
