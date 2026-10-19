/**
 * Saliko Terms of Use — SINGLE SOURCE OF TRUTH.
 *
 * Everything in the system that needs to quote, summarise, or check the
 * Saliko Terms of Use reads from this file:
 *   - app/saliko/terms/page.tsx   — renders the public terms page
 *   - app/api/terms/route.ts     — serves the terms text + acceptance status
 *   - scripts/seed-saliko-tc.ts  — pushes the same body into Firestore
 *     (`tcVersions/{SALIKO_TC_VERSION}`) for runtime fetches
 *
 * DRAFT STATUS (2026-08-03): this text was drafted by reading the actual
 * app flows (grocery ordering, store credential tiers, cancellation), not
 * copied from a template. It replaces the placeholder that was live in
 * production ("טיוטה לבדיקות פנימיות") — see Saliko #16. Section 8
 * (liability, minimum age, jurisdiction) was left open until Agla approved
 * its wording on 2026-10-14 (Cockpit 78161, saliko#45).
 *
 * This file must be reviewed and approved (Agla) BEFORE re-running
 * scripts/seed-saliko-tc.ts against production Firestore. Editing this
 * file alone does not publish anything — the seed script is the only path
 * that changes what real users see.
 */

import { SALIKO_CONTACT_EMAIL } from '@/app/saliko/canon'

/** Version slug. Bump (and reseed) whenever the terms text changes materially. */
export const SALIKO_TC_VERSION = '2026-08-03-saliko-tc-v1'

export const SALIKO_TC_CONTACT_EMAIL = SALIKO_CONTACT_EMAIL

/**
 * The full Terms of Use as HTML (Hebrew, RTL). Wrapped in a single
 * `<div dir="rtl">` so callers can drop it into either an HTML surface
 * (terms page, acceptance modal) or quote it from elsewhere.
 */
export const SALIKO_TC_HTML = `<div dir="rtl" style="line-height: 1.8; font-size: 1rem; color: #1e293b;">

<h2>תנאי שימוש — Saliko</h2>

<h3>גרסת המסמך</h3>
<p>
  גרסה: <code>${SALIKO_TC_VERSION}</code>. שינויים מהותיים בתנאים יחייבו
  אישור מחודש לפני המשך השימוש בסוכן.
</p>

<h3>1. מה Saliko עושה</h3>
<p>
  Saliko הוא סוכן אוטומטי שמבצע בשמך פעולות הזמנה באתרי רשתות שיווק
  נתמכות (לרבות שופרסל ורשת Rexail — מקור השפע ורשתות נוספות), על בסיס
  רשימת מוצרים קבועה והעדפות שאתה מגדיר. הפעולות מבוצעות בקצב שבועי,
  לפי לוח זמנים שאתה קובע, או באופן חד-פעמי אם אתה מבקש זאת ידנית.
</p>

<h3>2. פרטי התחברות לחנויות</h3>
<p>
  כדי לפעול בשמך מול חנות, Saliko צריך את פרטי ההתחברות שלך אליה (סיסמה
  או קוד חד-פעמי, לפי החנות). איך בדיוק המידע הזה נשמר, איפה, ומי יכול
  לגשת אליו — כולל ההבדלים בין רמות השימוש השונות — מפורט במלואו
  ב<a href="/privacy" style="color: #4338ca;">מדיניות הפרטיות</a> שלנו.
  Saliko לעולם לא חושף את פרטי ההתחברות שלך לצד שלישי כלשהו, פרט לחנות
  עצמה לצורך ביצוע ההזמנה.
</p>

<h3>3. אחריות על הזמנות</h3>
<p>
  Saliko בונה הזמנה אוטומטית בהתאם לרשימה ולהעדפות שהגדרת. <strong>אתה
  אחראי לבדוק את ההזמנה לפני שהיא ננעלת אצל החנות</strong> ולעדכן אותה
  אם צריך. Saliko אינו אחראי על תוכן ההזמנה הסופי, על מחירים, על זמינות
  מוצרים, או על איכות המשלוח — אלה תמיד באחריות החנות שבה בוצעה ההזמנה.
</p>
<p>
  ההתאמה בין מוצר ברשימה שלך לבין הפריט הספציפי בקטלוג של כל חנות
  מתבצעת אוטומטית. לעיתים עלולה להתרחש אי-התאמה טכנית שתמנע הוספת פריט
  מסוים להזמנה — הסוכן ינסה להתריע על כך ולהציע חלופה, אך אנו לא
  מתחייבים שההתאמה תהיה מושלמת בכל מקרה. בדוק תמיד את ההזמנה הסופית.
</p>

<h3>4. ביטול ושינוי הזמנה</h3>
<p>
  ניתן לנסות לבטל או לשנות הזמנה דרך Saliko כל עוד החנות עצמה עדיין
  מאפשרת זאת — חלון הזמן לביטול (המכונה לעיתים "נעילת הזמנה") נקבע
  ונשלט על ידי החנות עצמה, לא על ידי Saliko, ועשוי להשתנות בין רשת
  לרשת. לאחר שההזמנה ננעלה אצל החנות, כל שינוי או ביטול הוא באחריותך
  מול שירות הלקוחות של אותה חנות ישירות.
</p>

<h3>5. מנוי וחיוב</h3>
<p>
  השימוש ב-Saliko בגרסתו הנוכחית הוא <strong>חינם</strong>. ייתכן
  ש-Saliko יציע בעתיד מנוי בתשלום לתכונות מתקדמות. מעבר לתכונות בתשלום
  יחייב הסכמה מפורשת מצדך, ולא יחול באופן אוטומטי על משתמשים קיימים
  ללא אישורם.
</p>

<h3>6. שינויים בתנאים</h3>
<p>
  במקרה של שינוי מהותי בתנאי השימוש, Saliko ידרוש ממך אישור מחודש
  לפני שהסוכן ימשיך לפעול בשמך.
</p>

<h3>7. פרטיות ומידע</h3>
<p>
  פירוט מלא על אילו נתונים נאספים, איך הם מאוחסנים, ואיך אפשר למחוק
  אותם, נמצא ב<a href="/privacy" style="color: #4338ca;">מדיניות הפרטיות</a>
  שלנו — היא חלק בלתי נפרד מתנאי שימוש אלה.
</p>

<h3>8. אחריות ובדיקת ההזמנה ותחום שיפוט</h3>
<p>סאליקו הוא עוזר טכנולוגי בלבד. ההזמנה והתשלום נעשים ישירות בין המשתמש לבין החנות; סאליקו אינו צד לעסקה, ואינו אחראי לתשלום, למחירים, למלאי או לאספקה.</p>
<p>סוכני בינה מלאכותית עלולים לטעות. באחריות המשתמש לבדוק את תוכן הסל ולוודא שההזמנה נקלטה בחנות — לרבות קבלת אישור הזמנה מהחנות — בטרם יסתמך עליה. סאליקו לא יישא באחריות לנזק הנובע מהסתמכות על פעולת הסוכן ללא בדיקה כאמור.</p>
<p>השימוש בשירות מותר מגיל 18. על תנאים אלה יחול הדין הישראלי, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.</p>

<h3>9. יצירת קשר</h3>
<p>
  לשאלות בנוגע לתנאי השימוש, ניתן לפנות אלינו בדוא"ל:
  <a href="mailto:${SALIKO_TC_CONTACT_EMAIL}" style="color: #4338ca;">${SALIKO_TC_CONTACT_EMAIL}</a>.
</p>

</div>`
