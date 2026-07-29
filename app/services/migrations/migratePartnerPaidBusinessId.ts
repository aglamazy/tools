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
  fromBusinessId: string | undefined
  toBusinessId: string
}

export type PartnerPaidMigrationSkip = {
  docId: number
  vendor: string | undefined
  category: string | undefined
  currentBusinessId: string | undefined
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
  /** Target business syncId to move matching docs to */
  toBusinessId: string
}

type CategoryLookup = {
  category: Category
  source: 'subjectStore' | 'dexie'
}

export async function migratePartnerPaidBusinessId(
  opts: { dryRun?: boolean; vendorRules?: VendorRule[] } = {},
): Promise<PartnerPaidMigrationReport> {
  const dryRun = opts.dryRun !== false  // default true — must explicitly opt out
  const vendorRules: Array<{ regex: RegExp; toBusinessId: string }> = (opts.vendorRules || []).map(
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
  // `subjectStore` (Dexie `subjects` table), NOT the old fossil db.categories
  // table (dead since a one-time historical migration; nothing writes to it
  // anymore). For #74's lookup we union both stores, then resolve by businessId and
  // refuse ambiguous same-name matches so we do not move a doc to the wrong
  // business during a repair pass.
  const subjectCats = await subjectStore.getAll()

  const catCandidatesByName = new Map<string, CategoryLookup[]>()
  const addCandidate = (category: Category, source: CategoryLookup['source']) => {
    if (!category.name) return
    const list = catCandidatesByName.get(category.name) || []
    list.push({ category, source })
    catCandidatesByName.set(category.name, list)
  }
  for (const c of dexieCats) addCandidate(c, 'dexie')
  for (const c of subjectCats) addCandidate(c, 'subjectStore')

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
    const candidates = catCandidatesByName.get(d.category) || []
    if (candidates.length === 0) {
      skipped.push({
        docId: d.id!,
        vendor: d.vendor,
        category: d.category,
        currentBusinessId: d.businessId,
        reason: `category "${d.category}" not found in Categories table`,
      })
      continue
    }
    const businessScoped = candidates.filter((c) => c.category.businessId != null)
    const uniqueBusinessIds = [...new Set(businessScoped.map((c) => c.category.businessId))].filter(
      (id): id is string => id != null,
    )
    if (uniqueBusinessIds.length !== 1) {
      skipped.push({
        docId: d.id!,
        vendor: d.vendor,
        category: d.category,
        currentBusinessId: d.businessId,
        reason:
          uniqueBusinessIds.length === 0
            ? `category "${d.category}" has no businessId (household-scoped or shared)`
            : `category "${d.category}" is ambiguous across businesses: ${uniqueBusinessIds.join(', ')}`,
      })
      continue
    }
    const targetBusinessId = uniqueBusinessIds[0]
    if (d.businessId === targetBusinessId) {
      alreadyCorrect++
      continue
    }
    moves.push({
      docId: d.id!,
      vendor: d.vendor,
      category: d.category,
      fromBusinessId: d.businessId,
      toBusinessId: targetBusinessId,
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
