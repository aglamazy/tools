/**
 * Seed the first Terms & Conditions version in Firestore.
 * Run once: npx tsx scripts/seed-tc.ts
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_JSON env var (or .env.local).
 */

import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local manually
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      let val = match[2].trim()
      if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
        val = val.slice(1, -1)
      }
      process.env[match[1].trim()] = val
    }
  }
}

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!serviceAccountKey) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT_JSON in .env.local')
  process.exit(1)
}

const serviceAccount = JSON.parse(serviceAccountKey)

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

const TC_COLLECTION = 'tcVersions'
const VERSION = '2026-03-09' // matches config.tcVersion (dev/empty-DB fallback)

const TC_HTML = `<div dir="rtl" style="line-height: 1.8; font-size: 1rem; color: #1e293b;">

<h2>תנאי שימוש</h2>

<p>ברוכים הבאים לפלטפורמת <strong>Aglamazo</strong> (להלן: "המערכת" או "השירות"). השימוש במערכת מהווה הסכמה לתנאים המפורטים להלן. אנא קראו אותם בעיון.</p>

<h3>1. מהות השירות</h3>
<p>המערכת משמשת ככלי להבנה כללית של חישוב המיסים, ניהול הוצאות והכנסות, ומעקב פיננסי אישי ועסקי. המערכת <strong>אינה מוגדרת כמערכת מקצועית</strong> לחישוב מס, ראיית חשבון, או ייעוץ פיננסי מכל סוג שהוא.</p>

<h3>2. הגבלת אחריות</h3>
<ul>
  <li>המשתמש במערכת עושה זאת <strong>על אחריותו בלבד</strong> לצורך הבנה כללית של מצבו הפיננסי.</li>
  <li>על המשתמש להיעזר ב<strong>רואה חשבון או מנהל חשבונות מוסמך</strong> כדי להבין את חובותיו ולהסדירן.</li>
  <li>בעלי המערכת, מפתחיה ומפעיליה <strong>אינם אחראים</strong> לכל נזק, הפסד, או חבות מס שייגרמו כתוצאה מהשימוש במערכת או מהסתמכות על הנתונים המוצגים בה.</li>
  <li>החישובים המוצגים במערכת הם <strong>הערכות בלבד</strong> ואינם מהווים תחליף לייעוץ מקצועי.</li>
</ul>

<h3>3. פרטיות ואבטחת מידע</h3>
<ul>
  <li>הנתונים הפיננסיים של המשתמש מאוחסנים באופן מקומי במכשיר המשתמש ובענן (בהתאם להגדרות המשתמש).</li>
  <li>המערכת אינה משתפת מידע אישי עם צדדים שלישיים, למעט שירותים נדרשים להפעלת המערכת (אחסון ענן, אימות משתמשים).</li>
  <li>המשתמש אחראי לשמירה על סיסמתו ופרטי הגישה שלו.</li>
</ul>

<h3>4. שימוש מותר</h3>
<ul>
  <li>המשתמש מתחייב להשתמש במערכת למטרות חוקיות בלבד.</li>
  <li>אין להשתמש במערכת לצורך הלבנת הון, העלמת מס, או כל פעילות בלתי חוקית אחרת.</li>
</ul>

<h3>5. שינויים בתנאי השימוש</h3>
<p>בעלי המערכת רשאים לעדכן תנאים אלו מעת לעת. עדכון התנאים יחייב אישור מחדש מצד המשתמש.</p>

<h3>6. הפסקת שירות</h3>
<p>בעלי המערכת רשאים להפסיק את השירות או לשנות אותו בכל עת, ללא התחייבות מוקדמת. מומלץ לגבות את הנתונים באופן שוטף.</p>

</div>`

async function main() {
  const firestore = admin.firestore()

  // Check if version already exists
  const existing = await firestore.collection(TC_COLLECTION).doc(VERSION).get()
  if (existing.exists) {
    console.log(`T&C version ${VERSION} already exists. Skipping.`)
    process.exit(0)
  }

  await firestore.collection(TC_COLLECTION).doc(VERSION).set({
    text: TC_HTML,
    version: VERSION,
    createdBy: 'seed-script',
    createdAt: new Date().toISOString(),
  })

  console.log(`T&C version ${VERSION} seeded successfully.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
