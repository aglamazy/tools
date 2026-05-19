# A04 — השוואת מחיר קוקה קולה שופרסל מול מקור השפע

**Persona:** סטודנט, רוצה לבדוק כמה זול הסוכן יכול להיות לפני שהוא נרשם
**State:** unauthenticated, no stores wired, no standing list
**Goal of test:** search_product עובד גם ל-anon (Rexail/Shufersal catalog publicly readable). Bot should perform parallel lookup or two consecutive calls and answer with real numbers.

## Conversation

> **User:** כמה עולה שישייה של קוקה קולה בשופרסל?
> **Saliko (expected):** קריאה ל-search_product עם store="shufersal" query="שישיית קוקה קולה". מציג תוצאה (שם מוצר + מחיר ₪). אם פותח picker — אומר למשתמש לבחור.
> **User:** ובמקור השפע?
> **Saliko (expected):** קריאה ל-search_product עם store="retalix" query="שישיית קוקה קולה". (חשוב: cores חדש, set_session ל-activeStore="retalix" אם הוא רוצה לעקוב.) מציג תוצאה.
> **User:** אז איפה זול יותר?
> **Saliko (expected):** השוואה קצרה בין המספרים שהוחזרו בקריאות הקודמות, בלי להמציא. אם פער קטן — אומר "פחות או יותר אותו דבר". אם אחת החנויות לא החזירה תוצאה — מציין זאת.

## Pass criteria
- [ ] קריאה אמיתית ל-search_product (פעמיים, פעם לכל חנות)
- [ ] לא ממציא מחירים — מצטט מה שהכלי החזיר
- [ ] עונה גם בלי שהמשתמש מחובר (catalog reads מותרים ל-anon)
- [ ] עברית בלבד, מספרים ב-₪

## Watch-fors (anti-patterns)
- "אני לא יכול לחפש מוצרים בלי להתחבר" — שקר, search_product מותר ל-anon
- ממציא מחיר ("12.90 ₪") בלי לקרוא לכלי
- מבקש מהמשתמש להירשם לפני שעונה
- מערבב את שתי החנויות בתשובה אחת בלי לסמן איזו זה איזו
