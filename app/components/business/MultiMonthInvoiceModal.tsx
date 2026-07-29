'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ypayService } from '@/app/services/ypayService'
import { harvestTaskStore } from '@/app/stores/harvestTaskStore'
import { timeEntryStore } from '@/app/stores/timeEntryStore'
import { db } from '@/app/db/financeDB'
import type { Business, Project } from '@/app/db/financeDB'
import { getMonthDates, formatHours } from '@/app/lib/dateUtils'
import { VAT_RATE_AUTHORIZED_DEALER, billingDocLabel } from '@/app/lib/vat'

// How many months back to scan for tracked hours.
const SCAN_MONTHS = 24

type MonthRow = {
  monthName: string
  monthOffset: number
  hours: number
  invoiced: boolean
  serialNumber?: string
}

type Props = {
  business: Business
  project: Project
  vatType?: 'exempt' | 'authorized'
  onClose: () => void
  onCreated: (serialNumber: string, monthNames: string[]) => void
  onError: (message: string) => void
}

// month offset (relative to now) for a YYYY-MM-DD date
function offsetOfDate(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number)
  const now = new Date()
  return (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth())
}

// last working day (Sun–Thu) of the month at the given offset — mirrors TimingTab
function getLastWorkingDay(offset: number): string {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  while (lastDay.getDay() === 5 || lastDay.getDay() === 6) {
    lastDay.setDate(lastDay.getDate() - 1)
  }
  return lastDay.toISOString().split('T')[0]
}

export default function MultiMonthInvoiceModal({ business, project, vatType, onClose, onCreated, onError }: Props) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MonthRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const effectiveVat = vatType || business.vatType
  const docLabel = billingDocLabel(effectiveVat)
  const isAuthorized = effectiveVat === 'authorized'
  const rate = project.defaultHourlyRate || 0

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const tasks = await harvestTaskStore.getByProjectId(project.syncId!)
        const taskIds = new Set(tasks.map(t => t.syncId!))
        const rangeStart = getMonthDates(-(SCAN_MONTHS - 1)).start
        const rangeEnd = getMonthDates(0).end
        const entries = await timeEntryStore.getByDateRange(rangeStart, rangeEnd)

        // sum hours per month for this project
        const byMonth = new Map<number, number>()
        for (const e of entries) {
          if (!taskIds.has(e.taskId)) continue
          const off = offsetOfDate(e.date)
          byMonth.set(off, (byMonth.get(off) || 0) + e.hours)
        }

        const built: MonthRow[] = []
        for (const [off, hours] of byMonth) {
          if (hours <= 0) continue
          const monthName = getMonthDates(off).monthName
          const doc = await db.ypayDocuments
            .filter(d => d.transactionId === `invoice:${project.name}:${monthName}`)
            .first()
          built.push({
            monthName,
            monthOffset: off,
            hours,
            invoiced: !!doc,
            serialNumber: doc?.serialNumber,
          })
        }
        // chronological (oldest → newest)
        built.sort((a, b) => a.monthOffset - b.monthOffset)

        if (cancelled) return
        setRows(built)
        // pre-select un-invoiced months with hours
        setSelected(new Set(built.filter(r => !r.invoiced).map(r => r.monthName)))
      } catch (err: any) {
        if (!cancelled) onError(err?.message || 'שגיאה בטעינת שעות')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [project.id, project.name, onError])

  const toggle = (monthName: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(monthName)) next.delete(monthName)
    else next.add(monthName)
    return next
  })

  const selectedRows = useMemo(
    () => rows.filter(r => selected.has(r.monthName)).sort((a, b) => a.monthOffset - b.monthOffset),
    [rows, selected],
  )
  const preVat = selectedRows.reduce((sum, r) => sum + r.hours * rate, 0)
  const vatAmount = isAuthorized ? preVat * VAT_RATE_AUTHORIZED_DEALER : 0
  const total = preVat + vatAmount
  const totalHours = selectedRows.reduce((sum, r) => sum + r.hours, 0)
  const latestOffset = selectedRows.length ? selectedRows[selectedRows.length - 1].monthOffset : 0
  const invoiceDate = getLastWorkingDay(latestOffset)

  const handleCreate = async () => {
    if (!rate) { onError('לא הוגדר תעריף שעתי לפרויקט'); return }
    if (!project.contactEmail) { onError('לא הוגדר אימייל איש קשר לפרויקט'); return }
    if (!selectedRows.length) { onError('בחר לפחות חודש אחד'); return }
    setCreating(true)
    try {
      const result = await ypayService.createMultiMonthInvoice(business, {
        projectName: project.name,
        months: selectedRows.map(r => ({ monthName: r.monthName, totalHours: r.hours })),
        hourlyRate: rate,
        date: invoiceDate,
        contact: {
          name: project.name,
          email: project.contactEmail,
          businessID: project.contactBusinessID,
          phone: project.contactPhone,
        },
        vatType,
      })
      window.open(result.url, '_blank')
      onCreated(result.serialNumber, selectedRows.map(r => r.monthName))
      onClose()
    } catch (err: any) {
      onError(err?.message || 'שגיאה ביצירת חשבונית')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', borderRadius: '0.75rem', padding: '1.5rem', width: '520px', maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', direction: 'rtl' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{docLabel} — {project.name}</h3>
        <p style={{ margin: '0 0 1rem', color: '#64748b', fontSize: '0.85rem' }}>
          בחר את החודשים לחיוב. חודשים שטרם חויבו מסומנים אוטומטית.
        </p>

        {loading ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>טוען שעות…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>אין שעות רשומות לפרויקט זה.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1rem' }}>
              {rows.map(r => {
                const checked = selected.has(r.monthName)
                return (
                  <label
                    key={r.monthName}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem',
                      background: checked ? '#eff6ff' : '#f8fafc', border: `1px solid ${checked ? '#93c5fd' : '#e2e8f0'}`,
                      borderRadius: '0.375rem', cursor: 'pointer',
                    }}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(r.monthName)} />
                    <span style={{ flex: 1, fontWeight: 600 }}>{r.monthName}</span>
                    <span style={{ color: '#0369a1', fontWeight: 600 }}>{formatHours(r.hours)} ש׳</span>
                    {r.invoiced ? (
                      <span style={{ fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '0.375rem', padding: '0.125rem 0.5rem', fontWeight: 600 }}>
                        חויב #{r.serialNumber}
                      </span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{(r.hours * rate).toFixed(0)} ₪</span>
                    )}
                  </label>
                )
              })}
            </div>

            {selectedRows.length > 0 && (
              <div style={{ background: '#f8fafc', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>פריטי החשבונית ({selectedRows.length} חודשים):</span>
                {selectedRows.map(r => (
                  <div key={r.monthName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span>{project.name} — {r.monthName} ({r.hours.toFixed(2)} ש׳ × {rate} ₪)</span>
                    <span style={{ fontWeight: 600 }}>{(r.hours * rate).toFixed(2)} ₪</span>
                  </div>
                ))}
                <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '0.25rem 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#64748b' }}>
                  <span>סה״כ שעות</span><span>{totalHours.toFixed(2)}</span>
                </div>
                {isAuthorized ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>סכום ללא מע״מ</span><span>{preVat.toFixed(2)} ₪</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>מע״מ ({Math.round(VAT_RATE_AUTHORIZED_DEALER * 100)}%)</span><span>{vatAmount.toFixed(2)} ₪</span>
                    </div>
                  </>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.05rem', color: '#1e40af' }}>
                  <span>סה״כ</span><span>{total.toFixed(2)} ₪</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b' }}>
                  <span>תאריך מסמך</span><span>{invoiceDate.split('-').reverse().join('/')}</span>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
          <button
            disabled={creating || loading || selectedRows.length === 0}
            onClick={() => void handleCreate()}
            style={{
              padding: '0.5rem 1.25rem', background: (creating || selectedRows.length === 0) ? '#94a3b8' : '#6366f1',
              color: 'white', border: 'none', borderRadius: '0.375rem',
              cursor: (creating || selectedRows.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 600,
            }}
          >
            {creating ? 'יוצר…' : 'צור'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '0.5rem 1.25rem', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer' }}
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
