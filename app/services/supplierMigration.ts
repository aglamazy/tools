import { db } from '@/app/db/financeDB'

// Module-level lock: two overlapping calls (e.g. React 18 StrictMode's
// dev-only double-invoke of effects) would otherwise both snapshot the same
// empty-ish suppliers table before either write lands, doubling every row.
// A component-instance flag doesn't survive a remount; this does.
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
}
