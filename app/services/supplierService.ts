import { db, type Supplier } from '@/app/db/financeDB'

// aglamazo#478: when several records hold one alias (per-device seeding
// merged by sync), the one a person last renamed is the truth — a rename
// stamps updatedAt. Lookup and display both use this, so they never disagree.
const touchedAt = (s: Supplier) => s.updatedAt || s.createdAt || ''
const newer = (a: Supplier, b: Supplier) => (touchedAt(b) > touchedAt(a) ? b : a)

/** Case-insensitive exact match against a supplier's known bank/card description strings. */
export async function findSupplierByAlias(raw: string): Promise<Supplier | undefined> {
  const key = raw.trim().toLowerCase()
  if (!key) return undefined
  const suppliers = await db.suppliers.toArray()
  let found: Supplier | undefined
  for (const s of suppliers) {
    if (s.bankCardAliases.some((a) => a.trim().toLowerCase() === key)) found = found ? newer(found, s) : s
  }
  return found
}

/**
 * Case-insensitive substring match against a supplier's known email senders —
 * mirrors receiptMatchService.ts's isUrlOnlyInvoiceSender lenient check
 * (raw header string, no RFC5322 address parsing).
 */
export async function findSupplierByEmailSender(fromHeader: string): Promise<Supplier | undefined> {
  const lower = fromHeader.toLowerCase()
  if (!lower) return undefined
  const suppliers = await db.suppliers.toArray()
  return suppliers.find((s) => s.emailSenders.some((addr) => lower.includes(addr.toLowerCase())))
}

/** Learn a new sender for a known supplier — no-op if already present. */
export async function addEmailSenderToSupplier(supplierId: number, sender: string): Promise<void> {
  const trimmed = sender.trim()
  if (!trimmed) return
  const supplier = await db.suppliers.get(supplierId)
  if (!supplier) return
  if (supplier.emailSenders.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return
  await db.suppliers.update(supplierId, { emailSenders: [...supplier.emailSenders, trimmed] })
}

/** Find a supplier by alias, or create a bare new one if none exists yet. */
export async function resolveOrCreateSupplier(raw: string): Promise<Supplier> {
  const existing = await findSupplierByAlias(raw)
  if (existing) return existing

  const trimmed = raw.trim()
  const id = await db.suppliers.add({
    name: trimmed,
    bankCardAliases: [trimmed],
    emailSenders: [],
    createdAt: new Date().toISOString(),
  })
  const created = await db.suppliers.get(id)
  return created!
}

/** Resolve a raw bank/card description to its canonical Supplier.name, falling back to the raw string. */
export async function resolveSupplierDisplayName(raw: string): Promise<string> {
  const supplier = await findSupplierByAlias(raw)
  return supplier?.name ?? raw
}

/**
 * Load every known alias -> canonical-name mapping once, for synchronous
 * lookups inside a render loop (aglamazo#342) instead of an async DB read
 * per row.
 */
export async function buildSupplierAliasMap(): Promise<Map<string, string>> {
  const suppliers = await db.suppliers.toArray()
  const holder = new Map<string, Supplier>()
  for (const s of suppliers) {
    for (const alias of s.bankCardAliases) {
      // the same record findSupplierByAlias returns (aglamazo#478)
      const k = alias.trim().toLowerCase()
      const prev = holder.get(k)
      holder.set(k, prev ? newer(prev, s) : s)
    }
  }
  return new Map(Array.from(holder, ([k, s]) => [k, s.name]))
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Map<string, string>() // lowercased -> first-seen original casing
  for (const v of values) {
    const key = v.toLowerCase()
    if (!seen.has(key)) seen.set(key, v)
  }
  return [...seen.values()]
}

/**
 * Folds `from` into `to`: unions bankCardAliases + emailSenders (case-
 * insensitive dedupe) onto `to`, then deletes `from`. Suppliers carry no
 * foreign keys from other tables (transactions/documents resolve them by
 * alias-string lookup, not by id — see the `Supplier` interface comment),
 * so deleting `from` is safe: the next alias lookup for anything it used to
 * own now finds `to` instead. Returns the updated `to` record.
 */
async function mergeSuppliers(from: Supplier, to: Supplier): Promise<Supplier> {
  const mergedAliases = dedupeCaseInsensitive([...to.bankCardAliases, ...from.bankCardAliases])
  const mergedSenders = dedupeCaseInsensitive([...to.emailSenders, ...from.emailSenders])
  await db.suppliers.update(to.id!, {
    bankCardAliases: mergedAliases,
    emailSenders: mergedSenders,
    updatedAt: new Date().toISOString(),
  })
  await db.suppliers.delete(from.id!)
  return { ...to, bankCardAliases: mergedAliases, emailSenders: mergedSenders }
}

/**
 * Rename a raw bank/card description's group to a new canonical display
 * name (aglamazo#342) — creates the alias's Supplier record if it doesn't
 * exist yet, then renames it. Never touches transaction.merchant itself;
 * this only changes how the raw value is DISPLAYED/GROUPED.
 *
 * If another supplier already has that exact name, renaming would leave two
 * same-named records with different email senders/aliases — invisible
 * duplicates a lookup could pick either of (the Celcom bug, 2026-09-15).
 * Merge into the existing one instead of renaming past it.
 */
export async function renameSupplierAlias(rawValue: string, newName: string): Promise<void> {
  const trimmedName = newName.trim()
  if (!trimmedName) return
  const key = rawValue.trim().toLowerCase()
  if (!key) return

  // aglamazo#478: the same alias can sit on more than one record (508 in the
  // real store, from per-device seeding merged by sync). Renaming only the
  // first holder left the others showing the old name, so EVERY holder is
  // folded into one record here.
  const suppliers = await db.suppliers.toArray()
  const holders = suppliers.filter((s) => s.bankCardAliases.some((a) => a.trim().toLowerCase() === key))
  if (holders.length === 0) holders.push(await resolveOrCreateSupplier(rawValue))

  const named = suppliers.find((s) => s.name.toLowerCase() === trimmedName.toLowerCase())
    ?? holders.find((s) => s.name.toLowerCase() === trimmedName.toLowerCase())
  let target = named ?? holders[0]
  for (const h of holders) {
    if (h.id === target.id) continue
    target = await mergeSuppliers(h, target)
  }
  if (target.name !== trimmedName && !named) {
    await db.suppliers.update(target.id!, { name: trimmedName, updatedAt: new Date().toISOString() })
  }
}

/**
 * Explicit "bind this transaction's vendor to an existing supplier" action
 * (Agla, 2026-09-15) — for when a transaction resolved to a bare, sender-
 * less Supplier record (e.g. "סלקום") that's really the same vendor as an
 * existing one with a working email sender (e.g. "סלקום ישראל בע"מ").
 * Framed in the UI as binding the transaction, not "merging profiles" —
 * under the hood it's the same fold as renameSupplierAlias's collision case.
 */
export async function bindSupplierToExisting(sourceSupplierId: number, targetSupplierId: number): Promise<Supplier> {
  if (sourceSupplierId === targetSupplierId) throw new Error('Cannot bind a supplier to itself')
  const [source, target] = await Promise.all([
    db.suppliers.get(sourceSupplierId),
    db.suppliers.get(targetSupplierId),
  ])
  if (!source) throw new Error(`Supplier ${sourceSupplierId} not found`)
  if (!target) throw new Error(`Supplier ${targetSupplierId} not found`)
  return mergeSuppliers(source, target)
}
