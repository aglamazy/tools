'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/app/components/ToastContainer'
import { LocaleDateInput } from '@/app/components/LocaleInputs'
import { vacationStore } from '@/app/stores/vacationStore'
import Modal from '@/app/components/Modal'
import { searchFlights, FlightResult } from '@/app/services/flightService'
import type { Vacation } from '@/app/db/financeDB'

type StopsFilter = 0 | 1 | 2 | 'all'

export default function VacationPage() {
  const { showToast } = useToast()
  const [vacations, setVacations] = useState<Vacation[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')

  // Flight search state
  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null)
  const [flights, setFlights] = useState<FlightResult[]>([])
  const [flightsLoading, setFlightsLoading] = useState(false)
  const [maxStops, setMaxStops] = useState<StopsFilter>('all')
  const [selectedFlight, setSelectedFlight] = useState<FlightResult | null>(null)

  useEffect(() => {
    loadVacations()
  }, [])

  const loadVacations = async () => {
    setLoading(true)
    const data = await vacationStore.getAll()
    setVacations(data)
    setLoading(false)
  }

  const resetForm = () => {
    setFrom('')
    setTo('')
    setWindowStart('')
    setWindowEnd('')
  }

  const handleAdd = async () => {
    if (!from.trim() || !to.trim()) {
      showToast('error', 'יש למלא מוצא ויעד')
      return
    }

    await vacationStore.add({
      from: from.trim(),
      to: to.trim(),
      windowStart: windowStart || undefined,
      windowEnd: windowEnd || undefined,
    })

    showToast('success', 'חופשה נוספה', '✈️')
    resetForm()
    setShowForm(false)
    await loadVacations()
  }

  const handleDelete = async (id: number) => {
    await vacationStore.delete(id)
    showToast('success', 'חופשה נמחקה')
    await loadVacations()
  }

  const handleRowClick = async (vacation: Vacation) => {
    if (!vacation.windowStart || !vacation.windowEnd) {
      showToast('error', 'יש להגדיר חלון תאריכים לחיפוש טיסות')
      return
    }
    setSelectedVacation(vacation)
    setFlights([])
    setMaxStops('all')
    setSelectedFlight(null)
    setFlightsLoading(true)

    try {
      const results = await searchFlights(
        vacation.from,
        vacation.to,
        vacation.windowStart,
        vacation.windowEnd,
      )
      setFlights(results)
    } catch (err) {
      console.error('Flight search failed:', err)
      showToast('error', 'שגיאה בחיפוש טיסות')
    } finally {
      setFlightsLoading(false)
    }
  }

  const closeModal = () => {
    setSelectedVacation(null)
    setFlights([])
  }

  const filteredFlights = maxStops === 'all'
    ? flights
    : flights.filter(f => f.stops <= maxStops)

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—'
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('he-IL')
  }

  const formatTime = (isoStr: string) => {
    return new Date(isoStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}:${String(m).padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>טוען...</p>
      </div>
    )
  }

  return (
    <div dir="rtl" style={{ padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>✈️ תכנון חופשות</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: showForm ? '#6b7280' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          {showForm ? 'ביטול' : '+ חופשה חדשה'}
        </button>
      </div>

      {showForm && (
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                מוצא *
              </label>
              <input
                type="text"
                value={from}
                onChange={e => setFrom(e.target.value)}
                placeholder="למשל: TLV או תל אביב"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                יעד *
              </label>
              <input
                type="text"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="למשל: BCN או ברצלונה"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                חלון — מתאריך
              </label>
              <LocaleDateInput
                value={windowStart}
                onChange={setWindowStart}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                חלון — עד תאריך
              </label>
              <LocaleDateInput
                value={windowEnd}
                onChange={setWindowEnd}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              alignSelf: 'flex-start',
            }}
          >
            שמור
          </button>
        </div>
      )}

      {vacations.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          color: '#9ca3af',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          border: '1px dashed #d1d5db',
        }}>
          <p style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✈️</p>
          <p>אין חופשות מתוכננות</p>
          <p style={{ fontSize: '0.85rem' }}>לחץ על &quot;חופשה חדשה&quot; כדי להתחיל</p>
        </div>
      ) : (
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          backgroundColor: '#fff',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9' }}>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>מוצא</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>יעד</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>חלון — מ</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, fontSize: '0.85rem' }}>חלון — עד</th>
              <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem' }}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {vacations.map(v => (
              <tr
                key={v.id}
                onClick={() => handleRowClick(v)}
                style={{
                  borderTop: '1px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f9ff')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{v.from}</td>
                <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{v.to}</td>
                <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{formatDate(v.windowStart)}</td>
                <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{formatDate(v.windowEnd)}</td>
                <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(v.id!) }}
                    style={{
                      padding: '0.25rem 0.75rem',
                      backgroundColor: '#fee2e2',
                      color: '#dc2626',
                      border: '1px solid #fca5a5',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    מחק
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Flight Search Modal */}
      <Modal isOpen={!!selectedVacation} onClose={closeModal} maxWidth="800px">
        {selectedVacation && (
          <div dir="rtl" style={{ padding: '0.5rem' }}>
            <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700 }}>
              {selectedVacation.from} → {selectedVacation.to}
            </h2>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#6b7280' }}>
              {formatDate(selectedVacation.windowStart)} — {formatDate(selectedVacation.windowEnd)}
            </p>

            {/* Stops filter */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              {([0, 1, 2, 'all'] as StopsFilter[]).map(val => {
                const label = val === 'all' ? 'הכל' : val === 0 ? 'ישיר' : `${val}`
                const isActive = maxStops === val
                return (
                  <button
                    key={String(val)}
                    onClick={() => setMaxStops(val)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.85rem',
                      border: '1px solid',
                      borderColor: isActive ? '#2563eb' : '#d1d5db',
                      backgroundColor: isActive ? '#2563eb' : '#fff',
                      color: isActive ? '#fff' : '#374151',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
              <span style={{ fontSize: '0.8rem', color: '#9ca3af', alignSelf: 'center', marginRight: 'auto' }}>
                עצירות
              </span>
            </div>

            {flightsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                <div style={{
                  width: '2rem',
                  height: '2rem',
                  border: '3px solid #e5e7eb',
                  borderTopColor: '#2563eb',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 0.75rem',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                <p>מחפש טיסות...</p>
              </div>
            ) : filteredFlights.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '2rem',
                color: '#9ca3af',
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                border: '1px dashed #d1d5db',
              }}>
                <p>{flights.length === 0 ? 'לא נמצאו טיסות' : 'אין טיסות עם מספר עצירות זה'}</p>
              </div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.85rem',
                }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', position: 'sticky', top: 0 }}>
                      <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>חברה</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>המראה</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>נחיתה</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600 }}>משך</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600 }}>עצירות</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600 }}>מחיר</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFlights.map(f => (
                      <tr
                        key={f.id}
                        onClick={() => setSelectedFlight(f)}
                        style={{
                          borderTop: '1px solid #e2e8f0',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f0f9ff')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
                      >
                        <td style={{ padding: '0.5rem' }}>{f.airlines.join(', ')}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <div>{formatTime(f.departure)}</div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            {new Date(f.departure).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <div>{formatTime(f.arrival)}</div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            {new Date(f.arrival).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                          </div>
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          {formatDuration(f.duration)}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                          {f.stops === 0 ? (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>ישיר</span>
                          ) : (
                            <span>{f.stops}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 600, color: '#2563eb' }}>
                          {f.price.toLocaleString('he-IL')} {f.currency === 'ILS' ? '₪' : f.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {selectedFlight && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Raw data:</span>
                  <button
                    onClick={() => setSelectedFlight(null)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    סגור
                  </button>
                </div>
                <pre dir="ltr" style={{
                  backgroundColor: '#1e293b',
                  color: '#e2e8f0',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '250px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}>
                  {JSON.stringify(selectedFlight, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
