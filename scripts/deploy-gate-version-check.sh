#!/usr/bin/env bash
# deploy-gate-version-check.sh — the freshness assertion piece for
# /deploy-gate (dasi#3, item 2 of the fleet-versioning-standard convention).
#
# After a deploy goes READY, fetch the deployed APP_VERSION/APP_COMMIT from
# its health endpoint and require the version to differ from the previous
# prod deploy's (and, when the expected sha is known, to MATCH the pushed
# sha). An unchanged version is a deploy that didn't actually change the
# running code — a failed deploy wearing a green banner.
#
# Usage: deploy-gate-version-check.sh <health-url> [prev-version] [expected-sha]
#   health-url     e.g. https://markette.example.com/api/health
#   prev-version   APP_VERSION from the last known-good prod deploy (optional)
#   expected-sha   the sha this push is supposed to land (optional)
#
# Exit 0 = fresh (pass). Exit 1 = stale or unreadable (fail loud, per
# HTTP-status-honesty / no-swallows — this is meant to be called from a
# deploy-gate flow that treats non-zero as a hard block, not a warning).
set -euo pipefail

URL="${1:?usage: deploy-gate-version-check.sh <health-url> [prev-version] [expected-sha]}"
PREV_VERSION="${2:-}"
EXPECTED_SHA="${3:-}"

BODY="$(curl -fsS "$URL")" || {
  echo "FAIL: could not reach $URL — cannot assert version freshness" >&2
  exit 1
}

VERSION="$(printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("appVersion",""))' 2>/dev/null || true)"
COMMIT="$(printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("appCommit",""))' 2>/dev/null || true)"

if [ -z "$VERSION" ]; then
  echo "FAIL: $URL did not expose appVersion in its JSON body — the app isn't wired to this convention yet" >&2
  exit 1
fi

if [ -n "$PREV_VERSION" ] && [ "$VERSION" = "$PREV_VERSION" ]; then
  echo "FAIL: deployed appVersion ($VERSION) is UNCHANGED from the previous prod deploy ($PREV_VERSION) — this deploy did not actually change the running code" >&2
  exit 1
fi

if [ -n "$EXPECTED_SHA" ] && [ "$COMMIT" != "$EXPECTED_SHA" ]; then
  echo "FAIL: deployed appCommit ($COMMIT) does not match the pushed sha ($EXPECTED_SHA)" >&2
  exit 1
fi

echo "OK: appVersion=$VERSION appCommit=$COMMIT is fresh"
