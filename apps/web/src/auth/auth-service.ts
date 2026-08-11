import type { Session, User } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "../lib/supabase";

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthOperationResult {
  user: User | null;
  session: Session | null;
  requiresEmailVerification: boolean;
}

export class AuthUiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthUiError";
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): string {
  const normalized = normalizeEmail(email);

  if (!normalized || !normalized.includes("@")) {
    throw new AuthUiError("Enter a valid email address.");
  }

  return normalized;
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new AuthUiError("Password must be at least 8 characters.");
  }
}

function publicAuthError(operation: "register" | "sign-in"): AuthUiError {
  if (operation === "register") {
    return new AuthUiError(
      "Unable to create the account. Check the information and try again."
    );
  }

  return new AuthUiError(
    "Unable to sign in. Check your credentials and try again."
  );
}

export async function registerStudent(
  input: RegisterInput
): Promise<AuthOperationResult> {
  const email = validateEmail(input.email);
  validatePassword(input.password);

  const supabase = getBrowserSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        display_name: input.displayName?.trim() || null
      },
      emailRedirectTo: `${window.location.origin}/`
    }
  });

  if (error) {
    throw publicAuthError("register");
  }

  return {
    user: data.user,
    session: data.session,
    requiresEmailVerification: Boolean(data.user && !data.session)
  };
}

export async function signInStudent(
  emailInput: string,
  password: string
): Promise<AuthOperationResult> {
  const email = validateEmail(emailInput);

  if (!password) {
    throw new AuthUiError("Enter your password.");
  }

  const supabase = getBrowserSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw publicAuthError("sign-in");
  }

  return {
    user: data.user,
    session: data.session,
    requiresEmailVerification: false
  };
}

export async function signOutCurrentSession(): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new AuthUiError("Unable to sign out. Please try again.");
  }
}
