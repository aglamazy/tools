'use client'

import { useParams } from 'next/navigation'
import BusinessPage from '@/app/components/business/BusinessPage'
import { useResolvedBusinessId } from '@/app/hooks/useResolvedBusinessId'

export default function BusinessRoute() {
  const params = useParams()
  const businessId = useResolvedBusinessId(String(params.id))

  if (businessId === undefined) {
    return (
      <div className="tool-page" dir="rtl">
        <div className="card">
          <p>טוען...</p>
        </div>
      </div>
    )
  }

  if (businessId === null) {
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
      <BusinessPage businessId={businessId} />
    </div>
  )
}
