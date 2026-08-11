import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import type { MfaStatus } from "@tlp/shared-types";
import { AuthUiError } from "./auth-service";
import {
  beginTotpEnrollment,
  getMfaStatus,
  type TotpEnrollment,
  verifyTotpCode
} from "./mfa-service";

export function FounderMfaGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [selectedFactorId, setSelectedFactorId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  async function refreshStatus() {
    const nextStatus = await getMfaStatus();
    setStatus(nextStatus);

    if (nextStatus.verifiedTotpFactorIds.length > 0) {
      setSelectedFactorId(nextStatus.verifiedTotpFactorIds[0] ?? "");
    }
  }

  useEffect(() => {
    void refreshStatus()
      .catch((caught) => {
        setError(
          caught instanceof AuthUiError
            ? caught.message
            : "Unable to verify multi-factor authentication status."
        );
      })
      .finally(() => setBusy(false));
  }, []);

  async function handleBeginEnrollment() {
    setBusy(true);
    setError("");

    try {
      setEnrollment(await beginTotpEnrollment());
    } catch (caught) {
      setError(
        caught instanceof AuthUiError
          ? caught.message
          : "Unable to begin MFA enrollment."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const factorId = enrollment?.factorId || selectedFactorId;

    if (!factorId) {
      setError("No authenticator factor is available.");
      setBusy(false);
      return;
    }

    try {
      await verifyTotpCode(factorId, code);
      await refreshStatus();
      setEnrollment(null);
      setCode("");
    } catch (caught) {
      setError(
        caught instanceof AuthUiError
          ? caught.message
          : "Unable to verify multi-factor authentication."
      );
    } finally {
      setBusy(false);
    }
  }

  if (busy && !status) {
    return (
      <main className="shell">
        <section className="card" aria-live="polite">
          <p className="eyebrow">Founder administrator security</p>
          <h1>Checking multi-factor authentication…</h1>
        </section>
      </main>
    );
  }

  if (status?.currentLevel === "aal2") {
    return <>{children}</>;
  }

  const hasVerifiedFactor =
    (status?.verifiedTotpFactorIds.length ?? 0) > 0;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="mfa-title">
        <p className="eyebrow">Founder administrator security</p>
        <h1 id="mfa-title">
          {hasVerifiedFactor
            ? "Enter your authenticator code"
            : "Set up multi-factor authentication"}
        </h1>

        <p className="auth-intro">
          Founder/admin access requires a verified second factor before
          privileged platform operations are available.
        </p>

        {!hasVerifiedFactor && !enrollment && (
          <button
            type="button"
            onClick={handleBeginEnrollment}
            disabled={busy}
          >
            Set up authenticator
          </button>
        )}

        {enrollment && (
          <div className="mfa-enrollment">
            <p>
              Scan this QR code with your authenticator application, then enter
              the current 6-digit code.
            </p>
            <img
              className="mfa-qr"
              src={enrollment.qrCode}
              alt="Authenticator enrollment QR code"
            />
            <details>
              <summary>Cannot scan the QR code?</summary>
              <p>
                Enter this secret manually in your authenticator application:
              </p>
              <code>{enrollment.secret}</code>
            </details>
          </div>
        )}

        {(hasVerifiedFactor || enrollment) && (
          <form onSubmit={handleVerify} className="auth-form">
            <label>
              Authenticator code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
                disabled={busy}
              />
            </label>

            {error && (
              <p className="form-message error-message" role="alert">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy}>
              {busy ? "Verifying…" : "Verify MFA"}
            </button>
          </form>
        )}

        {error && !hasVerifiedFactor && !enrollment && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
