# 12 - API Keys and Google Drive Connection Wiped by Sync

## Workflow
preset: thorough
operations: code,review,run,pr
branch_from: main
merge_into: main

## Problem

Both the Claude API key and Google Drive connection are lost after cloud sync cycles.

- **Claude API key**: Saved in `db.appSettings` with key `claudeApiKey`. After auto-sync (every 5 min), the key disappears and the user must re-enter it.
- **Google Drive**: After sync, the Taxes tab shows the "Google Drive חבר" (Connect) button again, as if the tokens were wiped.

The backup service (`backupService.ts`) already has protection logic:
- **Export** (line 75): filters out `claudeApiKey` and `google_*` keys from the backup payload.
- **Import** (lines 179-194): reads local-only keys before clearing `appSettings`, then re-adds them after import.

Despite this, keys are being lost. The agent must debug the actual root cause — possible issues include:
- The merge flow (`mergeService.ts`) may have a separate code path that doesn't preserve keys.
- The `CloudSyncManager.tsx` auto-sync may call a different import path.
- Race condition: auto-sync clears and re-adds while another read is in progress.
- The preserve logic itself may have a bug (e.g. `bulkAdd` ID conflicts, or the `where('key')` query not matching).

## Fix

1. Debug and identify why keys are wiped during sync. Add console logs or inspect the merge/sync flow.
2. Fix the root cause so that `claudeApiKey` and `google_*` tokens in `appSettings` survive any sync operation (cloud sync, manual import/export, merge).
3. Verify the fix holds over multiple sync cycles (10 minutes, covering at least 2 auto-syncs at 5-min intervals).

## Files
| File | What changes |
|------|-------------|
| `app/services/backupService.ts` | `importAllStores()` — likely fix to key preservation logic |
| `app/services/mergeService.ts` | Check if merge has its own appSettings handling that skips preservation |
| `app/services/cloudBackupService.ts` | Check `restoreFromCloud()` and merge paths |
| `app/components/CloudSyncManager.tsx` | Check auto-sync flow — which import/merge function is called |
| `app/services/googleTokenService.ts` | `GOOGLE_TOKEN_SETTING_KEYS` — verify all token keys are listed |
| `app/components/settings/ApiKeysTab.tsx` | May need to reload key after sync events |
| `app/components/business/TaxesTab.tsx` | May need to reload drive status after sync events |

## Verify

Run the dev server on port 3100 and test over 10 minutes to survive multiple auto-sync cycles.

Setup:
- [ ] Read the Claude API key from `~/develop/docs/claude-key.txt`
- [ ] Navigate to `http://localhost:3100/app/settings`
- [ ] Click the "מפתחות API" tab
- [ ] Paste the Claude API key and click "שמור"
- [ ] **Expect**: key shows masked (e.g. `sk-ant-****...`)
- [ ] Take screenshot

Google Drive connection:
- [ ] Navigate to `http://localhost:3100/app/business` and open the Taxes tab ("מסים")
- [ ] If "Google Drive חבר" button is shown, click it and complete the OAuth flow
- [ ] **Expect**: green text "Google Drive מחובר" appears
- [ ] Take screenshot

File upload test:
- [ ] On the Taxes tab, click "העלה קובץ"
- [ ] Upload `~/Downloads/46620671120262.pdf`
- [ ] **Expect**: file appears in the list
- [ ] Take screenshot

Persistence over time (10 minutes):
- [ ] Wait 5 minutes (one auto-sync cycle at `syncIntervalMinutes: 5`)
- [ ] Reload the page
- [ ] Navigate to Settings > "מפתחות API"
- [ ] **Expect**: Claude API key is still shown masked
- [ ] Navigate to Business > Taxes tab
- [ ] **Expect**: "Google Drive מחובר" (not the connect button)
- [ ] **Expect**: uploaded file still in list
- [ ] Take screenshot
- [ ] Wait another 5 minutes (second sync cycle)
- [ ] Reload the page again
- [ ] **Expect**: Claude API key still present
- [ ] **Expect**: Google Drive still connected
- [ ] **Expect**: uploaded file still in list
- [ ] **Expect**: no console errors related to appSettings, tokens, or API keys
- [ ] Take screenshot
