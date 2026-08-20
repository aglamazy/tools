#!/usr/bin/env bash
# derive-app-version.sh — print APP_VERSION (CalVer) + APP_COMMIT for the
# current build. Part of the fleet-versioning-standard template (dasi#3,
# Agla 2026-08-18; see ~/develop/Buddy/docs/fleet-versioning-standard.md for
# the full convention this implements).
#
# Scheme (Agla's ruling, supersedes any "sha + date" text elsewhere):
#   APP_VERSION = YY.M.DD-HHmm   e.g. 26.8.18-2015
#   APP_COMMIT  = git short sha
#
# Both are derived HERE, at build time, from the build clock + git — never
# hand-maintained, nothing to forget to bump.
#
# Usage: bash derive-app-version.sh
#   prints two lines: APP_VERSION=... / APP_COMMIT=...
# Callers pipe this into their own generator (see generate-app-version.sh)
# rather than parsing stdout themselves where avoidable.
set -euo pipefail

# %-m / %-d are GNU date extensions (no leading zero) — fine on every fleet
# Linux host; a macOS/BSD caller needs `gdate` (coreutils) instead of `date`.
APP_VERSION="$(date -u +%y.%-m.%d-%H%M)"
APP_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "APP_VERSION=$APP_VERSION"
echo "APP_COMMIT=$APP_COMMIT"
