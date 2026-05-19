# C10 — Edge: רוטציית מפתח / כשל פענוח בקרון

**Persona:** משתמש Tier 3 פעיל; ב-side השרת קרה משהו נדיר — `SALIKO_CREDS_ENCRYPTION_KEY` הוחלף (אדמין רוטציה לא-מתוכננת / accident / migration) ו-ה-ciphertext הקיים כבר לא ניתן לפענח עם המפתח החדש. הקרון רץ בלילה ונכשל לפענח cred.
**State:** logged in (Tier 3), server-creds consent active, ה-cred ב-`groceries/{uid}/private/credentials` קיים אבל decrypt נכשל. הקרון רץ ב-21:00, decrypt threw, לא בוצעה הזמנה.

**Goal of test:** המערכת אסור שתתנהג כאילו "אין cred" ולעבור בשקט — זה ייצור confusion טוטאלי למשתמש שחושב שהוא ב-Tier 3 אבל קרון לא רץ. צריך לפחות: (1) log רציני של ה-decryption failure. (2) notification כלשהו למשתמש או לאדמין. (3) הבוט, כשנשאל "למה הקרון לא רץ אתמול?", צריך לזהות את ה-state ולהסביר.

## Conversation

(הקרון נכשל אמש. המשתמש פותח את האפליקציה בבוקר.)

> **User:** למה לא פתחת לי הזמנה אתמול בלילה? יום שלישי 21:00 כרגיל.
> **Saliko (expected):** קורא ל-`show_orders` ל-24 שעות אחרונות — אין הזמנה חדשה. צריך לעלות על ה-state האמיתי: ה-consent עוד פעיל (`getServerCredsConsent` מחזיר doc), ה-schedule עוד פעיל, ה-cred doc קיים — אבל פיענוח נכשל. **הניסוח האידיאלי:** "משהו לא תקין בצד שלנו. החיבור שלך ל-Tier 3 פעיל וה-cred של שופרסל קיים בשרת, אבל הקרון של אתמול לא הצליח לפענח אותו. זה בדרך כלל מצביע על תקלה תשתיתית — או שמפתח ההצפנה שלנו השתנה והעותקים הישנים לא תואמים. הצוות שלנו מקבל התראה כשזה קורה; אני ממליץ להזין את הסיסמה מחדש דרך הגדרות → חיבורים חיצוניים. השמירה החדשה תיכתב עם המפתח החדש ותעבוד. בינתיים, אם אתה רוצה הזמנה לפתוח עכשיו — נסה דרכי (אטנדד, מה-Dexie שלך)."
> **User:** מה זאת אומרת "מפתח השתנה"? אני לא עשיתי כלום.
> **Saliko (expected):** "צודק — זה לא משהו שאתה עושה. ה-Saliko מצפין creds עם מפתח שמנוהל מצד השרת. אם הצוות שלנו החליף את המפתח (לפעולה תפעולית, או מטעמי security incident) בלי תהליך מסודר של מיגרציה, ה-ciphertext הקיים הופך לבלתי-קריא. הצעד הנכון משם הוא לאחסן מחדש את ה-cred. אני יודע — זה לא מעודד. אם זה קורה לך שוב, שווה לדווח (privacy@saliko.co.il)."
> **User:** אז שאני אעדכן עכשיו?
> **Saliko (expected):** "כן. הגדרות → חיבורים חיצוניים → שמור שוב את שופרסל. ה-Dexie שלך עוד מכיל את הסיסמה (לא הושפעה), אז זה רק re-save שייצור ciphertext חדש בשרת. אחרי זה הקרון של שבוע הבא יעבוד."

## Pass criteria
- [ ] **לא מתנהג כאילו "אין cred"** — מבחין בין "אין doc" לבין "doc קיים אבל פענוח נכשל"
- [ ] מסביר את הסיבה הסבירה (רוטציית מפתח) בלי להסתיר את העובדה שמשהו השתבש בצד השרת
- [ ] מציע פתרון מעשי (re-save דרך Settings) שאכן יעבוד (Dexie עדיין מכיל את ה-plaintext)
- [ ] מציע הזמנה אטנדד כ-stop-gap אם המשתמש דחוף
- [ ] לא מאשים את המשתמש ב-"אולי שכחת לאשר Tier 3"
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- "אתה לא מחובר ל-Tier 3 כנראה" — שגוי; consent עוד קיים
- "הקרון לא רץ הלילה" בלי הסבר — קוצר מטעה
- "תכניס שוב את הסיסמה (כי אני שכחתי)" — מבלבל את המשתמש לחשוב שזה שלו
- "כל מה שצריך זה לחכות לקרון הבא" — לא יעזור; אותו פיענוח ייכשל גם בקרון הבא
- מסתיר את העובדה שזה אירוע תשתיתי שדורש attention של הצוות

## Known code-vs-policy gap (if any) — **EDGE CASE, מעשי**
- **`credEncryption.ts` decrypt failure handling:** היום, אם `decryptCred` זורק, מי שקורא לו (`shufersalClient.loadCredentials`, `retalixClient.readCredDoc`) צריך להחליט מה לעשות. שווה לוודא:
  1. ה-error לא נבלע בשקט — צריך להירשם ב-log עם uid + path + error stack.
  2. ב-cron, ה-loop צריך לבדוק `decrypt failed` ולהבדיל אותו מ-"לא קיים cred". כשל פענוח = אירוע, לא user-action.
  3. שווה לכתוב alert ל-Healthchecks.io או log ל-Sentry: "decrypt failure for uid X — investigate manually."
- **`looksEncrypted` rollout sniff:** ה-c2/c3 הזכיר את ה-sniff לטובת rollout (פלינטקסט legacy עובר through). זה means שאם איכשהו ה-cred נשמר כ-plaintext בטעות, ה-cron לא יקרוס אבל גם לא יקבל את ה-cred המוצפן הנכון — עוד edge דומה לזה.
- **`SALIKO_CREDS_ENCRYPTION_KEY` rotation procedure לא מתועד:** ה-c2/c3 אמר מפורשות "Rotation is a real migration (decrypt-with-old → encrypt-with-new) — out of scope for this step." אם זה לא מתועד ולא מוטמע, רוטציה תיצור בדיוק את ה-C10 הזה. **Flag prominently for step (e):** צריך לפחות (a) runbook למה לעשות אם הוחלף בלי מיגרציה, (b) UI affordance לזיהוי משתמשים פגומים כדי לפנות אליהם, (c) אזהרה בקוד אם detect mismatch בכמות זמן קצרה.
- **Flag prominently for step (e).**
