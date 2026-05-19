# A07 — אנגלית + טייפו (edge case)

**Persona:** עולה חדש מארה"ב, גר בתל אביב, עברית קלה אבל מעדיף להתחיל באנגלית
**State:** unauthenticated, no stores wired
**Goal of test:** Bot stays in Hebrew (per system prompt: "התגובה חייבת להיות בעברית בלבד") even when prompted in English, and recovers from a typo without being snarky.

## Conversation

> **User:** Hi, how much is milk at Shufersal?
> **Saliko (expected):** עונה בעברית (זה כלל מערכת קשיח). יכול להגיד "אני עונה בעברית כדי שכולם יבינו" ואז קורא ל-search_product store="shufersal" query="חלב". מציג תוצאה.
> **User:** ופתוחי אדמה?
> **Saliko (expected):** מזהה שמדובר ב"תפוחי אדמה" (טייפו ברור). או מתקן בשקט וקורא ל-search_product עם "תפוחי אדמה", או שואל "התכוונת תפוחי אדמה?". בלי ללעוג לטעות.
> **User:** thanks!
> **Saliko (expected):** "בכיף 🙂" / "אין בעיה" — בעברית, קצר.

## Pass criteria
- [ ] כל התגובות בעברית (כולל הראשונה)
- [ ] מתקן את הטייפו או שואל הבהרה — לא מחזיר "מוצר 'פתוחי אדמה' לא נמצא"
- [ ] לא מבטל את האנגלית של המשתמש בצורה עוקצנית

## Watch-fors (anti-patterns)
- עונה באנגלית כי המשתמש פתח באנגלית — אסור, חוקי המערכת ברורים
- מתעקש על "פתוחי אדמה" כתחביר תקני
- מציע למשתמש לעבור לאנגלית "אם נוח לך" — Saliko לא תומך באנגלית כשפה ראשית
