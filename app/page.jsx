'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
})

const normalizeCell = (value) => {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value.trim()
  }
  return value
}

const toNumber = (value) => {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '')
    const parsed = parseFloat(cleaned)
    return Number.isFinite(parsed) ? parsed : NaN
  }
  return NaN
}

const tryParseDate = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!match) {
    return null
  }

  const day = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10) - 1
  let year = Number.parseInt(match[3], 10)
  if (year < 100) {
    year += 2000
  }

  const parsed = new Date(year, month, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const findBillingDate = (rows) => {
  for (const row of rows) {
    for (const cell of row) {
      const parsed = tryParseDate(cell)
      if (parsed) {
        return parsed
      }
    }
  }
  return null
}

const parseStatement = (rows = []) => {
  const sanitized = rows.map((row) => row.map(normalizeCell))
  const billingDate = findBillingDate(sanitized)

  const headerIndex = sanitized.findIndex((row) =>
    row.some(
      (cell) =>
        typeof cell === 'string' &&
        cell.includes('סכום חיוב') &&
        row.some(
          (innerCell) => typeof innerCell === 'string' && innerCell.includes('פירוט'),
        ),
    ),
  )

  if (headerIndex === -1) {
    return { billingDate, payments: [] }
  }

  const headers = sanitized[headerIndex]
  const findIndex = (text) =>
    headers.findIndex((cell) => typeof cell === 'string' && cell.includes(text))

  const transactionDateIdx = findIndex('תאריך')
  const merchantIdx = findIndex('שם')
  const amountIdx = findIndex('סכום חיוב')
  const detailIdx = findIndex('פירוט')

  if (
    transactionDateIdx === -1 ||
    merchantIdx === -1 ||
    amountIdx === -1 ||
    detailIdx === -1
  ) {
    return { billingDate, payments: [] }
  }

  const payments = []
  const rowsAfterHeader = sanitized.slice(headerIndex + 1)

  rowsAfterHeader.forEach((row, rowIndex) => {
    const detailCell = row[detailIdx]
    if (!detailCell || typeof detailCell !== 'string') {
      return
    }

    const match = detailCell.match(/(\d+)\s*מתוך\s*(\d+)/)
    if (!match) {
      return
    }

    const current = parseInt(match[1], 10)
    const total = parseInt(match[2], 10)

    if (!Number.isFinite(current) || !Number.isFinite(total) || current >= total) {
      return
    }

    const amount = toNumber(row[amountIdx])
    if (!Number.isFinite(amount)) {
      return
    }

    payments.push({
      id: `${rowIndex}-${amount}-${current}`,
      transactionDate: row[transactionDateIdx] || '',
      merchant: row[merchantIdx] || 'עסקה ללא שם',
      amount,
      currentStep: current,
      totalSteps: total,
    })
  })

  return { billingDate, payments }
}

const addMonths = (date, count) => {
  if (!date) {
    return null
  }
  const result = new Date(date.getTime())
  result.setMonth(result.getMonth() + count)
  return result
}

const formatMonthLabel = (date, fallbackIndex) => {
  if (!date) {
    return `חודש ${fallbackIndex + 1}`
  }
  return date.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

const buildForecast = (payments, billingDate) => {
  if (!payments.length) {
    return []
  }

  const buckets = new Map()

  payments.forEach((payment) => {
    const remaining = payment.totalSteps - payment.currentStep
    for (let offset = 0; offset < remaining; offset += 1) {
      const dueDate = addMonths(billingDate, offset)
      const key = dueDate ? dueDate.toISOString().slice(0, 7) : `month-${offset}`
      const label = formatMonthLabel(dueDate, offset)

      if (!buckets.has(key)) {
        buckets.set(key, {
          key,
          label,
          date: dueDate,
          total: 0,
          payments: [],
        })
      }

      const bucket = buckets.get(key)
      bucket.total += payment.amount
      bucket.payments.push({
        id: `${payment.id}-${offset}`,
        merchant: payment.merchant,
        transactionDate: payment.transactionDate,
        scheduledStep: payment.currentStep + 1 + offset,
        totalSteps: payment.totalSteps,
        amount: payment.amount,
      })
    }
  })

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.date && b.date) {
      return a.date - b.date
    }
    if (a.date && !b.date) {
      return -1
    }
    if (!a.date && b.date) {
      return 1
    }
    return a.key.localeCompare(b.key)
  })
}

export default function FuturePaymentsPage() {
  const [fileName, setFileName] = useState('')
  const [payments, setPayments] = useState([])
  const [billingDate, setBillingDate] = useState(null)
  const [selectedMonthKey, setSelectedMonthKey] = useState('')
  const [error, setError] = useState('')

  const forecastMonths = useMemo(() => buildForecast(payments, billingDate), [payments, billingDate])

  useEffect(() => {
    if (!forecastMonths.length) {
      setSelectedMonthKey('')
      return
    }

    const exists = forecastMonths.some((month) => month.key === selectedMonthKey)
    if (!exists) {
      setSelectedMonthKey(forecastMonths[0].key)
    }
  }, [forecastMonths, selectedMonthKey])

  const selectedMonth = forecastMonths.find((month) => month.key === selectedMonthKey)

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setFileName(file.name)
    setError('')
    setPayments([])
    setBillingDate(null)

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      try {
        const data = new Uint8Array(loadEvent.target?.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
        })

        const statement = parseStatement(rows)
        setPayments(statement.payments)
        setBillingDate(statement.billingDate)

        if (!statement.payments.length) {
          setError('לא נמצאו תשלומים עתידיים בקובץ שנבחר.')
        }
      } catch (err) {
        console.error(err)
        setError('אירעה שגיאה בקריאת הקובץ. נסה לבחור קובץ XLS תקין.')
      }
    }

    reader.onerror = () => {
      setError('קריאת הקובץ נכשלה. נסה שוב.')
    }

    reader.readAsArrayBuffer(file)
  }

  return (
    <main className="app" dir="rtl">
      <div className="card">
        <header>
          <h1>תחזית תשלומים עתידיים</h1>
          <p>העלה את קובץ ה-XLS של פירוט האשראי כדי לראות את סך התשלומים הצפויים בחודשים הקרובים.</p>
        </header>

        <label className="file-picker">
          <span>{fileName || 'בחר קובץ XLS'}</span>
          <input type="file" accept=".xls,.xlsx" onChange={handleFileChange} />
        </label>

        <p className="note">הערה: הקבצים לא מועלים לשרת ומנותחים במחשב שלך.</p>

        {error && <div className="banner error">{error}</div>}

        {!error && !payments.length && fileName && (
          <div className="banner info">לא נמצאו תשלומים עתידיים בקובץ שנבחר.</div>
        )}

        {forecastMonths.length > 0 && (
          <>
            <section className="months-grid">
              {forecastMonths.map((month) => (
                <button
                  key={month.key}
                  type="button"
                  className={`month-card ${month.key === selectedMonthKey ? 'active' : ''}`}
                  onClick={() => setSelectedMonthKey(month.key)}
                >
                  <span className="month-label">{month.label}</span>
                  <span className="month-total">{currencyFormatter.format(month.total)}</span>
                  <span className="month-count">{month.payments.length} תשלומים</span>
                </button>
              ))}
            </section>

            <section className="details">
              <div className="details-header">
                <h2>פירוט לחודש {selectedMonth?.label || ''}</h2>
                {selectedMonth && (
                  <div className="details-total">
                    {currencyFormatter.format(selectedMonth.total)} • {selectedMonth.payments.length} תשלומים
                  </div>
                )}
              </div>

              {selectedMonth ? (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>שם העסק</th>
                        <th>תאריך עסקה</th>
                        <th>מספר תשלום</th>
                        <th>סכום</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedMonth.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{payment.merchant}</td>
                          <td>{payment.transactionDate}</td>
                          <td>
                            {payment.scheduledStep} / {payment.totalSteps}
                          </td>
                          <td>{currencyFormatter.format(payment.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="banner info">בחר חודש כדי לראות את הפירוט המלא.</div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
