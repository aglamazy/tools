'use client'

import React, { useEffect, useState } from 'react'
import Modal from '@/app/components/Modal'
import MonthlyComparisonChart, { type MonthlySeries, type ScaleMode } from './MonthlyComparisonChart'

type Props = {
  isOpen: boolean
  onClose: () => void
  title: string
  initialYear: number
  years: number[]
  /** Series for one year; each has 12 values Jan..Dec (null = no data). */
  loadSeries: (year: number) => Promise<MonthlySeries[]>
  unit: string
  scaleMode: ScaleMode
}

/**
 * A year selector over MonthlyComparisonChart (aglamazo#465). Generic: the
 * caller decides what is charted by the loadSeries it passes.
 */
export default function YearlyMonthlyModal({ isOpen, onClose, title, initialYear, years, loadSeries, unit, scaleMode }: Props) {
  const [year, setYear] = useState(initialYear)
  const [series, setSeries] = useState<MonthlySeries[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (isOpen) setYear(initialYear) }, [isOpen, initialYear])

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setSeries(null)
    setError(null)
    loadSeries(year)
      .then((s) => { if (!cancelled) setSeries(s) })
      .catch((err: unknown) => {
        console.error('[YearlyMonthlyModal] loadSeries failed', year, err)
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => { cancelled = true }
  }, [isOpen, year, loadSeries])

  const yearOptions = Array.from(new Set([...years, initialYear])).sort((a, b) => b - a)
  const hasData = !!series && series.some((s) => s.values.some((v) => v !== null))

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="820px">
      <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingInlineEnd: '2rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{title}</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
            שנה
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="שנה">
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        {error && <p style={{ color: '#b91c1c' }}>טעינת הנתונים נכשלה: {error}</p>}
        {!error && !series && <p style={{ color: '#64748b' }}>טוען...</p>}
        {!error && series && !hasData && <p style={{ color: '#64748b' }}>אין נתונים לשנה {year}.</p>}
        {!error && series && hasData && <MonthlyComparisonChart series={series} unit={unit} scaleMode={scaleMode} />}
      </div>
    </Modal>
  )
}
