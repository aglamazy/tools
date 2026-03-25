'use client'

import { useParams } from 'next/navigation'
import AccountingTab from '@/app/components/business/AccountingTab'

export default function AccountingRoute() {
  const params = useParams()
  const id = Number(params.id)

  if (isNaN(id)) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card">
          <p>עסק לא נמצא</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tool-page" dir="rtl">
      <div className="card">
        <AccountingTab businessId={id} />
      </div>
    </div>
  )
}
