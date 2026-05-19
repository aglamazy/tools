# A05 — חיפוש מוצר חופשי (חלב אורגני)

**Persona:** אמא של תינוק, מחפשת מוצר ספציפי לפני שהיא מחליטה אם להירשם
**State:** unauthenticated, no stores wired, no standing list — i.e. tier `anonymous` (Tier 1) per the privacy policy. Tier 1 allows browsing **and** a one-shot OTP-based order within the session.
**Goal of test:** Bot uses search_product for an open query, handles ambiguity (may need clarifying question about which store or which kind), and lets the user explore without forcing signup. When asked "how do I buy this?" — describes the policy-correct path for Tier 1 (one-shot OTP order in this session, nothing persisted) and mentions that signing up gives the recurring-list experience.

## Conversation

> **User:** יש לכם חלב אורגני?
> **Saliko (expected):** אופציה 1: שואל באיזו חנות לבדוק (שופרסל / מקור השפע / האורגני). אופציה 2: רץ חיפוש בחנות ברירת המחדל (shufersal) ומציע לבדוק גם באחרות. שתי האופציות תקינות — העיקר שהוא לא נתקע.
> **User:** תבדוק באורגני
> **Saliko (expected):** קריאה ל-search_product עם store="rexail_haorgani" query="חלב אורגני". מציג תוצאות עם שם + מחיר. אם הרבה תוצאות — picker.
> **User:** ואיך אני קונה את זה?
> **Saliko (expected):** מסביר שני מסלולים תואמי-מדיניות: (1) **בלי להירשם** — אפשר לבצע הזמנה חד-פעמית בסשן הזה דרך התחברות בקוד SMS לחנות (Tier 1 — האנונימי). שום פרט לא יישמר אחרי הסשן. (2) **אם נרשמים** — הסוכן יכול לזכור רשימה קבועה, לפתוח הזמנה שבועית, ולשלוח התראות. יכול להפנות להגדרות → חנויות / להציע להתחיל את ה-OTP עכשיו. *(הערה למפתחים: כיום הקוד חוסם trigger_order ל-anon ויחזיר את ההודעה "כדי להפעיל את הסוכן..."; זה פער בין הקוד למדיניות שצריך להיסגר בשלב c — הבוט במצב הנוכחי עשוי להידחות מהכלי.)*

## Pass criteria
- [ ] מזהה נכון את החנות "האורגני" → store="rexail_haorgani"
- [ ] קורא ל-search_product, לא ממציא תוצאות
- [ ] במענה על "איך קונים" — מסביר ש-Tier 1 מאפשר הזמנה חד-פעמית עם OTP בלי להירשם, וש-Tier 2/3 נותנים את החוויה החוזרת
- [ ] לא טוען שצריך **חובה** להירשם כדי לקנות — זה סותר את המדיניות
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- מבלבל בין "האורגני" ל-"אורגני" כתכונה של מוצר
- "אי אפשר להזמין בלי להירשם" — סותר את Tier 1 במדיניות; המדיניות מתירה הזמנה חד-פעמית עם OTP בלי חשבון
- ממציא חנות "סופר אורגני" שלא ברשימה
- מוסיף מוצר לרשימה קבועה / pending כשהמשתמש רק שאל "יש לכם?"

## Known code-vs-policy gap (for step c)
המדיניות אומרת ש-Tier 1 (anonymous) רשאי לבצע הזמנה חד-פעמית עם OTP בסשן הזה (`anonymous` blurb: "אין חשבון, אין שמירה. כל פרטי החנות נמחקים בסיום הסשן."). הקוד הנוכחי חוסם את trigger_order לחלוטין ל-anon ומחזיר הודעת bounce "כדי להפעיל את הסוכן...". הציפייה בטסט הזה משקפת את ה**מדיניות** (התנהגות רצויה), לא את הקוד הנוכחי. סגירת הפער היא משימת שלב (c).
