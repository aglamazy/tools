const h2 = { fontSize: '1.25rem', marginBottom: '0.75rem' } as const
const h3 = { fontSize: '1.05rem', margin: '1rem 0 0.5rem' } as const
const section = { marginBottom: '1.5rem' } as const
const table = { width: '100%', borderCollapse: 'collapse' as const, marginBottom: '1rem' }
const th = { textAlign: 'right' as const, borderBottom: '2px solid #e2e8f0', padding: '0.5rem', fontWeight: 600 }
const td = { borderBottom: '1px solid #f1f5f9', padding: '0.5rem', verticalAlign: 'top' as const }

export default function PrivacyContent() {
  return (
    <div>
      <section style={section}>
        <h2 style={h2}>1. מי אנחנו</h2>
        <p>
          Aglamazo היא אפליקציה לניהול פיננסי לעצמאים ולעסקים קטנים, בכתובת <strong>aglamazo.com</strong>.
        </p>
        <p>
          <strong>בעל השירות ואחראי על המידע:</strong> יעקב אגלמז, ע.מ 012680286.<br />
          <strong>יצירת קשר בנושאי פרטיות:</strong> support@aglamaz.com
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>1א. בקצרה — שלושה דברים שחשוב לדעת מיד</h2>
        <ol>
          <li><strong>הנתונים הפיננסיים שלך נשמרים בדפדפן שלך</strong>, לא בשרת שלנו.</li>
          <li>
            <strong>חשבוניות וקבלות שאתה מעלה נשלחות לספק בינה מלאכותית חיצוני</strong> (Google Gemini,
            ובמקרה של כשל Anthropic Claude) כדי לחלץ מהן את הפרטים. המסמך עצמו נשלח — עם השמות,
            מספרי העוסק והסכומים שבו. פירוט מלא בסעיף 5.
          </li>
          <li><strong>גיבוי לענן הוא בבחירתך</strong>, ומתבצע תחת חשבון Google שלך.</li>
        </ol>
      </section>

      <section style={section}>
        <h2 style={h2}>2. העיקרון: המידע נשאר אצלך</h2>
        <p>
          Aglamazo היא אפליקציית <strong>local-first</strong>. הנתונים הפיננסיים שלך נשמרים ב<strong>דפדפן שלך</strong> (IndexedDB),
          לא בשרת שלנו. אין לנו מסד נתונים מרכזי שמחזיק את הספרים שלך.
        </p>
        <p>
          מהמידע יוצא מהמכשיר שלך רק במקרים המפורטים להלן — גיבוי לענן שלך, שיתוף שבחרת בו,
          וחילוץ נתונים ממסמכים. כל אחד מהם מתואר במפורש.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>3. איזה מידע האפליקציה מטפלת בו</h2>
        <ul>
          <li><strong>תנועות בנק וכרטיסי אשראי</strong> — תאריך, סכום, תיאור, בית עסק, וסיווג שאתה קובע.</li>
          <li><strong>מסמכים פיננסיים</strong> — חשבוניות וקבלות שאתה מעלה או שנמשכות מהמייל: שם ספק, מספר מסמך, סכום, מע&quot;מ, ח.פ/ע.מ.</li>
          <li><strong>פרטי עסק</strong> — שם, מספר עוסק, שותפים ואחוזי חלוקה ביניהם.</li>
          <li><strong>פרטי התחברות ל-Ypay</strong> — מזהה וסוד לקוח של מעבד התשלומים, כולל זוגות נפרדים לסביבת בדיקות ולסביבת ייצור. נשמרים <strong>מקומית בלבד</strong>, בתוך רשומת העסק במכשיר שלך.</li>
          <li><strong>הגדרות</strong> — מפתחות API, העדפות תצוגה, נושאי הכנסה והוצאה.</li>
        </ul>
      </section>

      <section style={section}>
        <h2 style={h2}>4. הרשאות Google — מה בדיוק אנחנו מבקשים ולמה</h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>הרשאה</th>
              <th style={th}>מה היא מאפשרת</th>
              <th style={th}>למה היא נדרשת</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><code>drive.file</code></td>
              <td style={td}>גישה <strong>רק</strong> לקבצים שהאפליקציה עצמה יצרה או שפתחת דרכה</td>
              <td style={td}>שמירת החשבוניות והקבלות שהעלית, כדי שיהיו זמינות בכל מכשיר</td>
            </tr>
            <tr>
              <td style={td}><code>gmail.modify</code></td>
              <td style={td}>קריאה, ארגון, מחיקה ושליחה של דואר</td>
              <td style={td}>איתור אוטומטי של קבלות שהתקבלו במייל, סימונן, וארגונן בתוויות</td>
            </tr>
            <tr>
              <td style={td}><code>calendar.readonly</code></td>
              <td style={td}>קריאה בלבד של אירועי יומן</td>
              <td style={td}>שיוך זמן עבודה לפרויקטים</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>drive.file איננה גישה ל-Drive שלך.</strong> האפליקציה אינה יכולה לראות, לקרוא או למחוק
          קבצים שלא נוצרו על ידה.
        </p>
        <p>
          <strong>מדוע gmail.modify ולא הרשאת קריאה בלבד:</strong> האפליקציה מסמנת קבלות שטופלו, מסדרת
          אותן בתוויות, ושולחת מסמכים בשמך. פעולות אלה מחייבות הרשאת כתיבה. היא אינה קוראת
          דואר שאינו קשור לקבלות ואינה שולחת דואר ללא פעולה יזומה שלך.
        </p>
        <h3 style={h3}>Google API Services User Data Policy — שימוש מוגבל</h3>
        <p>
          השימוש של Aglamazo במידע שהתקבל מממשקי Google, והעברתו לכל יישום אחר, כפופים ל-
          {' '}<a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
          לרבות דרישות ה-Limited Use.
        </p>
        <p>
          בפרט: איננו משתמשים במידע מ-Gmail או מ-Drive לצורך פרסום, איננו מוכרים אותו, ואיננו
          מעבירים אותו לצדדים שלישיים למעט לצורך אספקת השירות עצמו כמתואר בסעיף 5.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>5. עיבוד מסמכים באמצעות בינה מלאכותית — הסעיף החשוב ביותר</h2>
        <p>
          <strong>כאשר אתה מעלה חשבונית או קבלה, המסמך נשלח לספק בינה מלאכותית חיצוני כדי לחלץ ממנו את הפרטים.</strong>
        </p>
        <ul>
          <li><strong>Google Gemini</strong> (דגם gemini-2.5-flash) — ספק ראשי.</li>
          <li><strong>Anthropic Claude</strong> (דגם claude-sonnet-5) — נבחר כגיבוי, אם החילוץ הראשון נכשל.</li>
        </ul>
        <p>
          מה נשלח: <strong>המסמך עצמו</strong> — קובץ PDF או תמונה — הכולל את שם הספק, שמך או שם עסקך,
          מספר עוסק, סכומים, מע&quot;מ ופרטי השירות שנרכש.
        </p>
        <p>מה חוזר: הפרטים המחולצים, שנשמרים במכשיר שלך.</p>
        <p>
          <strong>זהו העיבוד היחיד שבו תוכן פיננסי שלך מגיע לצד שלישי שאינו אתה.</strong> הוא מתבצע רק כאשר
          אתה מעלה מסמך או מבקש חילוץ ממייל.
        </p>
        <h3 style={h3}>מה עושים הספקים עם המסמך — אומת 09/09/2026</h3>
        <ul>
          <li>
            <strong>Google Gemini</strong> — המפתח של Aglamazo מוגדר בפרויקט עם <strong>חיוב פעיל (Paid tier)</strong>. בתנאי
            Google לשירותים בתשלום, ההנחיות והקבצים שנשלחים <strong>אינם משמשים לשיפור המוצרים שלהם</strong>. הם
            נשמרים לזמן מוגבל אך ורק לצורך זיהוי הפרות של מדיניות השימוש.
          </li>
          <li>
            <strong>Anthropic Claude</strong> — קלט ופלט <strong>נמחקים בתוך 30 יום</strong>, ואינם משמשים לאימון מודלים ללא
            הרשאה מפורשת.
          </li>
        </ul>
        <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
          מקורות:{' '}
          <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">Gemini API — חיוב ורמות שירות</a>
          {' · '}
          <a href="https://docs.anthropic.com/en/docs/build-with-claude/zero-data-retention" target="_blank" rel="noopener noreferrer">Anthropic — שמירת נתונים ב-API</a>
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>6. גיבוי בענן</h2>
        <p>
          אם תפעיל גיבוי בענן, הנתונים מסונכרנים ל-<strong>Firebase Firestore</strong> תחת חשבון Google שלך.
        </p>
        <p>
          אסימוני ההרשאה של Google <strong>אינם נכללים בגיבוי</strong> — הם נשמרים מקומית בלבד ומוסרים מכל
          כתיבת גיבוי, כדי שמכשיר אחד לא יוכל לדרוס את הרשאות הגישה של מכשיר אחר.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>7. שיתוף מכוון — מי עוד רואה את המידע שלך</h2>
        <p>Aglamazo מאפשרת שיתוף יזום. אלה אינם דליפות; אלה תכונות שאתה מפעיל.</p>
        <ul>
          <li><strong>משק בית משותף</strong> — הגיבוי משותף עם בן/בת הזוג, באמצעות סיסמה משותפת לכל עסק. מרגע ההפעלה, הצד השני רואה את הנתונים הפיננסיים המשותפים.</li>
          <li><strong>שותפים בעסק</strong> — שותף רשום רואה את מסך ההתחשבנות: הכנסות, הוצאות וחלוקת הרווח.</li>
        </ul>
      </section>

      <section style={section}>
        <h2 style={h2}>8. מדידה</h2>
        <p>
          האתר משתמש ב-<strong>Vercel Analytics</strong> לנתוני שימוש מצטברים (עמודים נצפים, ביצועים).
          הוא אינו אוסף את תוכן הנתונים הפיננסיים שלך.
        </p>
        <p>אין באפליקציה כלי ניטור שגיאות או אנליטיקה נוספים.</p>
      </section>

      <section style={section}>
        <h2 style={h2}>9. שמירה ומחיקה</h2>
        <p>
          הנתונים נשמרים כל עוד הם במכשיר שלך. <strong>מחיקת נתוני הדפדפן מוחקת אותם</strong> — הם אינם מוחזקים אצלנו.
        </p>
        <p><strong>הגיבוי המוצפן בענן ניתן למחיקה לבקשתך</strong>, ואנו נמחק אותו. פנה ל-support@aglamaz.com.</p>
        <p>מסמכים שנשמרו ב-Google Drive שלך נשארים בבעלותך וניתנים למחיקה ישירות מ-Drive.</p>
        <p><strong>מחיקה היא מחיקה.</strong> רשומה שמחקת אינה חוזרת בסנכרון הבא.</p>
      </section>

      <section style={section}>
        <h2 style={h2}>10. אבטחה</h2>
        <p>
          הנתונים נשמרים במכשיר שלך ומוגנים באמצעי האבטחה של הדפדפן ומערכת ההפעלה. גיבוי בענן
          מוגן על ידי חשבון Google שלך. שיתוף משק בית מוגן בסיסמה משותפת.
        </p>
        <p><strong>אחריותך:</strong> מי שיש לו גישה למכשיר או לחשבון Google שלך יכול להגיע לנתונים.</p>
      </section>

      <section style={section}>
        <h2 style={h2}>11. זכויותיך</h2>
        <p>
          מכיוון שהנתונים אצלך, הגישה והתיקון הם ישירים — דרך האפליקציה. לכל שאלה, בקשת מחיקה
          או תלונה: <strong>support@aglamaz.com</strong>.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>12. שינויים</h2>
        <p>נעדכן עמוד זה עם כל שינוי מהותי, ונציין את תאריך העדכון האחרון.</p>
        <p><strong>עדכון אחרון:</strong> 09/09/2026</p>
      </section>

      <hr style={{ margin: '2.5rem 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

      <div dir="ltr" style={{ textAlign: 'left' }}>
        <h2 style={h2}>Privacy Policy — Aglamazo (English)</h2>

        <section style={section}>
          <h3 style={h3}>1. Who we are</h3>
          <p>
            Aglamazo is a personal-finance and small-business bookkeeping application at{' '}
            <strong>aglamazo.com</strong>, operated by Yaakov Aglamaz (Israeli business ID 012680286).
            Privacy contact: <strong>support@aglamaz.com</strong>
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>2. The principle: your data stays with you</h3>
          <p>
            Aglamazo is <strong>local-first</strong>. Your financial data is stored <strong>in your own browser</strong> (IndexedDB),
            not on our servers. We operate no central database of your books. Data leaves your device only
            in the cases described below.
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>3. What data the app handles</h3>
          <p>
            Bank and credit-card transactions; financial documents (invoices and receipts, including supplier
            name, document number, amounts, VAT and business IDs); business details including partners and
            their profit-share percentages; <strong>Ypay payment-processor credentials</strong> (client id and
            secret, with separate sandbox and production pairs), stored <strong>locally only</strong>, on the
            business record on your device; and settings including API keys and categories.
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>4. Google permissions</h3>
          <table style={{ ...table, textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Scope</th>
                <th style={{ ...th, textAlign: 'left' }}>Grants</th>
                <th style={{ ...th, textAlign: 'left' }}>Why</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={td}><code>drive.file</code></td>
                <td style={td}>Access <strong>only</strong> to files this app created or you opened with it</td>
                <td style={td}>Storing your uploaded invoices and receipts</td>
              </tr>
              <tr>
                <td style={td}><code>gmail.modify</code></td>
                <td style={td}>Read, organize, delete and send mail</td>
                <td style={td}>Finding receipts in your mail, labelling them as handled, sending documents at your instruction</td>
              </tr>
              <tr>
                <td style={td}><code>calendar.readonly</code></td>
                <td style={td}>Read-only calendar events</td>
                <td style={td}>Attributing working time to projects</td>
              </tr>
            </tbody>
          </table>
          <p>
            <code>drive.file</code> is <strong>not</strong> access to your Drive: the app cannot see, read or delete
            files it did not create.
          </p>
          <p>
            <code>gmail.modify</code> rather than read-only because the app marks receipts as handled, organizes
            them into labels, and sends documents at your request — all of which require write access. It does
            not read mail unrelated to receipts, and sends nothing without your action.
          </p>
          <h3 style={h3}>Limited Use disclosure</h3>
          <p>
            Aglamazo&apos;s use and transfer of information received from Google APIs adheres to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>,
            including the <strong>Limited Use</strong> requirements. We do not use Gmail or Drive data for
            advertising, do not sell it, and do not transfer it to third parties except as required to provide
            the service, as described in section 5.
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>5. AI document processing — the most important section</h3>
          <p>
            <strong>When you upload an invoice or receipt, the document is sent to a third-party AI provider to
            extract its details.</strong>
          </p>
          <ul>
            <li><strong>Google Gemini</strong> (gemini-2.5-flash) — primary.</li>
            <li><strong>Anthropic Claude</strong> (claude-sonnet-5) — fallback, used only when the first extraction fails.</li>
          </ul>
          <p>
            <strong>What is sent: the document itself</strong> — a PDF or image containing supplier name, your
            name or business name, business ID, amounts, VAT and a description of what was purchased. What
            returns are the extracted fields, stored on your device.
          </p>
          <p>
            This is the <strong>only</strong> processing in which your financial content reaches a third party
            other than you, and it happens only when you upload a document or request extraction from mail.
          </p>
          <h3 style={h3}>What the providers do with the document — verified 2026-09-09</h3>
          <ul>
            <li>
              <strong>Google Gemini</strong> — Aglamazo&apos;s key sits in a project with <strong>billing enabled (paid tier)</strong>.
              Under Google&apos;s paid-service terms, prompts and files sent to the API are <strong>not used to
              improve their products</strong>; they are retained for a limited period solely to detect Prohibited
              Use Policy violations.
            </li>
            <li>
              <strong>Anthropic Claude</strong> — inputs and outputs are <strong>deleted within 30 days</strong>,
              and are never used for model training without express permission.
            </li>
          </ul>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Sources:{' '}
            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer">Gemini API billing and tiers</a>
            {' · '}
            <a href="https://docs.anthropic.com/en/docs/build-with-claude/zero-data-retention" target="_blank" rel="noopener noreferrer">Anthropic API and data retention</a>
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>6. Cloud backup</h3>
          <p>
            If you enable cloud backup, data syncs to <strong>Firebase Firestore</strong> under your own Google
            account. Google OAuth tokens are <strong>excluded from backups</strong> — held device-locally and
            stripped from every backup write, so one device cannot overwrite another&apos;s access.
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>7. Deliberate sharing</h3>
          <ul>
            <li><strong>Shared household</strong> — the backup is shared with a spouse via a per-business shared password; once enabled, they see the shared financial data.</li>
            <li><strong>Business partners</strong> — a registered partner sees the settlement screen: income, expenses and profit split.</li>
          </ul>
        </section>

        <section style={section}>
          <h3 style={h3}>8. Analytics</h3>
          <p>
            The site uses <strong>Vercel Analytics</strong> for aggregate usage data (page views, performance).
            It does not collect the content of your financial data. No other analytics or error-reporting
            tools are integrated.
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>9. Retention and deletion</h3>
          <p>
            Data persists while it is on your device; clearing browser data deletes it. If cloud backup is
            enabled you must also delete the backup, and you may contact us to request deletion. Documents
            stored in your Google Drive remain yours and can be deleted directly from Drive.
          </p>
          <p><strong>A deletion is a deletion.</strong> A record you delete does not come back on the next sync.</p>
        </section>

        <section style={section}>
          <h3 style={h3}>10. Security</h3>
          <p>
            Data is held on your device under your browser&apos;s and operating system&apos;s protections; cloud
            backup is protected by your Google account; household sharing by a shared password. Anyone with
            access to your device or Google account can reach the data.
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>11. Your rights</h3>
          <p>
            Because the data is yours and held by you, access and correction are direct, through the app.
            For any question, deletion request or complaint: <strong>support@aglamaz.com</strong>.
          </p>
        </section>

        <section style={section}>
          <h3 style={h3}>12. Changes</h3>
          <p>We will update this page on any material change and note the date of the last update.</p>
          <p><strong>Last updated:</strong> 09/09/2026</p>
        </section>
      </div>
    </div>
  )
}
