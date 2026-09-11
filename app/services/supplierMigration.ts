import { db } from '@/app/db/financeDB'

// Module-level lock: two overlapping calls (e.g. React 18 StrictMode's
// dev-only double-invoke of effects) would otherwise both snapshot the same
// empty-ish suppliers table before either write lands, doubling every row.
// A component-instance flag doesn't survive a remount; this does. This ONLY
// covers same-JS-instance concurrency though — see the Dexie transaction
// wrap below for the cross-tab/cross-reload case (aglamazo#364).
let inFlight: Promise<{ created: number; skipped: number }> | null = null

/**
 * Best-effort, idempotent seed: one Supplier row per distinct raw vendor
 * string currently in use across transactions. Dumb 1:1 seeding on purpose —
 * "VERCEL INC." and "VERCEL" become two separate rows here; deduping
 * near-identical names is a service-layer concern, not this sweep's job.
 * Safe to call repeatedly: re-runs rebuild the existing-alias set fresh each
 * time, so nothing new gets created once a string is already covered.
 */
export async function seedSuppliersFromTransactions(): Promise<{ created: number; skipped: number }> {
  if (inFlight) return inFlight
  inFlight = runSeed()
  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

async function runSeed(): Promise<{ created: number; skipped: number }> {
  // aglamazo#364: this component mounts and fires once per authenticated
  // page load, but `inFlight` above is a module-level JS variable — it
  // resets on every fresh page load/tab and does NOT protect against two
  // browser tabs (or two reloads close enough together) each doing their
  // own read-then-write pass. The read (snapshot existing aliases) and the
  // writes (one add per new alias) used to be separate, independent Dexie
  // calls, so another tab's writes could land in the gap between them —
  // exactly the shape of the 2026-07-13/14 incident (581 vendor names with
  // 3 byte-identical rows each). Wrapping the whole read+write sequence in
  // one Dexie transaction makes IndexedDB itself serialize it against any
  // other tab's readwrite transaction on the same table — a browser-level
  // guarantee, not just an in-process lock.
  return db.transaction('rw', [db.suppliers, db.transactions], async () => {
    const existingSuppliers = await db.suppliers.toArray()
    const existingAliases = new Set<string>()
    for (const s of existingSuppliers) {
      for (const alias of s.bankCardAliases) existingAliases.add(alias.toLowerCase())
    }

    const transactions = await db.transactions.toArray()
    let created = 0
    let skipped = 0

    for (const t of transactions) {
      const raw = (t.type === 'bank' ? t.description : t.merchant || t.description || '').trim()
      if (!raw) continue

      const key = raw.toLowerCase()
      if (existingAliases.has(key)) {
        skipped++
        continue
      }

      await db.suppliers.add({
        name: raw,
        bankCardAliases: [raw],
        emailSenders: [],
        createdAt: new Date().toISOString(),
      })
      existingAliases.add(key)
      created++
    }

    console.log('[supplierMigration] seeded', created, 'suppliers,', skipped, 'already covered')
    return { created, skipped }
  })
}
