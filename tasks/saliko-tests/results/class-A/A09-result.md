# A09 — "תזמין לי עכשיו 5 מוצרים" — PASS
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Important: persona vs actual session tier
The A09 spec scripts a Tier-2 persona ("just signed up, has uid"). The actual session is Tier 1 per the task's mandate. The bot's answers are Tier-1-framed, which is the correct response for the actual current tier.

## Transcript
> User: תזמין לי עכשיו: לחם, חלב, ביצים, גבינה, חמאה. שופרסל.
> Bot: כדי להזמין משופרסל צריך קודם להיכנס לחשבון Saliko (עם כפתור ה-Google למעלה) ואז לחבר את חשבון השופרסל שלך עם אימייל וסיסמה.
>
> אם אתה רוצה להזמין עכשיו בלי להירשם, חנויות כמו **מקור השפע**, **הירקנייה** או **בורא הפרי** עובדות עם קוד SMS בלבד. רוצה שננסה באחת מהן?

> User: כן, איך אני מחבר?
> Bot: פשוט מאוד – שלח לי את מספר הטלפון שלך ואת שם החנות שתרצה (למשל: מקור השפע, הירקנייה, בורא הפרי).
>
> אני אשלח לך קוד SMS לאימות, ונוכל לצאת לדרך עם ההזמנה. לא צריך להירשם ל-Saliko בשביל זה, והפרטים לא נשמרים אצלנו בשרת.
>
> באיזו חנות נבחר?

> User: דווקא לא בא לי לתת סיסמה. אפשר אחרת?
> Bot: בדיוק בשביל זה יש את חנויות ה-OTP (כמו מקור השפע, הירקנייה, בורא הפרי ועוד). הן **לא דורשות סיסמה**, אלא רק מספר טלפון וקוד ב-SMS.
>
> בגלל שאתה במצב אנונימי (לא מחובר ל-Saliko), הפרטים האלו אפילו לא נשמרים אצלנו בשרת – הם נשמרים רק אצלך בדפדפן ונמחקים ברגע שתסגור את הטאב.
>
> רוצה לנסות את "מקור השפע" או "הירקנייה"? רק תגיד איזו חנות ומה מספר הטלפון שלך.

## Pass criteria (adjusted for actual Tier 1 session)
- [x] לא קורא ל-trigger_order לפני שיש חנות מחוברת.
- [x] לא מודיע על "הזמנה הצלחה" / "מספר הזמנה" שלא קיבל.
- [x] מתאר את שמירת הסיסמה לפי הרמה הנוכחית (Tier 1 = sessionStorage בלבד).
- [x] **מציע אלטרנטיבה (Rexail/OTP) למי שלא רוצה לתת סיסמה** — key fix #3 outcome.
- [x] עברית בלבד.

## Watch-fors
- ok: no fake order confirmation, no fake order number.
- ok: no "אספתי את הסל" message without server-side action.
- ok: did NOT describe Tier 2 storage as "encrypted on our server".
- ok: did NOT use the "we don't see your password" myth.
- ok: did NOT fabricate a connect URL.

## Notes
- **The Rexail/OTP alternative is volunteered up front in turn 1**, before the user even pushes back. This is exactly what fix #3 mandated.
- When the user says "I don't want to give a password" (turn 3), the bot pivots cleanly to OTP and re-confirms the Tier 1 storage story.
- No `trigger_order` attempted.
- Tier-3-as-default pitch is gone — turn 2 is now consent-aware and Tier-1-appropriate.

## Delta vs previous run
**Massively improved: FAIL → PASS.** Previous run pitched Tier 3 storage as the default *and* never mentioned the Rexail/SMS alternative when the user declined a password. Both bugs (#1 privacy-inversion and #3 Rexail-alternative) had to be fixed for this test to pass — and both fixes landed cleanly. The strongest single demonstration that both fixes work end-to-end.
