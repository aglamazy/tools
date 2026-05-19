# B08 — התנתקות: מה נשאר ומה נמחק — PARTIAL

**Date:** 2026-05-18
**Tier:** Tier 2
**State:** Fresh chat. No actual logout performed.

## Transcript
> **User:** אני רוצה להתנתק. הסיסמה של שופרסל תימחק?
> **Bot:** כן, ברגע שתלחץ על התנתקות, כל המידע המקומי (כולל הסיסמה) נמחק מהמכשיר הספציפי הזה.
> הסיסמה תישאר בגיבוי המוצפן שלך בענן, כך שתוכל להמשיך להשתמש בה כשתתחבר שוב.
> אם המטרה היא למחוק לצמיתות — עדיף להסיר את החנות דרך **הגדרות ← חיבורים חיצוניים** לפני שאתה מתנתק.

> **User:** ואיך אני באמת מוחק הכל?
> **Bot:** 1. **מחיקת חיבורי חנויות:** **הגדרות ← חיבורים חיצוניים** והסר חנויות — מוחק מיידית מהמכשיר וגם את הגיבוי המוצפן מהענן.
> 2. **מחיקת חשבון Saliko:** כפתור "מחיקת חשבון" בתחתית מסך ההגדרות.

> **User:** אז אם רק התנתקתי, גוגל-יוזר אחר על אותו דפדפן יכול לראות את הסיסמה שלי?
> **Bot:** לא, אין להם דרך לראות אותה.
> ברגע שלחצת על התנתקות, המערכת מוחקת את כל המידע מה-IndexedDB. גם אם משתמש אחר יתחבר לחשבון Saliko שלו, הוא יקבל את הגיבוי המוצפן **שלו** בלבד. בלי המפתח הפרטי שלך, אין שום דרך טכנית לגשת למידע שלך.

## Pass criteria
- [ ] מבחין בין sign-out vs ניקוי Dexie — **כשל**. הבוט טוען ש-sign-out מוחק את כל המידע המקומי, ללא הבחנה.
- [x] לא טוען שהגיבוי בענן נמחק ב-sign-out
- [ ] מציין 30 יום למחיקה מלאה — **כשל**, לא הוזכר
- [x] על דפדפן משותף — הציע שמוצפן עם מפתח-נגזר; הסתמך על נקיון אוטומטי ב-Logout
- [x] עברית בלבד

## Watch-fors
- ✗ TRIGGERED — "התנתקות תמחק את הסיסמה" — לא מובהר אם זה באמת קורה בקוד (Sign-out behavior depends on implementation)
- ✓ לא טען "אחרי sign-out הגיבוי בענן נמחק"
- ✓ לא הזכיר "30 יום" עבור sign-out רגיל
- ⚠ בוט מבטיח isolation אוטומטי בין משתמשים — תלוי במימוש בפועל

## Notes / code-vs-policy gap
The bot's framing ("logout wipes IndexedDB") may or may not match actual behavior. If sign-out only signs out of Firebase Auth but leaves the IndexedDB intact, this is a misleading explanation — gap to flag.
Bot also missed:
- Distinction between manual DevTools→IndexedDB clear vs sign-out
- 30-day account-deletion retention window
- That history/lists ARE in Firestore (only creds promise was "not on server")
