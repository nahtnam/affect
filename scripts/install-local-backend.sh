#!/usr/bin/env bash
set -euo pipefail
umask 077
version=precompiled-2026-10-22-1447815
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) platform=aarch64-apple-darwin; sha=9caa539df14dff09317c1f1c22714ed77640e2e4a18ef630bc368fe8c6bb65df ;;
  Darwin-x86_64) platform=x86_64-apple-darwin; sha=70027e407cc78bb3ce1218dbcb4bbe6bca02fa80f3bdb50a12428d02c280394b ;;
  Linux-aarch64) platform=aarch64-unknown-linux-gnu; sha=1e9a3daaa243942ebabbf8ef62a77cb31faaf94add70997c81775a1f2a86ae18 ;;
  Linux-x86_64) platform=x86_64-unknown-linux-gnu; sha=7be627d8a8c9175b66a55cf6c4ab63c5f6bde1c412f59fbbe93f64a24a11bd13 ;;
  *) echo 'Unsupported local backend platform.' >&2; exit 1 ;;
esac
cd .setup.local
archive="backend-$sha.zip"
temp=$(mktemp -d ./backend.XXXXXX)
trap 'rm -rf -- "$temp"' EXIT
verify() {
  if command -v sha256sum >/dev/null; then
    echo "$sha  $1" | sha256sum -c - >/dev/null
  else
    echo "$sha  $1" | shasum -a 256 -c - >/dev/null
  fi
}
if ! [ -f "$archive" ] || ! verify "$archive"; then
  curl -fLsS --retry 3 "https://github.com/get-convex/convex-backend/releases/download/$version/convex-local-backend-$platform.zip" -o "$temp/archive"
  verify "$temp/archive"
  mv "$temp/archive" "$archive"
fi
unzip -p "$archive" convex-local-backend > "$temp/backend"
chmod 700 "$temp/backend"
mv "$temp/backend" convex-local-backend
echo "Installed verified Convex backend $version ($platform)."
