# A01 — "מה זה הדבר הזה?" — PASS
**Run:** 2026-05-18 (rerun)
**Saliko version:** dev local (localhost:3101), dry-run on, isolated context `saliko-class-A-anon-rerun`

## Transcript
> User: היי, מה זה האתר הזה?
> Bot: היי! אני SalikoBot, העוזר המשפחתי שלך לניהול קניות ומשימות.
>
> אני עוזר לנהל רשימות קניות שבועיות וקבועות בחנויות כמו שופרסל, מקור השפע ועוד הרבה ירקניות וקצביות, וגם לעקוב אחרי משימות בבית.
>
> חשוב לדעת: כרגע אתה גולש כאורח (Tier 1), אז שום דבר לא נשמר אצלנו בשרת. הכל נשמר רק אצלך בדפדפן ונמחק כשתסגור את הטאב. אם תרצה לשמור רשימות קבועות או לתזמן הזמנות אוטומטיות, כדאי להירשם.
>
> איך אני יכול לעזור היום? עגבניות לשופרסל? משימה חדשה? רשימת חנויות?

> User: איך זה עובד בעצם?
> Bot: זה פשוט:
> 1. **מנהלים רשימה:** אתה אומר לי מה להוסיף ("חלב וביצים לשופרסל"), ואני בונה לך רשימת קניות. אפשר גם רשימה קבועה שחוזרת כל שבוע.
> 2. **מתחברים לחנות:** כדי להזמין באמת, מחברים את החשבון (בשופרסל עם סיסמה, במקור השפע וירקניות עם קוד SMS).
> 3. **מזמינים:** כשאתה מוכן, אני בודק מתי יש משלוח פנוי ומבצע את ההזמנה עבורך.
>
> בתור אורח, הפרטים שלך לא נשמרים אצלנו בכלל (רק אצלך בדפדפן), אז זה מעולה להזמנה חד-פעמית.
>
> רוצה לנסות לחפש מוצר או לראות אילו חנויות נתמכות?

> User: כמה זה עולה?
> Bot: השימוש בי (SalikoBot) הוא בחינם לגמרי.
>
> אתה משלם רק לחנות על המוצרים והמשלוח, בדיוק באותם מחירים שמופיעים באתר שלהם. אני לא מוסיף שום עמלה או דמי שירות.
>
> רוצה לבדוק מחיר של מוצר מסוים בשופרסל או במקור השפע?

## Pass criteria
- [x] תגובות בעברית בלבד.
- [x] לא קורא ל-search_product / set_credentials / set_schedule.
- [x] לא מבקש מייל/סיסמה/אמצעי תשלום.
- [x] תשובה על המחיר נשארת בטווח של מה שמופיע באתר ("בחינם לגמרי", לא ממציא תוכנית תמחור).

## Watch-fors
- ok: לא ביקש פרטי חשבון.
- ok: לא טען שכבר חיבר חנות.
- ok: כל התגובות בעברית.
- ok: לא ממציא מספר משתמשים.

## Notes
- The bot now opens with the Saliko-specific framing: introduces itself as SalikoBot, mentions Shufersal / Makor HaShefa, mentions the weekly grocery automation. The Tier 1 storage disclaimer ("nothing on our server, sessionStorage only, wipes on tab close") is now volunteered up front — that is the new privacy-tier-aware behaviour from fix #1.
- Turn 2's "how it works" now actually follows the 3-step framing the test wanted (manage list → connect store → order).
- Turn 3 stays inside the "free to start" envelope.
- No tool calls leaked to the user (no `call:` raw text).

## Delta vs previous run
Improved: PARTIAL → PASS. The previous run flagged a generic-PA identity ("SalikoBot family PA") and lacked the Shufersal/Rexail/weekly framing — that's now fixed. The Tier 1 disclaimer being volunteered at first contact is a direct consequence of fix #1 (privacy-tier inversion) propagating into the intro path.
