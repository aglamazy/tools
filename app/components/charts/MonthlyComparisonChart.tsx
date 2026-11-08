'use client'

import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { yAxisDomain } from './yAxisDomain'

/** One labelled line: 12 values Jan..Dec; null = no data that month (a gap). */
export type MonthlySeries = { label: string; values: (number | null)[] }

/**
 * 'own'    = each series on its own range (one small chart per series — never
 *            two y-scales on one plot).
 * 'shared' = all series on one plot with one axis.
 */
export type ScaleMode = 'own' | 'shared'

type Props = {
  series: MonthlySeries[]
  /** ISO currency code (e.g. 'ILS') → currency format; anything else is a plain suffix. */
  unit: string
  scaleMode: ScaleMode
  height?: number
}

export const MONTH_LABELS_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']

// Fixed categorical order — color follows the series' position, never cycled.
const SERIES_COLORS = ['#2563eb', '#ea580c', '#059669', '#9333ea']

export function formatUnit(value: number, unit: string, compact = false): string {
  if (/^[A-Z]{3}$/.test(unit)) {
    return new Intl.NumberFormat('he-IL', {
      style: 'currency',
      currency: unit,
      maximumFractionDigits: compact ? 0 : 2,
      ...(compact ? { notation: 'compact' as const } : {}),
    }).format(value)
  }
  const n = new Intl.NumberFormat('he-IL', compact ? { notation: 'compact' } : { maximumFractionDigits: 2 }).format(value)
  return unit ? `${n} ${unit}` : n
}

function toRows(series: MonthlySeries[]) {
  return MONTH_LABELS_HE.map((month, i) => {
    const row: Record<string, string | number | null> = { month }
    series.forEach((s, j) => { row[`s${j}`] = s.values[i] ?? null })
    return row
  })
}

function Plot({ series, colorOffset, unit, height }: { series: MonthlySeries[]; colorOffset: number; unit: string; height: number }) {
  const domain = yAxisDomain(series.flatMap((s) => s.values))
  return (
    // Charts read left→right (Jan..Dec) even inside the RTL page
    <div dir="ltr" style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={toRows(series)} margin={{ top: 12, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" interval={0} tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#d1d5db' }} />
          <YAxis
            domain={domain}
            allowDataOverflow={false}
            tickFormatter={(v: number) => formatUnit(v, unit, true)}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            formatter={(value, name) => [typeof value === 'number' ? formatUnit(value, unit) : '—', String(name)]}
            contentStyle={{ direction: 'rtl', textAlign: 'right' }}
          />
          {series.length > 1 && <Legend />}
          {series.map((s, j) => (
            <Line
              key={j}
              type="linear"
              dataKey={`s${j}`}
              name={s.label}
              stroke={SERIES_COLORS[(colorOffset + j) % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
              activeDot={{ r: 6 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Generic month-by-month chart (Jan..Dec) for any labelled series — a subject,
 * a single expense, an income (aglamazo#465). Knows nothing about where the
 * numbers come from.
 */
export default function MonthlyComparisonChart({ series, unit, scaleMode, height = 320 }: Props) {
  if (series.length === 0) return null
  if (scaleMode === 'shared' || series.length === 1) {
    return <Plot series={series} colorOffset={0} unit={unit} height={height} />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {series.map((s, j) => (
        <div key={j}>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{s.label}</div>
          <Plot series={[s]} colorOffset={j} unit={unit} height={Math.max(160, Math.round(height / 1.6))} />
        </div>
      ))}
    </div>
  )
}
