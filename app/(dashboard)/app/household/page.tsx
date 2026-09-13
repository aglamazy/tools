'use client'

import HouseholdExpensePivot from '@/app/components/household/HouseholdExpensePivot'

export default function HouseholdPage() {
  return (
    <div className="tool-page" dir="rtl">
      <div className="card">
        <header>
          <h1>
            <span style={{ marginLeft: '0.5rem' }}>🏡</span>
            משק בית
          </h1>
        </header>
        <HouseholdExpensePivot />
      </div>
    </div>
  )
}
