#!/usr/bin/env bash
# Restore setup's native tool paths before handing all arguments to Mise.
set +x
set -euo pipefail

mise_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
source "$mise_root/scripts/toolchain.sh"
toolchain_init "$mise_root" exec
# Disable Bun's dotenv loader before it reads the package script.
if [[ "$#" -ge 5 && "$1 $2 $3 $4" = "exec -- bun run" && "$5" = local:* ]]; then
  exec env MISE_NO_ENV=1 "$MISE_INSTALL_PATH" exec -- bun --no-env-file run "${@:5}"
fi
exec "$MISE_INSTALL_PATH" "$@"
