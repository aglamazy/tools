#!/usr/bin/env bash
# migrations-ride-deploys-check.sh — heuristic check for dasi#3 item 3: a
# schema migration must ship only as part of a code deploy (migrate-on-boot
# or an equivalent deploy-bound hook), never run by hand against prod.
#
# This is a heuristic, framework-flavored (Next.js instrumentation.ts)
# starting point, not a universal prover — adapt the boot-hook filename /
# grep pattern to your stack. Model: cockpit-v2/instrumentation.ts +
# cockpit-v2/lib/migrate.ts in this same repo (grep-only reference, do not
# copy verbatim — it carries cockpit-specific guards).
#
# Usage: migrations-ride-deploys-check.sh <repo-root>
# Exit 0 = pass or n/a (no migrations/ dir). Exit 1 = fail.
set -euo pipefail

ROOT="${1:?usage: migrations-ride-deploys-check.sh <repo-root>}"
FAIL=0

if [ ! -d "$ROOT/migrations" ]; then
  echo "N/A: no migrations/ directory under $ROOT — nothing to check"
  exit 0
fi

BOOT_HOOK=""
for candidate in instrumentation.ts instrumentation.js; do
  if [ -f "$ROOT/$candidate" ]; then
    BOOT_HOOK="$ROOT/$candidate"
    break
  fi
done

if [ -z "$BOOT_HOOK" ]; then
  echo "FAIL: $ROOT/migrations exists but no boot hook (instrumentation.ts) runs them on deploy — a schema change has no deploy-bound path" >&2
  FAIL=1
elif ! grep -qi "migrat" "$BOOT_HOOK"; then
  echo "FAIL: $BOOT_HOOK exists but doesn't reference migrations — verify migrate-on-boot is actually wired, not just a same-named file" >&2
  FAIL=1
else
  echo "OK: $BOOT_HOOK wires migrations into the boot path"
fi

# Heuristic: flag a package.json script that shells out to psql/a migration
# runner directly against a PROD-looking var — that's a hand-run path around
# the deploy-bound hook, exactly what this convention forbids.
if [ -f "$ROOT/package.json" ] && grep -Ei '"[a-zA-Z:_-]+" *: *".*(psql|migrate).*PROD' "$ROOT/package.json" >/dev/null 2>&1; then
  echo "FAIL: package.json has a script invoking a migration/psql command directly against a PROD-named var — migrations must ride deploys, never run by hand" >&2
  FAIL=1
fi

exit "$FAIL"
