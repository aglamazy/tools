'use client'

import React, { useState, useEffect } from 'react'
import { format, parse, isValid } from 'date-fns'
import { he } from 'date-fns/locale'

type LocaleDateInputProps = {
  value: string // ISO format: YYYY-MM-DD
  onChange: (value: string) => void
  style?: React.CSSProperties
}

export function LocaleDateInput({ value, onChange, style }: LocaleDateInputProps) {
  const [displayValue, setDisplayValue] = useState('')

  useEffect(() => {
    if (value) {
      const date = parse(value, 'yyyy-MM-dd', new Date())
      if (isValid(date)) {
        setDisplayValue(format(date, 'd/M/yy', { locale: he }))
      }
    } else {
      setDisplayValue('')
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setDisplayValue(input)

    // Try to parse various formats
    const formats = ['d/M/yy', 'd/M/yyyy', 'd.M.yy', 'd.M.yyyy', 'd-M-yy', 'd-M-yyyy']
    for (const fmt of formats) {
      const parsed = parse(input, fmt, new Date())
      if (isValid(parsed)) {
        onChange(format(parsed, 'yyyy-MM-dd'))
        return
      }
    }
  }

  const handleBlur = () => {
    // Re-format on blur if valid
    if (value) {
      const date = parse(value, 'yyyy-MM-dd', new Date())
      if (isValid(date)) {
        setDisplayValue(format(date, 'd/M/yy', { locale: he }))
      }
    }
  }

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="d/m/yy"
      style={style}
    />
  )
}

type LocaleTimeInputProps = {
  value: string // HH:mm format
  onChange: (value: string) => void
  style?: React.CSSProperties
}

export function LocaleTimeInput({ value, onChange, style }: LocaleTimeInputProps) {
  const [displayValue, setDisplayValue] = useState(value || '')

  useEffect(() => {
    setDisplayValue(value || '')
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setDisplayValue(input)

    // Accept HH:mm or H:mm format
    const match = input.match(/^(\d{1,2}):(\d{2})$/)
    if (match) {
      const h = parseInt(match[1], 10)
      const m = parseInt(match[2], 10)
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        onChange(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
      }
    }
  }

  const handleBlur = () => {
    // Re-format on blur
    if (value) {
      setDisplayValue(value)
    }
  }

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder="HH:mm"
      style={{ ...style, width: '70px' }}
    />
  )
}
