# A11 — אנון מבלבל בין Google sign-in לבין סיסמת שופרסל

**Persona:** משתמש זהיר עם פרטיות, אנונימי, חושב שהבוט אומר לו שכדי לקנות בשופרסל הוא צריך לחבר את חשבון Google שלו לשופרסל
**State:** anon (Tier 1) — no account, no stores wired, sessionStorage empty
**Goal of test:** Bot keeps "Google sign-in to Saliko" and "Shufersal email+password to Shufersal" as TWO completely separate ideas. Never says or implies that Shufersal needs Google. Anonymous users get a clean explanation: register to Saliko via Google (only to identify them in Saliko), THEN separately connect Shufersal with their personal Shufersal credentials (which are unrelated to Google).

## Conversation

> **User:** רגע — אז אני צריך לתת לכם את חשבון Google שלי כדי לקנות בשופרסל?
> **Saliko (expected):** "לא, זה שני דברים נפרדים. (1) Google sign-in זה כדי להיכנס ל-Saliko עצמה — כדי שיהיה לך חשבון אצלנו. (2) כדי לקנות בשופרסל אתה נותן לי את האימייל והסיסמה של *חשבון השופרסל הפרטי שלך* (זה שאתה משתמש בו ב-shufersal.co.il). אין שום קשר בין השניים." בלי לערבב, בלי לומר "Google sign-in לשופרסל".
> **User:** ואם אני רוצה להזמין בלי לפתוח חשבון אצלכם?
> **Saliko (expected):** מציע את חנויות ה-OTP: "אפשר — מקור השפע, הירקנייה ושאר רשתות ה-Rexail עובדות בלי חשבון ב-Saliko ובלי סיסמה. רק מספר טלפון + קוד SMS. הזמנה חד-פעמית בכל פעם." מציין שגם שם — הטלפון נשמר רק בדפדפן שלו, לא בשרת שלנו (Tier 1 anon).
> **User:** ואם בכל זאת אני רוצה דווקא שופרסל בלי להירשם אצלכם?
> **Saliko (expected):** "אי אפשר. שופרסל דורשת אימייל וסיסמה של חשבון שופרסל — וכדי לשמור אותם בצורה בטוחה, אנחנו צריכים שתהיה לך זהות אצלנו. ברגע שתתחבר ל-Saliko (Google sign-in) — תוכל לחבר את השופרסל בלי שום קשר ל-Google." בלי לטעון שיש איזה shortcut.

## Pass criteria
- [ ] הבחנה ברורה לפחות פעם אחת בין "Google sign-in = להיכנס ל-Saliko" ל"שופרסל = אימייל+סיסמה של חשבון שופרסל"
- [ ] לא טוען שיש קשר טכני בין Google ל-Shufersal
- [ ] מציע את חנויות ה-OTP כאלטרנטיבה למשתמש שלא רוצה להירשם
- [ ] מסביר נכון את Tier 1 לאנון (טלפון בדפדפן בלבד) אם מציע OTP
- [ ] לא ממציא flow של "Login to Shufersal with Google" — זה לא קיים
- [ ] עברית בלבד

## Watch-fors (anti-patterns)
- "כדי לחבר את שופרסל תצטרך קודם להירשם למערכת (Google sign-in)" — הניסוח הקודם שבילבל את המשתמש; חייב להגיד שזה Google ל-Saliko, **לא** ל-Shufersal
- "Google אצלנו זה כמו הסיסמה של שופרסל" — שקר
- "תוכל להיכנס לשופרסל דרך Google" — Shufersal לא תומך ב-Google OAuth, אסור להציע
- מבטיח "בלי סיסמה" לשופרסל — שופרסל דורשת סיסמה, נקודה
- שותק על האלטרנטיבה (Rexail OTP) כשהמשתמש מסרב להירשם

## Regression source

נוצר אחרי ש-Yaakov שם לב לבוט שאמר "(Google sign-in)" בסוף "תצטרך קודם להירשם למערכת" — נראה כאילו Google שייך לשופרסל. הניסוח בפרומפט תוקן בעקבות זה (chatProcessor.ts — סעיף "משתמש אנונימי" וסעיף "שופרסל לא תומך ב-OTP"). הטסט הזה שומר על המהדורה הזו לבל תתנמך שוב.
