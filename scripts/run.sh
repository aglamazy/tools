#!/usr/bin/env bash
# Kill existing dev server and start fresh with logging
set -e

cd "$(dirname "$0")/.."

# Kill only the process listening on port 3100
fuser -k 3100/tcp 2>/dev/null || true
sleep 1

echo "Starting dev server..."
npm run dev 2>&1 | tee ./run.log &
