import type { IncomingMessage } from "node:http";
import type {
  IdentityContext,
  PlatformRole,
  PublicProfile
} from "@tlp/shared-types";
import { AppError } from "@tlp/shared-types";
import { createUserScopedSupabaseClient } from "./supabase";

export interface TrustedRequestIdentity {
  identity: IdentityContext;
  profile: PublicProfile;
  accessToken: string;
}

export function extractBearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization?.trim();

  if (!authorization) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      retryable: false
    });
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      retryable: false
    });
  }

  return token;
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return value === "student" || value === "founder_admin";
}

export async function resolveTrustedRequestIdentity(
  request: IncomingMessage
): Promise<TrustedRequestIdentity> {
  const accessToken = extractBearerToken(request);
  const supabase = createUserScopedSupabaseClient(accessToken);

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser(accessToken);

  if (userError || !user) {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
      retryable: false
    });
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,display_name,role,created_at,updated_at")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile || !isPlatformRole(profile.role)) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "Authorized profile is unavailable",
      retryable: false,
      details: {
        reason: "profile_unavailable"
      }
    });
  }

  const {
    data: aalData,
    error: aalError
  } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);

  if (aalError) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to verify authentication assurance level",
      retryable: true
    });
  }

  const publicProfile: PublicProfile = {
    userId: profile.user_id,
    displayName: profile.display_name ?? undefined,
    role: profile.role,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at
  };

  return {
    accessToken,
    profile: publicProfile,
    identity: {
      userId: user.id,
      email: user.email,
      role: profile.role,
      emailVerified: Boolean(user.email_confirmed_at),
      mfaVerified: aalData.currentLevel === "aal2"
    }
  };
}
