import { AppError } from "@tlp/shared-types";
import type { TrustedRequestIdentity } from "./auth-context";

export function requireFounderAdmin(
  trusted: TrustedRequestIdentity
): TrustedRequestIdentity {
  if (trusted.identity.role !== "founder_admin") {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Founder administrator access required",
      retryable: false
    });
  }

  if (!trusted.identity.emailVerified) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Verified email required for Founder administrator access",
      retryable: false
    });
  }

  if (!trusted.identity.mfaVerified) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Multi-factor authentication required",
      retryable: false,
      details: {
        reason: "mfa_required"
      }
    });
  }

  return trusted;
}
