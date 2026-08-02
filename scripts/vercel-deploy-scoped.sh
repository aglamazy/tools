#!/usr/bin/env bash
# Deploy this shared directory to a SPECIFIC Vercel project without
# leaving the local link pointed at the wrong one afterward.
#
# This repo directory is shared by multiple Vercel projects that all build
# from the same source (aglamazo, saliko, ...), distinguished by project-
# level env vars (NEXT_PUBLIC_PRODUCT). `.vercel/project.json` only points
# at ONE of them at a time — whichever project it defaults to, a bare
# `vercel deploy` silently deploys there, even if you meant a different
# project. (Bit us 2026-08-02: a `vercel deploy --target preview` meant for
# saliko landed on aglamazo instead, because that's what this directory
# happened to be linked to.)
#
# This script links to the requested project, deploys, then ALWAYS restores
# whatever project.json looked like before — even if the deploy fails.
#
# Usage: scripts/vercel-deploy-scoped.sh <project-name> [--target preview|production] [extra vercel deploy args...]
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <project-name> [--target preview|production] [extra vercel deploy args...]" >&2
  exit 1
fi

PROJECT="$1"
shift

LINK_FILE=".vercel/project.json"
BACKUP_FILE=$(mktemp)

restore_link() {
  if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
    cp "$BACKUP_FILE" "$LINK_FILE"
    echo "[vercel-deploy-scoped] restored original link: $(cat "$LINK_FILE")"
  fi
  rm -f "$BACKUP_FILE"
}
trap restore_link EXIT

if [ -f "$LINK_FILE" ]; then
  cp "$LINK_FILE" "$BACKUP_FILE"
  echo "[vercel-deploy-scoped] saved current link: $(cat "$LINK_FILE")"
fi

echo "[vercel-deploy-scoped] linking to project: $PROJECT"
vercel link --yes --project "$PROJECT"

echo "[vercel-deploy-scoped] deploying..."
vercel deploy "$@"
