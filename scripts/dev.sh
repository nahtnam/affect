#!/usr/bin/env bash
set -eu
# Select development explicitly even when a cloud editor exports CI=true.
prior_selector=${VERCEL_ENV-}
case "$prior_selector" in
  ''|development|ci) ;;
  *) echo 'Use a development profile for bun run dev.' >&2; exit 1 ;;
esac
export VERCEL_ENV=development
source scripts/activate.sh
if [[ -n ${DOTENV_PRIVATE_KEY:-} ]]; then
  echo 'Using development profile because a development key is available.'
  if [[ -z "$prior_selector" && ${CI:-} != true && ${GITHUB_ACTIONS:-} != true ]]; then
    unset VERCEL_ENV
  fi
  exec portless run --name affect-tanstack bun run --filter @affect/web dev "$@"
fi
echo 'Using local anonymous Convex because no development decryption key is available.'
exec node scripts/local.ts dev
