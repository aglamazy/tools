'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Transaction, type Business, type ExpenseDocument } from '@/app/db/financeDB'
import { businessStore } from '@/app/stores/businessStore'
import { subjectStore } from '@/app/stores/subjectStore'
import { partnerStore, type Partner as Participant } from '@/app/stores/partnerStore'
import type { BusinessAccessGrant } from '@/app/services/businessShareService'
import { appSettingsStore, type AccountOwners } from '@/app/stores/appSettingsStore'
import { getTaxProfile, vatTypeForDate, type TaxProfile } from '@/app/components/TaxProfileSection'
import { VAT_RATE_AUTHORIZED_DEALER, type VatType } from '@/app/lib/vat'
import { getTransactionAttributedUid } from '@/app/utils/transactionAttribution'
import { parseDateMs } from '@/app/utils/parsers/shared'
import type { Category } from '@/app/types/category'
import DocumentViewModal from '@/app/components/DocumentViewModal'

type SettlementSummaryProps = {
  businessId: string
}

type DrillDownKind = 'paid' | 'received' | 'settlementPaid' | 'settlementReceived'

type Row = {
  uid: string
  label: string
  sharePercent: number
  paid: number // regular business expenses only — settlement transfers shown separately
  received: number // regular business income only — settlement transfers shown separately
  settlementPaid: number // קיזוז/transfer categories this partner personally paid
  settlementReceived: number // amount credited via another partner's transfer-to-them
  netActual: number
  fairShare: number
  balance: number
  vatType: VatType | undefined
}

function netOfVat(gross: number, vatType: VatType | undefined): number {
  return vatType === 'authorized' ? gross / (1 + VAT_RATE_AUTHORIZED_DEALER) : gross
}

export default function SettlementSummary({ businessId }: SettlementSummaryProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  // Partner-paid invoices for this business (no bank tx, paidByUid set) —
  // imported via the Expenses-tab modal. Counted as expenses in the splid
  // math here so settlement reflects Nadar's out-of-band invoice payments.
  const [partnerPaidDocs, setPartnerPaidDocs] = useState<ExpenseDocument[]>([])
  // Synchronously pre-populate from localStorage (#L) so the "2+ partners"
  // empty state doesn't flash while the Business loads from Dexie. First
  // visit to this business returns [] and is filled by the subscribe/refresh
  // flow below.
  const [participants, setParticipants] = useState<Participant[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCached(businessId) : []
  )
  const [shares, setShares] = useState<BusinessAccessGrant[]>([])
  // Full profile (not just the current vatType) — the owner's VAT status can
  // change mid-year (vatConversion.effectiveDate), so per-transaction VAT
  // cleaning needs the whole record, not a single snapshot value.
  const [ownerTaxProfile, setOwnerTaxProfile] = useState<TaxProfile>({})
  const [accountOwners, setAccountOwners] = useState<AccountOwners>({})
  const [loading, setLoading] = useState(true)
  const [savingTxId, setSavingTxId] = useState<number | null>(null)
  // Drill-down: click a paid/received number in the summary table to filter
  // "רשימת תנועות" below to exactly the transactions that make up that number.
  const [drillDown, setDrillDown] = useState<{ uid: string; label: string; kind: DrillDownKind } | null>(null)
  const [viewDoc, setViewDoc] = useState<ExpenseDocument | null>(null)
  const [allCategories, setAllCategories] = useState<Category[]>([])

  const reloadTransactions = async () => {
    const cats = (await subjectStore.getAll()).filter(
      (c: Category) => (c.type === 'income' || c.type === 'expense') && c.businessId === businessId
    )
    const catNames = new Set(cats.map(c => c.name))
    if (catNames.size === 0) { setTransactions([]); return }
    const all = await db.transactions.toArray()
    setTransactions(all.filter(t => t.category && catNames.has(t.category)))
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const b = await businessStore.getBySyncId(businessId)
      if (cancelled) return
      setBusiness(b || null)
      if (!b) { setLoading(false); return }

      let profile = await getTaxProfile(b.userId)
      // Sharee devices don't have the owner's taxProfile appSettings row (it's
      // personal tax data, deliberately outside the shared-business scope), so
      // this comes back empty and every amount below would stay GROSS —
      // silently producing a different balance than the owner sees for the
      // same data. The scoped backup carries a two-field VAT subset instead;
      // fall back to it. (#302, found 2026-07-29 on the y25131 partner device.)
      if (!profile.vatType && !profile.vatConversion && b.syncId) {
        const shared = await db.appSettings.where('key').equals(`sharedVatProfile:${b.syncId}`).first()
        if (shared?.value) profile = shared.value as TaxProfile
      }
      if (cancelled) return
      setOwnerTaxProfile(profile)

      const owners = await appSettingsStore.getAccountOwners()
      if (cancelled) return
      setAccountOwners(owners)

      // Income + expense category names mapped to this business
      const allCats = await subjectStore.getAll()
      if (cancelled) return
      setAllCategories(allCats)
      const cats = allCats.filter(
        (c: Category) => (c.type === 'income' || c.type === 'expense') && c.businessId === businessId
      )
      const catNames = new Set(cats.map(c => c.name))
      if (catNames.size === 0) { setTransactions([]); setLoading(false); return }

      const all = await db.transactions.toArray()
      if (cancelled) return
      setTransactions(all.filter(t => t.category && catNames.has(t.category)))

      // Load partner-paid expense docs for this business.
      const docs = await db.expenseDocuments
        .filter((d) => d.businessId === businessId && !d.transactionId && !!d.paidByUid)
        .toArray()
      if (cancelled) return
      setPartnerPaidDocs(docs)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [businessId])

  useEffect(() => {
    if (!business) return
    const syncId = business.syncId
    // Record the businessId↔syncId pairing so the next mount can resolve
    // synchronously (covers the cold-start latency Agla flagged).
    partnerStore.recordBusiness(business.id, syncId)
    setParticipants(partnerStore.getCached(syncId))
    setShares(partnerStore.getCachedShares(syncId))
    const unsub = partnerStore.subscribe(() => {
      setParticipants(partnerStore.getCached(syncId))
      setShares(partnerStore.getCachedShares(syncId))
    })
    void partnerStore.refresh(syncId)
    return unsub
  }, [business?.id, business?.syncId])

  const incomeCatNames = useMemo(() => {
    return new Set(
      allCategories
        .filter((c: Category) => c.type === 'income' && c.businessId === businessId)
        .map(c => c.name)
    )
  }, [allCategories, businessId])

  // Categories flagged "קיזוז שותפים בלבד" — still count toward settlement
  // (paid/received) but aren't real business expenses, so the per-row list
  // labels them distinctly instead of the misleading "הוצאה" badge. Mapped by
  // name (not just a name Set) so `settlementPartnerUid` — the transfer
  // recipient — can drive a symmetric "received" credit: the payer keeps
  // their normal paid attribution, the designated partner additionally gets
  // credited on received for the same amount.
  const settlementCategoryByName = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of allCategories) {
      if (c.type === 'expense' && c.businessId === businessId && c.excludeFromBusinessTotals) {
        map.set(c.name, c)
      }
    }
    return map
  }, [allCategories, businessId])
  const settlementOnlyCatNames = useMemo(
    () => new Set(settlementCategoryByName.keys()),
    [settlementCategoryByName]
  )

  // Partner-uid resolution shared by `rows` (the summary math) and the
  // drill-down filter below — both MUST use the identical collapse logic so
  // a click on a summary number filters to exactly the transactions that
  // contributed to it.
  const partnerResolution = useMemo(() => {
    if (!business || !business.userId) return null
    const ownerUid: string = business.userId
    // Partners of THIS business = owner + active sharees only. Household-only
    // members (e.g., a spouse who isn't a sharee here) aren't partners — their
    // attributed txs collapse to the owner side.
    const shareeUids = shares
      .map(s => s.uid)
      .filter((u): u is string => typeof u === 'string')
    // Also count participants who carry a sharePercent — that's how sibling
    // partners (e.g. Nadar from y25131's perspective) reach the partner set
    // even though their grant isn't in the sharee's grantsToMe view. The
    // partnerStore enriches partners with email-resolved uids; without this
    // line they'd be visible in `participants` but excluded from the
    // settlement table.
    const partnerSharedUids = participants
      .filter(p => p.uid && p.sharePercent !== undefined)
      .map(p => p.uid)
    const partnerUids = new Set<string>([ownerUid, ...shareeUids, ...partnerSharedUids])
    const toPartnerUid = (uid: string | undefined): string => {
      if (uid && partnerUids.has(uid)) return uid
      return ownerUid
    }
    return { ownerUid, partnerUids, toPartnerUid }
  }, [business, shares, participants])

  const rows = useMemo<Row[]>(() => {
    if (!business || !business.userId || participants.length === 0 || !partnerResolution) return []

    const { ownerUid, partnerUids, toPartnerUid } = partnerResolution
    const partnerParticipants = participants.filter(p => partnerUids.has(p.uid))
    if (partnerParticipants.length === 0) return []

    // Effective share %: owner uses business.ownerSharePercent (or remainder),
    // sharees use their sharePercent.
    const shareeShareSum = partnerParticipants
      .filter(p => p.uid !== ownerUid)
      .reduce((s, p) => s + (p.sharePercent ?? 0), 0)
    const ownerShare = business.ownerSharePercent ?? Math.max(0, 100 - shareeShareSum)

    // VAT-clean: owner's status can change mid-year (vatConversion on file) —
    // a transaction predating the conversion must use the OLD status, not
    // whatever the owner is today, so this is date-aware rather than a single
    // snapshot value. Sharees default to 'exempt' until per-partner VAT
    // plumbing is added (TODO: extend partnerStore to surface vatType).
    const vatTypeAt = (uid: string, date: string): VatType | undefined =>
      uid === ownerUid ? vatTypeForDate(ownerTaxProfile, date) : 'exempt'
    // Current status only — for the summary table's "סטטוס מע״מ" badge, not money math.
    const currentVatTypeOf = (uid: string): VatType | undefined =>
      uid === ownerUid ? ownerTaxProfile.vatType : 'exempt'

    return partnerParticipants.map(p => {
      const isOwner = p.uid === ownerUid
      const sharePercent = isOwner ? ownerShare : (p.sharePercent ?? 0)
      const vatType = currentVatTypeOf(p.uid)

      // Attribution: paidByUid → card/bank owner → owner-fallback. Then collapse
      // any non-partner uid (e.g., household-only member) to the owner.
      // Settlement/transfer categories are tracked separately from regular
      // business paid/received (own columns in the table) — the payer's
      // settlementPaid and the recipient's settlementReceived are symmetric
      // (same amount on both sides), so they don't skew the fair-share pool.
      let paid = 0
      let received = 0
      let settlementPaid = 0
      let settlementReceived = 0
      for (const t of transactions) {
        const attributedUid = getTransactionAttributedUid(t, accountOwners, ownerUid)
        const partnerUid = toPartnerUid(attributedUid)
        const gross = Math.abs(t.amount)
        const isIncome = incomeCatNames.has(t.category ?? '')
        const settlementCat = !isIncome ? settlementCategoryByName.get(t.category ?? '') : undefined
        const txVatType = vatTypeAt(p.uid, t.date)
        // Settlement transfers aren't a taxable event — use the raw amount,
        // not VAT-cleaned, so both sides of the transfer show the same
        // number regardless of either partner's own VAT status.
        if (partnerUid === p.uid) {
          if (isIncome) received += netOfVat(gross, txVatType)
          else if (settlementCat) settlementPaid += gross
          else paid += netOfVat(gross, txVatType)
        }
        if (settlementCat?.settlementPartnerUid && toPartnerUid(settlementCat.settlementPartnerUid) === p.uid) {
          settlementReceived += gross
        }
      }

      // Partner-paid invoices (no bank tx) always count as expense, attributed
      // by paidByUid directly. VAT-cleaned with the date-aware vatType.
      for (const d of partnerPaidDocs) {
        const partnerUid = toPartnerUid(d.paidByUid)
        if (partnerUid !== p.uid) continue
        const gross = Math.abs(d.amount ?? 0)
        paid += netOfVat(gross, vatTypeAt(p.uid, d.date || ''))
      }

      return { uid: p.uid, label: p.label, sharePercent, paid, received, settlementPaid, settlementReceived,
               netActual: (received + settlementReceived) - (paid + settlementPaid), fairShare: 0, balance: 0, vatType }
    }).map((r, _, arr) => {
      // Fair share is computed against the sum of partners' VAT-cleaned net flows.
      const totalNet = arr.reduce((s, x) => s + x.netActual, 0)
      const fairShare = totalNet * (r.sharePercent / 100)
      return { ...r, fairShare, balance: r.netActual - fairShare }
    })
  }, [business, participants, partnerResolution, transactions, partnerPaidDocs, ownerTaxProfile, incomeCatNames, accountOwners, settlementCategoryByName])

  const settlementLine = useMemo(() => {
    if (rows.length < 2) return null
    // balance > 0 = received cash beyond fair share = debtor (owes others).
    // balance < 0 = received less than fair share = creditor (is owed).
    const sorted = [...rows].sort((a, b) => b.balance - a.balance)
    const debtor = sorted[0]
    const creditor = sorted[sorted.length - 1]
    const amount = Math.min(Math.abs(creditor.balance), debtor.balance)
    if (amount < 1) return { text: 'אין יתרה פתוחה בין השותפים', amount: 0 }
    return {
      text: `${debtor.label} חייב ל${creditor.label}`,
      amount: Math.round(amount),
    }
  }, [rows])

  const handleAttributionChange = async (t: Transaction, value: string) => {
    if (t.id == null) return
    try {
      setSavingTxId(t.id)
      // value === '' → "אוטומטי" (clear paidByUid). Dexie v4 update with `undefined`
      // deletes the property from the stored object.
      const updates: Partial<Transaction> = {
        paidByUid: value === '' ? undefined : value,
        updatedAt: new Date().toISOString(),
      }
      await db.transactions.update(t.id, updates)
      await reloadTransactions()
    } finally {
      setSavingTxId(null)
    }
  }

  if (loading) return <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>טוען...</p>
  if (!business) return <p style={{ color: '#dc2626', textAlign: 'center' }}>עסק לא נמצא</p>
  if (participants.length < 2) {
    return (
      <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>
        התחשבנות זמינה כשיש שני שותפים או יותר. הוסף שותף בלשונית ההגדרות.
      </p>
    )
  }
  const noActivity = rows.every(r => r.paid === 0 && r.received === 0) && transactions.length === 0

  const ownerUid = business.userId
  const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`

  // Render-scope partnerUids — same derivation as inside `rows` useMemo, used
  // by the per-row list to compute VAT-clean amounts per row.
  const renderShareeUids = shares
    .map(s => s.uid)
    .filter((u): u is string => typeof u === 'string')
  const renderPartnerUids = new Set<string>(ownerUid ? [ownerUid, ...renderShareeUids] : renderShareeUids)
  const vatTypeForTx = (resolvedUid: string | undefined, date: string): VatType | undefined => {
    const partnerUid = resolvedUid && renderPartnerUids.has(resolvedUid) ? resolvedUid : ownerUid
    return partnerUid === ownerUid ? vatTypeForDate(ownerTaxProfile, date) : 'exempt'
  }

  // Merge bank txs + partner-paid invoices into one display list, sorted by
  // date descending — newest first. Discriminator `kind` lets the renderer
  // treat them differently (partner-paid skips the auto-attribution select
  // since paidByUid is the canonical field). parseDateMs tolerates both the
  // canonical YYYY-MM-DD and legacy DD/MM/YYYY transaction date formats.
  type DisplayRow =
    | { kind: 'tx'; date: string; tx: Transaction }
    | { kind: 'doc'; date: string; doc: ExpenseDocument }
  const displayRows: DisplayRow[] = [
    ...transactions.map((t) => ({ kind: 'tx' as const, date: t.date, tx: t })),
    ...partnerPaidDocs.map((d) => ({ kind: 'doc' as const, date: d.date || '', doc: d })),
  ].sort((a, b) => parseDateMs(b.date) - parseDateMs(a.date))
  const sortedTransactions = displayRows.filter((r): r is Extract<DisplayRow, { kind: 'tx' }> => r.kind === 'tx').map((r) => r.tx)

  // Drill-down filter — same collapse logic (toPartnerUid) as the summary
  // math, so the filtered list matches exactly what contributed to the
  // clicked number, not just a resemblance.
  const toPartnerUid = partnerResolution?.toPartnerUid ?? ((uid?: string) => uid ?? ownerUid ?? '')
  const visibleRows = !drillDown ? displayRows : displayRows.filter((row) => {
    if (row.kind === 'doc') {
      if (drillDown.kind !== 'paid') return false // partner-paid docs are always a regular expense
      return toPartnerUid(row.doc.paidByUid) === drillDown.uid
    }
    const isIncome = incomeCatNames.has(row.tx.category ?? '')
    const settlementCat = !isIncome ? settlementCategoryByName.get(row.tx.category ?? '') : undefined
    if (drillDown.kind === 'settlementReceived') {
      return !!settlementCat?.settlementPartnerUid && toPartnerUid(settlementCat.settlementPartnerUid) === drillDown.uid
    }
    const attributedUid = getTransactionAttributedUid(row.tx, accountOwners, ownerUid)
    const partnerUid = toPartnerUid(attributedUid)
    if (partnerUid !== drillDown.uid) return false
    if (drillDown.kind === 'received') return isIncome
    if (drillDown.kind === 'settlementPaid') return !!settlementCat
    return !isIncome && !settlementCat // 'paid'
  })

  return (
    <div style={{ padding: '1rem 0' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>
        סיכום תנועות
      </h3>
      <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#475569' }}>
        חישוב נטו (ללא מע״מ) עבור שותפים מסוג עוסק מורשה. עוסק פטור — סכום ברוטו.
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#0f172a' }}>
            <th style={{ textAlign: 'right', padding: '0.6rem 0.5rem' }}>שותף</th>
            <th style={{ textAlign: 'right', padding: '0.6rem 0.5rem' }}>אחוז</th>
            <th style={{ textAlign: 'right', padding: '0.6rem 0.5rem' }}>סטטוס מע״מ</th>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem' }}>שילם</th>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem' }}>קיבל</th>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', color: '#6d28d9' }}>שילם (קיזוז)</th>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem', color: '#6d28d9' }}>קיבל (קיזוז)</th>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem' }}>חלקו ההוגן</th>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem' }}>מאזן</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const cell = (kind: DrillDownKind, amount: number, color?: string) => (
              <td
                onClick={() => setDrillDown(prev =>
                  prev?.uid === r.uid && prev?.kind === kind ? null : { uid: r.uid, label: r.label, kind }
                )}
                title="לחץ לסינון התנועות שמרכיבות סכום זה"
                style={{
                  padding: '0.6rem 0.5rem', textAlign: 'left', cursor: 'pointer', color,
                  textDecoration: 'underline', textDecorationStyle: 'dotted',
                  background: drillDown?.uid === r.uid && drillDown?.kind === kind ? '#eff6ff' : undefined,
                }}
              >
                {fmt(amount)}
              </td>
            )
            return (
              <tr key={r.uid} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.6rem 0.5rem' }}>
                  {r.label}{r.uid === ownerUid && <span style={{ marginRight: '0.4rem', fontSize: '0.75rem', color: '#94a3b8' }}>(בעלים)</span>}
                </td>
                <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{r.sharePercent}%</td>
                <td style={{ padding: '0.6rem 0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                  {r.vatType === 'authorized' ? 'עוסק מורשה' : r.vatType === 'exempt' ? 'עוסק פטור' : '—'}
                </td>
                {cell('paid', r.paid)}
                {cell('received', r.received)}
                {cell('settlementPaid', r.settlementPaid, '#6d28d9')}
                {cell('settlementReceived', r.settlementReceived, '#6d28d9')}
                <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b' }}>{fmt(r.fairShare)}</td>
                <td style={{
                  padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 600,
                  color: r.balance > 0 ? '#dc2626' : r.balance < 0 ? '#16a34a' : '#64748b',
                }}>
                  {r.balance > 0 ? '+' : ''}{fmt(r.balance)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', fontWeight: 600 }}>
            <td style={{ padding: '0.6rem 0.5rem' }}>סה״כ</td>
            <td style={{ padding: '0.6rem 0.5rem' }} />
            <td style={{ padding: '0.6rem 0.5rem' }} />
            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>{fmt(rows.reduce((s, r) => s + r.paid, 0))}</td>
            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>{fmt(rows.reduce((s, r) => s + r.received, 0))}</td>
            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#6d28d9' }}>{fmt(rows.reduce((s, r) => s + r.settlementPaid, 0))}</td>
            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#6d28d9' }}>{fmt(rows.reduce((s, r) => s + r.settlementReceived, 0))}</td>
            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b' }}>
              {fmt(rows.reduce((s, r) => s + r.fairShare, 0))}
            </td>
            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>{fmt(rows.reduce((s, r) => s + r.balance, 0))}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
        נטו עסקי (קיבל − שילם, ללא קיזוז): {fmt(rows.reduce((s, r) => s + (r.received - r.paid), 0))} —
        זהו הסכום המתחלק בין השותפים לפי "חלקו ההוגן" (סה״כ העמודה = הנטו העסקי).
      </div>

      {settlementLine && (
        <div style={{
          marginTop: '1.5rem', padding: '1rem 1.25rem',
          background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '0.5rem',
          fontSize: '0.95rem', textAlign: 'center', color: '#78350f',
        }}>
          {settlementLine.amount > 0
            ? <><strong>{settlementLine.text}</strong> סך <strong>{fmt(settlementLine.amount)}</strong></>
            : settlementLine.text}
        </div>
      )}

      {/* Per-row list — every income + expense tx with inline partner-picker */}
      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
            רשימת תנועות
          </h3>
          {drillDown && (
            <>
              <span style={{
                fontSize: '0.8rem', color: '#1d4ed8', background: '#eff6ff',
                border: '1px solid #bfdbfe', borderRadius: '0.25rem', padding: '0.15rem 0.5rem',
              }}>
                מסונן: {drillDown.label} · {
                  drillDown.kind === 'paid' ? 'שילם'
                  : drillDown.kind === 'received' ? 'קיבל'
                  : drillDown.kind === 'settlementPaid' ? 'שילם (קיזוז)'
                  : 'קיבל (קיזוז)'
                }
              </span>
              <button
                onClick={() => setDrillDown(null)}
                style={{
                  fontSize: '0.8rem', color: '#64748b', background: 'none',
                  border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0,
                }}
              >
                נקה סינון
              </button>
            </>
          )}
        </div>
        {noActivity || visibleRows.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem', padding: '1rem 0' }}>
            {drillDown ? 'אין תנועות התואמות את הסינון.' : 'אין תנועות לעסק זה.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#0f172a' }}>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem', whiteSpace: 'nowrap' }}>תאריך</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem' }}>סוג</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem' }}>תיאור</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.5rem', whiteSpace: 'nowrap' }}>סכום</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem' }}>שיוך</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.5rem' }}>שנה ידנית</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                if (row.kind === 'doc') {
                  const d = row.doc
                  const resolvedUid = d.paidByUid
                  const resolvedLabel = resolvedUid
                    ? participants.find((p) => p.uid === resolvedUid)?.label ?? '—'
                    : '—'
                  const vatType = vatTypeForTx(resolvedUid, d.date || '')
                  const amount = netOfVat(Math.abs(d.amount ?? 0), vatType)
                  return (
                    <tr key={`pp-${d.id}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#fffbeb' }}>
                      <td style={{ padding: '0.5rem 0.5rem', color: '#475569', whiteSpace: 'nowrap' }}>{d.date || '—'}</td>
                      <td style={{ padding: '0.5rem 0.5rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          fontSize: '0.7rem',
                          borderRadius: '0.25rem',
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                        }}>
                          הוצאה
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.5rem', color: '#0f172a' }}>
                        {(d.driveWebViewLink || d.externalUrl) ? (
                          <button
                            type="button"
                            onClick={() => setViewDoc(d)}
                            title="הצג מסמך"
                            style={{
                              background: 'none', border: 'none', padding: 0, margin: 0,
                              color: '#2563eb', cursor: 'pointer', font: 'inherit', textAlign: 'right',
                              textDecoration: 'underline', textDecorationStyle: 'dotted',
                            }}
                          >
                            {d.vendor || d.fileName}
                          </button>
                        ) : (
                          <div>{d.vendor || d.fileName}</div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: '#92400e' }}>
                          🧾 חשבונית ששולמה ע״י שותף
                        </div>
                      </td>
                      <td style={{ padding: '0.5rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 500, color: '#dc2626' }}>
                        {fmt(amount)}
                      </td>
                      <td style={{ padding: '0.5rem 0.5rem', color: '#475569' }}>
                        {resolvedLabel}
                      </td>
                      <td style={{ padding: '0.5rem 0.5rem', color: '#94a3b8', fontSize: '0.75rem' }}>—</td>
                    </tr>
                  )
                }
                const t = row.tx
                const isIncome = incomeCatNames.has(t.category ?? '')
                const isSettlementOnly = !isIncome && settlementOnlyCatNames.has(t.category ?? '')
                const resolvedUid = getTransactionAttributedUid(t, accountOwners, ownerUid)
                const resolvedLabel = resolvedUid
                  ? participants.find(p => p.uid === resolvedUid)?.label ?? '—'
                  : '—'
                const transferToUid = isSettlementOnly
                  ? settlementCategoryByName.get(t.category ?? '')?.settlementPartnerUid
                  : undefined
                const transferToLabel = transferToUid
                  ? participants.find(p => p.uid === transferToUid)?.label ?? '—'
                  : undefined
                const isAuto = !t.paidByUid
                const selectValue = t.paidByUid ?? ''
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.5rem 0.5rem', color: '#475569', whiteSpace: 'nowrap' }}>{t.date}</td>
                    <td style={{ padding: '0.5rem 0.5rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.5rem',
                        fontSize: '0.7rem',
                        borderRadius: '0.25rem',
                        background: isSettlementOnly ? '#f5f3ff' : isIncome ? '#f0fdf4' : '#fef2f2',
                        color: isSettlementOnly ? '#6d28d9' : isIncome ? '#16a34a' : '#dc2626',
                        border: `1px solid ${isSettlementOnly ? '#ddd6fe' : isIncome ? '#bbf7d0' : '#fecaca'}`,
                      }}>
                        {isSettlementOnly ? 'קיזוז' : isIncome ? 'הכנסה' : 'הוצאה'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem', color: '#0f172a' }}>
                      <div>{t.description}</div>
                      {t.category && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{t.category}</div>
                      )}
                      {transferToLabel && (
                        <div style={{ fontSize: '0.7rem', color: '#6d28d9' }}>↪ שולם ל{transferToLabel}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 500, color: isIncome ? '#16a34a' : '#dc2626' }}>
                      {isSettlementOnly ? fmt(Math.abs(t.amount)) : fmt(netOfVat(Math.abs(t.amount), vatTypeForTx(resolvedUid, t.date)))}
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem', color: '#475569' }}>
                      {resolvedLabel}
                      {isAuto && resolvedUid && (
                        <span style={{ marginRight: '0.3rem', fontSize: '0.7rem', color: '#94a3b8' }}>
                          (אוטומטי)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem' }}>
                      <select
                        value={selectValue}
                        disabled={savingTxId === t.id}
                        onChange={e => void handleAttributionChange(t, e.target.value)}
                        title={isAuto ? `אוטומטי → ${resolvedLabel}` : undefined}
                        style={{
                          padding: '0.3rem 0.5rem',
                          fontSize: '0.8rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.25rem',
                          direction: 'rtl',
                          background: isAuto ? '#f8fafc' : '#fff',
                          color: isAuto ? '#64748b' : '#0f172a',
                          cursor: savingTxId === t.id ? 'wait' : 'pointer',
                        }}
                      >
                        <option value="">אוטומטי{isAuto && resolvedUid ? ` (${resolvedLabel})` : ''}</option>
                        {participants.map(p => (
                          <option key={p.uid} value={p.uid}>{p.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <DocumentViewModal
        isOpen={!!viewDoc}
        onClose={() => setViewDoc(null)}
        title={viewDoc?.vendor || viewDoc?.fileName || 'מסמך'}
        href={viewDoc?.driveWebViewLink || viewDoc?.externalUrl}
        driveFileId={viewDoc?.driveFileId}
      />
    </div>
  )
}
