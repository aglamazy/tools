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
          {business.type !== BusinessType.Personal && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                סוג עוסק (למע"מ) <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="vatType"
                    checked={business.vatType === 'exempt' && !business.isTaxFree}
                    onChange={() => onChange({ ...business, vatType: 'exempt', isTaxFree: false })}
                  />
                  <span>פטור</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="vatType"
                    checked={business.vatType === 'authorized'}
                    onChange={() => onChange({ ...business, vatType: 'authorized', isTaxFree: false })}
                  />
                  <span>עוסק מורשה</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="vatType"
                    checked={business.isTaxFree === true}
                    onChange={() => onChange({ ...business, vatType: 'exempt', isTaxFree: true })}
                  />
                  <span>השכרת דירה</span>
                </label>
              </div>
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                {business.isTaxFree ? 'השכרת דירה למגורים — פטור ממס עד לתקרה' : business.vatType === 'exempt' ? 'יופק: קבלה' : business.vatType === 'authorized' ? 'יופק: חשבונית מס קבלה' : ''}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button onClick={onCancel} className="upload-another-btn">
              ביטול
            </button>
            <button
              onClick={onSave}
              className="file-picker"
              disabled={!business.name.trim() || (business.type !== BusinessType.Personal && !business.vatType)}
            >
              שמור
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
