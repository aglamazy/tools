'use client'

import TaxesTab from '@/app/components/business/TaxesTab'

export default function TaxesPage() {
  return (
    <main className="app" dir="rtl">
      <div className="card">
        <h2 style={{ margin: '0 0 1rem 0' }}>מסים</h2>
        <TaxesTab />
      </div>
    </main>
  )
}
