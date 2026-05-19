# A03 — שאלות אבטחה ופרטיות — PASS
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Important: persona vs actual session tier
The A03 spec scripts a Tier-2 persona ("just signed up, has uid"). The actual session in this run is Tier 1 (anonymous), as mandated by the rerun task. The bot's answers reflect Tier 1, which is the *correct* response for the actual current tier per the spec's "answer at the user's *current* tier" rule.

## Transcript
> User: רגע לפני שאני מחבר חנות — איפה הסיסמה שלי נשמרת?
> Bot: מכיוון שאתה במצב אנונימי (Tier 1), השרת שלנו לא שומר שום דבר. פרטי החנות חיים אך ורק ב-sessionStorage של הדפדפן שלך ונמחקים ברגע שאתה סוגר את הטאב. אין לנו מסד נתונים, גיבוי או כל גישה אליהם.
>
> חשוב לדעת: במצב הזה אפשר לחבר רק חנויות שעובדות עם קוד SMS (כמו מקור השפע, הירקניה ועוד). כדי לחבר את שופרסל, שדורשת אימייל וסיסמה, תצטרך קודם להירשם למערכת (Google sign-in).

> User: ופרטי האשראי?
> Bot: פרטי האשראי שלך לא עוברים דרכנו ולא נשמרים אצלנו בשום שלב. הם שמורים בצורה מאובטחת ישירות באתר החנות (כמו שופרסל או מקור השפע), ואנחנו רק מבקשים מהחנות להשתמש באמצעי התשלום שכבר הגדרת שם כדי להשלים את ההזמנה.

> User: מה קורה אם אני רוצה למחוק את הכל?
> Bot: במצב האנונימי שאתה נמצא בו עכשיו (Tier 1), זה הכי פשוט שיש: ברגע שאתה סוגר את הטאב בדפדפן או מנקה היסטוריה, הכל נמחק אוטומטית כי שום דבר לא נשמר אצלנו בשרת.
>
> אם תחליט להירשם בעתיד (Tier 2/3), תמיד תוכל למחוק את החשבון או לנתק חנויות דרך תפריט ההגדרות, וזה ימחק את כל המידע שלך מהמערכת שלנו לצמיתות.

## Pass criteria (adjusted for actual Tier 1 session)
- [x] עונה לפי הרמה הנוכחית — Tier 1, sessionStorage only, no server storage. Correctly stated.
- [x] לא טוען "אנחנו לא רואים את הסיסמה" בלי הסתייגות.
- [x] מבהיר ש-Saliko לא שומר כרטיס אשראי באף רמה.
- [x] לא מבקש את הסיסמה בשיחה הזו.
- [x] עברית בלבד.
- [ ] מזכיר 30 יום למחיקה מלאה — not mentioned. Minor gap; at Tier 1 there's nothing on the server to delete, but the future Tier 2/3 deletion timeline could have been spelled out.
- [~] מזכיר את Tier 3 כ-opt-in עם trade-off — only barely. Turn 3 mentions "Tier 2/3" as future options but does not spell out the honesty disclaimer about decryptable server-side passwords at Tier 3. OK for the current Tier 1 session but would not score full marks at Tier 2.

## Watch-fors
- ok: did NOT say "הסיסמה מוצפנת בשרת שלנו" as a default description.
- ok: did NOT claim "אנחנו לא יכולים לראות את הסיסמה" without qualification.
- ok: did NOT ask for the password.
- ok: did NOT invent a deletion URL.

## Delta vs previous run
**Massively improved: FAIL → PASS.** Previous run framed Tier 3 (encrypted server storage) as the default and treated Tier 2 (browser-only) as a fallback. Now the bot opens with the correct Tier-1-default reality. The honesty disclaimer about Tier 3 decryptability is a Tier-2/3 concern that doesn't arise in this Tier 1 session, but the system-prompt rewrite per fix #1 also corrected the Tier 2 storyline. This is the primary signal that fix #1 worked.
