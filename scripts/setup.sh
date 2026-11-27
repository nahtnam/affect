#!/usr/bin/env bash
# Bootstrap tools, optionally initialize hosted profiles, then validate development locally.
set +x
set -euo pipefail

setup_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$setup_root"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

usage() {
  printf '%s\n' \
    'Usage: bash scripts/setup.sh [--local | --hosted <affect env init flags...>]' \
    'Default: install tools and validate an existing local development profile.' \
    '--local: install the toolchain, dependencies without profiles.' \
    '--hosted: explicitly initialize or restore verified hosted profiles before local validation.' \
    'Hosted mode requires a released Affect CLI with env init support and separate provider authorization.'
}

setup_local=0
setup_hosted=0
case "${1:-}" in
  --local) setup_local=1; [ "$#" = 1 ] || fail '--local takes no arguments.' ;;
  --hosted) setup_hosted=1; shift ;;
  --help|-h) usage; exit 0 ;;
  '') ;;
  *) fail 'Unexpected setup arguments. Use --help or --hosted followed by affect env init flags.' ;;
esac

command -v curl >/dev/null 2>&1 || fail 'Setup requires curl.'
if [ "$setup_local" = 0 ] && [ "$setup_hosted" = 0 ]; then
  [ "$#" = 0 ] || fail 'Unexpected setup arguments. Use --help or --hosted followed by affect env init flags.'
  [ -f env/development/.env ] || fail 'Provide the encrypted development profile at env/development/.env before setup.'
  if [ -z "${DOTENV_PRIVATE_KEY:-}" ] && [ ! -f env/development/.env.keys ]; then
    fail 'Provide the development DOTENV_PRIVATE_KEY before setup.'
  fi
fi

source "$setup_root/scripts/toolchain.sh"
toolchain_init "$setup_root" setup
setup_mise=$MISE_INSTALL_PATH
if [ ! -x "$setup_mise" ]; then
  setup_installer=$(mktemp)
  trap 'rm -f -- "$setup_installer"' EXIT
  curl -fsSL https://mise.run -o "$setup_installer" || fail 'Unable to download the official Mise installer.'
  MISE_INSTALL_PATH="$setup_mise" MISE_VERSION=v2026.11.1 MISE_INSTALL_HELP=0 bash "$setup_installer" || fail 'Unable to install Mise.'
  rm -f -- "$setup_installer"
  trap - EXIT
fi
[ -f "$setup_mise" ] && [ -x "$setup_mise" ] || fail 'Unable to find Mise at MISE_INSTALL_PATH.'

MISE_NO_ENV=1 "$setup_mise" trust mise.toml
MISE_NO_ENV=1 "$setup_mise" install
if [ "$setup_local" = 1 ]; then
  MISE_NO_ENV=1 "$setup_mise" exec -- bun --no-env-file install --frozen-lockfile
  toolchain_save
  exit 0
fi
MISE_NO_ENV=1 "$setup_mise" exec -- bun install --frozen-lockfile
if [ "$setup_hosted" = 1 ]; then
  # Older CLIs can exit successfully while showing parent-command help for an
  # unknown subcommand. Confirm the exact command exists before invoking it.
  setup_hosted_help=$(MISE_NO_ENV=1 "$setup_mise" exec -- bunx --no-install affect env init --help 2>/dev/null) || fail 'Hosted setup requires a released compatible Affect CLI with affect env init support (0.0.7 or later).'
  case "$setup_hosted_help" in
    *'affect env init'*) ;;
    *) fail 'Hosted setup requires a released compatible Affect CLI with affect env init support (0.0.7 or later).' ;;
  esac
  unset setup_hosted_help
  AFFECT_REQUIRE_DEVELOPMENT=1 MISE_NO_ENV=1 "$setup_mise" exec -- bunx --no-install affect env init "$@"
  for setup_argument in "$@"; do
    case "$setup_argument" in
      --help|-h) exit 0 ;;
    esac
  done
fi
# The validator emits only fixed, secret-safe errors. Never run `affect setup`:
# that command can provision or change a remote Convex deployment.
if [ "$setup_hosted" = 1 ]; then
  # Hosted init owns the selected profile's keyfile. An unrelated ambient key
  # must not override the restored development key during local validation.
  DOTENV_PRIVATE_KEY= MISE_NO_ENV=1 "$setup_mise" exec -- bun scripts/validate-development-setup.ts
else
  MISE_NO_ENV=1 "$setup_mise" exec -- bun scripts/validate-development-setup.ts
fi
toolchain_save
if [ "$setup_hosted" = 1 ]; then
  printf '%s\n' 'Development setup complete. Use the configured development origin.'
else
  printf '%s\n' 'Development setup complete. Start with: VERCEL_ENV=development bash scripts/mise.sh exec -- bun run dev'
fi
