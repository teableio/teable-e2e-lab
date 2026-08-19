#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
E2E_LAB="${E2E_LAB:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}"
TEABLE_EE_MAIN="${TEABLE_EE_MAIN:-$(git -C "$E2E_LAB" config --local --get e2eLab.teableEeMain || true)}"
TEABLE_EE_SANDBOX="${TEABLE_EE_SANDBOX:-$(git -C "$E2E_LAB" config --local --get e2eLab.teableEeSandbox || true)}"
TEABLE_EE_REF="${TEABLE_EE_REF:-origin/develop}"

if [ -z "$TEABLE_EE_MAIN" ] || [ -z "$TEABLE_EE_SANDBOX" ]; then
  echo "Missing local teable-ee paths." >&2
  echo "Set TEABLE_EE_MAIN and TEABLE_EE_SANDBOX or run:" >&2
  echo "  git config --local e2eLab.teableEeMain /path/to/teable-ee" >&2
  echo "  git config --local e2eLab.teableEeSandbox /path/to/teable-ee-e2e-local" >&2
  exit 1
fi

if ! git -C "$TEABLE_EE_MAIN" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Missing teable-ee git checkout: $TEABLE_EE_MAIN" >&2
  exit 1
fi

git -C "$TEABLE_EE_MAIN" fetch origin

if ! git -C "$TEABLE_EE_SANDBOX" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  mkdir -p "$(dirname "$TEABLE_EE_SANDBOX")"
  git -C "$TEABLE_EE_MAIN" worktree add -B e2e-local "$TEABLE_EE_SANDBOX" "$TEABLE_EE_REF"
else
  git -C "$TEABLE_EE_SANDBOX" fetch origin
  git -C "$TEABLE_EE_SANDBOX" reset --hard "$TEABLE_EE_REF"
  git -C "$TEABLE_EE_SANDBOX" clean -fd \
    community/apps/nestjs-backend/test/e2e-lab \
    enterprise/backend-ee/vitest-e2e-lab.config.ts || true
fi

git -C "$TEABLE_EE_SANDBOX" status --short --branch
echo "teable-ee e2e sandbox ready: $TEABLE_EE_SANDBOX"
