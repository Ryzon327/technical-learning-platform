import { createServerSupabaseClient } from "../supabase";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function main() {
  const userId = required("FOUNDER_BOOTSTRAP_USER_ID");
  const confirmation = required("FOUNDER_BOOTSTRAP_CONFIRM");

  if (confirmation !== userId) {
    throw new Error(
      "FOUNDER_BOOTSTRAP_CONFIRM must exactly match FOUNDER_BOOTSTRAP_USER_ID."
    );
  }

  const supabase = createServerSupabaseClient();

  const { data: userResult, error: userError } =
    await supabase.auth.admin.getUserById(userId);

  if (userError || !userResult.user) {
    throw new Error("Founder bootstrap user was not found.");
  }

  if (!userResult.user.email_confirmed_at) {
    throw new Error(
      "Founder bootstrap user must have a verified email before elevation."
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id,role")
    .eq("user_id", userId)
    .single();

  if (profileError || !profile) {
    throw new Error("Founder bootstrap profile was not found.");
  }

  if (profile.role === "founder_admin") {
    console.log("Founder/admin role is already provisioned.");
    return;
  }

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ role: "founder_admin" })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error("Founder/admin role provisioning failed.");
  }

  console.log(
    "Founder/admin role provisioned. The user must enroll and verify MFA before privileged API access."
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Founder provisioning failed."
  );
  process.exitCode = 1;
});
