# A02 — אילו חנויות נתמכות — PASS
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Transcript
> User: באילו חנויות אתם תומכים?
> Bot: אלו החנויות שאני תומך בהן כרגע:
>
> *   **שופרסל**
> *   **מקור השפע** – https://www.makorhashefa.co.il
> *   **תן דג** – https://www.10dag.co.il
> *   **בורא הפרי והירק** – https://www.borepri.co.il
> *   **הירקניה** – https://www.hayarkania.co.il
> *   **עגבניה אונליין** – https://www.agvania-online.co.il
> *   **משק דהן** – https://www.meshek-dahan.co.il
> *   **האורגני** – https://shop.haorgani.co.il
> *   **באפלו מיטליז** – https://www.baffalo.co.il
> *   **ארצנו** – https://www.artzenu.co.il
> *   **משק הר פרחים** – https://www.ecomeshek.co.il
> *   **בשרה** – https://www.basra.co.il
> *   **הגינה האורגנית** – https://www.ginaorganit.co.il
>
> באיזו חנות תרצה שנתחיל?

> User: יש לכם רמי לוי? ויקטורי?
> Bot: כרגע רמי לוי וויקטורי לא נתמכים. הרשימה ששלחתי קודם היא הרשימה המעודכנת של החנויות שאני עובד איתן כרגע. תוכל למצוא שם את שופרסל, מקור השפע ועוד מגוון חנויות טבע ומשקים.

> User: ומה ההבדל בין שופרסל למקור השפע אצלכם?
> Bot: ההבדל העיקרי הוא בדרך החיבור ובמה שאפשר לעשות כרגע כמשתמש אנונימי:
>
> 1.  **דרך ההתחברות:**
>     *   **מקור השפע (ורשת Rexail):** החיבור פשוט ומהיר באמצעות קוד SMS לטלפון (OTP). אין צורך בסיסמה.
>     *   **שופרסל:** דורש אימייל וסיסמה.
>
> 2.  **שימוש ללא הרשמה (המצב שלך כרגע):**
>     *   ב**מקור השפע**, אתה יכול לבצע הזמנה חד-פעמית כבר עכשיו. הפרטים (הטלפון והקוד) לא נשמרים אצלנו בשרת בכלל, אלא רק אצלך בדפדפן ונמחקים ברגע שתסגור את הטאב.
>     *   ב**שופרסל**, כדי להתחבר דרכי צריך קודם להירשם למערכת (עם גוגל).
>
> בקיצור: אם אתה רוצה להזמין משהו זריז בלי לפתוח חשבון, מקור השפע (או שאר החנויות ברשימה כמו "תן דג" או "הירקניה") זו האופציה הכי טובה. מה תעדיף?

## Pass criteria
- [x] רשימת החנויות תואמת את ההקשר (13 חנויות).
- [x] לא ממציא חנויות שלא נתמכות — דחה רמי לוי וויקטורי ישירות.
- [x] מסביר נכון את ההבדל בין authType=password (שופרסל) ו-otp (רקסייל).
- [x] עברית בלבד.

## Watch-fors
- ok: לא אמר "כן יש לנו רמי לוי".
- ok: לא ממציא מחירים / זמני משלוח.
- ok: לא דחף הרשמה — הסביר שאפשר להזמין במקור השפע *בלי* להירשם.

## Notes
- Store list fully enumerated with URLs.
- "Rexail" internal label still leaked once in turn 3 ("רשת Rexail"). Same minor cosmetic issue as before.
- Auth-type split now connected to the user's Tier 1 state, which is a meaningful improvement.

## Delta vs previous run
Same verdict (PASS → PASS), but turn 3's explanation is more useful: previous run mentioned the auth-type split correctly but didn't connect it to Tier 1. Now the bot ties the auth difference directly to "what you can do *right now* as anon" which is concretely actionable. The "Rexail" label leak persists (unchanged).
