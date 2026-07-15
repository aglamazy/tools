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

## Disambiguated by exact-length synonym match

| # | Ask | Expect |
|---|---|---|
| 5a | "קיזוז" (bare word) | Fixed 2026-07-15 (Buddy flagged): originally silently matched `business-settlement`, wrong when the user meant the category-level flag. Added "קיזוז" as its own exact synonym on `subjects-settings` too — the scorer favors an exact single-token match over a longer phrase, so this now resolves confidently to `subjects-settings` (categories tab). Verify this is actually the more common intent live — if not, worth reconsidering. |
| 5b | "קיזוז שותפים" (the 2-word phrase) | Still resolves to `business-settlement` — its own synonym, unaffected by 5a's fix. Confirm both stay correct together, not just in isolation. |

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
