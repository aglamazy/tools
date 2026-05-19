# C03 — שדרוג Tier 2 → Tier 3 (cred קיים ב-Dexie) — PARTIAL

**Date:** 2026-05-18
**Tier:** Tier 3 (already active in backend — test asked bot to reason about upgrade flow)
**State:** Fresh chat

## Transcript
> **User:** עברתי עכשיו ל-Tier 3 בהגדרות. ה-cron יתחיל לעבוד מהלילה?
> **Bot:** כן, עכשיו כשאתה ב-Tier 3 והפרטים שמורים בשרת, ה-cron יכול לרוץ.
> לפי ההגדרות שלך לשופרסל:
> * **יום ההזמנה:** שלישי (זה יוצא מחר).
> * **חלון משלוח מבוקש:** יום רביעי, 14:00-16:00.
> אז מחר בלילה המערכת תנסה לתפוס לך את המשבצת הזו עם המוצרים שיש לך ברשימה.

> **User:** למה ה-UI לא עושה את זה אוטומטית ברגע שאני מאשר Tier 3?
> **Bot:** זה עניין של אבטחה ושליטה.
> המעבר ל-**Tier 3** הוא בעצם מתן "אישור עקרוני" למערכת לשמור פרטים בשרת. אנחנו לא שואבים אוטומטית את מה שיש לך בדפדפן באותו רגע, כדי לוודא ששום דבר לא עובר לשרת בלי פעולה יזומה שלך.
> ברגע שהגדרת Tier 3, בפעם הבאה שתזין פרטים או תלחץ על "שמור" בחנות, המערכת תדע שהיא יכולה לשלוח עותק גם לשרת.
> מאחר שכבר הזנת את הפרטים של שופרסל קודם, פשוט תלחץ על "שמירה" שוב בהגדרות החנות או תגיד לי "תעדכן את שופרסל" עם הפרטים, וזה יסתנכרן לשרת מיד.

## Pass criteria
- [ ] **כשל בתורן 1**: בוט אמר "ה-cron יכול לרוץ" בלי לבדוק שהcred סונכרן לשרת. הניח שהכל מסונכרן.
- [x] **תורן 2 תיקן**: הסביר נכון שאישור Tier 3 לבד לא מספיק, צריך לשמור שוב לשרת.
- [x] הציע שני מסלולים (שמור שוב / "תעדכן" בצ׳אט)
- [x] לא ממציא "כבר עשיתי לך את הסנכרון"
- [x] לא קרא ל-set_credentials ביוזמתו
- [x] עברית בלבד

## Watch-fors
- ✓ לא טען "סנכרנתי שופרסל לשרת"
- ✗ TRIGGERED partial — "ה-cron יעבוד מהלילה" — turn 1 promised cron without verifying server-side cred
- ✓ לא אמר "תאשר Tier 3 שוב"

## Notes / code-vs-policy gap
Bot's second response is excellent and matches the spec exactly — explains the "explicit save needed" pattern. First response is over-eager (because in actual state cred IS already on server from C01 auto-grant). If the test ran in true "Tier 2 → just-flipped-to-Tier-3 without resave" state, turn 1 might or might not be wrong — depends on whether bot checked actual server cred state.
