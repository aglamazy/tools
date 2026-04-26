'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { db, type TaxDocument, type Business, type Transaction, type AdvancePayment } from '@/app/db/financeDB'
import { subjectStore } from '@/app/stores/subjectStore'
import type { Category } from '@/app/types/category'
import { effectiveExpenseAmount } from './expenseScale'
import { getUser, subscribeToAuth } from '@/app/stores/authStore'
import { uploadAdvancePaymentReceipt, ensureRootFolder } from '@/app/services/googleDriveService'
import { getAccessToken } from '@/app/services/googleTokenService'
import { getHouseholdInfo } from '@/app/services/householdService'
import { type TaxStatus, type TaxStatusInfo, useExemptTaxStatus } from '@/app/components/TaxExemptBadge'
import RentalSummaryTable from './TaxRentalSummary'
import HouseholdIncomeSummary from './TaxHouseholdSummary'
import { SelfEmployedBTLSection, SelfEmployedIncomeTaxSection, type BTLRates, type IncomeTaxStep } from './TaxSelfEmployedSections'
import { getTaxProfile, type TaxProfile } from '@/app/components/TaxProfileSection'
import Modal from '@/app/components/Modal'
import BusinessForm from '@/app/components/settings/BusinessForm'
import type { BusinessUI } from '@/app/types/business'
import { businessStore } from '@/app/stores/businessStore'
import { BusinessType } from '@/app/types/business'

import TaxesDebugPanel, { type HouseholdMember, type HouseholdDebug } from './TaxesDebugPanel'

async function loadHouseholdMembers(): Promise<{ members: HouseholdMember[]; debug: HouseholdDebug }> {
  const currentUser = getUser()
  const members: HouseholdMember[] = []
  const debug: HouseholdDebug = { apiResult: null, apiError: null, fellBackToCurrentUser: false }
  try {
    const info = await getHouseholdInfo()
    debug.apiResult = info
    if (info.household) {
      const emails = (info.household as any).memberEmails || {}
      const names = (info.household as any).memberNames || {}
      for (const uid of info.household.members) {
        members.push({ uid, label: names[uid] || emails[uid] || uid })
      }
      return { members, debug }
    }
  } catch (err: any) {
    debug.apiError = err?.message ? String(err.message) : String(err)
  }
  // Fallback: just current user
  if (currentUser) {
    debug.fellBackToCurrentUser = true
    members.push({ uid: currentUser.uid, label: currentUser.displayName || currentUser.email || currentUser.uid })
  }
  return { members, debug }
}

import { TaxExemptStatusBanner, ExemptStatusBanner } from './TaxStatusBanners'

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
  const [categoryByName, setCategoryByName] = useState<Map<string, Category>>(new Map())
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [householdDebug, setHouseholdDebug] = useState<HouseholdDebug | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const debugMode = searchParams?.get('debug') === '1'
  const selectedUser = searchParams?.get('user') || 'all'
  const setSelectedUser = (uid: string) => {
    const params = new URLSearchParams(searchParams?.toString() || '')
    if (uid === 'all') params.delete('user')
    else params.set('user', uid)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname || '/')
  }
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    return subscribeToAuth(s => {
      if (s.initialized && s.user) setAuthReady(true)
    })
  }, [])
  const [taxExemptInfo, setTaxExemptInfo] = useState<TaxStatusInfo | null>(null)
  const exemptStatus = useExemptTaxStatus()
  const [btlRates, setBtlRates] = useState<BTLRates | null>(null)
  const [incomeTaxBrackets, setIncomeTaxBrackets] = useState<IncomeTaxStep[] | null>(null)
  const [rentalMonthlyLimit, setRentalMonthlyLimit] = useState<number | null>(null)
  const [advancePayments, setAdvancePayments] = useState<AdvancePayment[]>([])
  const [taxProfile, setTaxProfile] = useState<TaxProfile>({})
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-based

  useEffect(() => {
    if (!authReady) return
    const load = async () => {
      const [allDocs, biz, m, advPay, profile] = await Promise.all([
        db.taxDocuments.filter(d => d.year === currentYear).toArray(),
        db.businesses.toArray(),
        loadHouseholdMembers(),
        db.advancePayments.filter(p => p.month.endsWith(`/${currentYear}`)).toArray(),
        getTaxProfile(getUser()?.uid),
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

      // Fold household-scope deductible expense categories (no businessId, isDeductible=true)
      // into the expense map of every business owned by a member with non-zero share.
      // This is what makes things like ארנונה / חשמל / מים flow into the taxes report
      // for the relevant person's businesses.
      for (const cat of categories) {
        if (cat.businessId || cat.type !== 'expense') continue
        if (!cat.isDeductible || !cat.deductibleByMember) continue
        for (const [memberUid, percent] of Object.entries(cat.deductibleByMember)) {
          if (!percent || percent <= 0) continue
          for (const b of biz) {
            if (b.id == null || b.userId !== memberUid) continue
            const existing = expCatMap.get(b.id) || []
            if (!existing.includes(cat.name)) existing.push(cat.name)
            expCatMap.set(b.id, existing)
          }
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
      const byName = new Map<string, Category>()
      for (const c of categories) byName.set(c.name, c)
      setCategoryByName(byName)
      setMembers(m.members)
      setHouseholdDebug(m.debug)
      setAdvancePayments(advPay)
      setTaxProfile(profile)
      setLoading(false)
    }
    load()
  }, [currentYear, authReady])

  // Reload tax profile when the user selects a different household member tab.
  useEffect(() => {
    if (!authReady) return
    const uid = selectedUser === 'all' ? getUser()?.uid : selectedUser
    getTaxProfile(uid).then(setTaxProfile)
  }, [selectedUser, authReady])

  // Build derived data (needed before useEffect for tax exempt)
  const filteredDocs = selectedUser === 'all' ? docs : docs.filter(d => d.userId === selectedUser)
  const userBizIdsFromDocs = new Set(filteredDocs.map(d => d.businessId))
  // Exclude businesses shared with me — those belong to the owner's tax situation
  const ownBusinesses = businesses.filter(b => !b.sharedWithMe)
  const relevantBusinesses = selectedUser === 'all'
    ? ownBusinesses.filter(b => b.id && bizCategoryMap.has(b.id))
    : ownBusinesses.filter(b => b.id && (
        (bizCategoryMap.has(b.id) && (b.userId === selectedUser || userBizIdsFromDocs.has(b.id)))
        || b.userId === selectedUser
      ))

  // Trigger Drive folder migration on page load (if connected)
  useEffect(() => {
    getAccessToken().then(token => { if (token) ensureRootFolder().catch(() => {}) })
  }, [])

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
        setRentalMonthlyLimit(tl.amount)
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

  const handleUploadReceipt = async (month: string, file: File) => {
    const seBiz = relevantBusinesses.filter(b => !b.isTaxFree)
    const businessId = seBiz[0]?.id
    if (!businessId) return

    let driveFileId: string | undefined
    let driveWebViewLink: string | undefined
    const token = await getAccessToken()
    if (token) {
      const result = await uploadAdvancePaymentReceipt(file, currentYear)
      driveFileId = result.fileId
      driveWebViewLink = result.webViewLink
    }

    // Check for existing record
    const existing = await db.advancePayments
      .where('[businessId+month+type]')
      .equals([businessId, month, 'incomeTax'])
      .first()

    if (existing) {
      await db.advancePayments.update(existing.id!, {
        paidAt: new Date().toISOString(),
        driveFileId,
        driveWebViewLink,
        fileName: file.name,
      })
    } else {
      await db.advancePayments.add({
        businessId,
        month,
        type: 'incomeTax',
        paidAt: new Date().toISOString(),
        driveFileId,
        driveWebViewLink,
        fileName: file.name,
        userId: getUser()?.uid,
        createdAt: new Date().toISOString(),
      })
    }

    // Reload
    const advPay = await db.advancePayments.filter(p => p.month.endsWith(`/${currentYear}`)).toArray()
    setAdvancePayments(advPay)
  }

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
      {debugMode && (
        <TaxesDebugPanel
          currentUser={getUser()}
          householdDebug={householdDebug}
          members={members}
          userTabs={userTabs}
          selectedUser={selectedUser}
          ownBusinesses={ownBusinesses}
          relevantBusinesses={relevantBusinesses}
          bizCategoryMap={bizCategoryMap}
          expCategoryMap={expCategoryMap}
          userBizIdsFromDocs={userBizIdsFromDocs}
          transactions={transactions}
          taxProfile={taxProfile}
        />
      )}

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

      {/* Exempt status banner — only for individual person tabs */}
      {selectedUser !== 'all' && exemptStatus && <ExemptStatusBanner info={exemptStatus} />}

      {/* Conditional section tabs: שכיר / עצמאי */}
      {(() => {
        const hasDocs = filteredDocs.length > 0
        const nonRentalBiz = relevantBusinesses.filter(b => !b.isTaxFree && b.type !== BusinessType.Employee)
        const rentalBiz = relevantBusinesses.filter(b => b.isTaxFree)

        // Household tab: income summary (שכיר + עצמאי per member) + rental detail
        if (selectedUser === 'all') {
          return (
            <>
              <HouseholdIncomeSummary
                members={members}
                docs={filteredDocs}
                selfEmployedBizzes={nonRentalBiz}
                employeeBizzes={ownBusinesses.filter(b => b.type === BusinessType.Employee)}
                rentalBusinesses={rentalBiz}
                transactions={transactions}
                bizCategoryMap={bizCategoryMap}
                expCategoryMap={expCategoryMap}
                currentYear={currentYear}
                currentMonth={currentMonth}
              />
            </>
          )
        }

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
            categoryByName={categoryByName}
            currentYear={currentYear}
            currentMonth={currentMonth}
            taxExemptInfo={taxExemptInfo}
            btlRates={btlRates}
            incomeTaxBrackets={incomeTaxBrackets}
            advancePayments={advancePayments}
            onUploadReceipt={handleUploadReceipt}
            taxProfile={taxProfile}
            personUid={selectedUser}
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
  categoryByName: Map<string, Category>
  currentYear: number
  currentMonth: number
  taxExemptInfo: TaxStatusInfo | null
  btlRates: BTLRates | null
  incomeTaxBrackets: IncomeTaxStep[] | null
  advancePayments: AdvancePayment[]
  onUploadReceipt: (month: string, file: File) => Promise<void>
  taxProfile?: TaxProfile
  personUid?: string
}

function SummarySections({ sections, filteredDocs, nonRentalBusinesses, rentalBusinesses, transactions, bizCategoryMap, expCategoryMap, categoryByName, currentYear, currentMonth, taxExemptInfo, btlRates, incomeTaxBrackets, advancePayments, onUploadReceipt, taxProfile, personUid }: SummarySectionsProps) {
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
            categoryByName={categoryByName}
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
              taxProfile={taxProfile}
              personUid={personUid}
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
              advancePayments={advancePayments}
              onUploadReceipt={onUploadReceipt}
              taxProfile={taxProfile}
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
  categoryByName: Map<string, Category>
  currentYear: number
  currentMonth: number
}

function SelfEmployedSummaryTable({ businesses, transactions, bizCategoryMap, expCategoryMap, categoryByName, currentYear, currentMonth }: SelfEmployedTableProps) {
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
      bizExpense[biz.id!] = expTx.reduce((s, t) => s + effectiveExpenseAmount(t, biz, categoryByName), 0)
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

  const [drillDown, setDrillDown] = useState<{ monthIdx: number; bizId: number; kind: 'income' | 'expense' } | null>(null)
  const [editingBiz, setEditingBiz] = useState<BusinessUI | null>(null)

  const handleBizSave = async () => {
    if (!editingBiz) return
    await businessStore.saveUI(editingBiz, false)
    setEditingBiz(null)
  }

  const getDrillDownTransactions = () => {
    if (!drillDown) return []
    const monthStr = `${String(drillDown.monthIdx + 1).padStart(2, '0')}/${currentYear}`
    const catNames = (drillDown.kind === 'income' ? bizCategoryMap : expCategoryMap).get(drillDown.bizId) || []
    return transactions
      .filter(t => t.month === monthStr && t.category && catNames.includes(t.category))
      .filter(t => drillDown.kind === 'income' ? t.amount >= 0 : t.amount < 0)
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

  const isCellOpen = (monthIdx: number, bizId: number, kind: 'income' | 'expense') =>
    drillDown?.monthIdx === monthIdx && drillDown?.bizId === bizId && drillDown?.kind === kind

  const subTh: React.CSSProperties = { ...tHeaderStyle, fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }
  const incomeBg = '#f0fdf4'
  const expenseBg = '#fef2f2'
  const incomeOpen = '#bbf7d0'
  const expenseOpen = '#fecaca'

  return (
    <div style={{ overflowX: 'auto' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>עצמאי — הכנסות / הוצאות {currentYear}</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl', verticalAlign: 'bottom' }}>חודש</th>
            {businesses.map(biz => (
              <th key={biz.id} colSpan={2} style={{ ...tHeaderStyle, background: '#faf5ff', color: '#7c3aed', borderBottom: '1px solid #e2e8f0' }}>
                {biz.name}
                <button
                  onClick={() => { const { createdAt: _, updatedAt: __, ...ui } = biz; setEditingBiz({ ...ui, id: biz.id! }) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', marginRight: '0.25rem' }}
                  title="הגדרות עסק"
                >⚙️</button>
              </th>
            ))}
          </tr>
          <tr>
            {businesses.map(biz => (
              <React.Fragment key={biz.id}>
                <th style={{ ...subTh, color: '#16a34a' }}>הכנסה</th>
                <th style={{ ...subTh, color: '#dc2626' }}>הוצאה</th>
              </React.Fragment>
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
                return (
                  <React.Fragment key={biz.id}>
                    <td
                      onClick={() => income ? setDrillDown(isCellOpen(row.month, biz.id!, 'income') ? null : { monthIdx: row.month, bizId: biz.id!, kind: 'income' }) : undefined}
                      style={{
                        ...cellStyle,
                        background: isCellOpen(row.month, biz.id!, 'income') ? incomeOpen : incomeBg,
                        cursor: income ? 'pointer' : 'default',
                        color: '#16a34a',
                      }}
                    >
                      {income ? fmt(income) : '—'}
                    </td>
                    <td
                      onClick={() => expense ? setDrillDown(isCellOpen(row.month, biz.id!, 'expense') ? null : { monthIdx: row.month, bizId: biz.id!, kind: 'expense' }) : undefined}
                      style={{
                        ...cellStyle,
                        background: isCellOpen(row.month, biz.id!, 'expense') ? expenseOpen : expenseBg,
                        cursor: expense ? 'pointer' : 'default',
                        color: '#dc2626',
                      }}
                    >
                      {expense ? fmt(expense) : '—'}
                    </td>
                  </React.Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid #e2e8f0' }}>
            <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
            {businesses.map(biz => (
              <React.Fragment key={biz.id}>
                <td style={{ ...cellStyle, fontWeight: 700, background: incomeBg, color: '#16a34a' }}>
                  {fmt(totals.bizIncome[biz.id!] || 0)}
                </td>
                <td style={{ ...cellStyle, fontWeight: 700, background: expenseBg, color: '#dc2626' }}>
                  {fmt(totals.bizExpense[biz.id!] || 0)}
                </td>
              </React.Fragment>
            ))}
          </tr>
        </tfoot>
      </table>

      {/* Drill-down panel */}
      {drillDown && (() => {
        const biz = businesses.find(b => b.id === drillDown.bizId)
        const txList = getDrillDownTransactions()
        const isExpense = drillDown.kind === 'expense'
        const effectiveAmount = (t: Transaction): number => {
          if (!isExpense || !biz) return t.amount || 0
          return -effectiveExpenseAmount(t, biz, categoryByName)
        }
        const total = txList.reduce((s, t) => s + effectiveAmount(t), 0)
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
                {biz?.name} — {drillDown.kind === 'income' ? 'הכנסות' : 'הוצאות'} — {HEBREW_MONTHS[drillDown.monthIdx]} {currentYear}
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
                    <th style={{ ...tHeaderStyle, textAlign: 'right', direction: 'rtl' }}>אמצעי תשלום</th>
                    <th style={tHeaderStyle}>סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {txList.map(tx => (
                    <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.date}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.description}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl' }}>{tx.category}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', color: '#64748b', fontSize: '0.8rem' }}>
                        {tx.type === 'credit' && tx.cardNumber
                          ? `כרטיס ${tx.cardNumber}`
                          : tx.type === 'bank' && tx.accountNumber
                            ? `חשבון ${tx.accountNumber}`
                            : 'מזומן'}
                      </td>
                      <td style={{ ...cellStyle, color: tx.amount >= 0 ? '#16a34a' : '#dc2626' }}>
                        {(() => {
                          const eff = effectiveAmount(tx)
                          if (!isExpense || eff === tx.amount) return fmt(tx.amount)
                          return (
                            <span title={`מקורי: ${fmt(tx.amount)}`}>
                              {fmt(eff)}
                              <span style={{ marginInlineStart: '0.4rem', fontSize: '0.75em', color: '#94a3b8' }}>
                                ({fmt(tx.amount)})
                              </span>
                            </span>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                    <td colSpan={4} style={{ ...cellStyle, textAlign: 'right', direction: 'rtl', fontWeight: 700 }}>סה&quot;כ</td>
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


