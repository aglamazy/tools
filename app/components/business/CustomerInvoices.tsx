'use client'

import React, { useEffect, useMemo, useState } from 'react'
import type { Business } from '@/app/db/financeDB'
import { businessStore } from '@/app/stores/businessStore'
import { getTaxProfile } from '@/app/components/TaxProfileSection'
import type { StudentLessons } from '@/app/services/billing/monthScan'
import { groupCustomers, issueCustomerInvoice, lessonKey, type Customer } from '@/app/services/billing/customerInvoices'

type CustomerInvoicesProps = {
  businessId: string
  matched: StudentLessons[]
  year: number
  month: number // 1-based
}

type Issued = { url: string; serialNumber: string }

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const cardStyle: React.CSSProperties = { padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }
const cellStyle: React.CSSProperties = { padding: '0.4rem 0.5rem' }

/**
 * Calendar billing, slice 5 (aglamazo#432): one step per paying customer (a
 * student email — siblings share one). Each step lists the customer's
 * students with their lessons (untick a lesson that did not happen), and an
 * approve button that issues ONE invoice for the customer, one line per student.
 * Students with no email are listed as blocked and are not billed.
 */
export default function CustomerInvoices({ businessId, matched, year, month }: CustomerInvoicesProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [vatType, setVatType] = useState<'exempt' | 'authorized' | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [issuing, setIssuing] = useState<string | null>(null)
  const [issued, setIssued] = useState<Record<string, Issued>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const b = await businessStore.getBySyncId(businessId)
        if (cancelled) return
        setBusiness(b || null)
        if (!b) {
          setLoadError('העסק לא נמצא')
          return
        }
        const profile = await getTaxProfile(b.userId)
        if (!cancelled) setVatType(profile.vatType)
      } catch (err) {
        console.error('CustomerInvoices: failed to load business / tax profile', err)
        if (!cancelled) setLoadError('שגיאה בטעינת פרטי העסק')
      }
    }
    void load()
    return () => { cancelled = true }
  }, [businessId])

  // A new month starts with every lesson ticked and nothing issued.
  useEffect(() => {
    setExcluded(new Set())
    setIssued({})
    setErrors({})
    setExpanded(null)
  }, [year, month])

  const { customers, blocked } = useMemo(() => groupCustomers(matched, excluded), [matched, excluded])

  const hasYpay = business?.ypayUseSandbox
    ? !!(business?.ypaySandboxClientId && business?.ypaySandboxClientSecret)
    : !!(business?.ypayClientId && business?.ypayClientSecret)

  const toggleLesson = (key: string) => {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleApprove = async (customer: Customer) => {
    if (!business || issuing) return
    setIssuing(customer.email)
    setErrors(prev => ({ ...prev, [customer.email]: '' }))
    try {
      const result = await issueCustomerInvoice(business, customer, { year, month, date: todayLocal(), vatType })
      console.log('[aglamazo#432] customer invoice issued', customer.email, result.serialNumber)
      setIssued(prev => ({ ...prev, [customer.email]: result }))
      window.open(result.url, '_blank')
    } catch (err) {
      console.error('[aglamazo#432] customer invoice failed', customer.email, err)
      const message = err instanceof Error && err.message ? err.message : 'שגיאה בהפקת חשבונית'
      setErrors(prev => ({ ...prev, [customer.email]: message }))
    } finally {
      setIssuing(null)
    }
  }

  if (customers.length === 0 && blocked.length === 0) return null

  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem' }}>חשבוניות ללקוחות</h3>
      {loadError && <p style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem' }}>{loadError}</p>}
      {business && !hasYpay && (
        <p style={{ margin: 0, color: '#92400e', fontSize: '0.85rem' }}>יש להגדיר חיבור YPAY בהגדרות העסק לפני הפקת חשבוניות</p>
      )}

      {customers.map((customer) => {
        const done = issued[customer.email]
        const error = errors[customer.email]
        const isOpen = expanded === customer.email
        const busy = issuing === customer.email
        return (
          <div key={customer.email} style={{ padding: '0.75rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, direction: 'ltr' }}>{customer.email}</span>
              <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{customer.lessonCount} שיעורים</span>
              <span style={{ fontWeight: 700, color: '#059669' }}>₪{customer.total.toLocaleString()}</span>
              <button
                onClick={() => setExpanded(isOpen ? null : customer.email)}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                {isOpen ? 'הסתרת שיעורים' : 'עריכת שיעורים'}
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              <tbody>
                {customer.students.map((line) => (
                  <tr key={line.student.syncId ?? line.student.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{line.student.name}</td>
                    <td style={{ ...cellStyle, textAlign: 'center' }}>{line.count} שיעורים × ₪{line.rate}</td>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 600 }}>₪{line.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {isOpen && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {customer.students.flatMap(line => line.lessons.map(lesson => {
                  const key = lessonKey(lesson)
                  return (
                    <label key={key} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.8rem', color: '#475569' }}>
                      <input type="checkbox" checked={!excluded.has(key)} disabled={busy || !!done} onChange={() => toggleLesson(key)} />
                      <span>{lesson.date.split('-').reverse().join('/')}</span>
                      <span>{lesson.startTime}</span>
                      <span>{line.student.name}</span>
                    </label>
                  )
                }))}
              </div>
            )}

            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {done ? (
                <span style={{ color: '#059669', fontSize: '0.85rem' }}>
                  ✓ הופקה חשבונית #{done.serialNumber}{' '}
                  <a href={done.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>פתיחה</a>
                </span>
              ) : (
                <button
                  onClick={() => void handleApprove(customer)}
                  disabled={!business || !hasYpay || !!issuing || customer.total <= 0}
                  className="file-picker"
                >
                  {busy ? 'הפקת חשבונית...' : 'אישור והפקת חשבונית'}
                </button>
              )}
              {error && <span style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</span>}
            </div>
          </div>
        )
      })}

      {blocked.length > 0 && (
        <div style={{ padding: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.5rem' }}>
          {blocked.map(({ student, lessons, reason }) => (
            <div key={student.syncId ?? student.id} style={{ fontSize: '0.85rem', color: '#92400e' }}>
              ⚠ {student.name} ({lessons.length} שיעורים) — {reason} (בלשונית תלמידים)
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
