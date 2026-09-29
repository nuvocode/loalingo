#!/bin/sh
# Signed macOS build + latest.json for the in-app updater (tauri.conf.json → plugins.updater).
# Upload everything in dist-release/ to a GitHub release of nuvocode/loalingo tagged v<version>.
# Needs the private key from `tauri signer generate` at ~/.tauri/loalingo.key (never commit it).
set -e
cd "$(dirname "$0")/.."
export TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-$HOME/.tauri/loalingo.key}"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"
pnpm tauri build "$@"

version=$(node -p "require('./src-tauri/tauri.conf.json').version")
bundle=src-tauri/target/release/bundle
out=dist-release
rm -rf "$out" && mkdir -p "$out"
cp "$bundle"/macos/loalingo.app.tar.gz "$bundle"/dmg/*.dmg "$out"/
base="${UPDATE_BASE_URL:-https://github.com/nuvocode/loalingo/releases/download/v$version}"
# ponytail: Apple silicon only, add darwin-x86_64 / windows / linux entries when those builds exist
node -e '
const [v, sig, url] = process.argv.slice(1);
console.log(JSON.stringify({ version: v, pub_date: new Date().toISOString(),
  platforms: { "darwin-aarch64": { signature: sig, url } } }, null, 2));
' "$version" "$(cat "$bundle"/macos/loalingo.app.tar.gz.sig)" "$base/loalingo.app.tar.gz" > "$out"/latest.json
echo "Release files in $out/"
