import * as XLSX from 'xlsx'
import type { VatType } from '@/app/lib/vat'

// Export of the settlement tab (SettlementSummary) to a shareable XLSX — the
// document Agla sends his partner. Mirrors exactly what the UI shows: the
// summary table (VAT-cleaned amounts), the net-business line, the who-owes-whom
// settlement line, and the full transaction list. Lives outside
// SettlementSummary.tsx to keep that file under the 850-line cap.

export type SettlementExportSummaryRow = {
  label: string
  isOwner: boolean
  sharePercent: number
  vatType: VatType | undefined
  paid: number
  received: number
  settlementPaid: number
  settlementReceived: number
  fairShare: number
  balance: number
}

export type SettlementExportTxRow = {
  date: string
  typeLabel: string
  description: string
  category: string
  amount: number
  attribution: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

function vatLabel(vatType: VatType | undefined): string {
  return vatType === 'authorized' ? 'עוסק מורשה' : vatType === 'exempt' ? 'עוסק פטור' : '—'
}

export function exportSettlementToExcel(opts: {
  businessName: string
  rows: SettlementExportSummaryRow[]
  netBusiness: number
  settlementText: string | null
  txRows: SettlementExportTxRow[]
}) {
  const { businessName, rows, netBusiness, settlementText, txRows } = opts
  const today = new Date()
  const dateStr = today.toLocaleDateString('he-IL')
  const isoDate = today.toISOString().slice(0, 10)

  // --- Sheet 1: settlement summary ---
  const summaryData: Array<Array<string | number>> = []
  summaryData.push([`התחשבנות שותפים — ${businessName}`])
  summaryData.push([`נכון לתאריך ${dateStr}`])
  summaryData.push(['חישוב נטו (ללא מע״מ) עבור שותפים מסוג עוסק מורשה. עוסק פטור — סכום ברוטו.'])
  summaryData.push([])
  summaryData.push(['שותף', 'אחוז', 'סטטוס מע״מ', 'שילם', 'קיבל', 'שילם (קיזוז)', 'קיבל (קיזוז)', 'חלקו ההוגן', 'מאזן'])
  for (const r of rows) {
    summaryData.push([
      r.isOwner ? `${r.label} (בעלים)` : r.label,
      `${r.sharePercent}%`,
      vatLabel(r.vatType),
      round2(r.paid),
      round2(r.received),
      round2(r.settlementPaid),
      round2(r.settlementReceived),
      round2(r.fairShare),
      round2(r.balance),
    ])
  }
  summaryData.push([
    'סה״כ', '', '',
    round2(rows.reduce((s, r) => s + r.paid, 0)),
    round2(rows.reduce((s, r) => s + r.received, 0)),
    round2(rows.reduce((s, r) => s + r.settlementPaid, 0)),
    round2(rows.reduce((s, r) => s + r.settlementReceived, 0)),
    round2(rows.reduce((s, r) => s + r.fairShare, 0)),
    round2(rows.reduce((s, r) => s + r.balance, 0)),
  ])
  summaryData.push([])
  summaryData.push(['נטו עסקי (קיבל − שילם, ללא קיזוז):', round2(netBusiness)])
  if (settlementText) {
    summaryData.push([])
    summaryData.push([settlementText])
  }

  const wb = XLSX.utils.book_new()
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!views'] = [{ rightToLeft: true }]
  wsSummary['!cols'] = [
    { wch: 22 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
  ]
  wsSummary['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
  ]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'התחשבנות')

  // --- Sheet 2: transaction list ---
  const txData: Array<Array<string | number>> = []
  txData.push(['תאריך', 'סוג', 'תיאור', 'קטגוריה', 'סכום', 'שיוך'])
  for (const t of txRows) {
    txData.push([t.date, t.typeLabel, t.description, t.category, round2(t.amount), t.attribution])
  }
  const wsTx = XLSX.utils.aoa_to_sheet(txData)
  wsTx['!views'] = [{ rightToLeft: true }]
  wsTx['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 35 }, { wch: 20 }, { wch: 12 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, wsTx, 'תנועות')

  XLSX.writeFile(wb, `התחשבנות_${businessName}_${isoDate}.xlsx`)
}
