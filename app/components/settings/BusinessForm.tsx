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
          {business.type !== BusinessType.Personal && business.type !== BusinessType.Employee && (
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
          {business.type !== BusinessType.Personal && !business.isTaxFree && business.type !== BusinessType.Employee && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                מקדמות
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={business.btlAdvancePayment || ''}
                    onChange={(e) => onChange({ ...business, btlAdvancePayment: e.target.value ? Number(e.target.value) : undefined })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.9rem',
                      direction: 'ltr',
                    }}
                    placeholder="₪ בל״ל חודשי"
                    min={0}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    ביטוח לאומי (סכום חודשי)
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={business.incomeTaxAdvancePercent ?? ''}
                    onChange={(e) => onChange({ ...business, incomeTaxAdvancePercent: e.target.value ? Number(e.target.value) : undefined })}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.9rem',
                      direction: 'ltr',
                    }}
                    placeholder="% מס הכנסה"
                    min={0}
                    max={100}
                    step={0.1}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    מס הכנסה (% מההכנסה)
                  </span>
                </div>
              </div>
              {(business.incomeTaxAdvancePercent ?? 0) > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>תקופת תשלום:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="advancePeriod"
                      checked={(business.incomeTaxAdvancePeriod ?? 1) === 1}
                      onChange={() => onChange({ ...business, incomeTaxAdvancePeriod: 1 })}
                    />
                    חודשי
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <input
                      type="radio"
                      name="advancePeriod"
                      checked={business.incomeTaxAdvancePeriod === 2}
                      onChange={() => onChange({ ...business, incomeTaxAdvancePeriod: 2 })}
                    />
                    דו-חודשי
                  </label>
                </div>
              )}
            </div>
          )}
          {business.type !== BusinessType.Personal && !business.isTaxFree && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                סדר לחישוב מס
              </label>
              <input
                type="number"
                value={business.taxOrder ?? ''}
                onChange={(e) => onChange({ ...business, taxOrder: e.target.value ? Number(e.target.value) : undefined })}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.9rem',
                  direction: 'ltr',
                }}
                placeholder="1, 2, 3..."
                min={1}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                1 = ראשון (מדרגות נמוכות), 2 = שני (ממשיך מהראשון), וכו׳
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
              disabled={!business.name.trim() || (business.type !== BusinessType.Personal && business.type !== BusinessType.Employee && !business.vatType)}
            >
              שמור
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
