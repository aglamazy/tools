# nav-concierge MCP test plan (#283)

Ready to execute the moment a clean test browser (chrome-devtools-test @ :9223,
or the current session after `mr-cl restart` picks up the #889 config fix) is
reachable. **Never run against the shared :9222 profile — it carries Agla's
real account and real data.**

Setup: log into the app via the local dev "root" username/password flow
(the same one used earlier this session for subjectStore testing) — NOT a
real Google account, NOT the encrypted-backup-password gate. Create at least
one test business first (needed for the `requiresBusinessId` cases below).

## Existing queries (should resolve + actually navigate)

| # | Ask the chat agent | Expect | Verify |
|---|---|---|---|
| 1 | "איפה מוגדר סטטוס מע\"מ" (the epic's own anchor case) | Resolves to `vat-status`, lands on `/app/settings?tab=household` | Confirm the household tab is actually selected after navigation |
| 2 | "איפה אני משנה פרטי YPAY" | Resolves to `ypay-credentials` — requiresBusinessId, so the agent should ASK which business (no auto-navigate) instead of guessing | Confirm it asks, doesn't silently pick a business |
| 3 | "קח אותי לנושאים" | Resolves to `subjects-settings`, lands on `/app/settings?tab=categories` | Confirm categories tab selected |
| 4 | "הכנסות" (single word, business-scoped) | Resolves to `business-income` — same ask-which-business behavior as #2 | Confirm it asks |

## Ambiguous query (2+ real candidates close in score)

| # | Ask | Expect |
|---|---|---|
| 5 | "קיזוז" | Matches `business-settlement` (synonym "קיזוז שותפים") but the intended registry ALSO has a category-level קיזוז concept (`excludeFromBusinessTotals`, part of `subjects-settings`'s description, not yet its own synonym) — worth checking whether this comes back ambiguous or confidently picks settlement. If it silently picks one when a real user would find this genuinely ambiguous, that's a registry synonym gap to fix (add "קיזוז" to subjects-settings' synonyms), not a matching-algorithm bug. |

## Nonsense / not-found queries (must NOT fabricate a path)

| # | Ask | Expect |
|---|---|---|
| 6 | "מה זה הכל מטרה" | not_found — graceful "לא מצאתי..." reply, no navigation attempted |
| 7 | "תפוח אדמה" (potato — genuinely unrelated) | not_found |
| 8 | "ווקוד" (gibberish) | not_found |
| 9 | A real grocery query, e.g. "תחפש לי חלב" | Should NOT trigger find_setting at all — confirms the system prompt correctly scopes find_setting to settings/screens, not grocery products (SYSTEM_PROMPT's find_setting section explicitly says "not grocery products") |

## Channel check

| # | Case | Expect |
|---|---|---|
| 10 | Same query (#1) via the Telegram test CLI (`scripts/telegram-test.sh`) instead of web chat | Reply includes the resolved URL as plain text (Telegram auto-linkifies) — NOT an attempted client-side navigation (there's no browser to drive on that channel) |

## Recording results

For each row: pass/fail + a one-line note. This table (filled in) is the actual
deliverable Agla reviews before any prod-merge conversation — not "I ran some
queries and it seemed fine."
