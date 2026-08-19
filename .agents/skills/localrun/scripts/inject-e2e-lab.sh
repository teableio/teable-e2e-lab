#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
E2E_LAB="${E2E_LAB:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"
TEABLE_EE_SANDBOX="${TEABLE_EE_SANDBOX:-$(git -C "$E2E_LAB" config --local --get e2eLab.teableEeSandbox || true)}"

if [ -z "$TEABLE_EE_SANDBOX" ]; then
  echo "Missing teable-ee sandbox path." >&2
  echo "Set TEABLE_EE_SANDBOX or run:" >&2
  echo "  git config --local e2eLab.teableEeSandbox /path/to/teable-ee-e2e-local" >&2
  exit 1
fi

if [ ! -f "$E2E_LAB/e2e-lab.e2e-spec.ts" ]; then
  echo "Missing e2e-lab repo: $E2E_LAB" >&2
  exit 1
fi

if ! git -C "$TEABLE_EE_SANDBOX" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Missing teable-ee sandbox: $TEABLE_EE_SANDBOX" >&2
  echo "Run refresh-teable-ee-sandbox.sh first." >&2
  exit 1
fi

rm -rf "$TEABLE_EE_SANDBOX/community/apps/nestjs-backend/test/e2e-lab"
mkdir -p "$TEABLE_EE_SANDBOX/community/apps/nestjs-backend/test/e2e-lab"

cp -R \
  "$E2E_LAB/cases" \
  "$E2E_LAB/framework" \
  "$E2E_LAB/e2e-lab.e2e-spec.ts" \
  "$E2E_LAB/registry.ts" \
  "$TEABLE_EE_SANDBOX/community/apps/nestjs-backend/test/e2e-lab/"

cp "$E2E_LAB/vitest-e2e-lab.config.ts" \
  "$TEABLE_EE_SANDBOX/enterprise/backend-ee/vitest-e2e-lab.config.ts"

echo "Injected e2e-lab into: $TEABLE_EE_SANDBOX"
git -C "$TEABLE_EE_SANDBOX" status --short \
  community/apps/nestjs-backend/test/e2e-lab \
  enterprise/backend-ee/vitest-e2e-lab.config.ts
