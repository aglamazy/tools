# B04 — חיפוש והוספה לרשימה הקבועה (Dexie cred זמין)

**Persona:** משתמש שכבר חיבר שופרסל דרך ההגדרות, רוצה לבנות רשימה קבועה
**State:** logged in (Tier 2), no server-creds consent, **יש cred של שופרסל ב-Dexie בלבד**, אין שום doc ב-`groceries/{uid}/private/credentials`

**Goal of test:** עם cred ב-Dexie בלבד — חיפוש, הוספה לרשימה הקבועה, וצפייה ברשימה צריכות לעבוד באופן מלא. הבוט לא צריך לבקש creds ולא לדחוף ל-Tier 3.

## Conversation

> **User:** חפש לי קוטג׳ 5% של תנובה.
> **Saliko (expected):** קורא ל-search_product עם store="shufersal" query="קוטג׳ 5% תנובה". מציג תוצאות (1-5) עם שם + מחיר + יחידת מכירה. לא מבקש creds.
> **User:** הוסף את הראשון לרשימה הקבועה שלי.
> **Saliko (expected):** קורא ל-add_to_standing_list עם catalogId המתאים. מאשר: "נוסף לרשימה הקבועה שלך לשופרסל." מציין שהרשימה נשמרת ב-Firestore (פר-uid) — זה תקין ב-Tier 2 (המדיניות מאשרת "רשימות קבועות, היסטוריית הזמנות" על השרת; רק *פרטי החנות* הם הקו האדום).
> **User:** מה יש לי ברשימה?
> **Saliko (expected):** קורא ל-show_standing_list, מציג את המוצרים. עברית בלבד. אם זה הפריט הראשון — אומר את זה.

## Pass criteria
- [ ] חיפוש עובד עם cred מ-Dexie (לא דורש Firestore-side cred doc)
- [ ] add_to_standing_list עובד ב-Tier 2 (הרשימה לא נחשבת "פרטי חנות")
- [ ] לא מבקש creds מהמשתמש (כבר מחובר)
- [ ] לא דוחף Tier 3 בזרימה הזו
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- "אני צריך את הסיסמה שלך כדי לחפש" — שגוי; ה-cred זמין מ-Dexie
- "כדי להוסיף לרשימה צריך Tier 3" — שגוי; רשימות קבועות מותרות ב-Tier 2
- ממציא תוצאות חיפוש בלי לקרוא ל-search_product
- כותב catalogId שגוי / hallucinated

## Known code-vs-policy gap (if any)
- **Potential gap:** הקוד של search_product/shufersalClient כיום קורא ל-`loadCredentials` שמחפש את ה-doc ב-Firestore (`groceries/{uid}/private/credentials`). ב-Tier 2 ה-doc הזה לא קיים → search ייכשל אלא אם הזרימה משתמשת ב-Dexie cred ישירות. אם זה לא עובד end-to-end ב-Tier 2 טהור — זה פער שצריך לתעד: shufersalClient/retalixClient צריכים לקבל cred גם מ-Dexie (דרך CredentialService) לפני שנופלים ל-Firestore. **Flag for step (e).**
