'use client'

import React from 'react'

type PartyOption = { value: string; label: string }

type Props = {
  filterMode: 'month' | 'year' | 'all'
  setFilterMode: (m: 'month' | 'year' | 'all') => void
  selectedMonth: string
  setSelectedMonth: (m: string) => void
  selectedYear: string
  setSelectedYear: (y: string) => void
  availableMonths: string[]
  partyOptions: PartyOption[]
  partyFilter: string
  setPartyFilter: (v: string) => void
  amountMinFilter: string
  setAmountMinFilter: (v: string) => void
  amountMaxFilter: string
  setAmountMaxFilter: (v: string) => void
  showTotals: boolean
  monthTotal: number
  vatTotal: number
  hasDownloadable: boolean
  downloading: boolean
  onDownloadAll: () => void
  showCashForm: boolean
  setShowCashForm: (v: (f: boolean) => boolean) => void
  hasMultipleParticipants: boolean
  onOpenPartnerImport: () => void
}

export default function ExpenseFiltersBar({
  filterMode, setFilterMode, selectedMonth, setSelectedMonth, selectedYear, setSelectedYear,
  availableMonths, partyOptions, partyFilter, setPartyFilter,
  amountMinFilter, setAmountMinFilter, amountMaxFilter, setAmountMaxFilter,
  showTotals, monthTotal, vatTotal, hasDownloadable, downloading, onDownloadAll,
  showCashForm, setShowCashForm, hasMultipleParticipants, onOpenPartnerImport,
}: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <label style={{ fontWeight: 600 }}>תקופה:</label>
      <select
        value={filterMode}
        onChange={(e) => {
          const mode = e.target.value as 'month' | 'year' | 'all'
          setFilterMode(mode)
          if (mode === 'year' && !selectedYear) {
            const years = [...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a))
            if (years.length > 0) setSelectedYear(years[0])
          }
        }}
        style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '1rem', direction: 'rtl' }}
      >
        <option value="month">חודש</option>
        <option value="year">שנה</option>
        <option value="all">הכל</option>
      </select>
      {filterMode === 'month' && (
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '1rem', direction: 'rtl' }}
        >
          {availableMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      {filterMode === 'year' && (
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '1rem', direction: 'rtl' }}
        >
          {[...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a)).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {partyOptions.length > 1 && (
        <select
          value={partyFilter}
          onChange={(e) => setPartyFilter(e.target.value)}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '1rem', direction: 'rtl' }}
        >
          <option value="all">צד: הכל</option>
          {partyOptions.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem', color: '#64748b' }}>סכום:</label>
        <input
          type="number"
          min="0"
          placeholder="מינימום"
          value={amountMinFilter}
          onChange={(e) => setAmountMinFilter(e.target.value)}
          style={{ padding: '0.45rem 0.7rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '110px', direction: 'ltr' }}
        />
        <input
          type="number"
          min="0"
          placeholder="מקסימום"
          value={amountMaxFilter}
          onChange={(e) => setAmountMaxFilter(e.target.value)}
          style={{ padding: '0.45rem 0.7rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '110px', direction: 'ltr' }}
        />
      </div>
      {showTotals ? (
        <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
          סה"כ: ₪{monthTotal.toLocaleString()}
          {vatTotal > 0 && ` (מע״מ: ₪${vatTotal.toLocaleString()})`}
        </span>
      ) : null}
      {hasDownloadable && (
        <button
          onClick={onDownloadAll}
          disabled={downloading}
          style={{ padding: '0.4rem 0.8rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', background: downloading ? '#f1f5f9' : '#fff', cursor: downloading ? 'wait' : 'pointer', fontSize: '0.85rem' }}
        >
          {downloading ? '...מוריד' : '📥 הורד הכל (ZIP)'}
        </button>
      )}
      <button
        onClick={() => setShowCashForm(f => !f)}
        style={{ padding: '0.4rem 0.8rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', background: showCashForm ? '#f1f5f9' : '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
      >
        + מזומן
      </button>
      {hasMultipleParticipants && (
        <button
          onClick={onOpenPartnerImport}
          title="ייבוא מרובה של חשבוניות ששילם שותף — בחר מי שילם וקבצים מרובים, ערוך פרטים, אשר"
          style={{ padding: '0.4rem 0.8rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          + ייבוא חשבוניות מ-שותף
        </button>
      )}
    </div>
  )
}
