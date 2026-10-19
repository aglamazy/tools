import type { YpayDocument } from '@/app/db/financeDB'

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
