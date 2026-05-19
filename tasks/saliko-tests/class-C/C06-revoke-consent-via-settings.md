# C06 — ביטול אישור (Tier 3 → Tier 2) דרך Settings

**Persona:** משתמש Tier 3 ותיק שהחליט שהוא לא צריך יותר cron — מעדיף לחזור למצב שמרני
**State:** logged in (Tier 3 → revoking), server-creds consent active, יש cred שופרסל מוצפן בשרת, יש גם cred של מקור השפע (Rexail) מוצפן ב-`groceries/{uid}/stores/{retalixStoreId}/private/credentials`. ה-Dexie מכיל את שני ה-creds. Schedule פעיל.

**Goal of test:** ה-revoke flow עובד שלם: DELETE `/api/consent/server-creds` → `revokeServerCredsConsent` מוחק את כל ה-creds המוצפנים בשרת (שופרסל + כל חנות Rexail), מנקה את `users/{uid}.serverCredsConsent`. ה-Dexie נשאר. הקרון יפסיק (כי אין creds לקרוא). הבוט מאשר את המעבר נכון אם המשתמש שואל.

## Conversation

(הפעולה הראשית: Settings → "בטל אישור" → YesNoModal → אישור)

> **User:** (מהצ׳אט אחר כך) ביטלתי את Tier 3 בהגדרות. מה קרה בפועל?
> **Saliko (expected):** קורא ל-`getServerCredsConsent(uid)` ורואה שאין יותר consent. "ביטלת — הנה מה שקרה: (1) האישור עצמו (`users/{uid}.serverCredsConsent`) נמחק. (2) כל ה-creds המוצפנים שלך בשרת נמחקו — שופרסל ב-`groceries/{uid}/private/credentials` וגם מקור השפע ב-`groceries/{uid}/stores/.../private/credentials`. (3) הקרון הלילי לא יוכל לרוץ עליך יותר — אין לו cred להתחבר. (4) ה-Dexie במכשיר הזה **נשאר**, אז אתה עדיין יכול לחפש, להוסיף לרשימה ולפתוח הזמנות אטנדד (כשאתה באתר). חזרת בעצם ל-Tier 2."
> **User:** וה-schedule שהגדרתי?
> **Saliko (expected):** "ה-schedule עצמו (יום + שעה) נשאר ב-Firestore כ-data — לא נמחק. אבל הקרון, כשהוא ירוץ ביום ובשעה האלה, ינסה לקרוא את ה-cred של שופרסל לא יצליח, ולא יבצע כלום. אם אתה רוצה לנקות גם את ה-schedule (כדי לא להחזיק metadata מיותר), אפשר בהגדרות → לוח זמנים → 'בטל'."
> **User:** אז אם בעוד שבוע אחזור ל-Tier 3, הכל יחזור?
> **Saliko (expected):** "תצטרך לאשר Tier 3 שוב ולשמור את הסיסמה שוב (מ-Dexie או הזנה חדשה). ה-schedule שנשאר יחזור לרוץ מאליו ברגע שיש cred. ההיסטוריה והרשימה הקבועה לא הושפעו בכלל."

## Pass criteria
- [ ] מתאר נכון מה DELETE עושה: consent + שופרסל + Rexail per-store + Dexie נשאר
- [ ] מציין במפורש שהקרון יפסיק בלי להזכיר זאת בעקיפין
- [ ] לא מטשטש את העובדה שה-schedule נשאר אבל לא יעבוד
- [ ] מציע דרך לנקות את ה-schedule אם המשתמש רוצה
- [ ] עברית בלבד
- [ ] לא מנסה "להחזיר" את המשתמש ל-Tier 3 בלחץ

## Watch-fors (anti-patterns)
- "אני אאשר לך שוב Tier 3, זה רק קליק" — שגוי, צריך אישור מפורש של המשתמש
- "ה-Dexie שלך גם נמחק" — שקר; המדיניות אומרת מפורשות שלא
- "מחיקה לוקחת 30 יום" — שגוי; revoke הוא מיידי. ה-30 יום שייכים למחיקת חשבון מלאה
- "ה-schedule נמחק אוטומטית" — לא נכון אם הקוד לא מבצע את זה
- מנסה לחזור על "אבל cron כל כך נוח" אחרי שהמשתמש הביע החלטה

## Known code-vs-policy gap (if any)
- **Schedule cleanup לא קיים:** ה-`revokeServerCredsConsent` היום (לפי c2/c3) מוחק רק creds — לא נוגע ב-`groceries/{uid}/schedule`. שווה לחשוב אם זה הנכון:
  - **בעד השארה:** המשתמש אולי חוזר ל-Tier 3 בעוד שבוע, ונחמד שה-schedule יחזור אוטומטית.
  - **נגד:** metadata שלא רלוונטית מצטברת; הקרון רץ מיותר; בלבול UX.
  - **המלצה:** להציע ב-`YesNoModal` של revoke checkbox: "מחק גם את לוח הזמנים הקבוע?" ברירת מחדל off (שמרני).
- **Cron כשל שקט:** כשהקרון ירוץ אחרי revoke, הוא ינסה לטעון cred → `loadCredentials` יחזיר null → אם הקוד לא מתעד את זה ולא מודיע על כשל, המשתמש לא ידע שהקרון "מנסה ונכשל". שווה log + אולי notification.
