'use client'

import React from 'react'

type PartyOption = { value: string; label: string }

type IncomeFiltersProps = {
  filterMode: 'month' | 'year' | 'all'
  onFilterModeChange: (mode: 'month' | 'year' | 'all') => void
  availableMonths: string[]
  selectedMonth: string
  onSelectedMonthChange: (month: string) => void
  selectedYear: string
  onSelectedYearChange: (year: string) => void
  partyOptions: PartyOption[]
  partyFilter: string
  onPartyFilterChange: (value: string) => void
  amountMinFilter: string
  onAmountMinFilterChange: (value: string) => void
  amountMaxFilter: string
  onAmountMaxFilterChange: (value: string) => void
  hasVisibleTransactions: boolean
  monthTotal: number
}

const selectStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderRadius: '0.375rem',
  border: '1px solid #e2e8f0',
  fontSize: '1rem',
  direction: 'rtl',
}

export default function IncomeFilters({
  filterMode, onFilterModeChange, availableMonths, selectedMonth, onSelectedMonthChange,
  selectedYear, onSelectedYearChange, partyOptions, partyFilter, onPartyFilterChange,
  amountMinFilter, onAmountMinFilterChange, amountMaxFilter, onAmountMaxFilterChange,
  hasVisibleTransactions, monthTotal,
}: IncomeFiltersProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <label style={{ fontWeight: 600 }}>תקופה:</label>
      <select
        value={filterMode}
        onChange={(e) => {
          const mode = e.target.value as 'month' | 'year' | 'all'
          onFilterModeChange(mode)
          if (mode === 'year' && !selectedYear) {
            const years = [...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a))
            if (years.length > 0) onSelectedYearChange(years[0])
          }
        }}
        style={selectStyle}
      >
        <option value="month">חודש</option>
        <option value="year">שנה</option>
        <option value="all">הכל</option>
      </select>
      {filterMode === 'month' && (
        <select
          value={selectedMonth}
          onChange={(e) => onSelectedMonthChange(e.target.value)}
          style={selectStyle}
        >
          {availableMonths.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      )}
      {filterMode === 'year' && (
        <select
          value={selectedYear}
          onChange={(e) => onSelectedYearChange(e.target.value)}
          style={selectStyle}
        >
          {[...new Set(availableMonths.map(m => m.split('/')[1]))].sort((a, b) => Number(b) - Number(a)).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}
      {partyOptions.length > 1 && (
        <select
          value={partyFilter}
          onChange={(e) => onPartyFilterChange(e.target.value)}
          style={selectStyle}
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
          onChange={(e) => onAmountMinFilterChange(e.target.value)}
          style={{ padding: '0.45rem 0.7rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '110px', direction: 'ltr' }}
        />
        <input
          type="number"
          min="0"
          placeholder="מקסימום"
          value={amountMaxFilter}
          onChange={(e) => onAmountMaxFilterChange(e.target.value)}
          style={{ padding: '0.45rem 0.7rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', fontSize: '0.9rem', width: '110px', direction: 'ltr' }}
        />
      </div>
      {hasVisibleTransactions && (
        <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
          סה"כ: ₪{monthTotal.toLocaleString()}
        </span>
      )}
    </div>
  )
}
