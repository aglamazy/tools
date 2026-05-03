'use client'

import React from 'react'
import type { WeekEntry } from './timingTypes'
import {
  formatHours,
  getMonthDates,
  getCalendarDays,
  DAY_NAMES_HE,
} from '@/app/lib/dateUtils'
import { billingDocLabel, type VatType } from '@/app/lib/vat'

type MonthlyCalendarViewProps = {
  monthOffset: number
  onMonthOffsetChange: (offset: number) => void
  weekEntries: WeekEntry[]
  weekTotal: number
  hasYpay: boolean
  vatType?: VatType
  createdInvoices: Record<string, string>
  onExportToExcel: (projectName: string, entries: WeekEntry[]) => void
  onCreateInvoice: (projectName: string, totalHours: number) => void
  onEmailReport: (projectName: string, entries: WeekEntry[]) => void
  onDayClick: (date: string) => void
}

export default function MonthlyCalendarView({
  monthOffset, onMonthOffsetChange, weekEntries, weekTotal,
  hasYpay, vatType, createdInvoices, onExportToExcel, onCreateInvoice, onEmailReport, onDayClick,
}: MonthlyCalendarViewProps) {
  const docLabel = billingDocLabel(vatType)
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => onMonthOffsetChange(monthOffset - 1)}
            style={{
              padding: '0.25rem 0.5rem', background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.9rem',
            }}
          >►</button>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {getMonthDates(monthOffset).monthName}
          </h3>
          <button
            onClick={() => onMonthOffsetChange(monthOffset + 1)}
            disabled={monthOffset === 0}
            style={{
              padding: '0.25rem 0.5rem', background: '#f1f5f9', border: '1px solid #cbd5e1',
              borderRadius: '0.25rem', cursor: monthOffset === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem', opacity: monthOffset === 0 ? 0.5 : 1,
            }}
          >◄</button>
          {monthOffset !== 0 && (
            <button
              onClick={() => onMonthOffsetChange(0)}
              style={{
                padding: '0.25rem 0.5rem', background: '#dbeafe', border: '1px solid #93c5fd',
                borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem', color: '#1e40af',
              }}
            >חודש נוכחי</button>
          )}
        </div>
        <span style={{ fontWeight: 500, color: '#64748b' }}>{formatHours(weekTotal)} שעות</span>
      </div>

      {weekEntries.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(() => {
            const projectGroups = new Map<string, { projectName: string; entries: WeekEntry[] }>()
            weekEntries.forEach(entry => {
              if (!projectGroups.has(entry.projectName)) {
                projectGroups.set(entry.projectName, { projectName: entry.projectName, entries: [] })
              }
              projectGroups.get(entry.projectName)!.entries.push(entry)
            })

            const calendarDays = getCalendarDays(monthOffset)

            return Array.from(projectGroups.values()).map(project => {
              const projectTotal = project.entries.reduce((sum, e) => sum + e.hours, 0)

              const entriesByDate = new Map<string, { hours: number; tasks: string[] }>()
              project.entries.forEach(entry => {
                if (!entriesByDate.has(entry.date)) {
                  entriesByDate.set(entry.date, { hours: 0, tasks: [] })
                }
                const dayData = entriesByDate.get(entry.date)!
                dayData.hours += entry.hours
                if (!dayData.tasks.includes(entry.taskName)) dayData.tasks.push(entry.taskName)
              })

              const hasSaturdayEntries = project.entries.some(entry => new Date(entry.date).getDay() === 6)
              const hasFridayEntries = project.entries.some(entry => new Date(entry.date).getDay() === 5)

              let visibleDays: string[]
              let numColumns: number
              let excludeDays: number[]

              if (hasSaturdayEntries) {
                visibleDays = DAY_NAMES_HE; numColumns = 7; excludeDays = []
              } else if (hasFridayEntries) {
                visibleDays = DAY_NAMES_HE.slice(0, 6); numColumns = 6; excludeDays = [6]
              } else {
                visibleDays = DAY_NAMES_HE.slice(0, 5); numColumns = 5; excludeDays = [5, 6]
              }

              const filteredDays = calendarDays.filter(({ date }) => !excludeDays.includes(new Date(date).getDay()))

              return (
                <div key={project.projectName} style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem', overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '1rem', background: '#e0f2fe', borderBottom: '1px solid #bae6fd',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{project.projectName}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '1.1rem' }}>{formatHours(projectTotal)}</span>
                      <button
                        onClick={() => onExportToExcel(project.projectName, project.entries)}
                        title="ייצא ל-Excel"
                        style={{
                          padding: '0.375rem 0.75rem', background: '#10b981', color: 'white',
                          border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                        }}
                      >📊 Excel</button>
                      {hasYpay && (() => {
                        const serialNumber = createdInvoices[project.projectName]
                        return serialNumber ? (
                          <>
                            <button
                              onClick={() => onEmailReport(project.projectName, project.entries)}
                              title="שלח דוח + חשבונית במייל"
                              style={{
                                padding: '0.375rem 0.75rem', background: '#0ea5e9', color: 'white',
                                border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                              }}
                            >📧 שלח</button>
                            <span style={{
                              padding: '0.375rem 0.75rem', background: '#ecfdf5', color: '#059669',
                              borderRadius: '0.375rem', fontSize: '0.85rem', fontWeight: 600,
                              border: '1px solid #6ee7b7',
                            }}>
                              חשבונית #{serialNumber}
                            </span>
                          </>
                        ) : (
                          <button
                            onClick={() => onCreateInvoice(project.projectName, projectTotal)}
                            title={docLabel}
                            style={{
                              padding: '0.375rem 0.75rem', background: '#6366f1', color: 'white',
                              border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                            }}
                          >{docLabel}</button>
                        )
                      })()}
                    </div>
                  </div>
                  {/* Calendar Grid */}
                  <div style={{ padding: '0.5rem', direction: 'rtl' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: '2px' }}>
                      {visibleDays.map(day => (
                        <div key={day} style={{
                          textAlign: 'center', padding: '0.25rem', fontSize: '0.75rem',
                          fontWeight: 600, color: '#64748b', border: '1px solid transparent',
                        }}>{day}</div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numColumns}, minmax(0, 1fr))`, gap: '2px' }}>
                      {filteredDays.map(({ date, isCurrentMonth }) => {
                        const dayData = entriesByDate.get(date)
                        const dayNum = parseInt(date.split('-')[2])
                        return (
                          <div
                            key={date}
                            onClick={() => onDayClick(date)}
                            style={{
                              background: isCurrentMonth ? 'white' : '#f1f5f9', border: '1px solid #e2e8f0',
                              borderRadius: '0.25rem', padding: '0.25rem', minHeight: '60px',
                              opacity: isCurrentMonth ? 1 : 0.5, cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.125rem' }}>{dayNum}</div>
                            {dayData && (
                              <>
                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0369a1' }}>
                                  {formatHours(dayData.hours)}
                                </div>
                                <div style={{
                                  fontSize: '0.65rem', color: '#64748b', overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{dayData.tasks.join(', ')}</div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      ) : (
        <p style={{ color: '#64748b', textAlign: 'center' }}>אין רישומי זמן בחודש זה</p>
      )}
    </div>
  )
}
