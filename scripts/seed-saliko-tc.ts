/**
 * Seed Saliko's `tcVersions` collection with a Saliko-specific draft T&C.
 *
 * The placeholder text below is a starting point — covers data scope,
 * credential encryption, automation responsibility, cancellation, and
 * privacy. Yaakov / a lawyer should review before public launch and
 * push a `version: 2026-XX-YY` newer than the one here to force re-accept.
 *
 * Usage: npx tsx scripts/seed-saliko-tc.ts
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

import * as fs from 'fs'

const VERSION = '2026-05-06-saliko'

const SALIKO_TC_HE = `
<h2>תנאי שימוש - Saliko (טיוטה לבדיקות פנימיות)</h2>
<p>גרסה: ${VERSION}. טקסט זה ייסקר ויוחלף לפני השקה ציבורית.</p>

<h3>1. מה Saliko עושה</h3>
<p>Saliko הוא סוכן אוטומטי שמבצע בשמך פעולות באתרי מכר מקוון של רשתות שיווק
(שופרסל, מקור השפע ואחרים שייתווספו בעתיד) על בסיס רשימה קבועה והעדפות שלך.
פעולות מבוצעות בקצב שבועי, לפי לוח זמנים שאתה מגדיר.</p>

<h3>2. פרטי התחברות לחנויות</h3>
<p>כדי להתחבר בשמך לאתר החנות, Saliko מקבל ממך פרטי התחברות (אימייל וסיסמה
או מספר טלפון, לפי החנות). הפרטים נשמרים מוצפנים. Saliko לעולם לא חושף
את הפרטים שלך לצדדים שלישיים פרט לחנות עצמה לצורך ביצוע ההזמנה.</p>

<h3>3. אחריות על הזמנות</h3>
<p>Saliko פותח הזמנה אוטומטית בהתאם לרשימה ולהעדפות שהגדרת. אתה אחראי
לבדוק את ההזמנה לפני שהיא ננעלת ולעדכן אותה אם צריך. Saliko אינו אחראי
על תוכן ההזמנה, על מחירים, על זמינות מוצרים או על איכות המשלוח —
אלה באחריות החנות.</p>

<h3>4. ביטול הזמנה</h3>
<p>אפשר לבטל הזמנה דרך ממשק Saliko עד שעה לפני נעילת ההזמנה אצל החנות.
אחרי הנעילה הביטול הוא באחריותך מול שירות הלקוחות של החנות.</p>

<h3>5. פרטיות</h3>
<p>Saliko אוסף ושומר: פרטי התחברות מוצפנים, היסטוריית הזמנות,
רשימת מוצרים מועדפים, ושיחות עם הסוכן בצ׳אט. אנחנו לא מוכרים מידע
לצדדים שלישיים. ניתן למחוק את כל המידע בכל רגע דרך ההגדרות.</p>

<h3>6. מנוי וחיוב</h3>
<p>השימוש בגרסה הנוכחית של Saliko חינם. Saliko עשוי להציע בעתיד
מנוי בתשלום לתכונות מתקדמות. מעבר לתכונות בתשלום יחייב הסכמה מפורשת
ולא יחיל את עצמו על משתמשים קיימים ללא אישורם.</p>

<h3>7. שינויי תנאים</h3>
<p>במקרה של שינוי בתנאי השימוש, Saliko ידרוש אישור מחודש לפני הפעלה
מחדש של הסוכן.</p>

<h3>8. יצירת קשר</h3>
<p>שאלות, תקלות, או בקשות מחיקת מידע: שלח הודעה דרך ממשק הצ׳אט או
דרך עמוד "צור קשר".</p>
`.trim()

async function main() {
  const admin = await import('firebase-admin')
  const salikoSa = JSON.parse(fs.readFileSync('/home/yaakov/develop/docs/saliko-firebase-admin.json', 'utf8'))

  const app = admin.initializeApp({ credential: admin.credential.cert(salikoSa) })
  const db = app.firestore()

  // Wipe stale Aglamazo-derived doc(s) — fresh Saliko T&C should win.
  const existing = await db.collection('tcVersions').get()
  for (const d of existing.docs) {
    console.log(`Removing stale tcVersions/${d.id}`)
    await d.ref.delete()
  }

  await db.collection('tcVersions').doc(VERSION).set({
    version: VERSION,
    text: SALIKO_TC_HE,
    seededAt: new Date().toISOString(),
  })
  console.log(`✓ Wrote saliko-prod/tcVersions/${VERSION} (${SALIKO_TC_HE.length} chars)`)
  console.log(`Update app/config.ts#tcVersion to "${VERSION}" if you want existing test users to re-accept.`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
