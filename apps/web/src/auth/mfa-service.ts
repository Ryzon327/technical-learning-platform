import type { MfaStatus } from "@tlp/shared-types";
import { getBrowserSupabaseClient } from "../lib/supabase";
import { AuthUiError } from "./auth-service";

export interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const supabase = getBrowserSupabaseClient();

  const [
    { data: factorData, error: factorError },
    { data: aalData, error: aalError }
  ] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);

  if (factorError || aalError) {
    throw new AuthUiError(
      "Unable to verify multi-factor authentication status."
    );
  }

  const verifiedTotpFactorIds = factorData.totp
    .filter((factor) => factor.status === "verified")
    .map((factor) => factor.id);

  const normalizeAal = (
    level: string | null
  ): "aal1" | "aal2" | null => {
    if (level === "aal1" || level === "aal2") {
      return level;
    }

    return null;
  };

  const currentLevel = normalizeAal(aalData.currentLevel);
  const nextLevel = normalizeAal(aalData.nextLevel);

  return {
    currentLevel,
    nextLevel,
    verifiedTotpFactorIds,
    requiresMfa: nextLevel === "aal2" && currentLevel !== "aal2"
  };
}

export async function beginTotpEnrollment(): Promise<TotpEnrollment> {
  const supabase = getBrowserSupabaseClient();

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Technical Learning Platform Founder Admin"
  });

  if (error) {
    throw new AuthUiError(
      "Unable to begin multi-factor authentication enrollment."
    );
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret
  };
}

export async function verifyTotpCode(
  factorId: string,
  code: string
): Promise<void> {
  const normalized = code.trim();

  if (!/^\d{6}$/.test(normalized)) {
    throw new AuthUiError("Enter the 6-digit authenticator code.");
  }

  const supabase = getBrowserSupabaseClient();

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalized
  });

  if (error) {
    throw new AuthUiError(
      "The authenticator code could not be verified. Try the newest code."
    );
  }
}
