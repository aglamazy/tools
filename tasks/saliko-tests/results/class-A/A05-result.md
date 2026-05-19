# A05 — חיפוש מוצר חופשי (חלב אורגני) — PARTIAL
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Transcript
> User: יש לכם חלב אורגני?
> Bot: ok
>
> [picker: בחר "חלב" (הזמנה): אשל לבן 4.5% תנובה 206 גרם 2.9₪ / יוגורט 1.5% תנובה 200 גרם 4.9₪ / גבינה לבנה 5% תנובה 250 גרם 6.9₪ / חלב 3% תנובה 1 ליטר 7.9₪ / יוגורט בסגנון יווני 6% / קוטג' 3% 250 גרם 7.9₪ / קוטג' 5% 250 גרם 7.9₪ / שמנת לבישול 15% 250 מ"ל 8.9₪]

> User: תבדוק באורגני
> Bot: לא מצאתי חלב אורגני ב"האורגני". רוצה שאבדוק בשופרסל?

> User: ואיך אני קונה את זה?
> Bot: בשביל לקנות ב"האורגני" (ובשאר חנויות ה-Rexail כמו מקור השפע או הירקנייה) לא צריך אפילו להירשם לסאליקו.
>
> התהליך פשוט:
> 1. שלח לי את מספר הטלפון שלך.
> 2. תקבל קוד SMS מהחנות ותשלח לי אותו.
> 3. נוכל להוסיף מוצרים לעגלה ולבצע הזמנה.
>
> הפרטים שלך לא נשמרים אצלנו בשרת בכלל — הם נשארים רק בדפדפן שלך ונמחקים בסגירת הטאב.
>
> רוצה לשלוח מספר טלפון ונתחיל?

## Pass criteria
- [x] מזהה נכון את החנות "האורגני" → store="rexail_haorgani" — *fixed* from previous run.
- [x] קורא ל-search_product, לא ממציא תוצאות.
- [x] במענה על "איך קונים" — מסביר ש-Tier 1 מאפשר הזמנה חד-פעמית עם OTP בלי להירשם.
- [x] לא טוען שצריך **חובה** להירשם כדי לקנות.
- [x] עברית בלבד.

## Watch-fors
- ok: did not confuse "האורגני" with "אורגני" as an attribute (this was the previous run's failure).
- ok: did not invent a "סופר אורגני" store.
- ok: did not add to a list when user only asked "do you have it?"
- TRIGGERED: "ok" leaked as raw text in turn 1, before the picker. Stray token issue (also in A04).
- TRIGGERED: turn 1 search returned the generic "חלב" picker rather than specifically organic milk — query simplification or search-quality issue.

## Notes
- The Tier-1 + OTP narrative in turn 3 is now correct and clean — exactly what the spec asked for. Fix #1 paying off in the action-flow path, not just in privacy Q&A.
- Store-name fuzzy resolution ("האורגני") now works — previous run failed this.
- The "Rexail" internal label leaks again in turn 3.

## Delta vs previous run
**Massively improved: FAIL → PARTIAL.** Previous run's failure was the store-name fuzzy match (`האורגני` not mapped to the haorgani store; bot bounced with "לא הבנתי"). Now the store is resolved correctly and the OTP-based Tier-1 buying path is described accurately. The "ok" raw-text token is a new minor leak, and the search query truncation is a search-quality issue rather than a chat-brain issue. Not full PASS only because of those two surface issues.
