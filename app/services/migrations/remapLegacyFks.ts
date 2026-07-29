/**
 * Pure FK remap: local-int foreign keys -> syncId (UUID) foreign keys.
 *
 * Root cause (2026-07-28): every FK field below was stored as a Dexie
 * auto-increment `number` pointing at another table's local `id`. That id
 * is NOT stable — it changes whenever the parent row is deleted+reinserted,
 * which cloud-sync merges do routinely. Only `syncId` (assigned once via
 * crypto.randomUUID()) survives that. The old per-merge remap machinery
 * (FK_RELATIONS in applyMergedBackupService.ts) tried to patch this over on
 * every sync and still broke in production. This function is the one-time
 * cutover: convert every FK field to hold the parent's syncId instead, so
 * there is nothing left to remap afterward.
 *
 * Pure and side-effect-free — operates on an in-memory `stores` object
 * (same shape as BackupData['stores']) so it's testable in isolation
 * (against a captured export) before it's ever run against a live Dexie
 * instance. The v34 schema upgrade adapts this same function to Dexie's
 * `trans.table()` API.
 */

export interface FkFieldSpec {
  childTable: string
  field: string
  parentTable: string
}

// Every scalar FK field being migrated. (ypayDocuments.transactionId and
// ypayDocuments.closesAllocations[].docId are handled separately below —
// see the special cases in remapLegacyFks.)
export const FK_FIELDS_TO_MIGRATE: FkFieldSpec[] = [
  { childTable: 'projects', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'harvestTasks', field: 'projectId', parentTable: 'projects' },
  { childTable: 'timeEntries', field: 'taskId', parentTable: 'harvestTasks' },
  { childTable: 'expenseDocuments', field: 'transactionId', parentTable: 'transactions' },
  { childTable: 'expenseDocuments', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'expenseDocuments', field: 'vatPaymentId', parentTable: 'vatPayments' },
  { childTable: 'ypayDocuments', field: 'vatPaymentId', parentTable: 'vatPayments' },
  { childTable: 'taxDocuments', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'advancePayments', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'businessTasks', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'categories', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'subjects', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'subjectClassifications', field: 'transactionId', parentTable: 'transactions' },
  { childTable: 'suppliers', field: 'businessId', parentTable: 'businesses' },
  // Not in SYNCED_DB_TABLES (cloud-merge can't corrupt them today) but same
  // fragility class against a local delete+reinsert — migrate for real
  // completeness, not because sync ever touched them.
  { childTable: 'students', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'profileQAs', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'scoutResults', field: 'businessId', parentTable: 'businesses' },
  { childTable: 'scoutConfigs', field: 'businessId', parentTable: 'businesses' },
]

// A specific, known historical (parentTable, old local id) -> syncId
// correction, for orphans the generic pass can't resolve because the old id
// no longer exists in the current data at all (so there's nothing to look
// up from). Used for the one-time AH-incident repair — see schemaVersions.ts
// v34's call site for the actual values.
export interface OrphanOverride {
  parentTable: string
  oldValue: number
  syncId: string
}

export interface RemapResult {
  stores: Record<string, any>
  warnings: string[]
}

export interface UnresolvedFkGroup {
  childTable: string
  field: string
  parentTable: string
  oldValue: number
  rowCount: number
  /** A few sample child rows (id + name/description-ish fields), to eyeball
   *  what this orphaned group actually is without dumping everything. */
  sampleRows: Array<{ id: unknown; hint: string }>
}

function describeRow(row: any): string {
  const bits = [row?.name, row?.description, row?.title, row?.serialNumber, row?.vendor].filter(Boolean)
  return bits.length > 0 ? String(bits[0]) : '(no name/description field)'
}

/**
 * Diagnostic, read-only: for every FK field in FK_FIELDS_TO_MIGRATE, find
 * (parentTable, oldValue) pairs that don't resolve against the CURRENT
 * businesses/parents in `stores` — i.e. exactly the values that would get
 * silently cleared to undefined by remapLegacyFks unless covered by an
 * OrphanOverride.
 *
 * Built specifically to replace hand-guessed OrphanOverride lists (which
 * caused a real bug: a guessed dead id that happened to already belong to a
 * live business again meant the guess silently never fired, and the actual
 * orphaned rows got cleared instead of repaired). Run this against a real
 * captured export FIRST, look at the grouped counts + sample rows, and only
 * THEN decide the correct override mapping — don't guess.
 */
export function findUnresolvedFks(stores: Record<string, any[]>): UnresolvedFkGroup[] {
  const results: UnresolvedFkGroup[] = []

  for (const spec of FK_FIELDS_TO_MIGRATE) {
    const rows = stores[spec.childTable]
    if (!Array.isArray(rows)) continue
    const lookup = buildSyncIdLookup(stores[spec.parentTable])

    const byOldValue = new Map<number, any[]>()
    for (const row of rows) {
      const oldValue = row[spec.field]
      if (oldValue == null || typeof oldValue === 'string') continue // already migrated or unset
      if (lookup.has(oldValue)) continue // resolves fine, not an orphan
      if (!byOldValue.has(oldValue)) byOldValue.set(oldValue, [])
      byOldValue.get(oldValue)!.push(row)
    }

    for (const [oldValue, groupRows] of byOldValue) {
      results.push({
        childTable: spec.childTable,
        field: spec.field,
        parentTable: spec.parentTable,
        oldValue,
        rowCount: groupRows.length,
        sampleRows: groupRows.slice(0, 5).map((r) => ({ id: r.id, hint: describeRow(r) })),
      })
    }
  }

  return results.sort((a, b) => b.rowCount - a.rowCount)
}

function buildSyncIdLookup(parentRows: any[] | undefined): Map<number, string> {
  const map = new Map<number, string>()
  if (!Array.isArray(parentRows)) return map
  for (const row of parentRows) {
    if (row?.id != null && row.syncId) map.set(row.id, row.syncId)
  }
  return map
}

export function remapLegacyFks(
  stores: Record<string, any[]>,
  orphanOverrides: OrphanOverride[] = [],
): RemapResult {
  const warnings: string[] = []

  const overridesByParent = new Map<string, Map<number, string>>()
  for (const o of orphanOverrides) {
    if (!overridesByParent.has(o.parentTable)) overridesByParent.set(o.parentTable, new Map())
    overridesByParent.get(o.parentTable)!.set(o.oldValue, o.syncId)
  }

  const lookupsByParent = new Map<string, Map<number, string>>()
  const lookupFor = (parentTable: string): Map<number, string> => {
    let lookup = lookupsByParent.get(parentTable)
    if (!lookup) {
      lookup = buildSyncIdLookup(stores[parentTable] || [])
      lookupsByParent.set(parentTable, lookup)
    }
    return lookup
  }

  // Deep-ish clone (one level of row objects) so callers can compare
  // before/after without the input being mutated in place. `stores` may also
  // carry non-array fields (e.g. legacy `subjectStore`/`timerStore` blobs) —
  // pass those through completely untouched, this function only ever
  // touches row arrays.
  const resultStores: Record<string, any> = {}
  for (const [table, rows] of Object.entries(stores)) {
    resultStores[table] = Array.isArray(rows) ? rows.map((r) => ({ ...r })) : rows
  }

  let orphanCount = 0

  // Generic scalar FK remap.
  for (const spec of FK_FIELDS_TO_MIGRATE) {
    const rows = resultStores[spec.childTable]
    if (!rows) continue
    const lookup = lookupFor(spec.parentTable)
    const overrides = overridesByParent.get(spec.parentTable)
    for (const row of rows) {
      const oldValue = row[spec.field]
      if (oldValue == null) continue
      if (typeof oldValue === 'string') continue // already migrated — idempotent
      const syncId = lookup.get(oldValue) ?? overrides?.get(oldValue)
      if (syncId) {
        row[spec.field] = syncId
      } else {
        row[spec.field] = undefined
        orphanCount++
        warnings.push(
          `[remapLegacyFks] ${spec.childTable}.${spec.field}: no ${spec.parentTable} found for local id ${oldValue} (row id ${row.id}) — cleared`,
        )
      }
    }
  }

  // ypayDocuments.transactionId is overloaded: a genuine numeric-string FK
  // (String(transaction.id)), OR one of two synthetic dedup keys
  // ("invoice:project:month", "invoice-items:serial") with no transaction
  // behind them at all. Only the numeric-string shape is a real FK; the
  // synthetic keys must pass through completely untouched (multiple
  // components parse them as strings — see InvoicesTab.tsx, TimingTab.tsx).
  const transactionLookup = lookupFor('transactions')
  const ypayRows = resultStores.ypayDocuments || []
  for (const row of ypayRows) {
    const val = row.transactionId
    if (typeof val === 'string' && /^\d+$/.test(val)) {
      const syncId = transactionLookup.get(Number(val))
      if (syncId) {
        row.transactionId = syncId
      } else {
        warnings.push(
          `[remapLegacyFks] ypayDocuments.transactionId: no transaction found for local id ${val} (row id ${row.id}) — left unresolved`,
        )
      }
    }
    // else: synthetic key or already-migrated syncId — untouched.
  }

  // ypayDocuments.closesAllocations[].docId is self-referential (a receipt
  // pointing at the invoice(s) it closes, same table). Row primary keys
  // (`id`) never change in this migration — only FK VALUES do — so the
  // ypayDocuments id->syncId lookup built above from the ORIGINAL rows stays
  // valid for this pass regardless of order.
  const ypayLookup = lookupFor('ypayDocuments')
  for (const row of ypayRows) {
    if (!Array.isArray(row.closesAllocations)) continue
    row.closesAllocations = row.closesAllocations.map((alloc: any) => {
      if (typeof alloc?.docId === 'string') return alloc // already migrated
      const syncId = ypayLookup.get(alloc?.docId)
      if (syncId) return { ...alloc, docId: syncId }
      warnings.push(
        `[remapLegacyFks] ypayDocuments.closesAllocations: no ypayDocument found for local id ${alloc?.docId} (parent row id ${row.id}) — left unresolved`,
      )
      return alloc
    })
  }

  if (orphanCount > 0) {
    warnings.push(`[remapLegacyFks] ${orphanCount} FK reference(s) could not be resolved and were cleared`)
  }

  return { stores: resultStores, warnings }
}
