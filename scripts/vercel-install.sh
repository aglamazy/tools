#!/usr/bin/env bash
# Vercel installCommand hook.
#
# Private agents-* libs (agents-ai, agents-whatsapp, agents-gdrive, ...) are
# pulled from github:aglamazy/*. The package-lock resolves them via
# ssh://git@github.com/... because the dev's local git config rewrites
# HTTPS→SSH. Vercel has no SSH key for those private repos, so we redirect
# the SSH URL to HTTPS-with-token before `npm install` runs.
#
# Auth source (preferred): GitHub App "ah-deploy-agents" — mints a fresh
# 1-hour installation token at deploy time via scripts/mint-gh-token.cjs.
# Requires three env vars on the Vercel project:
#   AH_APP_ID, AH_APP_INSTALLATION_ID, AH_APP_PRIVATE_KEY
#
# Legacy fallback: AH_GITHUB_TOKEN (fine-grained PAT). Kept until the App
# flow is verified in prod, then removed.
set -euo pipefail

TOKEN=""

if [ -n "${AH_APP_ID:-}" ] && [ -n "${AH_APP_INSTALLATION_ID:-}" ] && { [ -n "${AH_APP_PRIVATE_KEY_B64:-}" ] || [ -n "${AH_APP_PRIVATE_KEY:-}" ]; }; then
  echo "[vercel-install] minting GitHub App installation token (ah-deploy-agents)..."
  # Mint script uses Node's built-in crypto — no npm install needed.
  # (Previous version installed jsonwebtoken here, which hung on Vercel build.)
  if ! TOKEN=$(node scripts/mint-gh-token.cjs); then
    echo "[vercel-install] mint-gh-token failed — aborting install" >&2
    exit 1
  fi
  if [ -z "$TOKEN" ]; then
    echo "[vercel-install] mint-gh-token returned empty token — aborting" >&2
    exit 1
  fi
  echo "[vercel-install] minted installation token (length=${#TOKEN})"
elif [ -n "${AH_GITHUB_TOKEN:-}" ]; then
  echo "[vercel-install] using legacy AH_GITHUB_TOKEN PAT (App env vars not set)"
  TOKEN="$AH_GITHUB_TOKEN"
else
  echo "[vercel-install] no auth: set AH_APP_ID/AH_APP_INSTALLATION_ID/AH_APP_PRIVATE_KEY (preferred) or AH_GITHUB_TOKEN — install will fail for private deps." >&2
fi

if [ -n "$TOKEN" ]; then
  git config --global \
    "url.https://x-access-token:${TOKEN}@github.com/.insteadOf" \
    "ssh://git@github.com/"
fi

npm install
