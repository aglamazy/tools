# Aglamaz Finance — systemd Service

The dev server runs as a systemd **user** service and starts automatically at boot.

## Service File

`~/.config/systemd/user/aglamaz-finance.service`

## Commands

```bash
# Status / logs
systemctl --user status aglamaz-finance
journalctl --user -u aglamaz-finance -f

# Stop / start / restart
systemctl --user stop aglamaz-finance
systemctl --user start aglamaz-finance
systemctl --user restart aglamaz-finance

# Disable auto-start
systemctl --user disable aglamaz-finance
```

## Notes

- Runs `npm run dev` on port **3100**
- Uses the nvm Node.js binary at `~/.nvm/versions/node/v22.22.0/bin/node`
- `loginctl enable-linger yaakov` is set so the service starts at boot, not just at login
- Restarts automatically on failure (5 s delay)
- To update after editing the service file: `systemctl --user daemon-reload && systemctl --user restart aglamaz-finance`
