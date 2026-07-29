'use client'

import { useParams } from 'next/navigation'
import AccountingTab from '@/app/components/business/AccountingTab'
import { useResolvedBusiness } from '@/app/hooks/useResolvedBusinessId'

export default function AccountingRoute() {
  const params = useParams()
  const business = useResolvedBusiness(String(params.id))

  if (business === undefined) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card">
          <p>טוען...</p>
        </div>
      </div>
    )
  }

  if (business === null || !business.syncId) {
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
        <AccountingTab businessId={business.syncId} />
      </div>
    </div>
  )
}
