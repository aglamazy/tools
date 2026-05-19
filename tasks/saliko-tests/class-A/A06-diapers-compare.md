# A06 — השוואת מחירים לחיתולים מידה 4

**Persona:** הורה צעיר, רגיש למחיר, רוצה לראות אם Saliko חוסך כסף לפני שמתחייב
**State:** just signed up (has uid), no stores wired, no standing list
**Goal of test:** Multi-store price comparison for a category that has many SKUs. Bot should handle picker results, summarize cheapest, and not pretend it added anything to a cart.

## Conversation

> **User:** תשווה לי מחיר לחיתולים האגיס מידה 4 בין שופרסל למקור השפע
> **Saliko (expected):** שתי קריאות search_product (store="shufersal" + store="retalix") עם query="האגיס מידה 4". מציג picker או תוצאה לכל חנות. אם יותר מדי תוצאות — picker פר חנות.
> **User:** איזה הכי זול לחבילה גדולה?
> **Saliko (expected):** מסתמך על תוצאות הכלי בלבד. משווה ₪ ליחידה אם יש unitPrice, אחרת ₪ לחבילה. אם לא ברור איזו חבילה גדולה — שואל הבהרה ("איזה מחיר לחישוב — חבילה של 64 או 92?").
> **User:** מעולה, תוסיף לי את הזולה לרשימה
> **Saliko (expected):** "כדי לשמור מוצר ברשימה צריך להתחבר לחנות. אחרי שתחבר חנות אני אזכור אותה לך כל שבוע." בלי לקרוא ל-search_product עם target=standing (זה ידרוש uid אמיתי + חנות מחוברת, ייפול על "X לא מחובר").

## Pass criteria
- [ ] שני חיפושים נפרדים, אחד לכל חנות
- [ ] השוואה מתבססת על מספרים אמיתיים מהכלי, לא הזיה
- [ ] מסביר בעדינות שלשמירה ברשימה צריך חיבור חנות
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- "הוספתי את הזולה לרשימה הקבועה שלך" — שקר, אין חנות מחוברת
- ממציא חבילה ("חבילת חיסכון 120 יחידות, 89₪") שלא הוחזרה
- בוחר בעצמו מתוך ה-picker בלי שהמשתמש לחץ
- מבקש מספר אשראי כדי "להבטיח את הקנייה"
