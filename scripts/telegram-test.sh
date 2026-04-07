#!/usr/bin/env bash
# Simple CLI to test the Telegram webhook locally.
# Simulates Telegram sending updates to /api/telegram/webhook.
#
# Usage: ./scripts/telegram-test.sh
#
# Type a message to send. When product results appear, type a number (1-5) to pick.
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
LAST_SEARCH_KEYS=()

echo "🤖 AglamazoBot test CLI — type messages, Ctrl+C to quit"
echo "   Type a number (1-5) after search results to pick a product"
echo "Target: $API_URL"
echo "---"

send_callback() {
  local callback_data="$1"
  UPDATE_ID=$((UPDATE_ID + 1))

  local payload
  payload=$(jq -n --argjson uid $FAKE_USER_ID --argjson cid $FAKE_CHAT_ID \
    --argjson mid $UPDATE_ID --arg data "$callback_data" '{
    update_id: $mid,
    callback_query: {
      id: ($mid | tostring),
      from: {id: $uid, is_bot: false, first_name: "Test"},
      message: {message_id: ($mid - 1), chat: {id: $cid, type: "private"}},
      data: $data
    }
  }')

  local resp
  resp=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "x-telegram-bot-api-secret-token: $WEBHOOK_SECRET" \
    -H "x-telegram-test: true" \
    -d "$payload")

  local reply
  reply=$(echo "$resp" | jq -r '.response // .callbackAnswer // empty')
  if [[ -n "$reply" ]]; then
    printf "בוט: %s\n" "$reply"
  fi
}

while true; do
  printf "\nאתה: "
  read -r msg
  [[ -z "$msg" ]] && continue

  # If user types a number and we have pending search keys, simulate a callback
  if [[ "$msg" =~ ^[0-9]+$ && ${#LAST_SEARCH_KEYS[@]} -gt 0 ]]; then
    local_idx=$((msg - 1))
    if [[ $local_idx -ge 0 && $local_idx -lt 10 ]]; then
      # Use first pending search key
      send_callback "p:${LAST_SEARCH_KEYS[0]}:$local_idx"
      LAST_SEARCH_KEYS=()
      continue
    fi
  fi

  UPDATE_ID=$((UPDATE_ID + 1))

  payload=$(jq -n --argjson uid $FAKE_USER_ID --argjson cid $FAKE_CHAT_ID \
    --argjson mid $UPDATE_ID --arg text "$msg" '{
    update_id: $mid,
    message: {
      message_id: $mid,
      from: {id: $uid, is_bot: false, first_name: "Test", username: "testuser"},
      chat: {id: $cid, type: "private", first_name: "Test"},
      date: (now | floor),
      text: $text
    }
  }')

  response=$(curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "x-telegram-bot-api-secret-token: $WEBHOOK_SECRET" \
    -H "x-telegram-test: true" \
    -d "$payload")

  bot_reply=$(echo "$response" | jq -r '.response // empty')
  actions=$(echo "$response" | jq -r '.actions // [] | if length > 0 then map(.action) | join(", ") else empty end')
  has_selections=$(echo "$response" | jq -r '.pendingSelections // [] | length')

  if [[ -n "$bot_reply" ]]; then
    printf "בוט: %s\n" "$bot_reply"
    [[ -n "$actions" ]] && printf "  ⚡ פעולות: %s\n" "$actions"

    # Show product search results and store keys for callback simulation
    LAST_SEARCH_KEYS=()
    if [[ "$has_selections" -gt 0 ]]; then
      echo "$response" | jq -r '.pendingSelections[] | "  🔍 \(.query) (\(.target)):", (.results | to_entries[] | "    [\(.key + 1)] \(.value.name)\(if .value.brand != "" then " | \(.value.brand)" else "" end) — \(.value.price)₪\(if .value.unitPrice != "" then " (\(.value.unitPrice))" else "" end)")'
      # Extract search keys
      while IFS= read -r key; do
        LAST_SEARCH_KEYS+=("$key")
      done < <(echo "$response" | jq -r '.pendingSelections[].searchKey')
    fi
  else
    echo "Raw: $response"
  fi
done
