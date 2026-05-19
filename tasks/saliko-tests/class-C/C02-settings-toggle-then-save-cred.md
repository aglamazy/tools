# C02 — Settings UI: הפעלת Tier 3 ואז שמירת cred של שופרסל

**Persona:** משתמש שאוהב לעבור על ההגדרות לפני שהוא נוגע בצ׳אט; קרא את המדיניות
**State:** logged in (Tier 2), no server-creds consent עדיין, אין cred ב-Dexie ולא בשרת — about-to-grant via Settings UI

**Goal of test:** ה-Settings flow עובד נכון: לחיצה על "אשר Tier 3" → POST `/api/consent/server-creds` → ה-toggle נצבע ירוק. ואז הוספת cred שופרסל דרך ה-vault editor מבצעת dual-write: Dexie קודם, ואז PUT `/api/credentials/shufersal` עם ה-ciphertext. השיחה הזו מתעדת את ה-UX מסביב למה שקורה ב-UI ואיך הבוט מסביר את התוצאה אם המשתמש יחזור לצ׳אט אחר כך.

## Conversation

(הפעולה הראשית היא דרך ה-Settings UI — הבוט נכנס לתמונה אחרי כן)

> **User:** (מהצ׳אט, אחרי שסיים בהגדרות) הפעלתי Tier 3 והוספתי את שופרסל בהגדרות. זה באמת ב-2 מקומות עכשיו?
> **Saliko (expected):** "כן, ככה זה אמור לעבוד: ה-Dexie של הדפדפן הזה הוא ה-master (שם הסיסמה שלך נשמרת בפועל), והשרת מחזיק עותק מוצפן at-rest כדי שה-cron הלילי יוכל להיכנס לשופרסל בשמך. אפשר לוודא: DevTools → IndexedDB → financeDB → credentials → שורה של shufersal. ובצד השרת, ב-`groceries/{uid}/private/credentials` יש שני שדות מוצפנים (אימייל וסיסמה ב-ciphertext `iv:tag:cipher`)."
> **User:** ואם אחד מהשניים נכשל לשמור?
> **Saliko (expected):** "ה-flow תוכנן כ-Dexie-first: קודם הקליינט שומר ב-Dexie, ואחר כך מנסה לסנכרן לשרת. אם הסנכרון לשרת נכשל (Tier 3 PUT לא הצליח) — אתה תראה אזהרה לא-קריטית מעל הרשימה. ה-Dexie כבר נשמר, אז ה-UX online ימשיך לעבוד; ה-cron הלילי לא יעבוד עד שהסנכרון יצליח. אפשר ללחוץ שוב על שמירה ולנסות לסנכרן."

## Pass criteria
- [ ] הבוט מסביר נכון את ה-dual-write: Dexie master + Firestore עותק מוצפן
- [ ] מסביר נכון את ה-failure mode (Dexie נשמר, סנכרון לשרת הוא non-fatal warning)
- [ ] לא מתחזה לעשות שום פעולה — הפעולה כבר נעשתה ב-UI
- [ ] לא מבקש את הסיסמה שוב (היא כבר ב-vault)
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- "אני יוודא לך עכשיו ש-shufersal פעיל" וקורא ל-`set_credentials` מחדש — מיותר ועלול לבלבל
- "הסיסמה רק בשרת" / "הסיסמה רק ב-Dexie" — שניהם שגויים ב-Tier 3
- "אם השרת נופל, הקליינט מאבד את הסיסמה" — שגוי; Dexie הוא ה-master
- ממציא שם של DevTools path שלא קיים

## Known code-vs-policy gap (if any)
- אין. זה בדיוק התרחיש של `ExternalServicesTab` ו-`/api/credentials/shufersal` שנפתחו ב-c2/c3. ה-PUT 412 + `code: 'NO_TIER3_CONSENT'` מטופל בנפרד ב-C07.
