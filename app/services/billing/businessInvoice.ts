import type { Business, Project, YpayDocument } from '@/app/db/financeDB'

/**
 * Whether a YPAY document belongs to a business (aglamazo#437): through one
 * of the business's projects (a project invoice), or through its own
 * `businessId` link (a student / calendar-billing invoice, which has no
 * project). One filter for InvoicesTab, IncomeTab and the partner sync —
 * a student invoice is listed exactly where a project invoice is.
 * Doc-type filtering stays with the caller.
 */
export function isBusinessInvoice(
  doc: Pick<YpayDocument, 'projectName' | 'businessId'>,
  businessSyncId: string,
  projectNames: ReadonlySet<string>,
): boolean {
  if (doc.projectName && projectNames.has(doc.projectName)) return true
  return !!businessSyncId && doc.businessId === businessSyncId
}

/**
 * Resolves the owner of a VAT document before looking at its customer/project
 * name. A YPAY document URL includes the issuing account id, while the
 * project name belongs to the customer and can be unmatched or stale.
 */
export function resolveVatIncomeOwner(
  doc: Pick<YpayDocument, 'businessId' | 'projectName' | 'url'>,
  businesses: readonly Business[],
  projects: readonly Project[],
): string | null | undefined {
  const ours = new Set(businesses.map(b => b.syncId).filter((id): id is string => !!id))
  if (doc.businessId) return ours.has(doc.businessId) ? doc.businessId : null
  const urlParts = decodeURIComponent(doc.url || '').split(/[^A-Za-z0-9_-]+/)
  const issuer = businesses.find(b => b.syncId && b.ypayClientId && urlParts.includes(b.ypayClientId))
  if (issuer?.syncId) return issuer.syncId
  if (!doc.projectName) return undefined
  const matches = projects.filter(p => p.name === doc.projectName)
  const own = matches.find(p => ours.has(p.businessId))
  return own?.businessId ?? (matches.length > 0 ? null : undefined)
}
