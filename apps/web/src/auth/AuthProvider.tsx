import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import type { AuthSessionState, IdentityContext } from "@tlp/shared-types";
import { getBrowserSupabaseClient } from "../lib/supabase";
import { signOutCurrentSession } from "./auth-service";

interface AuthContextValue {
  loading: boolean;
  session: Session | null;
  user: User | null;
  authState: AuthSessionState;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function userToIdentity(user: User): IdentityContext {
  return {
    userId: user.id,
    email: user.email,
    role: "student",
    emailVerified: Boolean(user.email_confirmed_at),
    mfaVerified: false
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let mounted = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (!error) {
        setSession(data.session);
      }

      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;

  const authState = useMemo<AuthSessionState>(
    () => ({
      authenticated: Boolean(user),
      ...(user ? { identity: userToIdentity(user) } : {})
    }),
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      user,
      authState,
      signOut: signOutCurrentSession
    }),
    [authState, loading, session, user]
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
