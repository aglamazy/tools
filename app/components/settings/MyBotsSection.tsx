'use client'

import { useState, useEffect } from 'react'
import { listBots, createBot, deleteBot, type BotSummary, type CreatedBot } from '@/app/services/botService'

export default function MyBotsSection() {
  const [bots, setBots] = useState<BotSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [newBotName, setNewBotName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newlyCreated, setNewlyCreated] = useState<CreatedBot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadBots()
  }, [])

  const loadBots = async () => {
    try {
      const data = await listBots()
      setBots(data)
    } catch (e: any) {
      console.log('[MyBots] Failed to load bots:', e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newBotName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const bot = await createBot(newBotName.trim())
      setNewlyCreated(bot)
      setBots([{ id: bot.id, name: bot.name, handle: bot.handle, createdAt: bot.createdAt }, ...bots])
      setNewBotName('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteBot(id)
      setBots(bots.filter(b => b.id !== id))
      if (newlyCreated?.id === id) setNewlyCreated(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const [showWebhookGuide, setShowWebhookGuide] = useState(false)

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1f2937' }}>
        🤖 הבוטים שלי
      </h3>
      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
        הוסף בוטים שיוכלו לקבל משימות מהלוח או ליצור משימות דרך webhook. כל בוט מקבל handle וטוקן לאימות.
      </p>

      {/* Create new bot */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={newBotName}
          onChange={e => setNewBotName(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleCreate()}
          placeholder="שם הבוט (למשל: AglaBot)"
          style={{
            flex: 1,
            padding: '0.625rem',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            fontSize: '0.9rem',
          }}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newBotName.trim()}
          className="file-picker"
          style={{ margin: 0, opacity: creating ? 0.5 : 1 }}
        >
          {creating ? 'יוצר...' : 'צור בוט'}
        </button>
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          {error}
        </div>
      )}

      {/* Newly created bot — show token once */}
      {newlyCreated && (
        <div style={{
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1rem',
        }}>
          <div style={{ fontWeight: 600, color: '#059669', marginBottom: '0.5rem' }}>
            בוט נוצר בהצלחה! שמור את הטוקן — הוא לא יוצג שוב.
          </div>
          <div style={{ fontSize: '0.85rem', color: '#374151' }}>
            <div><strong>שם:</strong> {newlyCreated.name}</div>
            <div><strong>Handle:</strong> {newlyCreated.handle}</div>
            <div style={{ marginTop: '0.5rem' }}>
              <strong>Token:</strong>
              <code style={{
                display: 'block',
                background: '#f3f4f6',
                padding: '0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                marginTop: '0.25rem',
                fontFamily: 'monospace',
              }}>
                {newlyCreated.token}
              </code>
            </div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(newlyCreated.token)
            }}
            style={{
              marginTop: '0.5rem',
              padding: '0.375rem 0.75rem',
              fontSize: '0.8rem',
              background: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '0.25rem',
              cursor: 'pointer',
            }}
          >
            העתק טוקן
          </button>
        </div>
      )}

      {/* Bot list */}
      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>טוען...</p>
      ) : bots.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>אין בוטים מוגדרים</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {bots.map(bot => (
            <div
              key={bot.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
              }}
            >
              <div>
                <div style={{ fontWeight: 500, color: '#1f2937' }}>🤖 {bot.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>@{bot.handle}</div>
              </div>
              <button
                onClick={() => handleDelete(bot.id)}
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.8rem',
                  border: '1px solid #fecaca',
                  borderRadius: '0.25rem',
                  background: '#fff',
                  cursor: 'pointer',
                  color: '#dc2626',
                }}
              >
                מחק
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Webhook guide */}
      <div style={{ marginTop: '2rem', borderTop: '1px solid #e5e7eb', paddingTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1f2937', margin: 0 }}>
            🔗 יצירת משימות דרך Webhook
          </h3>
          <button
            onClick={() => setShowWebhookGuide(!showWebhookGuide)}
            style={{
              background: 'none', border: '1px solid #d1d5db', borderRadius: '0.25rem',
              cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', padding: '0.2rem 0.5rem',
            }}
          >
            {showWebhookGuide ? 'הסתר' : 'איך זה עובד?'}
          </button>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0 0 0.75rem' }}>
          שלח בקשת POST כדי ליצור משימה אוטומטית בלוח המשימות.
        </p>

        {showWebhookGuide && (
          <div style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.5rem',
            padding: '1rem', fontSize: '0.85rem', color: '#374151',
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <strong>Endpoint:</strong>
              <code style={codeBlockStyle}>
                POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhook/task
              </code>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <strong>Headers:</strong>
              <code style={codeBlockStyle}>
                {`X-Bot-Handle: <handle של הבוט>\nAuthorization: Bearer <token של הבוט>`}
              </code>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                ← צור בוט למעלה כדי לקבל handle וטוקן
              </span>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <strong>Body (JSON):</strong>
              <code style={codeBlockStyle}>
{`{
  "title": "שם המשימה",          // חובה
  "priority": "medium",          // low / medium / high
  "quadrant": "do",              // do / schedule / delegate / eliminate
  "deadline": "2026-04-15",      // תאריך ISO (אופציונלי)
  "subject": "שם נושא",          // אופציונלי
  "tags": ["תגית1", "תגית2"]    // אופציונלי
}`}
              </code>
            </div>

            <div>
              <strong>דוגמה עם curl:</strong>
              <code style={codeBlockStyle}>
{`curl -X POST ${typeof window !== 'undefined' ? window.location.origin : 'https://aglamazo.com'}/api/webhook/task \\
  -H "Content-Type: application/json" \\
  -H "X-Bot-Handle: bot-xxxxxxxx" \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -d '{"title": "משימה חדשה", "priority": "high"}'`}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const codeBlockStyle: React.CSSProperties = {
  display: 'block',
  background: '#1e293b',
  color: '#e2e8f0',
  padding: '0.625rem',
  borderRadius: '0.375rem',
  fontSize: '0.78rem',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  marginTop: '0.25rem',
  marginBottom: '0.5rem',
  direction: 'ltr',
  textAlign: 'left',
}
