export type PlatformRole = "student" | "founder_admin";

export interface IdentityContext {
  userId: string;
  email?: string;
  role: PlatformRole;
  emailVerified: boolean;
  mfaVerified: boolean;
}

export interface PublicProfile {
  userId: string;
  displayName?: string;
  role: PlatformRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionState {
  authenticated: boolean;
  identity?: IdentityContext;
}

export interface MfaStatus {
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  verifiedTotpFactorIds: string[];
  requiresMfa: boolean;
}
