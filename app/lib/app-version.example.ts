/**
 * Checked-in fallback shape for the build-generated app-version module
 * (dasi#3 / fleet-versioning-standard). scripts/generate-app-version.sh
 * overwrites app/lib/app-version.ts (gitignored) with the real derived
 * values on every build — this file only covers a fresh clone before the
 * first build/prebuild has run.
 */
export const APP_VERSION = "00.0.00-0000";
export const APP_COMMIT = "unknown";
