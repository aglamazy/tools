'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Business } from '@/app/db/financeDB'
import { businessStore } from '@/app/stores/businessStore'
import { getTaxProfile } from '@/app/components/TaxProfileSection'
import type { StudentLessons } from '@/app/services/billing/monthScan'
import { billingMonthKey, groupCustomers, issueCustomerInvoice, lessonKey, normalizeEmail, type Customer } from '@/app/services/billing/customerInvoices'
import { approvableCustomers, isCustomerBilled, loadBilledCustomers, markCustomerBilled, type BilledCustomers } from '@/app/services/billing/billedCustomers'

type CustomerInvoicesProps = {
  businessId: string
  matched: StudentLessons[]
  year: number
  month: number // 1-based
}

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
 *
 * Slice 6 (aglamazo#433): a customer that already has an invoice for the
 * month (read from ypayDocuments by business + month + normalized email) is
 * shown as billed and is never approvable; an approve that succeeds marks the
 * customer billed at once, so a second click or re-render cannot issue again.
 */
export default function CustomerInvoices({ businessId, matched, year, month }: CustomerInvoicesProps) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [vatType, setVatType] = useState<'exempt' | 'authorized' | undefined>(undefined)
  const [loadError, setLoadError] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [issuing, setIssuing] = useState<string | null>(null)
  // null = not loaded yet — nothing is approvable until the month's billed customers are known.
  const [billed, setBilled] = useState<BilledCustomers | null>(null)
  const [billedError, setBilledError] = useState('')
  // Synchronous guard against a double click landing before the `issuing` state re-renders.
  const inFlight = useRef(false)
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

  // A new month starts with every lesson ticked.
  useEffect(() => {
    setExcluded(new Set())
    setErrors({})
    setExpanded(null)
  }, [year, month])

  // The month's already-billed customers (aglamazo#433).
  useEffect(() => {
    let cancelled = false
    setBilled(null)
    setBilledError('')
    loadBilledCustomers(businessId, billingMonthKey(year, month))
      .then(result => { if (!cancelled) setBilled(result) })
      .catch(err => {
        console.error('CustomerInvoices: failed to load billed customers', err)
        if (!cancelled) setBilledError('שגיאה בטעינת החשבוניות שהופקו — לא ניתן להפיק חשבוניות')
      })
    return () => { cancelled = true }
  }, [businessId, year, month])

  const { customers, blocked } = useMemo(() => groupCustomers(matched, excluded), [matched, excluded])
  const approvable = useMemo(
    () => new Set((billed ? approvableCustomers(customers, billed) : []).map(c => c.email)),
    [customers, billed],
  )

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
    if (!business || issuing || inFlight.current) return
    if (!billed || isCustomerBilled(billed, customer.email)) return
    inFlight.current = true
    setIssuing(customer.email)
    setErrors(prev => ({ ...prev, [customer.email]: '' }))
    try {
      const result = await issueCustomerInvoice(business, customer, { year, month, date: todayLocal(), vatType })
      console.log('[aglamazo#432] customer invoice issued', customer.email, result.serialNumber)
      setBilled(prev => markCustomerBilled(prev ?? new Map(), customer.email, { serialNumber: result.serialNumber, url: result.url }))
      window.open(result.url, '_blank')
    } catch (err) {
      console.error('[aglamazo#432] customer invoice failed', customer.email, err)
      const message = err instanceof Error && err.message ? err.message : 'שגיאה בהפקת חשבונית'
      setErrors(prev => ({ ...prev, [customer.email]: message }))
    } finally {
      inFlight.current = false
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
      {billedError && <p style={{ margin: 0, color: '#dc2626', fontSize: '0.85rem' }}>{billedError}</p>}

      {customers.map((customer) => {
        const done = billed?.get(normalizeEmail(customer.email))
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
                      <input type="checkbox" checked={!excluded.has(key)} disabled={busy || !!done?.length} onChange={() => toggleLesson(key)} />
                      <span>{lesson.date.split('-').reverse().join('/')}</span>
                      <span>{lesson.startTime}</span>
                      <span>{line.student.name}</span>
                    </label>
                  )
                }))}
              </div>
            )}

            <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {done && done.length > 0 ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                  <span style={{ padding: '0.1rem 0.5rem', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>✓ חשבונית הופקה</span>
                  {done.map(doc => (
                    <span key={doc.serialNumber} style={{ color: '#059669' }}>
                      #{doc.serialNumber}{' '}
                      <a href={doc.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>פתיחה</a>
                    </span>
                  ))}
                </span>
              ) : (
                <button
                  onClick={() => void handleApprove(customer)}
                  disabled={!business || !hasYpay || !!issuing || !approvable.has(customer.email)}
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
