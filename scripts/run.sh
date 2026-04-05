#!/usr/bin/env bash
# Kill existing dev server and start fresh with logging
set -e

cd "$(dirname "$0")/.."

# Kill only the process *listening* on port 3100 (not browsers/clients connected to it)
lsof -ti tcp:3100 -sTCP:LISTEN | xargs -r kill || true
sleep 1

echo "Starting dev server..."
npm run dev 2>&1 | tee ./run.log &
