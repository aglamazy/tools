#!/usr/bin/env bash
# Simple CLI to test the Telegram webhook locally.
# Simulates Telegram sending updates to /api/telegram/webhook.
#
# Usage: ./scripts/telegram-test.sh
#
# Requires: dev server running on port 3100, .env.local with TELEGRAM_WEBHOOK_SECRET

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [[ -f "$ENV_FILE" ]]; then
  WEBHOOK_SECRET=$(grep '^TELEGRAM_WEBHOOK_SECRET=' "$ENV_FILE" | cut -d= -f2-)
else
  echo "Missing .env.local" >&2
  exit 1
fi

if [[ -z "$WEBHOOK_SECRET" ]]; then
  echo "TELEGRAM_WEBHOOK_SECRET not set in .env.local" >&2
  exit 1
fi

API_URL="${API_URL:-http://localhost:3100/api/telegram/webhook}"
FAKE_USER_ID=123456789
FAKE_CHAT_ID=123456789
UPDATE_ID=1

echo "🤖 AglamazoBot test CLI — type messages, Ctrl+C to quit"
echo "Target: $API_URL"
echo "---"

while true; do
  printf "\nאתה: "
  read -r msg
  [[ -z "$msg" ]] && continue

  UPDATE_ID=$((UPDATE_ID + 1))

  payload=$(cat <<ENDJSON
{
  "update_id": $UPDATE_ID,
  "message": {
    "message_id": $UPDATE_ID,
    "from": {
      "id": $FAKE_USER_ID,
      "is_bot": false,
      "first_name": "Test",
      "username": "testuser"
    },
    "chat": {
      "id": $FAKE_CHAT_ID,
      "type": "private",
      "first_name": "Test"
    },
    "date": $(date +%s),
    "text": $(printf '%s' "$msg" | jq -Rs .)
  }
}
ENDJSON
)

  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "x-telegram-bot-api-secret-token: $WEBHOOK_SECRET" \
    -H "x-telegram-test: true" \
    -d "$payload")

  bot_reply=$(echo "$response" | jq -r '.response // empty')
  actions=$(echo "$response" | jq -r '.actions // [] | if length > 0 then map(.action) | join(", ") else empty end')

  if [[ -n "$bot_reply" ]]; then
    printf "בוט: %s\n" "$bot_reply"
    [[ -n "$actions" ]] && printf "  ⚡ פעולות: %s\n" "$actions"
  else
    echo "Raw: $response"
  fi
done
