import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import type {
  AuthSessionState,
  IdentityContext,
  PublicProfile
} from "@tlp/shared-types";
import { getBrowserSupabaseClient } from "../lib/supabase";
import { signOutCurrentSession } from "./auth-service";
import { loadCurrentProfile } from "./profile-service";

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: PublicProfile | null;
  authState: AuthSessionState;
  recoveryMode: boolean;
  profileError: string;
  signOut: () => Promise<void>;
  finishRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function userToIdentity(
  user: User,
  profile: PublicProfile
): IdentityContext {
  return {
    userId: user.id,
    email: user.email,
    role: profile.role,
    emailVerified: Boolean(user.email_confirmed_at),
    mfaVerified: false
  };
}

function recoveryModeFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get("mode") === "recovery";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(recoveryModeFromUrl);

  async function hydrateProfile(nextSession: Session | null) {
    if (!nextSession?.user) {
      setProfile(null);
      setProfileError("");
      return;
    }

    try {
      const nextProfile = await loadCurrentProfile(nextSession.user.id);
      setProfile(nextProfile);
      setProfileError("");
    } catch {
      setProfile(null);
      setProfileError(
        "Your authenticated profile could not be loaded. Sign out and try again."
      );
    }
  }

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let mounted = true;

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;

      if (!error) {
        setSession(data.session);
        await hydrateProfile(data.session);
      }

      if (mounted) setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
      }

      setSession(nextSession);

      window.setTimeout(() => {
        if (!mounted) return;
        void hydrateProfile(nextSession).finally(() => {
          if (mounted) setLoading(false);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;

  const authState = useMemo<AuthSessionState>(
    () => ({
      authenticated: Boolean(user && profile),
      ...(user && profile
        ? { identity: userToIdentity(user, profile) }
        : {})
    }),
    [profile, user]
  );

  function finishRecovery() {
    setRecoveryMode(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user,
      profile,
      authState,
      recoveryMode,
      profileError,
      signOut: signOutCurrentSession,
      finishRecovery
    }),
    [
      authState,
      loading,
      profile,
      profileError,
      recoveryMode,
      session,
      user
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
