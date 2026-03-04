#!/usr/bin/env bash
set -euo pipefail

CONFIG="$HOME/.config/water-meter/config.env"
LOG_DIR="$HOME/.local/share/water-meter"
LOG_FILE="$LOG_DIR/readings.csv"
BASE_URL="https://eu-customerportal-api.harmonyencoremdm.com"
APP_ID="78FE99BC-5D35-4AC8-A15A-85E9D3C90ED0"

# Source credentials
if [[ ! -f "$CONFIG" ]]; then
  echo "$(date -Iseconds),ERROR,Config file not found: $CONFIG" >> "$LOG_FILE" 2>/dev/null
  echo "Config file not found: $CONFIG" >&2
  exit 1
fi
source "$CONFIG"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

TIMESTAMP="$(date -Iseconds)"

# Login
LOGIN_RESPONSE=$(curl -sf -X POST "$BASE_URL/v1/consumer/login" \
  -H "Content-Type: application/json" \
  -H "x-app-id: $APP_ID" \
  -d "{\"deviceId\": \"$WATER_METER_DEVICE_ID\", \"email\": \"$WATER_METER_EMAIL\", \"pw\": \"$WATER_METER_PASSWORD\"}" 2>&1) || {
  echo "$TIMESTAMP,ERROR,Login failed: $LOGIN_RESPONSE" >> "$LOG_FILE"
  echo "Login failed" >&2
  exit 1
}

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')
if [[ -z "$TOKEN" ]]; then
  echo "$TIMESTAMP,ERROR,No token in login response" >> "$LOG_FILE"
  echo "No token in login response" >&2
  exit 1
fi

# Get last read
READ_RESPONSE=$(curl -sf "$BASE_URL/v1/consumption/last-read" \
  -H "x-access-token: $TOKEN" \
  -H "x-app-id: $APP_ID" 2>&1) || {
  echo "$TIMESTAMP,ERROR,Last-read request failed: $READ_RESPONSE" >> "$LOG_FILE"
  echo "Last-read request failed" >&2
  exit 1
}

METER_READ=$(echo "$READ_RESPONSE" | jq -r '.[0].read // empty')
if [[ -z "$METER_READ" ]]; then
  echo "$TIMESTAMP,ERROR,No read value in response" >> "$LOG_FILE"
  echo "No read value in response" >&2
  exit 1
fi

# Append to CSV
echo "$TIMESTAMP,$METER_READ" >> "$LOG_FILE"
