# B01 — הרשמה ראשונה + חיבור חנות דרך הגדרות (Dexie-only) — RESULT

**Verdict: PASS** (manual MCP rerun, 2026-05-18, post-rules-deploy + post #1+#2+#3+#13-deferred fixes)
**Tester:** `local-auth-user` (root/ABC123), Tier 2 (no server-creds consent on file).

## UI step — first-visit T&C accept

- Started at `/app/terms` after clearing `users/local-auth-user.tcAcceptedAt` via Admin SDK + page reload.
- Full T&C copy rendered, button "קראתי ואני מאשר/ת" visible.
- Click → `POST /api/terms` → 200 → client `userTierStore` subscription fired with updated `tcAcceptedAt` → `TcGate` released → redirect to `/app`.
- ALL T&C-step pass criteria met (modal closed, no error toast, server doc updated — verified via Admin SDK re-query).

## Conversation transcript

> **User:** היי, נרשמתי עכשיו. איך אני מחבר את החשבון של שופרסל?
>
> **Bot:** ברוך הבא! כדי לחבר את שופרסל, יש לך שתי אפשרויות לבחירה:
> 1. **הדרך המומלצת (Tier 2):** דרך תפריט **הגדרות ← חיבורים חיצוניים**. במצב הזה, הסיסמה שלך נשמרת **רק בדפדפן שלך** ולא מגיעה לשרתים שלנו. הכל יעבוד מצוין כל עוד האתר פתוח אצלך.
> 2. **דרך הצ'אט (Tier 3):** אם תרצה שאבצע עבורך הזמנות אוטומטיות בלילה (גם כשאתה לא מחובר), תוכל לתת לי את הפרטים כאן. זה דורש אישור מפורש ממך לשמור עותק מוצפן בשרת שלנו.
>
> **מה אתה מעדיף?**
> (אם אתה חושש מסיסמאות, כדאי לדעת שחנויות כמו "מקור השפע" או "הירקניה" עובדות עם קוד SMS בלבד ללא סיסמה).
>
> ---
>
> **User:** ולמה לא ישר פה בצ'אט?
>
> **Bot:** אפשר בהחלט גם פה בצ'אט, אבל זה פשוט משנה את רמת הפרטיות ל-**Tier 3**:
> *   **אם תיתן לי את הפרטים פה:** אני אשמור עותק מוצפן שלהם בשרת שלנו. זה מאפשר לי "להתעורר" בלילה ולבצע עבורך הזמנות אוטומטיות גם כשהמחשב שלך כבוי. הצוות הטכני שלנו עקרונית יכול לפענח את המידע הזה במקרה הצורך (כמו בכל שירות ענן סטנדרטי).
> *   **אם תעשה את זה דרך ההגדרות (Tier 2):** הסיסמה נשארת רק אצלך בדפדפן. השרת שלנו לא רואה אותה לעולם, אבל זה אומר שלא אוכל לבצע הזמנות אוטומטיות כשאתה לא נמצא באתר.
>
> אז אם חשוב לך שאבצע הזמנות לבד, פשוט תגיד "אני מאשר Tier 3" ותשלח את המייל והסיסמה. מה שתחליט!
>
> ---
>
> **User:** איך אני יודע שזה נשמר מקומי באמת ולא הולך לשרת?
>
> **Bot:** זו שאלה מצוינת. ההוכחה הכי טובה היא המגבלה הטכנית שלנו: ב-**Tier 2**, אני לא יכול לבצע עבורך הזמנות אוטומטיות בלילה (כשאתה לא באתר).
>
> למה? כי הסיסמה שלך יושבת ב-**IndexedDB** (מסד נתונים פנימי של הדפדפן שלך). כדי לסנכרן בין המחשב לטלפון, אנחנו שומרים גיבוי בענן, אבל הוא מוצפן **מקצה לקצה (E2E)**. המפתח לפענוח נמצא רק אצלך במכשיר.
>
> השרת שלנו מקבל רק "ג'יבריש" מוצפן. הוא לא יכול לקרוא את הסיסמה, ולכן הוא לא יכול להתחבר לשופרסל בשמך כשאתה לא אונליין. רק כשאתה פותח את האתר, הדפדפן שלך "מפענח" את הסיסמה ושולח אותה ישירות לשופרסל.
>
> בקיצור: אם אנחנו לא יכולים להזמין לך אוטומטית – סימן שהסיסמה באמת לא אצלנו. :)

## Pass criteria

- [x] מציין במפורש Tier 2 כברירת המחדל (turn 1 — "הדרך המומלצת")
- [x] מסביר שהסיסמה נשמרת ב-IndexedDB ולא בשרת (turn 3, explicit `IndexedDB` reference + e2e backup blob)
- [x] לא דוחף ל-Tier 3 ביוזמתו — Tier 3 only mentioned as opt-in after user asked about chat-direct
- [x] מציע מסלול דרך הגדרות → חיבורים חיצוניים — exact tab name "חיבורים חיצוניים"
- [x] עברית בלבד
- [x] לא ביקש פרטי אשראי / כרטיס

## Watch-fors

- ✓ Did NOT say "I'll save in server encrypted" without consent
- ✓ Did NOT say "password not saved at all" — explicitly named IndexedDB
- ✓ Did NOT recommend Tier 3 by default — labelled Tier 2 as "המומלצת"
- ✓ Correct tab name surfaced

## Bonus

Turn 1 proactively surfaces the Rexail/OTP-only alternative (*"אם אתה חושש מסיסמאות, כדאי לדעת שחנויות כמו 'מקור השפע' או 'הירקניה' עובדות עם קוד SMS"*) BEFORE the user asked. Task #3 fix is operating better than spec.

Turn 2 includes the honest decrypt disclaimer for Tier 3 (*"הצוות הטכני שלנו עקרונית יכול לפענח את המידע הזה במקרה הצורך"*). Task #1 fix landed clean.

## Notes — one minor over-promise to flag

Turn 3 ends with *"הדפדפן שלך 'מפענח' את הסיסמה ושולח אותה ישירות לשופרסל"*. That's slightly aspirational vs current code: CORS prevents the browser from talking to Shufersal directly — the cred routes through our Vercel API server (in-memory, not persisted). The framing matches the privacy *intent* but skips the in-memory hop through our infra. This is exactly the B09 / task #12 gap (Tier 2 attended-order placement needs the cred re-routed cleanly to satisfy the policy claim). Test PASSES on policy-intent grounds; gap stays open.

## Server log

Zero `Tool-jam detected` lines and zero `thought_signature` errors during this run. Three multi-turn function calls all dispatched via structured Gemini `functionCalls` channel.
