'use client'

/**
 * Read-only view of the store's cycle: schedule (orderDay / preferredSlot /
 * reviewReminderHours) plus the current order cycle status if one is active.
 *
 * Editing the schedule itself is not in scope of this page — that's done via
 * the chat assistant. This panel visualises what's already configured.
 */

import type { GrocerySchedule, OrderCycle } from '@/app/services/grocery/groceryTypes'

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatOrderDay(day: number | undefined): string {
  if (day === undefined || day === null) return '—'
  return HEBREW_DAYS[day] ?? '—'
}

const CYCLE_STATUS: Record<OrderCycle['status'], { label: string; color: string; bg: string }> = {
  draft: { label: 'טיוטה', color: '#6b7280', bg: '#f3f4f6' },
  active: { label: 'פעילה', color: '#047857', bg: '#d1fae5' },
  review: { label: 'תזכורת סופית', color: '#b45309', bg: '#fef3c7' },
  locked: { label: 'נעולה', color: '#b91c1c', bg: '#fee2e2' },
  delivered: { label: 'סופקה', color: '#1e40af', bg: '#dbeafe' },
  failed: { label: 'נכשלה', color: '#b91c1c', bg: '#fee2e2' },
}

export default function TimeTablePanel({
  schedule,
  orderCycle,
  onOrderClick,
}: {
  schedule: GrocerySchedule | null
  orderCycle: OrderCycle | null
  onOrderClick?: (orderId: string) => void
}) {
  const rows: { label: string; value: string }[] = []

  if (schedule) {
    rows.push({ label: 'יום הזמנה', value: formatOrderDay(schedule.orderDay) })
    rows.push({
      label: 'חלון משלוח מועדף',
      value: `${schedule.preferredSlot?.day || '—'} ${schedule.preferredSlot?.time || ''}`.trim(),
    })
    rows.push({
      label: 'תזכורת סקירה',
      value: schedule.reviewReminderHours ? `${schedule.reviewReminderHours} שעות לפני` : '—',
    })
  }

  const cycleInfo = orderCycle ? CYCLE_STATUS[orderCycle.status] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {schedule ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td style={{ padding: '0.4rem 0.5rem', color: '#6b7280', whiteSpace: 'nowrap', width: '40%' }}>
                  {r.label}
                </td>
                <td style={{ padding: '0.4rem 0.5rem', fontWeight: 500 }}>{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' }}>
          לא מוגדר לוח זמנים. ניתן להגדיר דרך הצ&apos;אט של העוזר.
        </div>
      )}

      {orderCycle && cycleInfo && (() => {
        const clickable = !!(onOrderClick && orderCycle.orderId)
        const handleClick = () => {
          if (clickable && orderCycle.orderId) onOrderClick!(orderCycle.orderId)
        }
        const cardStyle: React.CSSProperties = {
          marginTop: '0.25rem',
          padding: '0.6rem 0.75rem',
          borderRadius: '0.5rem',
          background: cycleInfo.bg,
          border: `1px solid ${cycleInfo.color}33`,
          width: '100%',
          textAlign: 'right',
          font: 'inherit',
          color: 'inherit',
          cursor: clickable ? 'pointer' : 'default',
          transition: 'transform 0.08s ease, box-shadow 0.12s ease',
        }
        const inner = (
          <>
            <div
              style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                marginBottom: '0.2rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>הזמנה נוכחית</span>
              {clickable && (
                <span style={{ fontSize: '0.7rem', color: cycleInfo.color, fontWeight: 600 }}>
                  לפרטים ←
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  background: cycleInfo.color,
                  color: '#fff',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '1rem',
                  fontWeight: 600,
                }}
              >
                {cycleInfo.label}
              </span>
              {orderCycle.orderId && (
                <span style={{ fontSize: '0.8rem', color: '#374151' }}>
                  #{orderCycle.orderId}
                </span>
              )}
              {orderCycle.slot && (
                <span style={{ fontSize: '0.8rem', color: '#374151' }}>
                  {orderCycle.slot.day} {orderCycle.slot.date} {orderCycle.slot.time}
                </span>
              )}
            </div>
          </>
        )
        return clickable ? (
          <button
            type="button"
            onClick={handleClick}
            aria-label={`פרטי הזמנה ${orderCycle.orderId}`}
            style={cardStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = `0 2px 6px ${cycleInfo.color}33`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {inner}
          </button>
        ) : (
          <div style={cardStyle}>{inner}</div>
        )
      })()}
    </div>
  )
}
