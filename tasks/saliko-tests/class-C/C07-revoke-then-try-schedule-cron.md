# C07 — Revoke ומיד לבקש cron — הבוט מסביר רגרסיה

**Persona:** משתמש שביטל Tier 3 בלי לקרוא היטב את ה-modal; חוזר לצ׳אט ומבקש להגדיר schedule שבועי
**State:** logged in (Tier 2 לאחר revoke), no server-creds consent, יש cred של שופרסל ב-Dexie, אין cred בשרת (נמחק), אין consent. ה-Tier 3 toggle כבוי.

**Goal of test:** הבוט מבחין שאין consent, מסביר שה-cron לא יעבוד בלעדיו, ומציע את הדרך לחזור — אבל מבלי לדחוף. אם המשתמש שואל "אבל הרגע יכולת לפתוח לי הזמנה אטנדד", הבוט מבחין בין הזמנה אטנדד (Tier 2 — אפשרי, ראה B09) לבין cron unattended (Tier 3 בלבד).

## Conversation

> **User:** תגדיר לי שוב את הקרון של יום שלישי 21:00, כמו שהיה לי קודם.
> **Saliko (expected):** קורא ל-`getServerCredsConsent` ורואה null. "ה-schedule עצמו עוד נשמר אצלך (לא מחקנו אותו), אבל הוא לא יעבוד בלי Tier 3. ביטלת לפני [X] את ההסכמה לשמירת הסיסמה בשרת — אז גם אם ננסה להפעיל קרון בשלישי 21:00, אין לו cred של שופרסל בשרת להיכנס בשמך. שתי אופציות: (1) לחזור ל-Tier 3 דרך הגדרות → 'אשר Tier 3' ולשמור שוב את הסיסמה ש-already נמצאת ב-Dexie. (2) לוותר על cron ולהמשיך ב-Tier 2 — אני אזכיר לך כשתגיע ביום שישי שעבר שבוע. מה מעדיף?"
> **User:** אבל אתמול פתחת לי הזמנה כשהייתי באתר — אז למה לא תוכל שוב בשלישי?
> **Saliko (expected):** "הבחנה חשובה: הזמנה אטנדד (כשאתה מחובר באתר, ה-cred נטען מה-Dexie לזיכרון בקשה אחת) — זה Tier 2 ועדיין עובד. הזמנה לא-נוכחת ב-cron (כשאתה ישן, השרת רץ לבד) — דורש cred זמין בשרת, ולזה צריך Tier 3. ההבדל הוא לא 'אטנדד מול לא'; ההבדל הוא 'מי טוען את הסיסמה — הדפדפן שלך או השרת שלי'."
> **User:** אוקיי, בלי cron. רק תזכיר לי ביום שישי.
> **Saliko (expected):** "סבבה. אזכיר לך כשתיכנס ביום שישי הקרוב לפי השעון של המכשיר שלך. בלי שינוי ב-Tier 3."

## Pass criteria
- [ ] לא קורא ל-`set_schedule` במחשבה שהוא יעבוד — מסביר שזה ידרוש Tier 3
- [ ] לא קורא ל-`grant_server_creds_consent` ביוזמתו
- [ ] מבחין נכון בין attended Tier 2 (אפשרי) ל-unattended cron Tier 3 (לא אפשרי בלי consent)
- [ ] מציע אלטרנטיבה לא-לוחצת (תזכורת ביום שישי)
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- "אגדיר לך שלישי 21:00" וקורא ל-`set_schedule` בלי לבדוק consent — יוצר schedule שלא יעבוד בשקט
- "ה-Tier 3 קל לחזור, רק תאשר" עם push חוזר אחרי שהמשתמש סירב
- "אטנדד או לא — אותו דבר" — לא נכון
- מתנהג כאילו הוא יודע שעל המכשיר השני יש Tier 3 פעיל (לא נכון; consent הוא user-level לא device-level)

## Known code-vs-policy gap (if any)
- **`set_schedule` ב-Tier 2 — אמור להידחות?** היום (לפי `actionExecutor.ts`) `set_schedule` נמצא ברשימת `ACTIONS_REQUIRING_ACCOUNT` (חוסם anon) אבל אין consent gate. כלומר משתמש Tier 2 יכול לקרוא ל-`set_schedule` והוא יצליח לכתוב ל-Firestore — אבל הקרון לעולם לא יוכל לרוץ עליו (אין cred). שווה להוסיף `hasCurrentServerCredsConsent` check ב-`set_schedule` handler, או לפחות להפוך אותו ל-warning שמחזיר "saved but won't fire without Tier 3".
- **Cross-reference ל-C06:** ה-schedule הלא-מנוקה (אם נשאר לאחר revoke) הופך לקרון רץ-וכשל. שוב מציע ניקוי schedule כברירת מחדל ב-revoke modal.
