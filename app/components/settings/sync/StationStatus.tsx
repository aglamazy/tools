import type { StationLock } from '@/app/services/stationLockService'

type LockMode = 'initializing' | 'master' | 'slave'

type StationStatusProps = {
  stationId: string
  lockMode: LockMode
  currentLock: StationLock | null
  onCheckLock: () => void
}

export default function StationStatus({ stationId, lockMode, currentLock, onCheckLock }: StationStatusProps) {
  return (
    <section style={{ marginBottom: '2rem', padding: '1rem', border: '1px solid #fed7aa', borderRadius: '0.75rem', background: '#fff7ed' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem' }}>מצב תחנה</h2>
          <div style={{ fontSize: '0.9rem', color: '#111827', marginBottom: '0.5rem' }}>
            <strong>Station ID:</strong> <code style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>{stationId || 'לא זמין'}</code>
          </div>
          <div style={{ fontSize: '0.9rem', color: '#111827' }}>
            <strong>מצב:</strong>{' '}
            <span style={{
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
              background: lockMode === 'master' ? '#d1fae5' : lockMode === 'slave' ? '#fee2e2' : '#f3f4f6',
              color: lockMode === 'master' ? '#065f46' : lockMode === 'slave' ? '#991b1b' : '#374151',
              fontWeight: 600,
            }}>
              {lockMode === 'master' ? '✓ MASTER (ניתן לעריכה)' : lockMode === 'slave' ? '🔒 SLAVE (קפוא)' : '⏳ מאתחל...'}
            </span>
          </div>
        </div>
        <button onClick={onCheckLock} className="file-picker secondary" style={{ flexShrink: 0 }}>
          בדוק נעילה
        </button>
      </div>

      {currentLock && (
        <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#f9fafb', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>תוכן קובץ נעילה:</div>
          <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', direction: 'ltr' }}>
            {JSON.stringify(currentLock, null, 2)}
          </div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <strong>שייך לתחנה זו:</strong>{' '}
            <span style={{ color: currentLock.stationId === stationId ? '#059669' : '#dc2626' }}>
              {currentLock.stationId === stationId ? 'כן ✓' : 'לא ✗'}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
