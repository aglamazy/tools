'use client'

import React, { useState } from 'react'
import { getIdToken } from '@/app/services/firebaseAuthService'

type TaxRateTier = { nationalInsurance: number; healthInsurance: number }
type TaxRateYear = { reduced: TaxRateTier; regular: TaxRateTier; threshold: number; maxIncome: number; minIncome: number }
type TaxRateTierDraft = { nationalInsurance: string; healthInsurance: string }
type TaxRateYearDraft = { reduced: TaxRateTierDraft; regular: TaxRateTierDraft; threshold: string; maxIncome: string; minIncome: string }

type IncomeTaxStep = { upTo: number; rate: number }
type IncomeTaxStepDraft = { upTo: string; rate: string }

export { type TaxRateYear, type TaxRateYearDraft, type IncomeTaxStep }

const emptyRateYear: TaxRateYear = { reduced: { nationalInsurance: 0, healthInsurance: 0 }, regular: { nationalInsurance: 0, healthInsurance: 0 }, threshold: 0, maxIncome: 0, minIncome: 0 }
const emptyRateYearDraft: TaxRateYearDraft = { reduced: { nationalInsurance: '', healthInsurance: '' }, regular: { nationalInsurance: '', healthInsurance: '' }, threshold: '', maxIncome: '', minIncome: '' }

export function rateYearToDraft(r: TaxRateYear): TaxRateYearDraft {
  return {
    reduced: { nationalInsurance: String(r.reduced.nationalInsurance), healthInsurance: String(r.reduced.healthInsurance) },
    regular: { nationalInsurance: String(r.regular.nationalInsurance), healthInsurance: String(r.regular.healthInsurance) },
    threshold: String(r.threshold),
    maxIncome: String(r.maxIncome),
    minIncome: String(r.minIncome),
  }
}

function draftToRateYear(d: TaxRateYearDraft): TaxRateYear {
  return {
    reduced: { nationalInsurance: Number(d.reduced.nationalInsurance) || 0, healthInsurance: Number(d.reduced.healthInsurance) || 0 },
    regular: { nationalInsurance: Number(d.regular.nationalInsurance) || 0, healthInsurance: Number(d.regular.healthInsurance) || 0 },
    threshold: Number(d.threshold) || 0,
    maxIncome: Number(d.maxIncome) || 0,
    minIncome: Number(d.minIncome) || 0,
  }
}

const TAX_SUB_TABS = [
  { id: 'rental', label: 'השכרת דירה' },
  { id: 'selfEmployed', label: 'ביטוח לאומי עצמאי' },
  { id: 'incomeTax', label: 'מס הכנסה' },
] as const

type TaxSubTab = typeof TAX_SUB_TABS[number]['id']

export default function TaxSettingsPanel({
  taxLimit, setTaxLimit,
  taxLimitDraft, setTaxLimitDraft,
  taxLimitSaved, setTaxLimitSaved,
  taxRates, setTaxRates,
  taxRateDrafts, setTaxRateDrafts,
  taxRateSaved, setTaxRateSaved,
  newRateYear, setNewRateYear,
  incomeTaxBrackets, setIncomeTaxBrackets,
  incomeTaxDrafts, setIncomeTaxDrafts,
  incomeTaxSaved, setIncomeTaxSaved,
  newIncomeTaxYear, setNewIncomeTaxYear,
}: {
  taxLimit: { amount: number; sinceYear: number } | null; setTaxLimit: React.Dispatch<React.SetStateAction<{ amount: number; sinceYear: number } | null>>
  taxLimitDraft: { amount: string; sinceYear: string }; setTaxLimitDraft: React.Dispatch<React.SetStateAction<{ amount: string; sinceYear: string }>>
  taxLimitSaved: boolean; setTaxLimitSaved: React.Dispatch<React.SetStateAction<boolean>>
  taxRates: Record<string, TaxRateYear>; setTaxRates: React.Dispatch<React.SetStateAction<Record<string, TaxRateYear>>>
  taxRateDrafts: Record<string, TaxRateYearDraft>; setTaxRateDrafts: React.Dispatch<React.SetStateAction<Record<string, TaxRateYearDraft>>>
  taxRateSaved: string | null; setTaxRateSaved: React.Dispatch<React.SetStateAction<string | null>>
  newRateYear: string; setNewRateYear: React.Dispatch<React.SetStateAction<string>>
  incomeTaxBrackets: Record<string, IncomeTaxStep[]>; setIncomeTaxBrackets: React.Dispatch<React.SetStateAction<Record<string, IncomeTaxStep[]>>>
  incomeTaxDrafts: Record<string, IncomeTaxStepDraft[]>; setIncomeTaxDrafts: React.Dispatch<React.SetStateAction<Record<string, IncomeTaxStepDraft[]>>>
  incomeTaxSaved: string | null; setIncomeTaxSaved: React.Dispatch<React.SetStateAction<string | null>>
  newIncomeTaxYear: string; setNewIncomeTaxYear: React.Dispatch<React.SetStateAction<string>>
}) {
  const [subTab, setSubTab] = useState<TaxSubTab>('rental')

  return (
    <div>
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.25rem', borderBottom: '2px solid #e2e8f0' }}>
        {TAX_SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.9rem',
              fontWeight: subTab === t.id ? 600 : 400,
              background: 'none',
              border: 'none',
              borderBottom: subTab === t.id ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: '-2px',
              cursor: 'pointer',
              color: subTab === t.id ? '#1e40af' : '#94a3b8',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'rental' && (
        <RentalSection
          taxLimit={taxLimit} setTaxLimit={setTaxLimit}
          taxLimitDraft={taxLimitDraft} setTaxLimitDraft={setTaxLimitDraft}
          taxLimitSaved={taxLimitSaved} setTaxLimitSaved={setTaxLimitSaved}
        />
      )}

      {subTab === 'selfEmployed' && (
        <SelfEmployedSection
          taxRates={taxRates} setTaxRates={setTaxRates}
          taxRateDrafts={taxRateDrafts} setTaxRateDrafts={setTaxRateDrafts}
          taxRateSaved={taxRateSaved} setTaxRateSaved={setTaxRateSaved}
          newRateYear={newRateYear} setNewRateYear={setNewRateYear}
        />
      )}

      {subTab === 'incomeTax' && (
        <IncomeTaxSection
          incomeTaxBrackets={incomeTaxBrackets} setIncomeTaxBrackets={setIncomeTaxBrackets}
          incomeTaxDrafts={incomeTaxDrafts} setIncomeTaxDrafts={setIncomeTaxDrafts}
          incomeTaxSaved={incomeTaxSaved} setIncomeTaxSaved={setIncomeTaxSaved}
          newIncomeTaxYear={newIncomeTaxYear} setNewIncomeTaxYear={setNewIncomeTaxYear}
        />
      )}
    </div>
  )
}

function RentalSection({
  taxLimit, setTaxLimit, taxLimitDraft, setTaxLimitDraft, taxLimitSaved, setTaxLimitSaved,
}: {
  taxLimit: { amount: number; sinceYear: number } | null; setTaxLimit: React.Dispatch<React.SetStateAction<{ amount: number; sinceYear: number } | null>>
  taxLimitDraft: { amount: string; sinceYear: string }; setTaxLimitDraft: React.Dispatch<React.SetStateAction<{ amount: string; sinceYear: string }>>
  taxLimitSaved: boolean; setTaxLimitSaved: React.Dispatch<React.SetStateAction<boolean>>
}) {
  const unchanged = taxLimit !== null && String(taxLimit.amount) === taxLimitDraft.amount && String(taxLimit.sinceYear) === taxLimitDraft.sinceYear

  return (
    <section>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#059669' }}>תקרת פטור חודשית מהשכרת דירה</h2>
      <a href="https://www.gov.il/he/pages/detail-tracks-payment-tax-relief-rental-apartments" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.75rem', display: 'inline-block' }}>לפרטים מלאים</a>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>תקרה חודשית (₪)</label>
          <input
            type="number" dir="ltr" value={taxLimitDraft.amount}
            onChange={(e) => { setTaxLimitDraft(prev => ({ ...prev, amount: e.target.value })); setTaxLimitSaved(false) }}
            style={{ width: '140px', padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>משנת</label>
          <input
            type="number" dir="ltr" value={taxLimitDraft.sinceYear}
            onChange={(e) => { setTaxLimitDraft(prev => ({ ...prev, sinceYear: e.target.value })); setTaxLimitSaved(false) }}
            style={{ width: '100px', padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem' }}
          />
        </div>
        <button
          onClick={async () => {
            const amount = Number(taxLimitDraft.amount)
            const sinceYear = Number(taxLimitDraft.sinceYear)
            if (!amount || !sinceYear || !/^\d{4}$/.test(taxLimitDraft.sinceYear)) return
            const token = await getIdToken()
            if (!token) return
            const updated = { amount, sinceYear }
            const res = await fetch('/api/admin/tax-settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ taxLimits: updated }),
            })
            if (res.ok) {
              setTaxLimit(updated)
              setTaxLimitSaved(true)
              setTimeout(() => setTaxLimitSaved(false), 2000)
            }
          }}
          disabled={unchanged}
          style={{
            padding: '0.3rem 0.75rem',
            background: taxLimitSaved ? '#10b981' : unchanged ? '#e5e7eb' : '#2563eb',
            color: unchanged ? '#9ca3af' : '#fff',
            border: 'none', borderRadius: '0.375rem', fontSize: '0.85rem', cursor: 'pointer',
          }}
        >
          {taxLimitSaved ? '✓' : 'שמור'}
        </button>
      </div>
    </section>
  )
}

function SelfEmployedSection({
  taxRates, setTaxRates, taxRateDrafts, setTaxRateDrafts, taxRateSaved, setTaxRateSaved, newRateYear, setNewRateYear,
}: {
  taxRates: Record<string, TaxRateYear>; setTaxRates: React.Dispatch<React.SetStateAction<Record<string, TaxRateYear>>>
  taxRateDrafts: Record<string, TaxRateYearDraft>; setTaxRateDrafts: React.Dispatch<React.SetStateAction<Record<string, TaxRateYearDraft>>>
  taxRateSaved: string | null; setTaxRateSaved: React.Dispatch<React.SetStateAction<string | null>>
  newRateYear: string; setNewRateYear: React.Dispatch<React.SetStateAction<string>>
}) {
  const inp = (value: string, onChange: (v: string) => void, width = '90px') => (
    <input type="number" step="0.01" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width, padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.85rem', textAlign: 'center' as const }} />
  )
  const thStyle: React.CSSProperties = { padding: '0.5rem 0.6rem', fontSize: '0.8rem', color: '#1e5a8a', fontWeight: 600, background: '#e0f0ff', border: '1px solid #c4dff0', textAlign: 'center' }
  const tdStyle: React.CSSProperties = { padding: '0.4rem 0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }
  const labelStyle: React.CSSProperties = { padding: '0.4rem 0.6rem', border: '1px solid #e2e8f0', fontWeight: 500, fontSize: '0.85rem', textAlign: 'right', background: '#fafafa' }

  return (
    <section>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#7c3aed' }}>ביטוח לאומי ובריאות — עצמאי</h2>
      <a href="https://www.btl.gov.il/Insurance/National%20Insurance/type_list/Self_Employed/Pages/rates.aspx" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#6b7280', display: 'inline-block' }}>לפרטים מלאים</a>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>חישוב למבוגרים בלבד (גיל 18 עד גיל פרישה)</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {Object.keys(taxRates).sort().reverse().map((year) => {
          const draft = taxRateDrafts[year]
          if (!draft) return null
          const orig = taxRates[year]
          const unchanged = orig && JSON.stringify(draftToRateYear(draft)) === JSON.stringify(orig)
          return (
            <div key={year} style={{ padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{year}</span>
                <button
                  onClick={async () => {
                    const rates = draftToRateYear(draft)
                    const token = await getIdToken()
                    if (!token) return
                    const updated = { ...taxRates, [year]: rates }
                    const res = await fetch('/api/admin/tax-settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ taxRates: updated }),
                    })
                    if (res.ok) {
                      setTaxRates(updated)
                      setTaxRateSaved(year)
                      setTimeout(() => setTaxRateSaved(null), 2000)
                    }
                  }}
                  disabled={!!unchanged}
                  style={{
                    padding: '0.25rem 0.75rem',
                    background: taxRateSaved === year ? '#10b981' : unchanged ? '#e5e7eb' : '#2563eb',
                    color: unchanged ? '#9ca3af' : '#fff',
                    border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', cursor: 'pointer',
                  }}
                >
                  {taxRateSaved === year ? '✓' : 'שמור'}
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table dir="rtl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}></th>
                      <th style={thStyle}>
                        <div>על הכנסה חודשית עד</div>
                        <div>{inp(draft.threshold, v => setTaxRateDrafts(prev => ({ ...prev, [year]: { ...prev[year], threshold: v } })), '100px')} ש&quot;ח</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>(שיעור מופחת)</div>
                      </th>
                      <th style={thStyle}>
                        <div>על הכנסה חודשית מעל</div>
                        <div>{inp(draft.threshold, () => {}, '100px')} ש&quot;ח ועד</div>
                        <div>{inp(draft.maxIncome, v => setTaxRateDrafts(prev => ({ ...prev, [year]: { ...prev[year], maxIncome: v } })), '100px')} ש&quot;ח</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 400 }}>(שיעור רגיל)</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={labelStyle}>דמי ביטוח לאומי</td>
                      <td style={tdStyle}>
                        {inp(draft.reduced.nationalInsurance, v => setTaxRateDrafts(prev => ({ ...prev, [year]: { ...prev[year], reduced: { ...prev[year].reduced, nationalInsurance: v } } })))}%
                      </td>
                      <td style={tdStyle}>
                        {inp(draft.regular.nationalInsurance, v => setTaxRateDrafts(prev => ({ ...prev, [year]: { ...prev[year], regular: { ...prev[year].regular, nationalInsurance: v } } })))}%
                      </td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>דמי ביטוח בריאות</td>
                      <td style={tdStyle}>
                        {inp(draft.reduced.healthInsurance, v => setTaxRateDrafts(prev => ({ ...prev, [year]: { ...prev[year], reduced: { ...prev[year].reduced, healthInsurance: v } } })))}%
                      </td>
                      <td style={tdStyle}>
                        {inp(draft.regular.healthInsurance, v => setTaxRateDrafts(prev => ({ ...prev, [year]: { ...prev[year], regular: { ...prev[year].regular, healthInsurance: v } } })))}%
                      </td>
                    </tr>
                    <tr style={{ background: '#f0f9ff' }}>
                      <td style={{ ...labelStyle, fontWeight: 700 }}>סך הכול</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {((Number(draft.reduced.nationalInsurance) || 0) + (Number(draft.reduced.healthInsurance) || 0)).toFixed(2)}%
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {((Number(draft.regular.nationalInsurance) || 0) + (Number(draft.regular.healthInsurance) || 0)).toFixed(2)}%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                הכנסה מזערית: {inp(draft.minIncome, v => setTaxRateDrafts(prev => ({ ...prev, [year]: { ...prev[year], minIncome: v } })), '100px')} ש&quot;ח לחודש
              </div>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="number" dir="ltr" placeholder="שנה" value={newRateYear}
            onChange={(e) => setNewRateYear(e.target.value)}
            style={{ width: '100px', padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem' }}
          />
          <button
            onClick={() => {
              const y = newRateYear.trim()
              if (y && /^\d{4}$/.test(y) && !taxRates[y]) {
                setTaxRates(prev => ({ ...prev, [y]: emptyRateYear }))
                setTaxRateDrafts(prev => ({ ...prev, [y]: emptyRateYearDraft }))
                setNewRateYear('')
              }
            }}
            disabled={!newRateYear || !/^\d{4}$/.test(newRateYear) || !!taxRates[newRateYear]}
            style={{ padding: '0.3rem 0.75rem', background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: '0.375rem', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            + הוסף שנה
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Income Tax Section (מס הכנסה)
// ---------------------------------------------------------------------------

export function incomeTaxStepsToDraft(steps: IncomeTaxStep[]): IncomeTaxStepDraft[] {
  return steps.map(s => ({ upTo: String(s.upTo), rate: String(s.rate) }))
}

function draftToIncomeTaxSteps(drafts: IncomeTaxStepDraft[]): IncomeTaxStep[] {
  return drafts.map(d => ({ upTo: Number(d.upTo) || 0, rate: Number(d.rate) || 0 }))
}

const emptyIncomeTaxSteps: IncomeTaxStep[] = [
  { upTo: 0, rate: 0 },
]

const emptyIncomeTaxStepsDraft: IncomeTaxStepDraft[] = [
  { upTo: '', rate: '' },
]

function IncomeTaxSection({
  incomeTaxBrackets, setIncomeTaxBrackets, incomeTaxDrafts, setIncomeTaxDrafts, incomeTaxSaved, setIncomeTaxSaved, newIncomeTaxYear, setNewIncomeTaxYear,
}: {
  incomeTaxBrackets: Record<string, IncomeTaxStep[]>; setIncomeTaxBrackets: React.Dispatch<React.SetStateAction<Record<string, IncomeTaxStep[]>>>
  incomeTaxDrafts: Record<string, IncomeTaxStepDraft[]>; setIncomeTaxDrafts: React.Dispatch<React.SetStateAction<Record<string, IncomeTaxStepDraft[]>>>
  incomeTaxSaved: string | null; setIncomeTaxSaved: React.Dispatch<React.SetStateAction<string | null>>
  newIncomeTaxYear: string; setNewIncomeTaxYear: React.Dispatch<React.SetStateAction<string>>
}) {
  const inp = (value: string, onChange: (v: string) => void, width = '90px') => (
    <input type="number" step="0.01" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width, padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.85rem', textAlign: 'center' as const }} />
  )

  const thStyle: React.CSSProperties = { padding: '0.5rem 0.6rem', fontSize: '0.8rem', color: '#1e5a8a', fontWeight: 600, background: '#e0f0ff', border: '1px solid #c4dff0', textAlign: 'center' }
  const tdStyle: React.CSSProperties = { padding: '0.4rem 0.5rem', border: '1px solid #e2e8f0', textAlign: 'center' }

  return (
    <section>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', color: '#b45309' }}>מדרגות מס הכנסה — שנתי</h2>
      <a href="https://www.gov.il/BlobFolder/generalpage/income-tax-annual-deductions-booklet/he/generalInformation_income-tax-yearly-deductions-booklet_yearly-deductions-booklet-2025.pdf" target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: '#6b7280', display: 'inline-block' }}>חוברת ניכויים שנתית — לפרטים מלאים</a>
      <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>סכומים שנתיים בש&quot;ח. המדרגה האחרונה תחול על כל הכנסה מעל הסכום שצוין.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {Object.keys(incomeTaxBrackets).sort().reverse().map((year) => {
          const drafts = incomeTaxDrafts[year]
          if (!drafts) return null
          const orig = incomeTaxBrackets[year]
          const unchanged = orig && JSON.stringify(draftToIncomeTaxSteps(drafts)) === JSON.stringify(orig)

          return (
            <div key={year} style={{ padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', background: '#fafafa' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{year}</span>
                <button
                  onClick={async () => {
                    const steps = draftToIncomeTaxSteps(drafts)
                    const token = await getIdToken()
                    if (!token) return
                    const updated = { ...incomeTaxBrackets, [year]: steps }
                    const res = await fetch('/api/admin/tax-settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ incomeTaxBrackets: updated }),
                    })
                    if (res.ok) {
                      setIncomeTaxBrackets(updated)
                      setIncomeTaxSaved(year)
                      setTimeout(() => setIncomeTaxSaved(null), 2000)
                    }
                  }}
                  disabled={!!unchanged}
                  style={{
                    padding: '0.25rem 0.75rem',
                    background: incomeTaxSaved === year ? '#10b981' : unchanged ? '#e5e7eb' : '#2563eb',
                    color: unchanged ? '#9ca3af' : '#fff',
                    border: 'none', borderRadius: '0.375rem', fontSize: '0.8rem', cursor: 'pointer',
                  }}
                >
                  {incomeTaxSaved === year ? '✓' : 'שמור'}
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table dir="rtl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>מדרגה</th>
                      <th style={thStyle}>הכנסה שנתית עד (₪)</th>
                      <th style={thStyle}>שיעור מס (%)</th>
                      <th style={{ ...thStyle, width: '50px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((step, idx) => (
                      <tr key={idx}>
                        <td style={tdStyle}>{idx + 1}</td>
                        <td style={tdStyle}>
                          {idx === drafts.length - 1
                            ? <span style={{ fontSize: '0.8rem', color: '#64748b' }}>ומעלה</span>
                            : inp(step.upTo, v => setIncomeTaxDrafts(prev => {
                                const arr = [...(prev[year] || [])]
                                arr[idx] = { ...arr[idx], upTo: v }
                                return { ...prev, [year]: arr }
                              }), '120px')
                          }
                        </td>
                        <td style={tdStyle}>
                          {inp(step.rate, v => setIncomeTaxDrafts(prev => {
                            const arr = [...(prev[year] || [])]
                            arr[idx] = { ...arr[idx], rate: v }
                            return { ...prev, [year]: arr }
                          }), '80px')}%
                        </td>
                        <td style={tdStyle}>
                          {drafts.length > 1 && (
                            <button
                              onClick={() => setIncomeTaxDrafts(prev => {
                                const arr = [...(prev[year] || [])]
                                arr.splice(idx, 1)
                                return { ...prev, [year]: arr }
                              })}
                              style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.9rem' }}
                              title="הסר מדרגה"
                            >✕</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => setIncomeTaxDrafts(prev => {
                  const arr = [...(prev[year] || [])]
                  arr.push({ upTo: '', rate: '' })
                  return { ...prev, [year]: arr }
                })}
                style={{ marginTop: '0.5rem', padding: '0.2rem 0.6rem', background: '#fff7ed', color: '#b45309', border: '1px solid #fed7aa', borderRadius: '0.375rem', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                + הוסף מדרגה
              </button>
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="number" dir="ltr" placeholder="שנה" value={newIncomeTaxYear}
            onChange={(e) => setNewIncomeTaxYear(e.target.value)}
            style={{ width: '100px', padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', fontSize: '0.9rem' }}
          />
          <button
            onClick={() => {
              const y = newIncomeTaxYear.trim()
              if (y && /^\d{4}$/.test(y) && !incomeTaxBrackets[y]) {
                setIncomeTaxBrackets(prev => ({ ...prev, [y]: emptyIncomeTaxSteps }))
                setIncomeTaxDrafts(prev => ({ ...prev, [y]: emptyIncomeTaxStepsDraft }))
                setNewIncomeTaxYear('')
              }
            }}
            disabled={!newIncomeTaxYear || !/^\d{4}$/.test(newIncomeTaxYear) || !!incomeTaxBrackets[newIncomeTaxYear]}
            style={{ padding: '0.3rem 0.75rem', background: '#fff7ed', color: '#b45309', border: '1px solid #fed7aa', borderRadius: '0.375rem', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            + הוסף שנה
          </button>
        </div>
      </div>
    </section>
  )
}
