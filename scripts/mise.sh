#!/usr/bin/env bash
# Restore setup's native tool paths before handing all arguments to Mise.
set +x
set -euo pipefail

mise_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
source "$mise_root/scripts/toolchain.sh"
toolchain_init "$mise_root" exec
exec "$MISE_INSTALL_PATH" "$@"
