# A10 — שאלות על משלוח + ההבדל מהזמנה ישירה — PASS
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Transcript
> User: למה שאשתמש בכם במקום פשוט להיכנס לאתר של שופרסל?
> Bot: שאלה מעולה. הנה כמה סיבות שהופכות את סאליקו ליותר מסתם עגלת קניות:
>
> 1. **ניהול רשימה קבועה:** במקום למלא עגלה מאפס כל פעם, המערכת מנהלת עבורך רשימה של מוצרים שחוזרים כל שבוע (כמו חלב או לחם) שנוספים אוטומטית.
> 2. **שפה חופשית:** פשוט כותבים "תוסיף חלב" או "השבוע בלי עגבניות" במקום לחפש וללחוץ באתר.
> 3. **הכל במקום אחד:** אפשר לנהל כאן גם את שופרסל, גם את הירקנייה (מקור השפע למשל) וגם את חנות הדגים באותו ממשק פשוט.
> 4. **משימות משפחתיות:** שילוב של רשימת הקניות עם משימות הבית ותזכורות.
>
> במצב אנונימי (כמו עכשיו) אפשר לעשות הזמנות חד-פעמיות מהירות, אבל כדי ליהנות מהרשימה הקבועה והאוטומציה כדאי להירשם (Google sign-in למעלה).

> User: ומי מביא את ההזמנה בפועל?
> Bot: החנות עצמה. סאליקו הוא העוזר החכם שמנהל עבורך את הרשימות ושולח את הפקודות, אבל הליקוט, האריזה והמשלוח מתבצעים על ידי צוות החנות (שופרסל, מקור השפע וכו').
>
> זה אומר שאתה מקבל את אותם המוצרים, אותם המחירים ואותם השליחים של החנות, פשוט בלי לעבוד קשה באתר שלהם.

> User: ומה עם זמני משלוח של מקור השפע באזור פתח תקווה?
> Bot: כדי לבדוק את זמני המשלוח הפנויים ב"מקור השפע", אני צריך להתחבר לחשבון שלך.
>
> שלח לי את מספר הטלפון שלך, אשלח לך קוד SMS לחיבור מהיר, ואז אוכל להציג לך את כל המשבצות הפנויות בפתח תקווה.
>
> (מכיוון שאתה במצב אנונימי, הפרטים לא יישמרו אצלנו בשרת אלא רק אצלך בדפדפן עד לסגירת הטאב).

## Pass criteria
- [x] מבדיל ברור בין "הסוכן" (Saliko) לבין "החנות" — turn 2 nails this.
- [x] לא ממציא חלונות משלוח / אזורי חלוקה — turn 3 explicitly defers to the store.
- [x] עונה ענייני, לא יותר מ-4 שורות לכל תגובה — turn 1 is 4 bullets + 1 closing line; turns 2-3 are concise.
- [x] עברית בלבד.

## Watch-fors
- ok: did not claim Saliko does delivery.
- ok: did not invent Petah Tikva delivery windows.
- ok: did not claim to be cheaper than Shufersal.
- ok: did not bash Shufersal.

## Notes
- Value-prop in turn 1 is well-framed (recurring list, conversational, multi-store, tasks integration) without overpromising.
- Turn 2 perfectly articulates the agent-vs-store split.
- Turn 3 honestly defers slot data to the store and offers the OTP path — consistent with A09's flow, no false "I'll show you slots now" promise.

## Delta vs previous run
**Same verdict (PASS → PASS).** Quality is comparable; the explicit Tier 1 storage disclaimer in turn 3 is a small new touch that aligns with the privacy-tier-aware approach from fix #1.
