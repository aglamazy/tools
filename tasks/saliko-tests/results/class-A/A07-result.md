# A07 — אנגלית + טייפו — PARTIAL
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Transcript
> User: Hi, how much is milk at Shufersal?
> Bot: היי! אני נתקל בקצת קושי לבדוק מחירים בשופרסל כרגע.
>
> שים לב שאתה גם לא מחובר לחשבון השופרסל שלך (Tier 1). כדי שאוכל לגשת לנתונים ולבצע פעולות, צריך להתחבר עם אימייל וסיסמה דרך כפתור ההתחברות למעלה (זה דורש הרשמה ל-Saliko קודם).
>
> אם תרצה, אני יכול לבדוק מחירים בחנויות אחרות כמו "מקור השפע" או "הירקניה" שעובדות עם קוד SMS פשוט. מה דעתך?

> User: ופתוחי אדמה?
> Bot: גם לגבי תפוחי אדמה, אני לא יכול למשוך מחירים משופרסל בלי שתתחבר לחשבון שלך.
>
> מכיוון שאתה כרגע במצב אנונימי (Tier 1), הדרך הכי קלה לראות מחירים היא דרך חנויות כמו **"בורא הפרי והירק"** או **"הירקנייה"**. שם אפשר להתחבר פשוט עם מספר טלפון וקוד SMS.
>
> רוצה שאבדוק מחיר של תפוחי אדמה באחת מהן?

> User: thanks!
> Bot: בשמחה! אם תרצה עזרה במשהו אחר או שתחליט להתחבר לאחת החנויות, אני כאן. יום מעולה!

## Pass criteria
- [x] כל התגובות בעברית — turn 1 stayed Hebrew even though prompted in English.
- [x] מתקן את הטייפו או שואל הבהרה — silently corrected "פתוחי אדמה" → "תפוחי אדמה".
- [x] לא מבטל את האנגלית בצורה עוקצנית.

## Watch-fors
- ok: did NOT respond in English.
- ok: did NOT insist on "פתוחי אדמה" as a valid spelling.
- ok: did NOT offer to switch to English.

## Notes
- **The `call:` raw-text leak from the previous run is GONE.** Same underlying fix as A04 — model now emits proper functionCall objects.
- Shufersal anon catalog-read blocker still present (same as A04, A06).
- The bot's framing around the blocker is *clean*: acknowledges Tier 1, redirects to OTP-only stores, doesn't fabricate a price.
- Turn 2 silent typo correction is exactly what the spec asked for.
- Turn 3 "בשמחה!" in Hebrew, short, friendly.

## Delta vs previous run
**Improved: PARTIAL → PARTIAL (cleaner failure).** Previous run had the `call:` raw-text leak in turn 1 — gone now. The Shufersal-auth issue is the same systemic blocker as A04. Language and typo handling are smoother now: silent typo correction, no English response, no condescension. Net: same verdict but better quality.
