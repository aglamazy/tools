import { useEffect, useMemo, useState } from 'react'
import { db, type Business, type Project, type Transaction, type YpayDocument } from '@/app/db/financeDB'
import type { TaxProfile } from '@/app/components/TaxProfileSection'
import { turnoverExVat } from './TaxSelfEmployedSections'
import { computeInvoiceIncome, type InvoiceIncomeResult } from './invoiceIncome'

/**
 * aglamazo#485: the one income source for the taxes page's self-employed
 * table, forecast, BTL and income-tax sections. null until the ypay
 * documents are loaded, so no section renders a deposit-only figure first.
 */
export function useInvoiceIncome(params: {
  businesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<string, string[]>
  taxProfile?: TaxProfile
}): InvoiceIncomeResult | null {
  const { businesses, transactions, bizCategoryMap, taxProfile } = params
  const [loaded, setLoaded] = useState<{ docs: YpayDocument[]; projects: Project[] } | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const [docs, projects] = await Promise.all([db.ypayDocuments.toArray(), db.projects.toArray()])
      if (alive) setLoaded({ docs, projects })
    })()
    return () => { alive = false }
    // transactions: a sync that brings new bank rows usually brings their
    // receipts too — re-read so the two never disagree.
  }, [transactions])

  const result = useMemo(() => {
    if (!loaded) return null
    const businessSyncIds = businesses.map(b => b.syncId).filter((s): s is string => !!s)
    return computeInvoiceIncome({
      businessSyncIds,
      docs: loaded.docs,
      projects: loaded.projects,
      transactions,
      bizCategoryMap,
      depositNet: (t, gross) => turnoverExVat([{ ...t, amount: gross }], taxProfile),
    })
  }, [loaded, businesses, transactions, bizCategoryMap, taxProfile])

  useEffect(() => {
    if (result && result.unattributed.length > 0) {
      console.warn('[aglamazo#485] income documents with no business on this table:', result.unattributed.map(d => `${d.docType}:${d.serialNumber}`))
    }
  }, [result])

  return result
}
