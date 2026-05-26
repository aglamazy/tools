'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { db, type Transaction, type Business } from '@/app/db/financeDB'
import { businessStore } from '@/app/stores/businessStore'
import { subjectStore } from '@/app/stores/subjectStore'
import { partnerStore, type Partner as Participant } from '@/app/stores/partnerStore'
import type { BusinessAccessGrant } from '@/app/services/businessShareService'
import { appSettingsStore, type AccountOwners } from '@/app/stores/appSettingsStore'
import { getTaxProfile } from '@/app/components/TaxProfileSection'
import { VAT_RATE_AUTHORIZED_DEALER, type VatType } from '@/app/lib/vat'
import { getTransactionAttributedUid } from '@/app/utils/transactionAttribution'
import type { Category } from '@/app/types/category'

type SettlementSummaryProps = {
  businessId: number
}

type Row = {
  uid: string
  label: string
  sharePercent: number
  paid: number
  received: number
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
  const [participants, setParticipants] = useState<Participant[]>(() =>
    typeof window !== 'undefined' ? partnerStore.getCached(undefined) : []
  )
  const [shares, setShares] = useState<BusinessAccessGrant[]>([])
  const [ownerVatType, setOwnerVatType] = useState<VatType | undefined>(undefined)
  const [accountOwners, setAccountOwners] = useState<AccountOwners>({})
  const [loading, setLoading] = useState(true)
  const [savingTxId, setSavingTxId] = useState<number | null>(null)

  const reloadTransactions = async () => {
    const cats = subjectStore.getAll().filter(
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
      const b = await businessStore.getById(businessId)
      if (cancelled) return
      setBusiness(b || null)
      if (!b) { setLoading(false); return }

      const profile = await getTaxProfile(b.userId)
      if (cancelled) return
      setOwnerVatType(profile.vatType)

      const owners = await appSettingsStore.getAccountOwners()
      if (cancelled) return
      setAccountOwners(owners)

      // Income + expense category names mapped to this business
      const cats = subjectStore.getAll().filter(
        (c: Category) => (c.type === 'income' || c.type === 'expense') && c.businessId === businessId
      )
      const catNames = new Set(cats.map(c => c.name))
      if (catNames.size === 0) { setTransactions([]); setLoading(false); return }

      const all = await db.transactions.toArray()
      if (cancelled) return
      setTransactions(all.filter(t => t.category && catNames.has(t.category)))
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [businessId])

  useEffect(() => {
    if (!business) return
    const syncId = business.syncId
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
      subjectStore.getAll()
        .filter((c: Category) => c.type === 'income' && c.businessId === businessId)
        .map(c => c.name)
    )
  }, [businessId])

  const rows = useMemo<Row[]>(() => {
    if (!business || !business.userId || participants.length === 0) return []

    const ownerUid: string = business.userId
    // Partners of THIS business = owner + active sharees only. Household-only
    // members (e.g., a spouse who isn't a sharee here) aren't partners — their
    // attributed txs collapse to the owner side.
    const shareeUids = shares
      .map(s => s.uid)
      .filter((u): u is string => typeof u === 'string')
    const partnerUids = new Set<string>([ownerUid, ...shareeUids])
    const partnerParticipants = participants.filter(p => partnerUids.has(p.uid))
    if (partnerParticipants.length === 0) return []

    const toPartnerUid = (uid: string | undefined): string => {
      if (uid && partnerUids.has(uid)) return uid
      return ownerUid
    }

    // Effective share %: owner uses business.ownerSharePercent (or remainder),
    // sharees use their sharePercent.
    const shareeShareSum = partnerParticipants
      .filter(p => p.uid !== ownerUid)
      .reduce((s, p) => s + (p.sharePercent ?? 0), 0)
    const ownerShare = business.ownerSharePercent ?? Math.max(0, 100 - shareeShareSum)

    // VAT-clean: owner uses their tax profile; sharees default to 'exempt' until
    // per-partner VAT plumbing is added (TODO: extend partnerStore to surface vatType).
    const vatTypeOf = (uid: string): VatType | undefined =>
      uid === ownerUid ? ownerVatType : 'exempt'

    return partnerParticipants.map(p => {
      const isOwner = p.uid === ownerUid
      const sharePercent = isOwner ? ownerShare : (p.sharePercent ?? 0)
      const vatType = vatTypeOf(p.uid)

      // Attribution: paidByUid → card/bank owner → owner-fallback. Then collapse
      // any non-partner uid (e.g., household-only member) to the owner.
      let paid = 0
      let received = 0
      for (const t of transactions) {
        const attributedUid = getTransactionAttributedUid(t, accountOwners, ownerUid)
        const partnerUid = toPartnerUid(attributedUid)
        if (partnerUid !== p.uid) continue
        const gross = Math.abs(t.amount)
        const net = netOfVat(gross, vatType)
        if (incomeCatNames.has(t.category ?? '')) received += net
        else paid += net
      }

      return { uid: p.uid, label: p.label, sharePercent, paid, received,
               netActual: received - paid, fairShare: 0, balance: 0, vatType }
    }).map((r, _, arr) => {
      // Fair share is computed against the sum of partners' VAT-cleaned net flows.
      const totalNet = arr.reduce((s, x) => s + x.netActual, 0)
      const fairShare = totalNet * (r.sharePercent / 100)
      return { ...r, fairShare, balance: r.netActual - fairShare }
    })
  }, [business, participants, shares, transactions, ownerVatType, incomeCatNames, accountOwners])

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
  const vatTypeForTx = (resolvedUid: string | undefined): VatType | undefined => {
    const partnerUid = resolvedUid && renderPartnerUids.has(resolvedUid) ? resolvedUid : ownerUid
    return partnerUid === ownerUid ? ownerVatType : 'exempt'
  }

  // Sort transactions by date (DD/MM/YYYY) descending — newest first
  const sortedTransactions = [...transactions].sort((a, b) => {
    const [aD, aM, aY] = a.date.split('/')
    const [bD, bM, bY] = b.date.split('/')
    const aT = new Date(`${aY}-${aM}-${aD}`).getTime()
    const bT = new Date(`${bY}-${bM}-${bD}`).getTime()
    return bT - aT
  })

  return (
    <div style={{ padding: '1rem 0' }}>
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
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem' }}>חלקו ההוגן</th>
            <th style={{ textAlign: 'left', padding: '0.6rem 0.5rem' }}>מאזן</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.uid} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '0.6rem 0.5rem' }}>
                {r.label}{r.uid === ownerUid && <span style={{ marginRight: '0.4rem', fontSize: '0.75rem', color: '#94a3b8' }}>(בעלים)</span>}
              </td>
              <td style={{ padding: '0.6rem 0.5rem', color: '#64748b' }}>{r.sharePercent}%</td>
              <td style={{ padding: '0.6rem 0.5rem', color: '#64748b', fontSize: '0.8rem' }}>
                {r.vatType === 'authorized' ? 'עוסק מורשה' : r.vatType === 'exempt' ? 'עוסק פטור' : '—'}
              </td>
              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>{fmt(r.paid)}</td>
              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left' }}>{fmt(r.received)}</td>
              <td style={{ padding: '0.6rem 0.5rem', textAlign: 'left', color: '#64748b' }}>{fmt(r.fairShare)}</td>
              <td style={{
                padding: '0.6rem 0.5rem', textAlign: 'left', fontWeight: 600,
                color: r.balance > 0 ? '#dc2626' : r.balance < 0 ? '#16a34a' : '#64748b',
              }}>
                {r.balance > 0 ? '+' : ''}{fmt(r.balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.75rem' }}>
          רשימת תנועות
        </h3>
        {noActivity || sortedTransactions.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '0.85rem', padding: '1rem 0' }}>
            אין תנועות לעסק זה.
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
              {sortedTransactions.map(t => {
                const isIncome = incomeCatNames.has(t.category ?? '')
                const resolvedUid = getTransactionAttributedUid(t, accountOwners, ownerUid)
                const resolvedLabel = resolvedUid
                  ? participants.find(p => p.uid === resolvedUid)?.label ?? '—'
                  : '—'
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
                        background: isIncome ? '#f0fdf4' : '#fef2f2',
                        color: isIncome ? '#16a34a' : '#dc2626',
                        border: `1px solid ${isIncome ? '#bbf7d0' : '#fecaca'}`,
                      }}>
                        {isIncome ? 'הכנסה' : 'הוצאה'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem', color: '#0f172a' }}>
                      <div>{t.description}</div>
                      {t.category && (
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{t.category}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem 0.5rem', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 500, color: isIncome ? '#16a34a' : '#dc2626' }}>
                      {fmt(netOfVat(Math.abs(t.amount), vatTypeForTx(resolvedUid)))}
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
    </div>
  )
}
