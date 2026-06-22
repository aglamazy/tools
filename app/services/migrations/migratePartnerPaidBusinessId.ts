/**
 * One-time data repair for partner-paid ExpenseDocuments whose `businessId`
 * drifted (#74). Cause: until f3560c3+, FK_RELATIONS only remapped
 * expenseDocuments.transactionId on cloud sync-in, NOT businessId. For
 * partner-paid docs (transactionId undefined) the cloud's stale local-int
 * businessId got written verbatim — and once local businesses' autoinc ids
 * shifted, the doc showed under whatever business now owned the stale int.
 *
 * Inference rule: for each partner-paid doc, look up `d.category` in the
 * Categories table; the category's own `businessId` is authoritative (the
 * user picked the category in a specific business's ExpenseTab). Move the
 * doc to that business if it differs.
 *
 * Idempotent: re-running is safe — docs already matching their category's
 * businessId are no-ops. Docs whose category resolves nowhere are skipped
 * with a reason in the report.
 *
 * Exposed on window so Agla can run it from DevTools on prod aglamazo.com:
 *
 *   await window.aglamazoMigrations.partnerPaidBusinessId({ dryRun: true })
 *   // review .moves / .skipped, then:
 *   await window.aglamazoMigrations.partnerPaidBusinessId({ dryRun: false })
 */
import { db } from '@/app/db/financeDB'
import type { Category } from '@/app/types/category'
import { subjectStore } from '@/app/stores/subjectStore'

export type PartnerPaidMigrationMove = {
  docId: number
  vendor: string | undefined
  category: string | undefined
  fromBusinessId: number | undefined
  toBusinessId: number
}

export type PartnerPaidMigrationSkip = {
  docId: number
  vendor: string | undefined
  category: string | undefined
  currentBusinessId: number | undefined
  reason: string
}

export type PartnerPaidMigrationReport = {
  dryRun: boolean
  totalPartnerPaid: number
  alreadyCorrect: number
  moves: PartnerPaidMigrationMove[]
  skipped: PartnerPaidMigrationSkip[]
}

export type VendorRule = {
  /** RegExp source or literal string (matched against ExpenseDocument.vendor) */
  vendorPattern: string | RegExp
  /** Target business id to move matching docs to */
  toBusinessId: number
}

export async function migratePartnerPaidBusinessId(
  opts: { dryRun?: boolean; vendorRules?: VendorRule[] } = {},
): Promise<PartnerPaidMigrationReport> {
  const dryRun = opts.dryRun !== false  // default true — must explicitly opt out
  const vendorRules: Array<{ regex: RegExp; toBusinessId: number }> = (opts.vendorRules || []).map(
    (r) => ({
      regex: r.vendorPattern instanceof RegExp ? r.vendorPattern : new RegExp(r.vendorPattern, 'i'),
      toBusinessId: r.toBusinessId,
    }),
  )

  const [docs, dexieCatsRaw] = await Promise.all([
    db.expenseDocuments.toArray(),
    db.categories.toArray(),
  ])
  // db.categories is typed via financeDB.Category which omits businessId, but
  // the runtime field is always present (added by categoryStore). Cast to the
  // canonical Category type from app/types/category for type-safe access.
  const dexieCats = dexieCatsRaw as unknown as Category[]
  // The category that the user picks in PartnerPaidImportModal comes from
  // `subjectStore` (localStorage key 'finance-categories'), NOT db.categories.
  // For #74's lookup we union both — subjectStore takes precedence because it's
  // the source of truth for what the user actually sees in the picker.
  const subjectCats = subjectStore.getAll()

  const catByName = new Map<string, Category>()
  for (const c of dexieCats) {
    if (c.name) catByName.set(c.name, c)
  }
  // subjectStore wins on collision — last write to the map wins.
  for (const c of subjectCats) {
    if (c.name) catByName.set(c.name, c)
  }

  // Partner-paid heuristic: no transactionId, paidByUid set. Matches the
  // SettlementSummary filter at app/components/business/SettlementSummary.tsx
  // (`!d.transactionId && !!d.paidByUid`).
  const partnerPaid = docs.filter((d) => !d.transactionId && !!d.paidByUid)

  const moves: PartnerPaidMigrationMove[] = []
  const skipped: PartnerPaidMigrationSkip[] = []
  let alreadyCorrect = 0

  for (const d of partnerPaid) {
    // Vendor-rule override takes precedence over category inference — lets the
    // caller hand-target docs the category map can't reach (e.g. category name
    // doesn't exist in the current Categories table because it was renamed/
    // deleted post-import, the #74 Meta Platforms case).
    const matchedRule = d.vendor
      ? vendorRules.find((r) => r.regex.test(d.vendor as string))
      : undefined
    if (matchedRule) {
      if (d.businessId === matchedRule.toBusinessId) {
        alreadyCorrect++
        continue
      }
      moves.push({
        docId: d.id!,
        vendor: d.vendor,
        category: d.category,
        fromBusinessId: d.businessId,
        toBusinessId: matchedRule.toBusinessId,
      })
      continue
    }
    if (!d.category) {
      skipped.push({
        docId: d.id!,
        vendor: d.vendor,
        category: d.category,
        currentBusinessId: d.businessId,
        reason: 'no category — cannot infer business',
      })
      continue
    }
    const cat = catByName.get(d.category)
    if (!cat) {
      skipped.push({
        docId: d.id!,
        vendor: d.vendor,
        category: d.category,
        currentBusinessId: d.businessId,
        reason: `category "${d.category}" not found in Categories table`,
      })
      continue
    }
    if (cat.businessId === undefined || cat.businessId === null) {
      skipped.push({
        docId: d.id!,
        vendor: d.vendor,
        category: d.category,
        currentBusinessId: d.businessId,
        reason: `category "${d.category}" has no businessId (household-scoped or shared)`,
      })
      continue
    }
    if (d.businessId === cat.businessId) {
      alreadyCorrect++
      continue
    }
    moves.push({
      docId: d.id!,
      vendor: d.vendor,
      category: d.category,
      fromBusinessId: d.businessId,
      toBusinessId: cat.businessId,
    })
  }

  if (!dryRun && moves.length > 0) {
    const nowIso = new Date().toISOString()
    for (const m of moves) {
      await db.expenseDocuments.update(m.docId, {
        businessId: m.toBusinessId,
        updatedAt: nowIso,
      })
    }
  }

  return {
    dryRun,
    totalPartnerPaid: partnerPaid.length,
    alreadyCorrect,
    moves,
    skipped,
  }
}
