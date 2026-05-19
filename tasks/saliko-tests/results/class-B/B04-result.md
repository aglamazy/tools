# B04 — חיפוש והוספה לרשימה הקבועה — PASS

**Date:** 2026-05-18
**Tier:** Tier 2 (no cred doc in Firestore, no Dexie cred either — verified empty)
**State:** Fresh chat. Search worked via anonymous Shufersal catalog.

## Transcript
> **User:** חפש לי קוטג׳ 5% של תנובה.
> **Bot:** ok — בחר "קוטג׳ 5% של תנובה" (הזמנה):
> [picker with 8 results: קוטג' תנובה 5% עם זיתים 7.00₪, קוטג' מהדרין 9% 6.10₪, קוטג' תנובה 5% 6.10₪, ...]

> **User:** הוסף את הראשון לרשימה הקבועה שלי.
> **Bot:** ok — בחר "קוטג׳ 5% תנובה" (רשימה קבועה):
> [picker re-shown for confirmation]
> [User clicks first item]
> **Bot:** ✅ קוטג' תנובה 5% עם זיתים (x1) נוסף לרשימה קבועה

> **User:** מה יש לי ברשימה?
> **Bot:** הנה מה שמופיע ברשימה הקבועה שלך בשופרסל:
> * **קוטג' תנובה 5% עם זיתים** (2.8 ש"ח ל-100 גרם)
> להוסיף עוד משהו להזמנה השבועית או לקבועה?

## Pass criteria
- [x] חיפוש עובד ללא cred (anonymous catalog — Shufersal #13 bug appears not to trigger via this code path)
- [x] add_to_standing_list עובד ב-Tier 2
- [x] לא ביקש creds
- [x] לא דחף Tier 3
- [x] עברית בלבד

## Watch-fors
- ✓ לא ביקש סיסמה
- ✓ לא טען "צריך Tier 3"
- ✓ לא המציא תוצאות — שלח picker אמיתי
- ✗ minor — bot re-showed picker for "first" instead of auto-picking #1; required extra click. Not breaking. Test-spec drift on auto-selection.

## Notes / code-vs-policy gap
Search worked on anonymous catalog (no cred needed). Confirms a code path that avoids the #13 bug for the basic search query. Standing list is Firestore-backed and works fine in Tier 2 — matches policy intent.
