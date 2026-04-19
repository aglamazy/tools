'use client'

import React, { useState, useEffect, useRef } from 'react'

/** Parse d/m/yy or d/m/yyyy into YYYY-MM-DD, returns null if invalid */
function parseLocalDate(input: string): string | null {
  const match = input.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/)
  if (!match) return null
  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  let year = parseInt(match[3], 10)
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Format YYYY-MM-DD as dd/mm/yyyy */
function formatLocalDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y.padStart(4, '0')}`
}

type LocaleDateInputProps = {
  value: string // ISO format: YYYY-MM-DD
  onChange: (value: string) => void
  style?: React.CSSProperties
}

export function LocaleDateInput({ value, onChange, style }: LocaleDateInputProps) {
  const [displayValue, setDisplayValue] = useState('')
  const hiddenRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (value) {
      setDisplayValue(formatLocalDate(value))
    } else {
      setDisplayValue('')
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setDisplayValue(input)
    const parsed = parseLocalDate(input)
    if (parsed) onChange(parsed)
  }

  const handleBlur = () => {
    if (value) setDisplayValue(formatLocalDate(value))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="dd/mm/yyyy"
        style={style}
      />
      <div style={{ position: 'relative' }}>
        <input
          ref={hiddenRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '1px',
            height: '1px',
            opacity: 0,
            pointerEvents: 'none',
          }}
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => hiddenRef.current?.showPicker()}
          style={{
            background: 'none',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            padding: '0.4rem',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
          }}
          title="בחר תאריך"
        >
          📅
        </button>
      </div>
    </div>
  )
}

type LocaleTimeInputProps = {
  value: string // HH:mm format
  onChange: (value: string) => void
  style?: React.CSSProperties
}

/** Parse HH:MM or H:MM into a validated "HH:MM" string, returns null if invalid */
function parseTime(input: string): string | null {
  const match = input.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  if (h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function LocaleTimeInput({ value, onChange, style }: LocaleTimeInputProps) {
  const [displayValue, setDisplayValue] = React.useState(value)
  const hiddenRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setDisplayValue(value)
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setDisplayValue(input)
    const parsed = parseTime(input)
    if (parsed) onChange(parsed)
  }

  const handleBlur = () => {
    if (value) setDisplayValue(value)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="HH:MM"
        style={{ ...style, width: '72px' }}
      />
      <div style={{ position: 'relative' }}>
        <input
          ref={hiddenRef}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ position: 'absolute', top: 0, left: 0, width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => hiddenRef.current?.showPicker()}
          style={{
            background: 'none',
            border: '1px solid #e2e8f0',
            borderRadius: '0.375rem',
            padding: '0.4rem',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
          }}
          title="בחר שעה"
        >
          🕐
        </button>
      </div>
    </div>
  )
}
