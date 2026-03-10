'use client'

import React, { useEffect, useState } from 'react'
import { db, type TaxDocument, type Business, type Transaction } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import { type TaxStatus, type TaxStatusInfo } from '@/app/components/TaxExemptBadge'
import { appSettingsStore } from '@/app/stores/appSettingsStore'
import FilesSubTab from './TaxFilesSubTab'

type HouseholdMember = { uid: string; label: string }

async function loadHouseholdMembers(): Promise<HouseholdMember[]> {
  const currentUser = getUser()
  const members: HouseholdMember[] = []
  try {
    const info = await getHouseholdInfo()
    if (info.household) {
      const emails = (info.household as any).memberEmails || {}
      const names = (info.household as any).memberNames || {}
      for (const uid of info.household.members) {
        members.push({ uid, label: names[uid] || emails[uid] || uid })
      }
      return members
    }
  } catch { /* no household */ }
  // Fallback: just current user
  if (currentUser) {
    members.push({ uid: currentUser.uid, label: currentUser.displayName || currentUser.email || currentUser.uid })
  }
  return members
}

type SubTab = 'files' | 'summary'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'files', label: 'קבצים' },
  { id: 'summary', label: 'סיכום שנתי' },
]

const TAX_STATUS_STYLES: Record<TaxStatus, { bg: string; border: string; text: string; label: string }> = {
  green: { bg: '#f0fdf4', border: '#86efac', text: '#16a34a', label: 'תקין — הכנסה מהשכרה בטווח הפטור' },
  yellow: { bg: '#fefce8', border: '#fde047', text: '#a16207', label: 'זהירות — מתקרב לתקרת השכרת דירה' },
  red: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626', label: 'חריגה — הכנסה מהשכרה עברה את התקרה' },
  gray: { bg: '#f9fafb', border: '#d1d5db', text: '#9ca3af', label: 'טרם הוגדר' },
}

function TaxExemptStatusBanner({ info }: { info: TaxStatusInfo }) {

  const style = TAX_STATUS_STYLES[info.status]
  const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })
  const remainingToLimit = Math.max(0, info.limit - info.currentIncome)

  return (
    <div style={{
      marginBottom: '1rem',
      padding: '0.75rem 1rem',
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: '0.5rem',
      fontSize: '0.9rem',
      color: style.text,
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{style.label}</div>
      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.85rem', color: '#475569' }}>
        <div>
          <span style={{ color: '#64748b' }}>הכנסה שנתית נוכחית: </span>
          <strong>{fmt(info.currentIncome)}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>תקרת השכרה:</span>
          <strong>{fmt(info.limit)}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>נותר עד לתקרה: </span>
          <strong>{fmt(remainingToLimit)}</strong>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>הכנסה חודשית מקסימלית: </span>
          <strong>{fmt(info.maxMonthlyIncome)}</strong>
        </div>
      </div>
      {/* Progress bar */}
      <div style={{
        marginTop: '0.5rem',
        height: 6,
        background: '#e2e8f0',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, (info.currentIncome / info.limit) * 100)}%`,
          background: style.text,
          borderRadius: 3,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}

export default function TaxesTab() {
  const [subTab, setSubTab] = useState<SubTab>('files')

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '1rem',
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: '0.5rem',
      }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '0.4rem 1rem',
              fontSize: '0.85rem',
              fontWeight: subTab === t.id ? 600 : 400,
              background: subTab === t.id ? '#eff6ff' : 'transparent',
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              color: subTab === t.id ? '#1e40af' : '#64748b',
              borderRadius: '0.25rem 0.25rem 0 0',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'files' && <FilesSubTab loadHouseholdMembers={loadHouseholdMembers} />}
      {subTab === 'summary' && <AnnualSummarySubTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Annual Summary Sub-Tab
// ---------------------------------------------------------------------------

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
]

function AnnualSummarySubTab() {
  const [docs, setDocs] = useState<TaxDocument[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [bizCategoryMap, setBizCategoryMap] = useState<Map<number, string[]>>(new Map())
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [taxExemptInfo, setTaxExemptInfo] = useState<TaxStatusInfo | null>(null)
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-based

  useEffect(() => {
    const load = async () => {
      const [allDocs, biz, m] = await Promise.all([
        db.taxDocuments.filter(d => d.year === currentYear).toArray(),
        db.businesses.toArray(),
        loadHouseholdMembers(),
      ])

      // Build business → category names map from subjectStore
      const categories = subjectStore.getAll() as Category[]
      const catMap = new Map<number, string[]>()
      for (const cat of categories) {
        if (cat.businessId && cat.type === 'income') {
          const existing = catMap.get(cat.businessId) || []
          existing.push(cat.name)
          catMap.set(cat.businessId, existing)
        }
      }

      // Load transactions for the current year that match any business category
      const allCatNames = new Set<string>()
      catMap.forEach(names => names.forEach(n => allCatNames.add(n)))

      let bizTransactions: Transaction[] = []
      if (allCatNames.size > 0) {
        const allTx = await db.transactions.toArray()
        bizTransactions = allTx.filter(t =>
          t.category && allCatNames.has(t.category) &&
          t.month && t.month.endsWith(`/${currentYear}`)
        )
      }

      setDocs(allDocs)
      setBusinesses(biz)
      setTransactions(bizTransactions)
      setBizCategoryMap(catMap)
      setMembers(m)
      setLoading(false)
    }
    load()
  }, [currentYear])

  // Build derived data (needed before useEffect for tax exempt)
  const filteredDocs = selectedUser === 'all' ? docs : docs.filter(d => d.userId === selectedUser)
  const userBizIdsFromDocs = new Set(filteredDocs.map(d => d.businessId))
  const relevantBusinesses = selectedUser === 'all'
    ? businesses.filter(b => b.id && bizCategoryMap.has(b.id))
    : businesses.filter(b => b.id && (
        (bizCategoryMap.has(b.id) && (b.userId === selectedUser || userBizIdsFromDocs.has(b.id)))
        || b.userId === selectedUser
      ))

  // Compute tax exempt status from relevant exempt businesses only
  useEffect(() => {
    const exemptBizzes = relevantBusinesses.filter(b => b.vatType === 'exempt')
    if (exemptBizzes.length === 0) { setTaxExemptInfo(null); return }

    const exemptCatNames = new Set<string>()
    for (const biz of exemptBizzes) {
      const catNames = bizCategoryMap.get(biz.id!) || []
      catNames.forEach(n => exemptCatNames.add(n))
    }

    const yearTx = transactions.filter(t => t.category && exemptCatNames.has(t.category))
    const currentIncome = yearTx.reduce((s, t) => s + (t.amount || 0), 0)

    const monthlyIncomes: number[] = []
    for (let m = 0; m <= currentMonth; m++) {
      const monthStr = `${String(m + 1).padStart(2, '0')}/${currentYear}`
      monthlyIncomes.push(
        yearTx.filter(t => t.month === monthStr).reduce((s, t) => s + (t.amount || 0), 0)
      )
    }
    const maxMonthlyIncome = monthlyIncomes.length > 0 ? Math.max(...monthlyIncomes) : 0

    appSettingsStore.getAnnualTaxLimit(currentYear).then(limit => {
      if (!limit) { setTaxExemptInfo(null); return }
      const status: TaxStatus = currentIncome > limit ? 'red' : currentIncome + maxMonthlyIncome > limit ? 'yellow' : 'green'
      setTaxExemptInfo({ status, currentIncome, maxMonthlyIncome, limit })
    })
  }, [selectedUser, relevantBusinesses.length, transactions.length])  

  if (loading) return <p style={{ textAlign: 'center', color: '#94a3b8' }}>טוען...</p>

  // Build user tabs
  const userTabs: { id: string; label: string }[] = []
  if (members.length > 1) {
    userTabs.push({ id: 'all', label: 'משק בית' })
  }
  for (const m of members) {
    userTabs.push({ id: m.uid, label: m.label })
  }
  if (userTabs.length === 0) {
    userTabs.push({ id: 'all', label: 'הכל' })
  }

  return (
    <div>
      {/* User tabs */}
      {userTabs.length > 1 && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '0.5rem',
        }}>
          {userTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedUser(t.id)}
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: selectedUser === t.id ? 600 : 400,
                background: selectedUser === t.id ? '#eff6ff' : 'transparent',
                border: 'none',
                borderBottom: selectedUser === t.id ? '2px solid #3b82f6' : '2px solid transparent',
                cursor: 'pointer',
                color: selectedUser === t.id ? '#1e40af' : '#64748b',
                borderRadius: '0.25rem 0.25rem 0 0',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {relevantBusinesses.some(b => b.vatType === 'exempt') && taxExemptInfo && <TaxExemptStatusBanner info={taxExemptInfo} />}

      <AnnualSummaryTable
        docs={filteredDocs}
        businesses={relevantBusinesses}
        transactions={transactions}
        bizCategoryMap={bizCategoryMap}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    </div>
  )
}

type SummaryTableProps = {
  docs: TaxDocument[]
  businesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<number, string[]>
  currentYear: number
  currentMonth: number
}

function AnnualSummaryTable({ docs, businesses, transactions, bizCategoryMap, currentYear, currentMonth }: SummaryTableProps) {
  const monthlyData = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const monthDocs = docs.filter(d => d.month === monthStr)

    // Per-business income from transactions (עצמאי)
    const bizIncome: Record<number, number> = {}
    for (const biz of businesses) {
      const catNames = bizCategoryMap.get(biz.id!) || []
      const bizTx = transactions.filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
      bizIncome[biz.id!] = bizTx.reduce((s, t) => s + (t.amount || 0), 0)
    }

    // Tax-free income: sum income from businesses marked isTaxFree
    let taxFreeIncome = 0
    for (const biz of businesses) {
      if (biz.isTaxFree) {
        taxFreeIncome += bizIncome[biz.id!] || 0
      }
    }

    return {
      month: i,
      label: HEBREW_MONTHS[i],
      grossIncome: monthDocs.reduce((s, d) => s + (d.grossIncome || 0), 0),
      incomeTax: monthDocs.reduce((s, d) => s + (d.incomeTax || 0), 0),
      nationalInsurance: monthDocs.reduce((s, d) => s + (d.nationalInsurance || 0), 0),
      healthInsurance: monthDocs.reduce((s, d) => s + (d.healthInsurance || 0), 0),
      netIncome: monthDocs.reduce((s, d) => s + (d.netIncome || 0), 0),
      bizIncome,
      taxFreeIncome,
    }
  })

  const hasTaxFreeBusinesses = businesses.some(b => b.isTaxFree)

  const totals = {
    grossIncome: monthlyData.reduce((s, m) => s + m.grossIncome, 0),
    incomeTax: monthlyData.reduce((s, m) => s + m.incomeTax, 0),
    nationalInsurance: monthlyData.reduce((s, m) => s + m.nationalInsurance, 0),
    healthInsurance: monthlyData.reduce((s, m) => s + m.healthInsurance, 0),
    netIncome: monthlyData.reduce((s, m) => s + m.netIncome, 0),
    taxFreeIncome: monthlyData.reduce((s, m) => s + m.taxFreeIncome, 0),
    bizIncome: Object.fromEntries(businesses.map(biz => [
      biz.id!,
      monthlyData.reduce((s, m) => s + (m.bizIncome[biz.id!] || 0), 0),
    ])),
  }

  const [drillDown, setDrillDown] = useState<{ monthIdx: number; bizId: number } | null>(null)

  const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

  const getDrillDownTransactions = () => {
    if (!drillDown) return []
    const monthStr = `${String(drillDown.monthIdx + 1).padStart(2, '0')}/${currentYear}`
    const catNames = bizCategoryMap.get(drillDown.bizId) || []
    return transactions
      .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }

  const cellStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    fontSize: '0.85rem',
    textAlign: 'left' as const,
    direction: 'ltr',
  }

  const headerStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    background: '#f8fafc',
    color: '#475569',
    borderBottom: '2px solid #e2e8f0',
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>סיכום שנתי {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...headerStyle, textAlign: 'right', direction: 'rtl' }}>חודש</th>
            <th style={headerStyle}>ברוטו</th>
            <th style={headerStyle}>מס הכנסה</th>
            <th style={headerStyle}>ביטוח לאומי</th>
            <th style={headerStyle}>ביטוח בריאות</th>
            <th style={headerStyle}>נטו</th>
            {hasTaxFreeBusinesses && (
              <th style={{ ...headerStyle, background: '#ecfdf5', color: '#059669' }}>השכרת דירה</th>
            )}
            {businesses.map(biz => (
              <th key={biz.id} style={{ ...headerStyle, background: '#faf5ff', color: '#7c3aed' }}>{biz.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthlyData.map(row => (
            <tr key={row.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }}>{row.label}</td>
              <td style={cellStyle}>{row.grossIncome ? fmt(row.grossIncome) : '—'}</td>
              <td style={cellStyle}>{row.incomeTax ? fmt(row.incomeTax) : '—'}</td>
              <td style={cellStyle}>{row.nationalInsurance ? fmt(row.nationalInsurance) : '—'}</td>
              <td style={cellStyle}>{row.healthInsurance ? fmt(row.healthInsurance) : '—'}</td>
              <td style={cellStyle}>{row.netIncome ? fmt(row.netIncome) : '—'}</td>
              {hasTaxFreeBusinesses && (
                <td style={{ ...cellStyle, background: '#f0fdf4' }}>
                  {row.taxFreeIncome ? fmt(row.taxFreeIncome) : '—'}
                </td>
              )}
              {businesses.map(biz => (
                <td
                  key={biz.id}
                  onClick={() => row.bizIncome[biz.id!] ? setDrillDown(
                    drillDown?.monthIdx === row.month && drillDown?.bizId === biz.id! ? null : { monthIdx: row.month, bizId: biz.id! }
                  ) : undefined}
                  style={{
                    ...cellStyle,
                    background: drillDown?.monthIdx === row.month && drillDown?.bizId === biz.id! ? '#fef3c7' : '#fefce8',
                    cursor: row.bizIncome[biz.id!] ? 'pointer' : 'default',
                  }}
                >
                  {row.bizIncome[biz.id!] ? fmt(row.bizIncome[biz.id!]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f0fdf4' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.grossIncome)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.incomeTax)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.nationalInsurance)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.healthInsurance)}</td>
            <td style={{ ...cellStyle, fontWeight: 700 }}>{fmt(totals.netIncome)}</td>
            {hasTaxFreeBusinesses && (
              <td style={{ ...cellStyle, fontWeight: 700, background: '#f0fdf4', color: '#059669' }}>
                {fmt(totals.taxFreeIncome)}
              </td>
            )}
            {businesses.map(biz => (
              <td key={biz.id} style={{ ...cellStyle, fontWeight: 700, background: '#fefce8' }}>
                {fmt(totals.bizIncome[biz.id!] || 0)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      {/* Drill-down panel */}
      {drillDown && (() => {
        const biz = businesses.find(b => b.id === drillDown.bizId)
        const txList = getDrillDownTransactions()
        const total = txList.reduce((s, t) => s + (t.amount || 0), 0)
        return (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            border: '1px solid #e2e8f0',
            borderRadius: '0.5rem',
            background: '#fffbeb',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                {biz?.name} — {HEBREW_MONTHS[drillDown.monthIdx]} {currentYear}
              </h4>
              <button
                onClick={() => setDrillDown(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>
            {txList.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>אין תנועות</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerStyle, textAlign: 'right', direction: 'rtl' }}>תאריך</th>
                    <th style={{ ...headerStyle, textAlign: 'right', direction: 'rtl' }}>תיאור</th>
                    <th style={{ ...headerStyle, textAlign: 'right', direction: 'rtl' }}>קטגוריה</th>
                    <th style={headerStyle}>סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {txList.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.date}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.description}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.category}</td>
                      <td style={{ ...cellStyle, color: tx.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                        {fmt(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={3} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
                    <td style={{ ...cellStyle, fontWeight: 700, color: total >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(total)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )
      })()}
    </div>
  )
}

