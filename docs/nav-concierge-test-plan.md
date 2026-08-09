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

## RESULTS (run 2026-08-09, chrome-devtools-test @ :9223, local root/ABC123, 2 test businesses)

| # | Result | Note |
|---|---|---|
| 1 | ✅ PASS | Navigated to `/app/settings?tab=household`, household-sharing content genuinely rendered (not just URL match). |
| 2 | ✅ PASS | With only 1 business: correctly described the path without guessing/navigating. Re-tested with a 2nd business added: agent explicitly asked "איזה עסק תרצה לעדכן?" — row's real intent (don't silently pick) confirmed only once genuine ambiguity existed. |
| 3 | ✅ PASS | Navigated to `/app/settings?tab=categories`, categories content rendered. |
| 4 | ✅ PASS | With 2 businesses present, asked "לאיזה עסק תרצה להגיע או לעדכן הכנסות?" — no guess, no navigation. |
| 5a | ✅ PASS (minor wording nit) | Resolved to `subjects-settings`/categories tab as the 07-15 fix intends. Response text loosely reused the label "קיזוז שותפים" while correctly pointing at the category-level `excludeFromBusinessTotals` flag — technically correct destination, but the label choice could read as confusing to a user. Not a functional bug. |
| 5b | ❌ **FAIL — real regression** | Doc says this must still confidently resolve to `business-settlement`. Instead the agent now shows genuine ambiguity ("זה יכול להיות אחד משני דברים... לאיזה מהם התכוונת?") between the category-level flag and business-settlement. The 5a fix (adding "קיזוז" as an exact synonym on subjects-settings) appears to have degraded 5b's own confidence — exactly the failure mode this row was written to catch ("confirm both stay correct together, not just in isolation"). |
| 6 | ❌ **FAIL — worse than documented failure mode** | Expected: not_found, graceful "לא מצאתי" reply, no navigation. Actual: `find_setting` was never even attempted — the agent answered "מה זה הכל מטרה" as a general financial-knowledge question (explained what a general-purpose loan is), not scoped to the app at all. No fabricated navigation (that part's fine), but not a graceful "I don't know" either — a confident-sounding off-topic answer. |
| 7 | ⚠️ **Test-plan premise flaw, not an app bug** | "תפוח אדמה" (potato) is a real grocery item this app's Shufersal integration handles — the agent correctly routed it to grocery search, not `find_setting`. Row 7's premise ("genuinely unrelated") doesn't hold for this app; it inadvertently re-tests row 9's scoping requirement instead of what it intended. |
| 8 | ⚠️ **Contaminated by sticky context + separate bug found** | Sent right after case 7's grocery-mode was active: "ווקוד" got fuzzy-matched to "אבוקדו" (avocado) and continued the grocery-connection flow, rather than being independently evaluated. Real finding: conversational context from a prior turn biases interpretation of a later ambiguous/nonsense query. Attempted to reset via "התחל מחדש" (both a real click and a dispatched MouseEvent) to get a clean retest — **the reset button did not clear history either time**, a separate, real bug worth its own fix. Did not get a pristine isolated re-test of gibberish-in-a-vacuum; reporting this honestly rather than claiming a clean result. |
| 9 | ✅ PASS | "תחפש לי חלב" (search for milk) correctly routed to grocery search, never touched `find_setting` — confirms the scoping SYSTEM_PROMPT intends. |
| 10 | ✅ PASS (verified via code + server log, not a live round-trip) | `app/api/telegram/webhook/route.ts:174-179` explicitly sends `navigateTo` as a plain-text URL (`sendMessage(chat.id, APP_URL + path)`), never attempts client-side navigation, with a comment explaining why. Server log confirms `find_setting` ran correctly for the Telegram-path message; could not observe the actual delivered text since the CLI's `FAKE_USER_ID` isn't a real Telegram chat (`Bad Request: chat not found` — expected, not a defect; a real Telegram chat would be needed for a true end-to-end read, which this test correctly avoided faking). |

**Net: 6 pass, 2 real bugs found (5b regression, case 6 fallback-to-general-knowledge), 1 separate bug found (reset button non-functional), 1 test-plan premise flaw (row 7), 1 inconclusive due to sticky-context contamination (row 8).**
**Not ready for the prod-merge conversation as-is** — the 5b regression and case 6 fallback are both real, user-facing correctness issues a released feature shouldn't ship with.
