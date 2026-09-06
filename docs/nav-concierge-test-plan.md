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

## RESULTS (run 2026-09-06, aglamazo#336 — gate before agents-ai registration/AH-admin pilot)

Compass/Dasi's 2026-09-04 kickoff (`reports/2026-09-04-app-nav-concierge-kickoff.md`,
Compass repo) named two open items before fix-then-adopt could proceed: the 08-11
fix (#311) was never re-run after a later fix (#312) touched the same code area, and
a newly-found VAT-status direct-navigation tab race was unfixed.

| Check | Method | Result |
|---|---|---|
| Row 5b — "קיזוז שותפים" confidently resolves to `business-settlement`, not ambiguous | Direct call to `findSetting()` (pure function, deterministic — more reliable than an LLM round-trip for this specific question) | ✅ `match business-settlement` |
| Row 5a — bare "קיזוז" still resolves to `category-offset-flag`, unaffected | Same, direct call | ✅ `match category-offset-flag` — #311's fix (the geometric-mean scoring change) holds; #312 touched only SYSTEM_PROMPT trigger phrasing (`13ddbb3`, verified via `git show --stat`), never `findSetting.ts`/`registry.ts` — the two fixes were always in non-overlapping code, confirmed rather than assumed |
| Row 6 — "מה זה הכל מטרה" still returns not_found at the tool layer | Same, direct call | ✅ `not_found` |
| Row 1 — VAT-status: matcher resolves correctly | Same, direct call | ✅ `match vat-status-member` — confirms the matcher itself was never the problem |
| **Row 1 — VAT-status: household tab actually SELECTED after a direct navigation while already on `/app/settings`** | Live browser (chrome-devtools MCP, local dev root/ABC123 login per this doc's own setup instructions, no real account/data touched): opened Settings (default `categories` tab), opened chat, asked the exact row-1 query, confirmed via screenshot that the tab bar highlighted "🏠 משק בית" and household content rendered, without a page reload | ❌→✅ **FAIL, now FIXED.** Root cause: `SettingsTabsContent` (`app/components/settings/SettingsTabs.tsx`) computed `activeTab` via `useState(initialTab)`, which only reads `searchParams` on mount. A same-route `router.push` (the chat's `navigateTo`) updates the URL but not this already-mounted component's state. Fixed by adding a `useEffect` that syncs `activeTab` when `searchParams` changes post-mount; manual tab clicks use `window.history.replaceState` (bypasses Next's router, `useSearchParams` never observes it), so they're unaffected. |

**Not re-run in full:** rows 2-4, 7-10 (unrelated to either of the two open items;
already-passing MCP-only checks, code-review-only checks, or premise-flawed as
originally noted — no code path touching them changed).

**Net: both open items closed.** #311 confirmed intact and unaffected by #312. The
VAT-status tab race — the epic's own anchor case — is fixed and verified live. Ready
to hand back to Compass/Dasi for the schema + `agents-ai` registration step.
