# 8 - Water Meter Polling via Arad RymPro API

## Workflow
preset: instant
operations: code,merge
branch_from: dev
merge_into: dev

## Problem

We use Arad smart water meters with the "Read Your Meter Pro" service (rym-pro.com).
The city's leak alert system has a 24-hour delay — we discovered an open tap ourselves before the alert arrived.

We want to poll the meter reading every 10 minutes via cron, log to a file, so we can later build leak-detection logic on top of the data.

## API Reference (discovered via Swagger at `/docs`)

- **Base URL:** `https://eu-customerportal-api.harmonyencoremdm.com`
- **Swagger:** `https://eu-customerportal-api.harmonyencoremdm.com/docs` (v1.0, v1.1, v2.0)
- **App ID header:** `x-app-id: 78FE99BC-5D35-4AC8-A15A-85E9D3C90ED0`
- **Auth token header:** `x-access-token: <token>` (returned from login)

### Login
```
POST /v1/consumer/login
Body: {"deviceId": "<string>", "email": "<string>", "pw": "<string>"}
Response: {"token": "<base64>:<base64>"}
```

### Last Read (current meter value)
```
GET /v1/consumption/last-read
Headers: x-access-token, x-app-id
Response: [{"meterCount": 15826, "meterId": "000011043576", "read": 1634.49}]
```
- `read` is cumulative m³, resolution 100 liters (0.1 m³ steps)

### Other useful endpoints (for future use)
- `GET /v1/consumption/daily/{meterCount}/{from}/{to}` — daily consumption array
- `GET /v1/consumption/hourly/{meterCount}/{from}/{to}` — hourly (returned 500 for our meter, may not be available)
- `GET /v1/consumer/myalerts` — active alerts list
- `GET /v1/consumer/myalerts/settings` — alert channel config
- `GET /v1/consumer/meters` — meter info (serial, address)
- `POST /v1/consumer/settings/monthlylimit/{limit}` — set monthly limit

### Meter info
- Meter count: `15826`
- Meter serial: `14717615`
- Address: כפר יונה, גרניט 23
- Normal daily usage: ~0.8–1.0 m³

## Fix

### 1. Credentials file (already created)

Credentials are pre-configured at `~/.config/water-meter/config.env` (mode 600).
The script should source this file. It exports: `WATER_METER_EMAIL`, `WATER_METER_PASSWORD`, `WATER_METER_DEVICE_ID`.

Do NOT create or modify this file — it already exists.

### 2. Create the polling script

Create `scripts/water-meter-poll.sh` (in the project repo):

- Source credentials from `~/.config/water-meter/config.env`
- Login to get a fresh token (tokens may expire; always login first)
- Call `last-read` endpoint
- Append a line to the log file: `ISO-timestamp,meter_read_m3`
- Log file location: `~/.local/share/water-meter/readings.csv`
- Create the log directory if it doesn't exist
- On error (login fail, network error), log `ISO-timestamp,ERROR,<message>` and exit 1
- Keep the script minimal — no leak detection logic yet, just data collection

Example log output:
```csv
2026-03-04T08:40:00+02:00,1634.49
2026-03-04T08:50:00+02:00,1634.49
2026-03-04T09:00:00+02:00,1634.59
```

### 3. Install crontab entry

Add to the current user's crontab:
```
*/10 * * * * /home/yaakov/develop/Aglamaz/finance/scripts/water-meter-poll.sh
```

Do NOT replace existing crontab entries — append only (use `crontab -l` + append + `crontab -`).

## Files

| File | What changes |
|------|-------------|
| `scripts/water-meter-poll.sh` | New — bash script that logs in and polls last-read, appends to CSV |

## Verify

No UI or dev server needed. Verify with code-level checks only:

- [ ] `scripts/water-meter-poll.sh` exists and is executable (`chmod +x`)
- [ ] `~/.config/water-meter/config.env` exists with mode 600 (pre-created, just verify it's there)
- [ ] Run `bash scripts/water-meter-poll.sh` manually — exit code 0
- [ ] Check `~/.local/share/water-meter/readings.csv` contains a line with a timestamp and meter reading (e.g., `1634.49`)
- [ ] Run `crontab -l` and confirm the `water-meter-poll.sh` entry exists with `*/10 * * * *` schedule
- [ ] Run the script a second time — CSV now has 2 lines (appended, not overwritten)
