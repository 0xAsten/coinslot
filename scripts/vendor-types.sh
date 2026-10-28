#!/usr/bin/env bash
set -euo pipefail
src="${1:-}"
if [ -z "$src" ] || [ ! -f "$src" ]; then
  echo "usage: scripts/vendor-types.sh <path-to-claude-code.d.ts>" >&2
  exit 1
fi
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/vendor"
cp "$src" "$root/vendor/claude-code.d.ts"
echo "vendored $src -> vendor/claude-code.d.ts"
