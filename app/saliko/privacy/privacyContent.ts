/**
 * Saliko privacy statement — SINGLE SOURCE OF TRUTH.
 *
 * Everything in the system that needs to quote, summarise, or check the
 * Saliko privacy policy reads from this file:
 *   - app/saliko/privacy/page.tsx  — renders the public policy page
 *   - app/api/privacy/route.ts     — serves the policy + acceptance status
 *   - scripts/seed-saliko-privacy.ts — pushes the same body into Firestore
 *     (`privacyVersions/{SALIKO_PRIVACY_VERSION}`) for runtime fetches and
 *     historical record-keeping
 *   - the chat brain / consent gates / tests will import these exports to
 *     reference the canonical tier names + version slug (do not duplicate
 *     the strings elsewhere — import them from here).
 *
 * Style: plain Hebrew, formal but not pompous. We do NOT claim "we can't
 * see your password" in Tier 3 — encryption-at-rest protects against DB
 * leaks but personnel with prod access can technically decrypt. Stating
 * this honestly is the whole point of the document.
 */

/** Version slug. Bump (and reseed) whenever the policy text changes materially. */
export const SALIKO_PRIVACY_VERSION = '2026-05-16-saliko-privacy-v1'

/** Canonical tier identifiers — reuse these throughout the codebase. */
export const SALIKO_PRIVACY_TIERS = {
  anonymous: 'anonymous',
  loggedInNoServerCreds: 'logged-in-no-server-creds',
  loggedInWithServerCreds: 'logged-in-with-server-creds',
} as const

export type SalikoPrivacyTierId =
  (typeof SALIKO_PRIVACY_TIERS)[keyof typeof SALIKO_PRIVACY_TIERS]

/** Human-facing tier labels (Hebrew). */
export const SALIKO_PRIVACY_TIER_LABELS: Record<SalikoPrivacyTierId, string> = {
  [SALIKO_PRIVACY_TIERS.anonymous]: 'אנונימי',
  [SALIKO_PRIVACY_TIERS.loggedInNoServerCreds]: 'מחובר ללא שמירת פרטי חנות בשרת',
  [SALIKO_PRIVACY_TIERS.loggedInWithServerCreds]: 'מחובר עם שמירת פרטי חנות בשרת',
}

/** Contact address for privacy questions. */
export const SALIKO_PRIVACY_CONTACT_EMAIL = 'privacy@saliko.co.il'

/**
 * The full privacy statement as HTML (Hebrew, RTL). The string is wrapped in
 * a single `<div dir="rtl">` so callers can drop it into either an HTML
 * surface (privacy page, T&C-style modal) or quote ranges of it from the
 * chat brain.
 */
export const SALIKO_PRIVACY_HTML = `<div dir="rtl" style="line-height: 1.8; font-size: 1rem; color: #1e293b;">

<h2>מדיניות פרטיות — Saliko</h2>

<p>
  Saliko הוא סוכן אוטומטי שמבצע פעולות בשמך באתרי רשתות מזון (שופרסל,
  מקור השפע ועוד). כדי לעשות זאת — ובמיוחד כדי לעשות זאת כשאינך מחובר —
  הוא נדרש להחזיק חלק מהמידע שלך. המסמך הזה מסביר בדיוק מה נשמר, איפה,
  ומי יכול לגשת אליו. החלוקה נעשית לפי שלוש רמות שאתה בוחר ביניהן ויכול
  לעבור ביניהן בכל עת.
</p>

<h3>גרסת המסמך</h3>
<p>
  גרסה: <code>${SALIKO_PRIVACY_VERSION}</code>. שינויים מהותיים יחייבו
  אישור מחודש לפני המשך השימוש.
</p>

<h3>פרטים שלעולם לא נשמרים אצלנו</h3>
<p>
  <strong>פרטי כרטיס אשראי לא נשמרים אצל Saliko בשום רמה.</strong>
  הם נשמרים אצל רשת המזון עצמה (שופרסל / מקור השפע / וכו') במסגרת
  החשבון שלך אצלם. Saliko אינו רואה, אינו מאחסן, ואינו מעביר את פרטי
  הכרטיס שלך.
</p>

<hr />

<h3>רמה 1 — אנונימי (<code>${SALIKO_PRIVACY_TIERS.anonymous}</code>)</h3>
<p>
  אתה משתמש ב-Saliko בלי ליצור חשבון. אפשר להתחבר לחנות באמצעות קוד
  חד-פעמי (OTP) ולבצע הזמנה אחת.
</p>
<ul>
  <li><strong>מה נשמר:</strong> כלום מעבר לסשן הזמני בדפדפן.</li>
  <li>
    <strong>מתי נמחק:</strong> ברגע ההתנתקות (או בסגירת הטאב, או כשהסשן
    פג). שום פרט התחברות לא נשמר אחרי הסשן.
  </li>
  <li>
    <strong>ביקור חוזר:</strong> מתחיל מאפס. אין היסטוריה, אין רשימה
    קבועה, אין זיהוי שלך.
  </li>
  <li>
    <strong>גישה מצד צוות Saliko:</strong> אין — אין מה לראות, שום
    דבר לא נשמר.
  </li>
  <li>
    <strong>הזמנות אוטומטיות:</strong> לא רלוונטי. ההזמנה היחידה היא
    זו שאתה מבצע בעצמך בסשן הנוכחי.
  </li>
</ul>

<h3>
  רמה 2 — מחובר, ללא שמירת פרטי חנות בשרת
  (<code>${SALIKO_PRIVACY_TIERS.loggedInNoServerCreds}</code>)
</h3>
<p>
  אתה מחובר בחשבון Saliko (Google sign-in). יש לך גישה כמעט מלאה
  לשירות — דפדוף, רשימות קבועות, היסטוריה, הצעות חכמות, צ׳אט עם
  הסוכן. <strong>פרטי החנות נמצאים רק בדפדפן שלך</strong> (IndexedDB).
</p>
<ul>
  <li>
    <strong>מה נשמר על השרת:</strong> פרטי החשבון שלך אצלנו (מזהה
    Google, אימייל), היסטוריית הזמנות שלך, רשימות קבועות, שיחות עם הסוכן.
  </li>
  <li>
    <strong>פרטי חנות (סיסמת שופרסל וכו'):</strong> רק במכשיר שלך.
    מסונכרנים בין מכשירים כחלק מגיבוי מוצפן end-to-end ל-Firebase
    Storage. המפתח להצפנה אצלך בלבד — Saliko רואה ciphertext, לא את
    הסיסמה עצמה.
  </li>
  <li>
    <strong>גישה מצד צוות Saliko:</strong> רואה את ההזמנות, הרשימות
    והשיחות שלך. <em>לא</em> רואה את פרטי החנות.
  </li>
  <li>
    <strong>הזמנות אוטומטיות (cron) ללא נוכחות:</strong> לא אפשרי.
    הסוכן צריך אותך מחובר בדפדפן כדי לפתוח חיבור לחנות. אם רוצים
    הזמנות אוטומטיות כשאתה ישן — צריך לעבור לרמה 3.
  </li>
</ul>

<h3>
  רמה 3 — מחובר, עם שמירת פרטי חנות מוצפנים בשרת
  (<code>${SALIKO_PRIVACY_TIERS.loggedInWithServerCreds}</code>)
</h3>
<p>
  אתה נותן אישור מפורש ל-Saliko לשמור את פרטי ההתחברות לחנות בשרת
  שלנו, מוצפנים. זה מאפשר את כל היכולות — כולל הזמנות אוטומטיות
  שמופעלות ב-cron בלי שתהיה מחובר.
</p>
<ul>
  <li>
    <strong>מה נשמר על השרת:</strong> כל מה שיש ברמה 2,
    <strong> בנוסף ל</strong>פרטי ההתחברות שלך לחנות (אימייל / טלפון /
    סיסמה / טוקן), מוצפנים at-rest עם מפתח שנשמר ב-KMS של ענן הניהול.
  </li>
  <li>
    <strong>מה זה אומר באמת:</strong> ההצפנה at-rest מגינה מפני דליפת
    מסד נתונים. <strong>אבל</strong> מכיוון שהשרת חייב לפענח את הפרטים
    כדי להתחבר בשמך לחנות, אנשי צוות Saliko עם גישה לסביבת הייצור
    יכולים, באופן עקרוני, לפענח אותם. אנחנו לא מתחזים לטעון
    "אנחנו לא יכולים לראות את הסיסמה" — זה לא נכון ברמה הזו.
  </li>
  <li>
    <strong>מי כן ניגש בפועל:</strong> מערכת ההזמנה האוטומטית, כדי
    להתחבר לחנות פעם בכמה ימים. אנשי צוות — רק במקרה של תקלה שדורשת
    תחקור, ועם תיעוד הגישה.
  </li>
  <li>
    <strong>הזמנות אוטומטיות (cron) ללא נוכחות:</strong> פעיל. הסוכן
    יכול לפתוח הזמנה ביום הקבוע ולנעול אותה (עם אישור שלך מראש או
    בטלגרם).
  </li>
</ul>

<hr />

<h3>מעבר בין רמות</h3>
<p>
  המעבר נעשה דרך עמוד ההגדרות שלך, בלחיצה אחת. מעבר כלפי מטה (מרמה 3
  לרמה 2, או מרמה 2 לרמה 1) <strong>מוחק מיידית את המידע שאינו רלוונטי
  לרמה החדשה</strong> ומשבית את התכונות שהוא תמך בהן. אין תקופת
  צינון — המחיקה היא חלק מאותה פעולה.
</p>
<ul>
  <li>
    מעבר 3 → 2: פרטי החנות מוחקים מהשרת. הזמנות אוטומטיות נכבות. הפרטים
    נשארים אצלך בדפדפן בלבד.
  </li>
  <li>
    מעבר 2 → 1: הסשן מתנתק, החשבון נסגר. אם תבקש מחיקה מלאה — נמחק גם
    את ההיסטוריה והרשימות מהשרת שלנו (השלמת המחיקה עד 30 יום בגלל
    גיבויים).
  </li>
</ul>

<h3>מחיקת חשבון מלאה</h3>
<p>
  בכל רמה, אפשר לבקש מחיקה מלאה של כל המידע שלך דרך ההגדרות או
  באימייל אלינו. נשלים את המחיקה תוך 30 יום (הזמן הזה נדרש כדי שגם
  גיבויים יוחלפו).
</p>

<h3>שיתוף מידע עם צדדים שלישיים</h3>
<p>
  Saliko לא מוכר ולא משתף את המידע שלך עם צדדים שלישיים לצורך פרסום או
  שיווק. המידע מועבר רק לחנות עצמה (לצורך ההזמנה) ולספקי תשתית
  טכנית (Firebase / Google Cloud / Vercel) שמחזיקים אותו אצלם תחת
  אותם תנאים.
</p>

<h3>שאלות, פניות, ובקשות מחיקה</h3>
<p>
  לפנייה בנושאי פרטיות:
  <a href="mailto:${SALIKO_PRIVACY_CONTACT_EMAIL}" style="color: #4338ca;">${SALIKO_PRIVACY_CONTACT_EMAIL}</a>.
</p>

</div>`

/**
 * Plain-text snippets (no HTML) suitable for the chat brain or short
 * confirmation prompts. Keep these short — the policy page itself is the
 * full statement; these are for in-conversation reference.
 */
export const SALIKO_PRIVACY_TIER_BLURBS: Record<SalikoPrivacyTierId, string> = {
  [SALIKO_PRIVACY_TIERS.anonymous]:
    'רמה אנונימית: אין חשבון, אין שמירה. כל פרטי החנות נמחקים בסיום הסשן.',
  [SALIKO_PRIVACY_TIERS.loggedInNoServerCreds]:
    'רמה מחובר ללא שמירת פרטים בשרת: פרטי החנות רק אצלך בדפדפן (גיבוי מוצפן end-to-end). הזמנות אוטומטיות ללא נוכחות לא אפשריות.',
  [SALIKO_PRIVACY_TIERS.loggedInWithServerCreds]:
    'רמה מחובר עם שמירת פרטים מוצפנים בשרת: מאפשר הזמנות אוטומטיות גם כשאתה לא מחובר. ההצפנה at-rest מגינה מדליפה, אבל צוות עם גישת ייצור יכול עקרונית לפענח.',
}
