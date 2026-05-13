/**
 * READ-ONLY: validate expense classification against the "legit business
 * expenses" canonical list (12 categories × 2 businesses: AgentsHeads + BubbleLabs).
 *
 * Data model (after probing the live Dexie DB):
 *   - businesses[]  — Business entities; AH and BL identified by name match.
 *   - categories[]  — Each category has optional businessId; isDeductible
 *     + deductibleByMember marks household-shared deductible categories
 *     (e.g. ארנונה proportional).
 *   - businessCategories[] — VENDOR→category lookup (the "business" column
 *     here is actually a transaction description / merchant, NOT a Business
 *     entity). Not used for business attribution here.
 *   - transactions[] — Each has .category (string NAME), .amount, .date.
 *
 * Source of data:
 *   - Default: download encrypted backup from Firebase Storage and decrypt
 *     with AGLAMAZO_BACKUP_PASSWORD (PBKDF2 + AES-GCM, mirroring the app's
 *     encryptionService.ts).
 *   - Override: AGLAMAZO_BACKUP_JSON=path/to/plaintext.json (for offline
 *     runs or when the password is not available to the script — e.g.
 *     dumped from the browser via window.db).
 *
 * Zero writes. Run locally:
 *   AGLAMAZO_BACKUP_PASSWORD='...' npx tsx scripts/validate-expense-classification.ts
 *   AGLAMAZO_BACKUP_JSON=/tmp/aglamazo-data.json npx tsx scripts/validate-expense-classification.ts
 */
import { loadEnv } from './_load-env'
import * as fs from 'fs'
import { webcrypto } from 'crypto'
loadEnv()

const UID = 'rARk7h1zwjhH9ATji5pHETqSWuC3'

// --- Legit categories ----------------------------------------------------
const LEGIT_CATEGORIES: { name: string; variants: string[] }[] = [
  { name: 'ציוד', variants: ['ציוד'] },
  { name: 'ענן, תקשורת ואינטרנט', variants: ['ענן', 'תקשורת', 'אינטרנט', 'cloud', 'internet', 'תקשורת ומחשוב'] },
  { name: 'ארנונה', variants: ['ארנונה'] },
  { name: 'חשמל', variants: ['חשמל', 'electric'] },
  { name: 'מים', variants: ['מים'] },
  { name: 'רכב', variants: ['רכב', 'רכב ונסיעות', 'דלק', 'fuel', 'טסט', 'פחת', 'ביטוח רכב'] },
  { name: 'ציוד משרדי', variants: ['ציוד משרדי', 'משרדי', 'office'] },
  { name: 'ריהוט', variants: ['ריהוט'] },
  { name: 'הכשרות', variants: ['הכשרה', 'הכשרות', 'קורס', 'סדנה', 'training'] },
  { name: 'כנסים מקצועיים', variants: ['כנס', 'כנסים', 'conference'] },
  { name: 'בנקאות', variants: ['בנקאות', 'בנק', 'עמלה'] },
  { name: 'ביטוח ציוד', variants: ['ביטוח ציוד'] },
]

const HINTS: { keywords: string[]; suggested: string }[] = [
  { keywords: ['חשמל', 'electric', 'iec', 'חברת חשמל'], suggested: 'חשמל' },
  { keywords: ['חברת מים', 'מי אביבים', 'מי שבע', 'water', 'תאגיד מים', 'מי כפר יונה', 'מי שרונים', 'מעיינות'], suggested: 'מים' },
  { keywords: ['דלק', 'fuel', 'סונול', 'פז', 'דור-אלון', 'דור אלון', 'פז יל', 'paz', 'sonol', 'delek', 'אלון רב', 'תחנת דלק'], suggested: 'רכב (דלק)' },
  { keywords: ['ארנונה', 'מס עירוני', 'עיריית', 'עירייה'], suggested: 'ארנונה' },
  { keywords: ['ביטוח רכב', 'car insurance', 'איילון רכב', 'מנורה רכב', 'הפניקס רכב', 'כלל רכב'], suggested: 'רכב (ביטוח)' },
  { keywords: ['טסט', 'רישוי רכב', 'משרד התחבורה'], suggested: 'רכב (טסט)' },
  { keywords: ['אינטרנט', 'internet', 'בזק', 'סלקום', 'partner', 'פרטנר', 'cellcom', 'bezeq', 'נטוויז'], suggested: 'ענן/אינטרנט' },
  { keywords: ['aws', 'amazon web', 'google cloud', 'gcp', 'anthropic', 'openai', 'vercel', 'firebase', 'render', 'fly.io', 'digitalocean', 'cloudflare'], suggested: 'ענן' },
  { keywords: ['google one', 'google workspace', 'github', 'cursor', 'jetbrains', 'notion', 'figma', 'slack', 'zoom'], suggested: 'ענן/SaaS' },
  { keywords: ['office depot', 'משרד', 'נייר', 'דיו', 'מדפסת', 'office'], suggested: 'ציוד משרדי' },
  { keywords: ['ריהוט', 'איקאה', 'ikea'], suggested: 'ריהוט' },
  { keywords: ['קורס', 'course', 'סדנה', 'הכשרה', 'udemy', 'coursera'], suggested: 'הכשרות' },
  { keywords: ['כנס מקצוע', 'conference', 'meetup'], suggested: 'כנסים מקצועיים' },
  { keywords: ['עמלת ניהול', 'עמלת חשבון', 'banking fee', 'דמי כרטיס', 'עמלת כרטיס'], suggested: 'בנקאות' },
  { keywords: ['apple', 'macbook', 'mac mini', 'iphone', 'ipad', 'dell', 'lenovo', 'samsung galaxy', 'בני סופר טכנו', 'best buy'], suggested: 'ציוד' },
]

const PERSONAL_HINTS = [
  'מזון', 'תרבות ובילויים', 'בריאות', 'ביגוד', 'מתנות', 'נופש', 'ילדים',
  'חיות', 'משכנתא', 'שכר דירה', 'תרומה', 'דירה', 'בית',
]

// --- Decryption ----------------------------------------------------------
const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const IV_LENGTH = 12
async function decryptBackup(encryptedBase64: string, password: string): Promise<string> {
  const combined = Buffer.from(encryptedBase64, 'base64')
  const salt = combined.subarray(0, SALT_LENGTH)
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH)
  const enc = new TextEncoder()
  const passwordKey = await webcrypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plain)
}

// --- Helpers ------------------------------------------------------------
function normalize(s: string | undefined | null): string {
  if (!s) return ''
  return s.toLowerCase().replace(/["׳״'`־\-]/g, ' ').replace(/\s+/g, ' ').trim()
}
function matchLegit(catName: string): { idx: number; exact: boolean; variant?: string } | null {
  if (!catName) return null
  const n = normalize(catName)
  for (let i = 0; i < LEGIT_CATEGORIES.length; i++) {
    const lc = LEGIT_CATEGORIES[i]
    if (normalize(lc.name) === n) return { idx: i, exact: true }
    for (const v of lc.variants) {
      const nv = normalize(v)
      if (n === nv || n.includes(nv) || nv.includes(n)) return { idx: i, exact: false, variant: catName }
    }
  }
  return null
}
function parseDate(s: string | undefined): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const iso = new Date(s)
  return isNaN(iso.getTime()) ? null : iso
}
function fmtAmount(n: number): string { return n.toLocaleString('he-IL', { maximumFractionDigits: 0 }) }
function pad(s: string, w: number): string { return s + ' '.repeat(Math.max(0, w - [...s].length)) }
function takeUnique<T>(arr: T[], n: number): T[] {
  const set = new Set<string>(); const out: T[] = []
  for (const x of arr) { const k = String(x); if (!set.has(k)) { set.add(k); out.push(x); if (out.length >= n) break } }
  return out
}

// --- Main ---------------------------------------------------------------
;(async () => {
  let backupJson: string | null = null
  if (process.env.AGLAMAZO_BACKUP_JSON) {
    backupJson = fs.readFileSync(process.env.AGLAMAZO_BACKUP_JSON, 'utf8')
    console.error('[validate] loaded plaintext backup from', process.env.AGLAMAZO_BACKUP_JSON)
  } else {
    const admin = await import('firebase-admin')
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)
    const app = admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    })
    const fs2 = app.firestore()
    const userDoc = await fs2.collection('users').doc(UID).get()
    const householdId = (userDoc.data() as any)?.householdId
    const path = householdId ? `backups/households/${householdId}/backup.enc` : `backups/${UID}/backup.enc`
    console.error('[validate] downloading', path)
    const [bytes] = await app.storage().bucket().file(path).download()
    const encryptedBase64 = bytes.toString('utf8')
    const pw = process.env.AGLAMAZO_BACKUP_PASSWORD
    if (!pw) {
      console.error('\nERROR: AGLAMAZO_BACKUP_PASSWORD env var is required.')
      console.error('Or pass AGLAMAZO_BACKUP_JSON=/path/to/plaintext-export.json')
      process.exit(2)
    }
    backupJson = await decryptBackup(encryptedBase64, pw)
    console.error('[validate] decrypted backup, length =', backupJson.length)
  }

  const parsed = JSON.parse(backupJson!)
  // Accept either top-level keys or backup.stores.* wrap
  const stores = parsed.stores || parsed
  const transactions: any[] = stores.transactions || []
  const categories: any[] = stores.categories || []
  const businesses: any[] = stores.businesses || []
  const businessCategories: any[] = stores.businessCategories || []

  console.log(`# Aglamazo — Expense Classification Validation`)
  console.log(`Generated: ${new Date().toISOString()}`)
  console.log(`Source backup: ${parsed.timestamp || '(no timestamp / synthetic dump)'}`)
  console.log(`Counts: tx=${transactions.length} cat=${categories.length} biz=${businesses.length} bizCat=${businessCategories.length}`)
  console.log()

  const findBiz = (...needles: string[]) => businesses.find(b => {
    const nm = normalize(b.name)
    return needles.some(n => nm.includes(normalize(n)))
  })
  const ah = findBiz('agentsheads', 'agents heads', 'agents head', 'אג׳נטסהדס', 'agents-heads')
  const bl = findBiz('bubblelabs', 'bubble labs', 'bubble-labs', 'בבל לאבס', 'באבל לאבס')
  console.log(`Identified businesses:`)
  console.log(`  AgentsHeads → ${ah ? `id=${ah.id} name="${ah.name}" type=${ah.type}` : '(NOT FOUND)'}`)
  console.log(`  BubbleLabs  → ${bl ? `id=${bl.id} name="${bl.name}" type=${bl.type}` : '(NOT FOUND)'}`)
  if (!ah || !bl) {
    console.log(`All businesses: ${businesses.map(b => `${b.id}:${b.name}(${b.type})`).join(', ')}`)
  }
  console.log()

  // Index categories by name
  const catByName: Map<string, any> = new Map()
  for (const c of categories) catByName.set(c.name, c)

  // Categories scoped to each business (by businessId)
  const ahCatNames: Set<string> = new Set()
  const blCatNames: Set<string> = new Set()
  const householdDeductibleCatNames: Set<string> = new Set()
  for (const c of categories) {
    if (c.type !== 'expense') continue
    if (ah && c.businessId === ah.id) ahCatNames.add(c.name)
    if (bl && c.businessId === bl.id) blCatNames.add(c.name)
    if (c.businessId == null && c.isDeductible && c.deductibleByMember) householdDeductibleCatNames.add(c.name)
  }

  console.log(`Categories scoped to AH (by businessId): ${ahCatNames.size} → ${[...ahCatNames].join(', ') || '(none)'}`)
  console.log(`Categories scoped to BL (by businessId): ${blCatNames.size} → ${[...blCatNames].join(', ') || '(none)'}`)
  console.log(`Household-shared deductible categories: ${householdDeductibleCatNames.size} → ${[...householdDeductibleCatNames].join(', ') || '(none)'}`)
  console.log()

  // ===== Section 1: Coverage matrix =====
  console.log(`## 1. Coverage matrix (legit category present + scoped)\n`)
  console.log(`Legit category                                  AH            BL`)
  console.log(`----------------------------------------------- ------------- -------------`)
  function cell(catSet: Set<string>, legitIdx: number): string {
    let chosen: { name: string; exact: boolean } | null = null
    for (const c of catSet) {
      const m = matchLegit(c)
      if (m && m.idx === legitIdx) {
        if (m.exact) { chosen = { name: c, exact: true }; break }
        if (!chosen) chosen = { name: c, exact: false }
      }
    }
    if (!chosen) return 'X missing'
    return chosen.exact ? 'V exact' : `V "${chosen.name.slice(0, 11)}"`
  }
  for (let i = 0; i < LEGIT_CATEGORIES.length; i++) {
    console.log(`${pad(LEGIT_CATEGORIES[i].name, 47)} ${pad(cell(ahCatNames, i), 13)} ${pad(cell(blCatNames, i), 13)}`)
  }
  console.log()
  console.log(`Note: an unscoped category (e.g. "ציוד" with no businessId) shows as "missing" here even though the name exists.`)
  console.log(`      "Household-shared deductible" (e.g. ארנונה via deductibleByMember) also counts as missing unless tied to the business.`)
  console.log()

  // Bonus: name-match coverage (regardless of scope) — useful to distinguish "name missing" vs "scope missing".
  console.log(`### 1b. Name-only coverage (does a matching category NAME exist anywhere?)\n`)
  const allExpenseCatNames = new Set(categories.filter(c => c.type === 'expense').map(c => c.name))
  console.log(`Legit category                                  match?       matched name`)
  console.log(`----------------------------------------------- ------------ --------------------`)
  for (const lc of LEGIT_CATEGORIES) {
    let matched: string | null = null
    for (const cn of allExpenseCatNames) {
      const m = matchLegit(cn)
      if (m && normalize(lc.name) === normalize(LEGIT_CATEGORIES[m.idx].name)) { matched = cn; break }
    }
    console.log(`${pad(lc.name, 47)} ${pad(matched ? 'V found' : 'X missing', 12)} ${matched || ''}`)
  }
  console.log()

  // ===== Section 2: Per-category spending =====
  const year = new Date().getFullYear()
  const startYear = new Date(year, 0, 1)
  const endYear = new Date(year + 1, 0, 1)
  console.log(`## 2. Per-category spending (year=${year}, expenses only)\n`)

  function spendByLegit(catSet: Set<string>, label: string) {
    console.log(`### ${label}\n`)
    const byCat: Map<string, any[]> = new Map()
    for (const tx of transactions) {
      if (typeof tx.amount !== 'number' || tx.amount >= 0) continue
      const d = parseDate(tx.date)
      if (!d || d < startYear || d >= endYear) continue
      const c = tx.category || ''
      if (!catSet.has(c)) continue
      if (!byCat.has(c)) byCat.set(c, [])
      byCat.get(c)!.push(tx)
    }
    console.log(`Legit category                                  #tx    total ₪      sample vendors`)
    console.log(`----------------------------------------------- ------ ------------ --------------------------------------`)
    for (const lc of LEGIT_CATEGORIES) {
      let chosen: string | null = null
      for (const c of catSet) {
        const m = matchLegit(c)
        if (m && m.idx === LEGIT_CATEGORIES.indexOf(lc)) { chosen = c; break }
      }
      const txs = chosen ? (byCat.get(chosen) || []) : []
      const total = txs.reduce((s, t) => s + Math.abs(t.amount), 0)
      const vendors = takeUnique(txs.map(t => (t.merchant || t.description || '').slice(0, 25)), 4)
      console.log(`${pad(lc.name + (chosen && chosen !== lc.name ? ` [${chosen}]` : ''), 47)} ${pad(String(txs.length), 6)} ${pad(fmtAmount(total), 12)} ${vendors.join(' | ')}`)
    }
    console.log()
  }
  if (ah) spendByLegit(ahCatNames, `AgentsHeads (${ah.name})`)
  if (bl) spendByLegit(blCatNames, `BubbleLabs (${bl.name})`)
  spendByLegit(householdDeductibleCatNames, `Household-shared deductible`)

  // Also: if no scoped categories at all, give a "match-by-name from any category" view
  if (ahCatNames.size === 0 && blCatNames.size === 0 && householdDeductibleCatNames.size === 0) {
    console.log(`### 2b. (fallback) Spending in legit-named categories regardless of business scope\n`)
    spendByLegit(allExpenseCatNames, `All categories (unscoped, by name match)`)
  }

  // ===== Section 3: Suspected miscategorizations =====
  console.log(`## 3. Suspected miscategorizations (uncategorized expenses with hints)\n`)
  const suspects: { tx: any; suggested: string }[] = []
  for (const tx of transactions) {
    if (typeof tx.amount !== 'number' || tx.amount >= 0) continue
    const d = parseDate(tx.date)
    if (!d || d < startYear || d >= endYear) continue
    const cat = (tx.category || '').trim().toLowerCase()
    const isUncat = !cat || cat === 'uncategorized' || cat === 'לא מסווג' || cat === 'ללא קטגוריה'
    if (!isUncat) continue
    const hay = normalize((tx.description || '') + ' ' + (tx.merchant || ''))
    for (const h of HINTS) {
      if (h.keywords.some(k => hay.includes(normalize(k)))) { suspects.push({ tx, suggested: h.suggested }); break }
    }
  }
  suspects.sort((a, b) => Math.abs(b.tx.amount) - Math.abs(a.tx.amount))
  console.log(`date       amount       suggested            description`)
  console.log(`---------- ------------ -------------------- -----------------------------------------------------`)
  for (const s of suspects.slice(0, 40)) {
    const desc = ((s.tx.description || '') + (s.tx.merchant ? ' / ' + s.tx.merchant : '')).slice(0, 70)
    console.log(`${pad(s.tx.date || '?', 10)} ${pad(fmtAmount(Math.abs(s.tx.amount)) + ' ₪', 12)} ${pad(s.suggested, 20)} ${desc}`)
  }
  console.log(`\nTotal suspects: ${suspects.length}, total amount: ${fmtAmount(suspects.reduce((a, s) => a + Math.abs(s.tx.amount), 0))} ₪\n`)

  // ===== Section 4: Unknown categories =====
  console.log(`## 4. Non-legit expense categories that look business-ish\n`)
  const catStats: Map<string, { count: number; total: number }> = new Map()
  for (const tx of transactions) {
    if (typeof tx.amount !== 'number' || tx.amount >= 0) continue
    const d = parseDate(tx.date)
    if (!d || d < startYear || d >= endYear) continue
    const c = (tx.category || '').trim()
    if (!c) continue
    if (matchLegit(c)) continue
    const cn = normalize(c)
    if (PERSONAL_HINTS.some(p => cn.includes(normalize(p)))) continue
    const s = catStats.get(c) || { count: 0, total: 0 }
    s.count += 1; s.total += Math.abs(tx.amount)
    catStats.set(c, s)
  }
  const ranked = [...catStats.entries()].sort((a, b) => b[1].total - a[1].total)
  console.log(`category                                       #tx    total ₪`)
  console.log(`---------------------------------------------- ------ ------------`)
  for (const [name, s] of ranked.slice(0, 25)) {
    console.log(`${pad(name, 46)} ${pad(String(s.count), 6)} ${fmtAmount(s.total)}`)
  }
  console.log()

  // ===== Section 5: Coverage stats =====
  console.log(`## 5. Coverage stats (year=${year}, expenses only)\n`)
  let totalExpense = 0
  let uncategorized = 0
  let legitTotal = 0
  let scopedAH = 0
  let scopedBL = 0
  let householdDeductible = 0
  for (const tx of transactions) {
    if (typeof tx.amount !== 'number' || tx.amount >= 0) continue
    const d = parseDate(tx.date)
    if (!d || d < startYear || d >= endYear) continue
    const amt = Math.abs(tx.amount)
    totalExpense += amt
    const c = (tx.category || '').trim()
    if (!c) { uncategorized += amt; continue }
    const isLegit = !!matchLegit(c)
    if (isLegit) legitTotal += amt
    if (ahCatNames.has(c)) scopedAH += amt
    if (blCatNames.has(c)) scopedBL += amt
    if (householdDeductibleCatNames.has(c)) householdDeductible += amt
  }
  const pct = (x: number) => totalExpense > 0 ? Math.round(100 * x / totalExpense) : 0
  console.log(`Total expense this year:      ${pad(fmtAmount(totalExpense) + ' ₪', 18)}`)
  console.log(`Uncategorized:                ${pad(fmtAmount(uncategorized) + ' ₪', 18)} (${pct(uncategorized)}%)`)
  console.log(`In legit-named category:      ${pad(fmtAmount(legitTotal) + ' ₪', 18)} (${pct(legitTotal)}%)`)
  console.log(`Scoped to AH (businessId):    ${pad(fmtAmount(scopedAH) + ' ₪', 18)} (${pct(scopedAH)}%)`)
  console.log(`Scoped to BL (businessId):    ${pad(fmtAmount(scopedBL) + ' ₪', 18)} (${pct(scopedBL)}%)`)
  console.log(`Household-deductible:         ${pad(fmtAmount(householdDeductible) + ' ₪', 18)} (${pct(householdDeductible)}%)`)
  console.log()
  console.log(`=== End of report ===`)

  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
