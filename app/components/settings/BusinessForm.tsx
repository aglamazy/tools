'use client'

import React from 'react'
import { BusinessType } from '@/app/types/business'
import type { BusinessUI } from '@/app/types/business'

type BusinessFormProps = {
  business: BusinessUI
  onChange: (business: BusinessUI) => void
  onSave: () => void
  onCancel: () => void
  isNew: boolean
}

export default function BusinessForm({ business, onChange, onSave, onCancel, isNew }: BusinessFormProps) {
  return (
    <>
      <div className="modal-header">
        <h2>{isNew ? 'הוספת עסק' : 'עריכת עסק'}</h2>
      </div>
      <div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              שם העסק
            </label>
            <input
              type="text"
              value={business.name}
              onChange={(e) => onChange({ ...business, name: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                fontSize: '1rem',
                direction: 'rtl',
              }}
              placeholder="הזן שם עסק..."
              autoFocus
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
              סוג
            </label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="businessType"
                  checked={business.type === BusinessType.Personal}
                  onChange={() => onChange({ ...business, type: BusinessType.Personal, isTaxFree: false })}
                />
                <span>🏠 אישי/בית</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="businessType"
                  checked={business.type === BusinessType.Business}
                  onChange={() => onChange({ ...business, type: BusinessType.Business })}
                />
                <span>🏢 עסקי</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="businessType"
                  checked={business.type === BusinessType.Employee}
                  onChange={() => onChange({ ...business, type: BusinessType.Employee, vatType: undefined, isTaxFree: false })}
                />
                <span>💼 שכיר</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="businessType"
                  checked={business.type === BusinessType.Teacher}
                  onChange={() => onChange({ ...business, type: BusinessType.Teacher })}
                />
                <span>👩‍🏫 מורה פרטית</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="businessType"
                  checked={business.type === BusinessType.Artist}
                  onChange={() => onChange({ ...business, type: BusinessType.Artist })}
                />
                <span>🎨 אמן</span>
              </label>
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={!!business.isTaxFree}
                onChange={(e) => onChange({ ...business, isTaxFree: e.target.checked })}
              />
              <span>🏠 השכרת דירה למגורים — פטור ממס עד לתקרה</span>
            </label>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
              סמן אם העסק הוא השכרת דירת מגורים. הכנסה ממנה מחושבת מול תקרת השכרה ולא מול תקרת עוסק פטור.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button onClick={onCancel} className="upload-another-btn">
              ביטול
            </button>
            <button
              onClick={onSave}
              className="file-picker"
              disabled={!business.name.trim()}
            >
              שמור
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
