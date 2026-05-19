# C02 — Settings UI Tier 3 + שמירת cred — PARTIAL

**Date:** 2026-05-18
**Tier:** Tier 3 (consent active from C01 — was supposed to be granted via Settings; was instead granted in C01 via chat)
**State:** Fresh chat. Cred + consent already exist in backend.

## Transcript
> **User:** הפעלתי Tier 3 והוספתי את שופרסל בהגדרות. זה באמת ב-2 מקומות עכשיו?
> **Bot:** כן, בדיוק. בגלל שאתה ב-**Tier 3**, הפרטים שמורים בשני מקומות:
> 1. **אצלך בדפדפן:** כדי שתוכל לנהל את הקניות בצורה מהירה כשאתה מחובר.
> 2. **עותק מוצפן בשרת שלנו:** זה מה שמאפשר לי "להתעורר" בשלישי בלילה ולבצע עבורך את ההזמנה באופן אוטומטי.
>
> חשוב להיות שקוף – העותק בשרת מוצפן, אבל כדי לבצע את ההזמנה בשמך, המערכת חייבת לפענח אותו. זה אומר שטכנית, צוות עם גישת ניהול למערכת יכול עקרונית לגשת לפרטים.

> **User:** ואם אחד מהשניים נכשל לשמור?
> **Bot:** המערכת בנויה כך שהם מגבים אחד את השני:
> * **אם הזיכרון בדפדפן נמחק** – השרת עדיין מחזיק את העותק המוצפן.
> * **אם השמירה בשרת נכשלת** – פשוט לא אוכל לבצע פעולות כשאתה לא נמצא. במקרה כזה, נחזור להתנהג כמו ב-Tier 2.

## Pass criteria
- [~] dual-write — הסבר תקין אבל לא "Dexie master" מפורש; הציג כשני עותקים שווים
- [ ] failure mode: Dexie-first — **כשל**. הבוט הציג כסימטרי, לא הזכיר שה-Dexie save מתבצע ראשון ושהשרת הוא best-effort sync.
- [x] לא מתחזה לעשות פעולה
- [x] לא ביקש סיסמה שוב
- [x] עברית בלבד

## Watch-fors
- ✓ לא קרא ל-set_credentials שוב
- ✓ לא טען "רק בשרת" / "רק ב-Dexie"
- ✗ TRIGGERED partially — "אם השרת נופל, הקליינט מאבד..." — לא נאמר כך מפורש, אבל הסימטריה מטשטשת את האמת שה-Dexie הוא ה-master

## Notes / code-vs-policy gap
Test setup drift: should have run with cred newly entered via Settings UI; in fact ran with cred from C01 auto-grant. Bot's explanation matches the dual-write reality of the code but doesn't lean into "Dexie is master, server is sync". Honest disclaimer about decryption is present (good).
