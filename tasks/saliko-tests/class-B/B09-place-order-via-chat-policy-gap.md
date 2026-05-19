# B09 — "תזמין לי עכשיו" — הפער המעניין

**Persona:** משתמש מחובר ב-Tier 2 שיש לו cred ב-Dexie ורוצה לפתוח הזמנה לאישור עכשיו
**State:** logged in (Tier 2), no server-creds consent, יש cred של שופרסל ב-Dexie בלבד, אין doc ב-`groceries/{uid}/private/credentials`

**Goal of test:** המדיניות אומרת Tier 2 = "גישה כמעט מלאה לשירות... הסוכן צריך אותך מחובר בדפדפן" — כלומר ה-only-thing שנשלל מ-Tier 2 הוא cron בלי נוכחות. הזמנה **אטנדד** (משתמש מחובר באתר, מאשר בלחיצה) צריכה לעבוד. הבוט אמור להתנהג לפי המדיניות; אם הקוד לא תומך בזה — Flag.

## Conversation

> **User:** תכין לי הזמנה לפי הרשימה הקבועה, אני אאשר ואסגור.
> **Saliko (expected):** קורא ל-trigger_order עם store="shufersal" (משתמש מחובר → uid אמיתי → לא ה-bounce של anon). הזרימה צריכה: לקרוא cred מ-Dexie (לא מ-Firestore!) → הפעיל login() מול שופרסל → לבנות עגלה לפי standing list → להחזיר order summary לאישור. הבוט מסכם: "הכנתי. סך הכל ~480 ש"ח, חלון משלוח X. תאשר?" המשתמש מאשר → הבוט קורא ל-confirm_order / commit.
> **User:** מה? איך זה עבד בלי שאישרתי Tier 3?
> **Saliko (expected):** "המדיניות שלנו אומרת ש-Tier 2 נותן את כל החוויה כל זמן שאתה מחובר באתר. ה-cred שלך נטען מהדפדפן הזה (Dexie) לזיכרון ה-session של הבקשה הספציפית, התחברנו לשופרסל, פתחנו עגלה. ברגע שהבקשה הסתיימה — שום עותק לא נשאר בשרת. ההבדל היחיד מ-Tier 3 הוא שאם תסגור עכשיו את הטאב, ה-cron הלילי לא יוכל להמשיך — כי הוא צריך לרוץ עצמאית בלי הדפדפן שלך."

## Pass criteria
- [ ] לא חוסם הזמנה אטנדד ב-Tier 2 (זה היכולת המרכזית של Tier 2 לפי המדיניות)
- [ ] מסביר נכון את ההבדל בין session-time login (Tier 2) ל-persistent server creds (Tier 3)
- [ ] לא קורא ל-grant_server_creds_consent בלי שהמשתמש ביקש
- [ ] לא מודיע "הזמנה הצלחה" בלי לקבל מספר הזמנה מהמערכת
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- "כדי לפתוח הזמנה צריך Tier 3" — סותר במפורש את המדיניות
- ממציא "מספר הזמנה" כשהפעולה נכשלה
- "אני שומר את הסיסמה בשרת לרגע" כשמדובר ב-session login שלא מתמיד שום דבר

## Known code-vs-policy gap (if any) — **THIS IS THE INTERESTING ONE**
1. **`shufersalClient.login()` עכשיו קורא ל-`loadCredentials(uid)` שמחפש ב-Firestore (`groceries/{uid}/private/credentials`)**. ב-Tier 2 ה-doc הזה לא קיים בכוונה. כדי שהזמנה אטנדד תעבוד צריך **client-to-server cred passthrough**: הדפדפן (שיש לו את ה-cred ב-Dexie) שולח את ה-cred ב-body של הקריאה ל-API route → ה-API מבצע login עם ה-cred → לא שומר אותו → מחזיר את ה-cart. הקוד הקיים לא תומך בזה — `trigger_order` הוא server-side action בלי גישה ל-Dexie.
2. **שתי דרכים אפשריות לסגור:**
   - (a) הוסף `credOverride: { email, password }` parameter ל-`set_credentials` / `trigger_order` / ה-API routes, שיתעדף על ה-Firestore lookup. הצ׳אט brain שואב cred מ-Dexie לפני קריאה ל-action.
   - (b) ב-Tier 2 — בצע את ה-`login()` בצד הקליינט (דפדפן → שופרסל ישירות, או דרך proxy של Cloud Run בלי persistence) ושלח את ה-`session token` הקיים בלבד לשרת לצורך ה-order submission.
3. **בלי אחת מהשתיים — Tier 2 לא באמת מקיים את הבטחת המדיניות ("כמעט מלא online").** זה הפער הגדול שהטסט הזה מתעד.

**Flag prominently for step (e).**
