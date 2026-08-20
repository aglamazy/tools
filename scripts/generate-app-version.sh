#!/usr/bin/env bash
# generate-app-version.sh — write a TypeScript module exporting APP_VERSION +
# APP_COMMIT, for a project's prebuild step. Part of the fleet-versioning-
# standard template (dasi#3). Pairs with derive-app-version.sh.
#
# Usage: bash generate-app-version.sh <output-ts-path>
#   e.g. bash generate-app-version.sh lib/app-version.ts
#
# Wire into package.json:
#   "prebuild": "bash scripts/generate-app-version.sh lib/app-version.ts"
# and .gitignore the output path — it's build-generated, never hand-edited
# or committed. Commit nextjs/lib/app-version.example.ts (from this template)
# instead, as the checked-in reference shape for local dev before first build.
set -euo pipefail

OUT="${1:?usage: generate-app-version.sh <output-ts-path>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

eval "$(bash "$SCRIPT_DIR/derive-app-version.sh")"

mkdir -p "$(dirname "$OUT")"
cat > "$OUT" <<EOF
// AUTO-GENERATED at build time by scripts/generate-app-version.sh.
// Do not edit or commit — see nextjs/lib/app-version.example.ts for the
// checked-in fallback shape (tools/templates/app-version, dasi#3).
export const APP_VERSION = "${APP_VERSION}";
export const APP_COMMIT = "${APP_COMMIT}";
EOF

echo "[generate-app-version] wrote $OUT (APP_VERSION=$APP_VERSION APP_COMMIT=$APP_COMMIT)"
