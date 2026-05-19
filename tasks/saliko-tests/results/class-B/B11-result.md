# B11 — T&C clear → gate blocks — PASS

**Date:** 2026-05-18
**Tier:** Tier 2 (root/local-auth-user)
**State:** UI-only test, no chat

## Steps
1. Admin SDK: `users/local-auth-user.tcAcceptedAt = null` (was "2026-05-06-saliko")
2. Navigated to `http://localhost:3101/app` — auto-redirected to `/app/terms` with full T&C copy + "קראתי ואני מאשר/ת" button.
3. Direct nav to `http://localhost:3101/app/chat` — also redirected to `/app/terms`. Direct URL navigation does NOT bypass the gate.
4. Clicked "קראתי ואני מאשר/ת" → redirected to `/app` → app fully usable, stores tab loaded with the standing-list item from B04.
5. Admin SDK verify: `tcAcceptedAt` = "2026-05-06-saliko" (restored).

## Pass criteria
- [x] לאחר ניקוי `tcAcceptedAt` ורענון, T&C gate חזר וחסם
- [x] בזמן ה-gate: navigation ל-/app/chat נחסם ב-redirect ל-/app/terms (gate is real, not cosmetic)
- [x] לאחר אישור מחדש, האפליקציה זמינה במלואה — stores tab + standing list rendered
- [x] לא הצליחו לעקוף את ה-gate על ידי direct URL — verified
- [x] tcAcceptedAt before: null → after: "2026-05-06-saliko" (current version slug)

## Watch-fors
- ✓ Gate is enforced via route redirect (not just modal overlay)
- ✓ Cannot navigate to /app/chat or /app while tcAcceptedAt=null
- ⚠ Did NOT independently verify /api/* endpoints reject requests when tcAcceptedAt=null — server-side enforcement may still be a gap; we only tested client-side redirect.

## Notes / code-vs-policy gap
T&C gate works as a route-level redirect. To fully validate, would need to send a raw POST to /api/grocery/* with tcAcceptedAt=null and verify 403 — that wasn't done in this test (would be a separate API-level test). Flag as gap if server-side enforcement is needed for compliance.
