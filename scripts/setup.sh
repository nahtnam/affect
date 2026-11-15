#!/usr/bin/env bash
# Bootstrap tools and validate an already-provisioned development profile locally.
set +x
set -euo pipefail

setup_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$setup_root"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

[ -n "${HOME:-}" ] || fail 'Setup requires a home directory.'
command -v curl >/dev/null 2>&1 || fail 'Setup requires curl.'
[ -f env/development/.env ] || fail 'Provide the encrypted development profile at env/development/.env before setup.'
if [ -z "${DOTENV_PRIVATE_KEY:-}" ] && [ ! -f env/development/.env.keys ]; then
  fail 'Provide the development DOTENV_PRIVATE_KEY before setup.'
fi

setup_mise="$HOME/.local/bin/mise"
if [ ! -x "$setup_mise" ]; then
  [ ! -e "$setup_mise" ] && [ ! -L "$setup_mise" ] || fail 'The standard Mise installation path is not executable.'
  setup_installer=$(mktemp)
  trap 'rm -f -- "$setup_installer"' EXIT
  curl -fsSL https://mise.run -o "$setup_installer" || fail 'Unable to download the official Mise installer.'
  MISE_INSTALL_PATH="$setup_mise" MISE_VERSION=v2026.11.1 MISE_INSTALL_HELP=0 bash "$setup_installer" || fail 'Unable to install Mise.'
  rm -f -- "$setup_installer"
  trap - EXIT
fi
[ -x "$setup_mise" ] || fail 'Unable to find Mise at its standard installation path.'

MISE_NO_ENV=1 "$setup_mise" trust mise.toml
MISE_NO_ENV=1 "$setup_mise" install
MISE_NO_ENV=1 "$setup_mise" exec -- bun install --frozen-lockfile
# The validator emits only fixed, secret-safe errors. Never run `affect setup`:
# that command can provision or change a remote Convex deployment.
MISE_NO_ENV=1 "$setup_mise" exec -- bun scripts/validate-development-setup.ts
printf '%s\n' 'Development setup complete. Start with: VERCEL_ENV=development "$HOME/.local/bin/mise" exec -- bun run dev'
