'use client'

import { useParams } from 'next/navigation'
import BusinessPage from '@/app/components/business/BusinessPage'

export default function BusinessRoute() {
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
      <BusinessPage businessId={id} />
    </div>
  )
}
