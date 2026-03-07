'use client'

import { useParams } from 'next/navigation'
import ReceiptsTab from '@/app/components/business/ReceiptsTab'

export default function ReceiptsRoute() {
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
        <ReceiptsTab businessId={id} />
      </div>
    </div>
  )
}
