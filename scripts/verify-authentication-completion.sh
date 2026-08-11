#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "===== AUTHENTICATION COMPLETION CHECK ====="

required_files=(
  "apps/web/src/auth/auth-service.ts"
  "apps/web/src/auth/AuthProvider.tsx"
  "apps/web/src/auth/AuthScreen.tsx"
  "apps/web/src/auth/PasswordRecoveryScreen.tsx"
  "apps/web/src/auth/profile-service.ts"
  "apps/web/src/auth/mfa-service.ts"
  "apps/web/src/auth/FounderMfaGate.tsx"
  "services/api/src/auth-context.ts"
  "services/api/src/authorization.ts"
  "services/api/src/admin/provision-founder.ts"
  "supabase/migrations/20260811000200_authentication_foundation.sql"
)

for path in "${required_files[@]}"; do
  if [ ! -f "$path" ]; then
    echo "FAIL: missing authentication implementation file: $path"
    exit 1
  fi
done

required_spec_files=(
  "docs/Feature-Registry/Authentication-Engine/AUTH-001_STUDENT_ACCOUNT_REGISTRATION.md"
  "docs/Feature-Registry/Authentication-Engine/AUTH-002_SIGN_IN_AND_SIGN_OUT.md"
  "docs/Feature-Registry/Authentication-Engine/AUTH-003_SESSION_MANAGEMENT.md"
  "docs/Feature-Registry/Authentication-Engine/AUTH-004_EMAIL_VERIFICATION.md"
  "docs/Feature-Registry/Authentication-Engine/AUTH-005_PASSWORD_RECOVERY.md"
  "docs/Feature-Registry/Authentication-Engine/AUTH-006_FOUNDER_ADMIN_MFA.md"
  "docs/Feature-Registry/Authentication-Engine/AUTH-007_AUTHENTICATION_IDENTITY_CONTEXT.md"
)

for path in "${required_spec_files[@]}"; do
  if [ ! -f "$path" ]; then
    echo "FAIL: missing approved Authentication specification: $path"
    exit 1
  fi

  if ! grep -Fq -- "- [x] Approved" "$path"; then
    echo "FAIL: Authentication specification is not approved: $path"
    exit 1
  fi
done

if ! grep -Fq 'role = (' \
  supabase/migrations/20260811000200_authentication_foundation.sql; then
  echo "FAIL: expected role-preserving profile update rule not found."
  exit 1
fi

if ! grep -Fq 'role in (' \
  supabase/migrations/20260811000200_authentication_foundation.sql; then
  echo "FAIL: expected role constraint not found."
  exit 1
fi

if ! grep -Fq 'requireFounderAdmin' services/api/src/server.ts; then
  echo "FAIL: privileged server authorization is not wired into the API."
  exit 1
fi

if ! grep -Fq 'mfaVerified' services/api/src/authorization.ts; then
  echo "FAIL: Founder/admin MFA authorization enforcement was not found."
  exit 1
fi

if ! grep -Fq 'aal2' services/api/src/auth-context.ts; then
  echo "FAIL: Supabase AAL2-to-trusted-identity mapping was not found."
  exit 1
fi

if grep -R --line-number \
  'SUPABASE_SERVICE_ROLE_KEY' \
  apps/web/src >/tmp/tlp_browser_service_role 2>/dev/null; then
  echo "FAIL: browser code references SUPABASE_SERVICE_ROLE_KEY:"
  cat /tmp/tlp_browser_service_role
  exit 1
fi

echo "PASS: AUTH-001 through AUTH-007 specifications exist and are approved"
echo "PASS: required authentication implementation files exist"
echo "PASS: profile role constraints are present"
echo "PASS: privileged server authorization is wired"
echo "PASS: Founder/admin AAL2 enforcement is present"
echo "PASS: browser does not reference the Supabase service-role key"

echo
echo "Running Wave 1 verification..."
bash scripts/verify-wave1.sh

echo
echo "AUTHENTICATION ENGINE COMPLETION CHECK PASSED"
