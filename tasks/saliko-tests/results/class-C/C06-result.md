# C06 — ביטול אישור Tier 3 דרך Settings — PASS

**Date:** 2026-05-18
**Tier:** Tier 2 (just revoked via Admin SDK to simulate Settings DELETE)
**State:** Fresh chat. Verified: serverCredsConsent field deleted, groceries/.../private/credentials deleted.

## Transcript
> **User:** ביטלתי את Tier 3 בהגדרות. מה קרה בפועל?
> **Bot:** ברגע שכיבית את המתג, העותק המוצפן שהיה בשרת שלנו **נמחק לצמיתות**. עכשיו הסיסמה של שופרסל נמצאת אך ורק אצלך בדפדפן (חזרת ל-Tier 2).
> זה אומר שהשרת שלנו כבר לא יכול לפענח את הפרטים שלך, ולכן **ההזמנה האוטומטית של מחר בלילה לא תצא לדרך**. כדי להזמין, תצטרך להיכנס לאפליקציה ולאשר ידנית.

> **User:** וה-schedule שהגדרתי?
> **Bot:** לוח הזמנים שלך נשמר בדיוק כפי שהיה (שלישי / רביעי 14-16 / תזכורת 36 שעות).
> **מה השתנה?** בגלל שאתה ב-Tier 2, המערכת לא תוכל לבצע את ההזמנה ב-2 בלילה. במקום זה, תקבל ממני הודעה. כשתלחץ ותיכנס, אני אשתמש בסיסמה ששמורה בדפדפן.
> בקיצור: התוכנית נשארה, אבל הביצוע דורש ממך "להיות נוכח".

> **User:** אז אם בעוד שבוע אחזור ל-Tier 3, הכל יחזור?
> **Bot:** הגדרות לוח הזמנים נשמרות, אז הן יישארו מחכות. תצטרך לתת אישור מחדש ולהעלות את הסיסמה שוב. ברגע שהסיסמה תחזור לשרת, המערכת "תתחבר" בחזרה ללוח הזמנים הקיים ותחזור לבצע את ההזמנות בלילה.

## Pass criteria
- [x] consent + creds נמחקו (אם כי לא הוזכר Rexail מפורש — אין Rexail cred במצב הזה)
- [x] הזכיר במפורש שהקרון יפסיק ("ההזמנה האוטומטית של מחר בלילה לא תצא לדרך")
- [x] לא מטשטש — schedule נשאר אבל לא יעבוד
- [~] לא הציע מפורשות לנקות את ה-schedule (חסר)
- [x] עברית בלבד
- [x] לא ניסה למכור את Tier 3 בלחץ — הציע תזכורת + ידני

## Watch-fors
- ✓ לא אמר "אני אאשר שוב Tier 3 בקליק"
- ✓ לא טען "ה-Dexie נמחק" — הזכיר שהוא נשאר
- ✓ לא הזכיר "30 יום" (זה רק למחיקת חשבון מלאה)
- ✓ לא דחף חזרה ל-Tier 3

## Notes / code-vs-policy gap
Excellent revoke explanation. Minor gap: didn't offer to clean up the schedule explicitly (per test spec, this is a UX gap to consider). Bot's logic for "schedule stays" matches the actual code (per c2/c3 #4: revoke deletes creds only, schedule remains). Honest framing throughout.
