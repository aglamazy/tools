'use client'

import React, { useEffect, useState } from 'react'
import { db, type TaxDocument, type Business, type Transaction } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'
import { getUser } from '@/app/stores/authStore'
import { getHouseholdInfo } from '@/app/services/householdService'
import { type TaxStatus, type TaxStatusInfo } from '@/app/components/TaxExemptBadge'
import RentalSummaryTable from './TaxRentalSummary'
import { SelfEmployedBTLSection, SelfEmployedIncomeTaxSection, type BTLRates, type IncomeTaxStep } from './TaxSelfEmployedSections'
import Modal from '@/app/components/Modal'
import BusinessForm from '@/app/components/settings/BusinessForm'
import type { BusinessUI } from '@/app/types/business'
import { businessStore } from '@/app/stores/businessStore'

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
  return (
    <div>
      <AnnualSummarySubTab />
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
  const [expCategoryMap, setExpCategoryMap] = useState<Map<number, string[]>>(new Map())
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [taxExemptInfo, setTaxExemptInfo] = useState<TaxStatusInfo | null>(null)
  const [btlRates, setBtlRates] = useState<BTLRates | null>(null)
  const [incomeTaxBrackets, setIncomeTaxBrackets] = useState<IncomeTaxStep[] | null>(null)
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-based

  useEffect(() => {
    const load = async () => {
      const [allDocs, biz, m] = await Promise.all([
        db.taxDocuments.filter(d => d.year === currentYear).toArray(),
        db.businesses.toArray(),
        loadHouseholdMembers(),
      ])

      // Build business → category names map from subjectStore (income + expense)
      const categories = subjectStore.getAll() as Category[]
      const catMap = new Map<number, string[]>()
      const expCatMap = new Map<number, string[]>()
      for (const cat of categories) {
        if (cat.businessId && cat.type === 'income') {
          const existing = catMap.get(cat.businessId) || []
          existing.push(cat.name)
          catMap.set(cat.businessId, existing)
        }
        if (cat.businessId && cat.type === 'expense') {
          const existing = expCatMap.get(cat.businessId) || []
          existing.push(cat.name)
          expCatMap.set(cat.businessId, existing)
        }
      }

      // Load transactions for the current year that match any business category (income or expense)
      const allCatNames = new Set<string>()
      catMap.forEach(names => names.forEach(n => allCatNames.add(n)))
      expCatMap.forEach(names => names.forEach(n => allCatNames.add(n)))

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
      setExpCategoryMap(expCatMap)
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

  // Load platform tax settings (BTL rates + tax limits) — public endpoint, no auth needed
  useEffect(() => {
    fetch('/api/tax-settings').then(res => res.ok ? res.json() : null).then(data => {
      if (!data) return
      const rates = (data.taxRates || {}) as Record<string, BTLRates>
      setBtlRates(rates[String(currentYear)] ?? null)
      const brackets = (data.incomeTaxBrackets || {}) as Record<string, IncomeTaxStep[]>
      const bracketYear = Object.keys(brackets).map(Number).filter(y => y <= currentYear).sort((a, b) => b - a)[0]
      setIncomeTaxBrackets(bracketYear ? brackets[String(bracketYear)] : null)
      const tl = data.taxLimits as { amount: number; sinceYear: number } | null
      if (tl && currentYear >= tl.sinceYear) {
        setTaxExemptInfo(prev => prev ? { ...prev, limit: tl.amount } : prev)
      }
    }).catch(() => {})
  }, [currentYear])

  // Compute tax exempt status from relevant exempt businesses
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

    fetch('/api/tax-settings').then(res => res.ok ? res.json() : null).then(data => {
      if (!data) { setTaxExemptInfo(null); return }
      const tl = data.taxLimits as { amount: number; sinceYear: number } | null
      if (tl && currentYear >= tl.sinceYear) {
        const limit = tl.amount
        const status: TaxStatus = maxMonthlyIncome > limit ? 'red' : maxMonthlyIncome > limit * 0.8 ? 'yellow' : 'green'
        setTaxExemptInfo({ status, currentIncome, maxMonthlyIncome, limit })
      } else { setTaxExemptInfo(null) }
    }).catch(() => setTaxExemptInfo(null))
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

      {/* Conditional section tabs: שכיר / עצמאי */}
      {(() => {
        const hasDocs = filteredDocs.length > 0
        const nonRentalBiz = relevantBusinesses.filter(b => !b.isTaxFree)
        const rentalBiz = relevantBusinesses.filter(b => b.isTaxFree)
        const sections: { id: string; label: string }[] = []
        if (hasDocs) sections.push({ id: 'employee', label: 'שכיר' })
        if (nonRentalBiz.length > 0) sections.push({ id: 'selfEmployed', label: 'עצמאי' })
        if (rentalBiz.length > 0) sections.push({ id: 'rental', label: 'השכרת דירה' })
        if (sections.length === 0) return <p style={{ color: '#94a3b8', textAlign: 'center' }}>אין נתונים לשנה זו</p>

        return (
          <SummarySections
            sections={sections}
            filteredDocs={filteredDocs}
            nonRentalBusinesses={nonRentalBiz}
            rentalBusinesses={rentalBiz}
            transactions={transactions}
            bizCategoryMap={bizCategoryMap}
            expCategoryMap={expCategoryMap}
            currentYear={currentYear}
            currentMonth={currentMonth}
            taxExemptInfo={taxExemptInfo}
            btlRates={btlRates}
            incomeTaxBrackets={incomeTaxBrackets}
          />
        )
      })()}
    </div>
  )
}

type SummarySectionsProps = {
  sections: { id: string; label: string }[]
  filteredDocs: TaxDocument[]
  nonRentalBusinesses: Business[]
  rentalBusinesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<number, string[]>
  expCategoryMap: Map<number, string[]>
  currentYear: number
  currentMonth: number
  taxExemptInfo: TaxStatusInfo | null
  btlRates: BTLRates | null
  incomeTaxBrackets: IncomeTaxStep[] | null
}

function SummarySections({ sections, filteredDocs, nonRentalBusinesses, rentalBusinesses, transactions, bizCategoryMap, expCategoryMap, currentYear, currentMonth, taxExemptInfo, btlRates, incomeTaxBrackets }: SummarySectionsProps) {
  const [activeSection, setActiveSection] = useState(sections[0].id)

  return (
    <div>
      {sections.length > 1 && (
        <div style={{ display: 'flex', gap: '0', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0' }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                padding: '0.5rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: activeSection === s.id ? 600 : 400,
                background: 'none',
                border: 'none',
                borderBottom: activeSection === s.id ? '2px solid #3b82f6' : '2px solid transparent',
                marginBottom: '-2px',
                cursor: 'pointer',
                color: activeSection === s.id ? '#1e40af' : '#94a3b8',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {activeSection === 'employee' && (
        <EmployeeSummaryTable docs={filteredDocs} currentYear={currentYear} currentMonth={currentMonth} />
      )}

      {activeSection === 'selfEmployed' && (
        <>
          <SelfEmployedSummaryTable
            businesses={nonRentalBusinesses}
            transactions={transactions}
            bizCategoryMap={bizCategoryMap}
            expCategoryMap={expCategoryMap}
            currentYear={currentYear}
            currentMonth={currentMonth}
          />
          {btlRates && (
            <SelfEmployedBTLSection
              businesses={nonRentalBusinesses}
              transactions={transactions}
              bizCategoryMap={bizCategoryMap}
              expCategoryMap={expCategoryMap}
              currentYear={currentYear}
              currentMonth={currentMonth}
              rates={btlRates}
            />
          )}
          {incomeTaxBrackets && incomeTaxBrackets.length > 0 && (
            <SelfEmployedIncomeTaxSection
              businesses={nonRentalBusinesses}
              transactions={transactions}
              bizCategoryMap={bizCategoryMap}
              expCategoryMap={expCategoryMap}
              currentYear={currentYear}
              currentMonth={currentMonth}
              btlRates={btlRates}
              brackets={incomeTaxBrackets}
              salaryDocs={filteredDocs}
            />
          )}
        </>
      )}

      {activeSection === 'rental' && (
        <>
          {taxExemptInfo && <TaxExemptStatusBanner info={taxExemptInfo} />}
          <RentalSummaryTable
            businesses={rentalBusinesses}
            transactions={transactions}
            bizCategoryMap={bizCategoryMap}
            currentYear={currentYear}
            currentMonth={currentMonth}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const cellStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.85rem',
  textAlign: 'left' as const,
  direction: 'ltr',
}

const tHeaderStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  background: '#f8fafc',
  color: '#475569',
  borderBottom: '2px solid #e2e8f0',
}

const fmt = (n: number) => n.toLocaleString('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })

// ---------------------------------------------------------------------------
// Employee (שכיר) Summary Table
// ---------------------------------------------------------------------------

function EmployeeSummaryTable({ docs, currentYear, currentMonth }: { docs: TaxDocument[]; currentYear: number; currentMonth: number }) {
  const monthlyData = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`
    const monthDocs = docs.filter(d => d.month === monthStr)
    return {
      month: i,
      label: HEBREW_MONTHS[i],
      grossIncome: monthDocs.reduce((s, d) => s + (d.grossIncome || 0), 0),
      incomeTax: monthDocs.reduce((s, d) => s + (d.incomeTax || 0), 0),
      nationalInsurance: monthDocs.reduce((s, d) => s + (d.nationalInsurance || 0), 0),
      healthInsurance: monthDocs.reduce((s, d) => s + (d.healthInsurance || 0), 0),
      netIncome: monthDocs.reduce((s, d) => s + (d.netIncome || 0), 0),
    }
  })

  const totals = {
    grossIncome: monthlyData.reduce((s, m) => s + m.grossIncome, 0),
    incomeTax: monthlyData.reduce((s, m) => s + m.incomeTax, 0),
    nationalInsurance: monthlyData.reduce((s, m) => s + m.nationalInsurance, 0),
    healthInsurance: monthlyData.reduce((s, m) => s + m.healthInsurance, 0),
    netIncome: monthlyData.reduce((s, m) => s + m.netIncome, 0),
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>שכיר — סיכום שנתי {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>חודש</th>
            <th style={tHeaderStyle}>ברוטו</th>
            <th style={tHeaderStyle}>מס הכנסה</th>
            <th style={tHeaderStyle}>ביטוח לאומי</th>
            <th style={tHeaderStyle}>ביטוח בריאות</th>
            <th style={tHeaderStyle}>נטו</th>
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
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Self-Employed (עצמאי) Summary Table
// ---------------------------------------------------------------------------

type SelfEmployedTableProps = {
  businesses: Business[]
  transactions: Transaction[]
  bizCategoryMap: Map<number, string[]>
  expCategoryMap: Map<number, string[]>
  currentYear: number
  currentMonth: number
}

function SelfEmployedSummaryTable({ businesses, transactions, bizCategoryMap, expCategoryMap, currentYear, currentMonth }: SelfEmployedTableProps) {
  const monthlyData = Array.from({ length: currentMonth + 1 }, (_, i) => {
    const monthStr = `${String(i + 1).padStart(2, '0')}/${currentYear}`

    const bizIncome: Record<number, number> = {}
    const bizExpense: Record<number, number> = {}
    for (const biz of businesses) {
      const catNames = bizCategoryMap.get(biz.id!) || []
      const bizTx = transactions.filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
      bizIncome[biz.id!] = bizTx.reduce((s, t) => s + (t.amount || 0), 0)

      const expCatNames = expCategoryMap.get(biz.id!) || []
      const expTx = transactions.filter(t => t.month === monthStr && t.category && expCatNames.includes(t.category) && t.amount < 0)
        .filter(t => !t.currentStep || t.currentStep === 1)
        .map(t => {
          if (t.totalSteps && t.totalSteps > 1) {
            const fullAmount = t.totalAmount || (t.totalSteps * Math.abs(t.amount))
            return { ...t, amount: -fullAmount }
          }
          return t
        })
      bizExpense[biz.id!] = expTx.reduce((s, t) => s + Math.abs(t.amount), 0)
    }

    return { month: i, label: HEBREW_MONTHS[i], bizIncome, bizExpense }
  })

  const totals = {
    bizIncome: Object.fromEntries(businesses.map(biz => [
      biz.id!, monthlyData.reduce((s, m) => s + (m.bizIncome[biz.id!] || 0), 0),
    ])),
    bizExpense: Object.fromEntries(businesses.map(biz => [
      biz.id!, monthlyData.reduce((s, m) => s + (m.bizExpense[biz.id!] || 0), 0),
    ])),
  }

  const [drillDown, setDrillDown] = useState<{ monthIdx: number; bizId: number } | null>(null)
  const [editingBiz, setEditingBiz] = useState<BusinessUI | null>(null)

  const handleBizSave = async () => {
    if (!editingBiz) return
    await businessStore.update(editingBiz.id, {
      name: editingBiz.name, type: editingBiz.type, vatType: editingBiz.vatType,
      isTaxFree: editingBiz.isTaxFree, btlAdvancePayment: editingBiz.btlAdvancePayment,
      taxOrder: editingBiz.taxOrder,
    })
    setEditingBiz(null)
  }

  const getDrillDownTransactions = () => {
    if (!drillDown) return []
    const monthStr = `${String(drillDown.monthIdx + 1).padStart(2, '0')}/${currentYear}`
    const incomeCatNames = bizCategoryMap.get(drillDown.bizId) || []
    const expenseCatNames = expCategoryMap.get(drillDown.bizId) || []
    const allCatNames = [...incomeCatNames, ...expenseCatNames]
    return transactions
      .filter(t => t.month === monthStr && t.category && allCatNames.includes(t.category))
      .filter(t => t.amount >= 0 || !t.currentStep || t.currentStep === 1)
      .map(t => {
        if (t.amount < 0 && t.totalSteps && t.totalSteps > 1) {
          const fullAmount = t.totalAmount || (t.totalSteps * Math.abs(t.amount))
          return { ...t, amount: -fullAmount }
        }
        return t
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>עצמאי — סיכום שנתי {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>חודש</th>
            {businesses.map(biz => (
              <th key={biz.id} style={{ ...tHeaderStyle, background: '#faf5ff', color: '#7c3aed' }}>
                {biz.name}
                <button
                  onClick={() => setEditingBiz({ id: biz.id!, name: biz.name, type: biz.type, vatType: biz.vatType, isTaxFree: biz.isTaxFree, btlAdvancePayment: biz.btlAdvancePayment, taxOrder: biz.taxOrder, pinnedToSidebar: biz.pinnedToSidebar })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', marginRight: '0.25rem' }}
                  title="הגדרות עסק"
                >⚙️</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthlyData.map(row => (
            <tr key={row.month} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 500 }}>{row.label}</td>
              {businesses.map(biz => {
                const income = row.bizIncome[biz.id!] || 0
                const expense = row.bizExpense[biz.id!] || 0
                const net = income - expense
                const hasData = income > 0 || expense > 0
                return (
                  <td
                    key={biz.id}
                    onClick={() => hasData ? setDrillDown(
                      drillDown?.monthIdx === row.month && drillDown?.bizId === biz.id! ? null : { monthIdx: row.month, bizId: biz.id! }
                    ) : undefined}
                    style={{
                      ...cellStyle,
                      background: drillDown?.monthIdx === row.month && drillDown?.bizId === biz.id! ? '#fef3c7' : '#fefce8',
                      cursor: hasData ? 'pointer' : 'default',
                    }}
                  >
                    {hasData ? fmt(net) : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f0fdf4' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            {businesses.map(biz => (
              <td key={biz.id} style={{ ...cellStyle, fontWeight: 700, background: '#fefce8' }}>
                {fmt((totals.bizIncome[biz.id!] || 0) - (totals.bizExpense[biz.id!] || 0))}
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
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>תאריך</th>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>תיאור</th>
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>קטגוריה</th>
                    <th style={tHeaderStyle}>סכום</th>
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
      <Modal isOpen={!!editingBiz} onClose={() => setEditingBiz(null)} maxWidth="500px">
        {editingBiz && (
          <BusinessForm business={editingBiz} onChange={setEditingBiz} onSave={handleBizSave} onCancel={() => setEditingBiz(null)} isNew={false} />
        )}
      </Modal>
    </div>
  )
}


