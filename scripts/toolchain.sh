#!/usr/bin/env bash
# Shared native tool paths for setup and the fresh-shell Mise entrypoint.
# Values are data: never source or evaluate toolchain.paths.

toolchain_keys='MISE_INSTALL_PATH MISE_CONFIG_DIR MISE_DATA_DIR MISE_CACHE_DIR MISE_STATE_DIR MISE_TMP_DIR MISE_INSTALLS_DIR MISE_INSTALL_STORE_DIR MISE_PLUGINS_DIR MISE_DOWNLOADS_DIR MISE_SHIMS_DIR XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME BUN_INSTALL BUN_INSTALL_CACHE_DIR BUN_RUNTIME_TRANSPILER_CACHE_PATH BUN_TMPDIR BUN_INSTALL_GLOBAL_DIR BUN_INSTALL_BIN TMPDIR PORTLESS_STATE_DIR'
toolchain_saved_keys=()
toolchain_saved_values=()

toolchain_fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

toolchain_valid_key() {
  local allowed
  for allowed in $toolchain_keys; do
    [ "$1" != "$allowed" ] || return 0
  done
  return 1
}

toolchain_valid_value() {
  case "$2" in *$'\n'*|*$'\r'*) return 1 ;; esac
  if [ "$1" = BUN_RUNTIME_TRANSPILER_CACHE_PATH ]; then
    case "$2" in ''|0) return 0 ;; esac
  fi
  case "$2" in /*) return 0 ;; *) return 1 ;; esac
}

toolchain_mode() {
  if toolchain_file_mode=$(stat -c '%a' -- "$1" 2>/dev/null); then
    :
  else
    toolchain_file_mode=$(stat -f '%Lp' "$1" 2>/dev/null) || return 1
  fi
}

toolchain_check_state() {
  [ ! -L "$toolchain_state_dir" ] || toolchain_fail 'Unsafe toolchain state directory.'
  if [ -e "$toolchain_state_dir" ]; then
    [ -d "$toolchain_state_dir" ] && [ -O "$toolchain_state_dir" ] || toolchain_fail 'Unsafe toolchain state directory.'
    toolchain_mode "$toolchain_state_dir" || toolchain_fail 'Unable to inspect toolchain state permissions.'
    [ "$toolchain_file_mode" = 700 ] || toolchain_fail 'Toolchain state directory requires owner-only permissions (0700).'
  fi
  [ ! -L "$toolchain_state_file" ] || toolchain_fail 'Unsafe toolchain paths file.'
  if [ -e "$toolchain_state_file" ]; then
    [ -f "$toolchain_state_file" ] && [ -O "$toolchain_state_file" ] || toolchain_fail 'Unsafe toolchain paths file.'
    toolchain_mode "$toolchain_state_file" || toolchain_fail 'Unable to inspect toolchain state permissions.'
    [ "$toolchain_file_mode" = 600 ] || toolchain_fail 'Toolchain paths file requires owner-only permissions (0600).'
  fi
}

toolchain_saved() {
  toolchain_has_saved=0
  toolchain_saved_value=''
  local index
  for ((index = 0; index < ${#toolchain_saved_keys[@]}; index++)); do
    if [ "${toolchain_saved_keys[$index]}" = "$1" ]; then
      toolchain_has_saved=1
      toolchain_saved_value=${toolchain_saved_values[$index]}
      return
    fi
  done
}

toolchain_read() {
  toolchain_check_state
  [ -f "$toolchain_state_file" ] || return 0
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in *=*) ;; *) toolchain_fail 'Malformed toolchain paths file; rerun setup after removing it.' ;; esac
    key=${line%%=*}
    value=${line#*=}
    toolchain_valid_key "$key" || toolchain_fail 'Unknown toolchain path record; rerun setup after removing it.'
    toolchain_valid_value "$key" "$value" || toolchain_fail "Invalid saved toolchain path: $key."
    toolchain_saved "$key"
    [ "$toolchain_has_saved" = 0 ] || toolchain_fail 'Duplicate toolchain path record; rerun setup after removing it.'
    toolchain_saved_keys[${#toolchain_saved_keys[@]}]=$key
    toolchain_saved_values[${#toolchain_saved_values[@]}]=$value
  done < "$toolchain_state_file"
}

toolchain_writable_dir() {
  local probe
  (umask 077; mkdir -p -- "$1") 2>/dev/null || return 1
  [ -d "$1" ] || return 1
  probe=$(mktemp "$1/.setup-write.XXXXXX" 2>/dev/null) || return 1
  rm -f -- "$probe" || return 1
}

toolchain_set() {
  local key=$1 default=$2 fallback=${3:-} value explicit=0
  value=${!key-}
  [ -z "$value" ] || explicit=1
  if [ "$key" = BUN_RUNTIME_TRANSPILER_CACHE_PATH ] && [ "${BUN_RUNTIME_TRANSPILER_CACHE_PATH+x}" = x ]; then
    explicit=1
  fi
  toolchain_saved "$key"
  if [ "$explicit" = 1 ]; then
    toolchain_valid_value "$key" "$value" || toolchain_fail "Invalid toolchain path: $key."
    if [ "$toolchain_mode_kind" = exec ]; then
      [ "$toolchain_has_saved" = 1 ] && [ "$value" = "$toolchain_saved_value" ] || toolchain_fail "Toolchain path conflicts with setup: $key. Rerun bash scripts/setup.sh."
    fi
  elif [ "$toolchain_has_saved" = 1 ]; then
    value=$toolchain_saved_value
  else
    value=$default
  fi
  # Optional native overrides retain native defaults unless explicitly supplied.
  if [ -z "$value" ] && [ "$key" != BUN_RUNTIME_TRANSPILER_CACHE_PATH ]; then
    unset "$key"
    return
  fi
  toolchain_valid_value "$key" "$value" || toolchain_fail "Invalid toolchain path: $key."
  case "$key:$value" in BUN_RUNTIME_TRANSPILER_CACHE_PATH:|BUN_RUNTIME_TRANSPILER_CACHE_PATH:0) ;;
    MISE_INSTALL_PATH:*) ;;
    *)
      if ! toolchain_writable_dir "$value"; then
        if [ "$explicit" = 0 ] && [ "$toolchain_has_saved" = 0 ] && [ -n "$fallback" ] && toolchain_writable_dir "$fallback"; then
          value=$fallback
        else
          toolchain_fail "Toolchain directory is not writable: $key."
        fi
      fi ;;
  esac
  export "$key=$value"
}

toolchain_init() {
  toolchain_root=$1
  toolchain_mode_kind=$2
  toolchain_state_dir="$toolchain_root/.setup.local"
  toolchain_state_file="$toolchain_state_dir/toolchain.paths"
  toolchain_read
  if [ "$toolchain_mode_kind" = exec ]; then
    [ -f "$toolchain_state_file" ] || toolchain_fail 'Toolchain paths are not configured. Run bash scripts/setup.sh first.'
    local required
    for required in MISE_INSTALL_PATH MISE_CONFIG_DIR MISE_DATA_DIR MISE_CACHE_DIR MISE_STATE_DIR MISE_TMP_DIR XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME BUN_INSTALL BUN_INSTALL_CACHE_DIR BUN_RUNTIME_TRANSPILER_CACHE_PATH BUN_TMPDIR TMPDIR PORTLESS_STATE_DIR; do
      toolchain_saved "$required"
      [ "$toolchain_has_saved" = 1 ] || toolchain_fail 'Incomplete toolchain paths file. Rerun bash scripts/setup.sh.'
    done
  else
    toolchain_writable_dir "$toolchain_root" || toolchain_fail 'Setup requires a writable repository.'
  fi
  local home_usable=0 mise_default mise_on_path
  if [ "$toolchain_mode_kind" = setup ]; then
    case "${HOME:-}" in /*)
      if [ -d "$HOME" ]; then
        local probe
        probe=$(mktemp -d "$HOME/.setup-probe.XXXXXX" 2>/dev/null) && { rmdir -- "$probe"; home_usable=1; }
      fi ;;
    esac
  fi
  if [ "$home_usable" = 1 ]; then
    toolchain_default_config="$HOME/.config"
    toolchain_default_data="$HOME/.local/share"
    toolchain_default_cache="$HOME/.cache"
    toolchain_default_state="$HOME/.local/state"
    toolchain_default_tmp="$HOME/.cache/toolchain/tmp"
    toolchain_default_bun="$HOME/.bun"
    toolchain_default_portless="$HOME/.portless"
    mise_default="$HOME/.local/bin/mise"
  else
    toolchain_default_config="$toolchain_state_dir/config"
    toolchain_default_data="$toolchain_state_dir/data"
    toolchain_default_cache="$toolchain_state_dir/cache"
    toolchain_default_state="$toolchain_state_dir/state"
    toolchain_default_tmp="$toolchain_state_dir/tmp"
    toolchain_default_bun="$toolchain_state_dir/data/bun"
    toolchain_default_portless="$toolchain_state_dir/state/portless"
    mise_default="$toolchain_state_dir/bin/mise"
  fi
  # Reuse an existing native executable even if its parent is read-only.
  if [ -f "${HOME:-}/.local/bin/mise" ] && [ -x "${HOME:-}/.local/bin/mise" ]; then
    mise_default="$HOME/.local/bin/mise"
  elif mise_on_path=$(command -v mise 2>/dev/null); then
    case "$mise_on_path" in /*) [ ! -f "$mise_on_path" ] || [ ! -x "$mise_on_path" ] || mise_default=$mise_on_path ;; esac
  fi
  # The ignored state directory is also the fallback root; protect it before use.
  if [ ! -d "$toolchain_state_dir" ]; then
    (umask 077; mkdir -- "$toolchain_state_dir") || toolchain_fail 'Unable to create toolchain state directory.'
  fi
  toolchain_check_state
  toolchain_set XDG_CONFIG_HOME "$toolchain_default_config" "$toolchain_state_dir/config"
  toolchain_set XDG_DATA_HOME "$toolchain_default_data" "$toolchain_state_dir/data"
  toolchain_set XDG_CACHE_HOME "$toolchain_default_cache" "$toolchain_state_dir/cache"
  toolchain_set XDG_STATE_HOME "$toolchain_default_state" "$toolchain_state_dir/state"
  toolchain_set TMPDIR "$toolchain_default_tmp" "$toolchain_state_dir/tmp"
  toolchain_set MISE_CONFIG_DIR "$XDG_CONFIG_HOME/mise" "$toolchain_state_dir/config/mise"
  toolchain_set MISE_DATA_DIR "$XDG_DATA_HOME/mise" "$toolchain_state_dir/data/mise"
  toolchain_set MISE_CACHE_DIR "$XDG_CACHE_HOME/mise" "$toolchain_state_dir/cache/mise"
  toolchain_set MISE_STATE_DIR "$XDG_STATE_HOME/mise" "$toolchain_state_dir/state/mise"
  toolchain_set MISE_TMP_DIR "$TMPDIR/mise" "$toolchain_state_dir/tmp/mise"
  toolchain_set MISE_INSTALLS_DIR ''
  toolchain_set MISE_INSTALL_STORE_DIR ''
  toolchain_set MISE_PLUGINS_DIR ''
  toolchain_set MISE_DOWNLOADS_DIR ''
  toolchain_set MISE_SHIMS_DIR ''
  toolchain_set BUN_INSTALL "$toolchain_default_bun" "$toolchain_state_dir/data/bun"
  toolchain_set BUN_INSTALL_CACHE_DIR "$XDG_CACHE_HOME/bun/install" "$toolchain_state_dir/cache/bun/install"
  toolchain_set BUN_RUNTIME_TRANSPILER_CACHE_PATH "$XDG_CACHE_HOME/bun/runtime" "$toolchain_state_dir/cache/bun/runtime"
  toolchain_set BUN_TMPDIR "$TMPDIR/bun" "$toolchain_state_dir/tmp/bun"
  toolchain_set BUN_INSTALL_GLOBAL_DIR ''
  toolchain_set BUN_INSTALL_BIN ''
  toolchain_set PORTLESS_STATE_DIR "$toolchain_default_portless" "$toolchain_state_dir/state/portless"
  toolchain_explicit_mise=${MISE_INSTALL_PATH:-}
  toolchain_set MISE_INSTALL_PATH "$mise_default"
  if [ -e "$MISE_INSTALL_PATH" ] || [ -L "$MISE_INSTALL_PATH" ]; then
    [ -f "$MISE_INSTALL_PATH" ] && [ -x "$MISE_INSTALL_PATH" ] || toolchain_fail 'Invalid toolchain executable: MISE_INSTALL_PATH.'
  elif [ "$toolchain_mode_kind" = exec ]; then
    toolchain_fail 'Mise is unavailable. Rerun bash scripts/setup.sh.'
  else
    if ! toolchain_writable_dir "$(dirname -- "$MISE_INSTALL_PATH")"; then
      toolchain_saved MISE_INSTALL_PATH
      if [ -z "${toolchain_explicit_mise:-}" ] && [ "$toolchain_has_saved" = 0 ] && toolchain_writable_dir "$toolchain_state_dir/bin"; then
        export MISE_INSTALL_PATH="$toolchain_state_dir/bin/mise"
      else
        toolchain_fail 'Toolchain directory is not writable: MISE_INSTALL_PATH.'
      fi
    fi
  fi
}

toolchain_save() {
  toolchain_check_state
  local temporary key value
  temporary=$(umask 077; mktemp "$toolchain_state_dir/.toolchain.paths.XXXXXX") || toolchain_fail 'Unable to save toolchain paths.'
  for key in $toolchain_keys; do
    value=${!key-}
    if [ -n "$value" ] || { [ "$key" = BUN_RUNTIME_TRANSPILER_CACHE_PATH ] && [ "${BUN_RUNTIME_TRANSPILER_CACHE_PATH+x}" = x ]; }; then
      printf '%s=%s\n' "$key" "$value" >> "$temporary" || { rm -f -- "$temporary"; toolchain_fail 'Unable to save toolchain paths.'; }
    fi
  done
  if ! chmod 600 "$temporary" || ! mv -f -- "$temporary" "$toolchain_state_file"; then
    rm -f -- "$temporary"
    toolchain_fail 'Unable to save toolchain paths.'
  fi
}
