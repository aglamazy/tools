import { db, type Supplier } from '@/app/db/financeDB'

/** Case-insensitive exact match against a supplier's known bank/card description strings. */
export async function findSupplierByAlias(raw: string): Promise<Supplier | undefined> {
  const key = raw.trim().toLowerCase()
  if (!key) return undefined
  const suppliers = await db.suppliers.toArray()
  return suppliers.find((s) => s.bankCardAliases.some((a) => a.toLowerCase() === key))
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
  const map = new Map<string, string>()
  for (const s of suppliers) {
    for (const alias of s.bankCardAliases) {
      map.set(alias.trim().toLowerCase(), s.name)
    }
  }
  return map
}

/**
 * Rename a raw bank/card description's group to a new canonical display
 * name (aglamazo#342) — creates the alias's Supplier record if it doesn't
 * exist yet, then renames it. Never touches transaction.merchant itself;
 * this only changes how the raw value is DISPLAYED/GROUPED.
 */
export async function renameSupplierAlias(rawValue: string, newName: string): Promise<void> {
  const trimmedName = newName.trim()
  if (!trimmedName) return
  const supplier = await resolveOrCreateSupplier(rawValue)
  if (supplier.name !== trimmedName) {
    await db.suppliers.update(supplier.id!, { name: trimmedName, updatedAt: new Date().toISOString() })
  }
}
