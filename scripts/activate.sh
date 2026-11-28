#!/usr/bin/env bash
# Mise sources this in Bash. Keep the native CLI's profile selection unchanged.
set +x
affect_activation_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
affect_activation_target=${VERCEL_ENV:-}
if [ -z "$affect_activation_target" ]; then
  if [ "${CI:-}" = true ] || [ "${GITHUB_ACTIONS:-}" = true ]; then
    affect_activation_target=ci
  else
    affect_activation_target=development
  fi
fi

if [ "$affect_activation_target" = development ] && [ -z "${DOTENV_PRIVATE_KEY:-}" ]; then
  if [ -e "$affect_activation_root/env/development/.env.keys" ] || [ -L "$affect_activation_root/env/development/.env.keys" ]; then
    DOTENV_PRIVATE_KEY=$(bun "$affect_activation_root/scripts/validate-development-setup.ts" --read-key) || exit 1
    export DOTENV_PRIVATE_KEY
  fi
fi

if [[ "$affect_activation_target" == ci && -z ${DOTENV_PRIVATE_KEY:-} ]]; then
  : # A keyless CI checkout can use the toolchain and anonymous backend.
elif [[ "$affect_activation_target" == development ]]; then
  if [[ -n ${DOTENV_PRIVATE_KEY:-} ]]; then
    affect_exports=$(bun "$affect_activation_root/node_modules/affect-cli/dist/index.js" env 2>/dev/null) || {
      echo 'Cannot decrypt or load the development profile. Check the development key and env/development/.env.' >&2
      exit 1
    }
    eval "$affect_exports"
    unset affect_exports
  fi
else
  source "$affect_activation_root/node_modules/affect-cli/scripts/activate.sh"
fi
unset affect_activation_root affect_activation_target
