'use client'

import React, { useEffect, useState } from 'react'
import { db } from '@/app/db/financeDB'

export default function ApiKeysTab() {
  const [claudeApiKey, setClaudeApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    db.appSettings.where('key').equals('claudeApiKey').first().then(row => {
      console.log('[ApiKeysTab] load row:', row)
      if (row?.value) {
        setClaudeApiKey(row.value as string)
        setHasKey(true)
      }
    }).catch(err => {
      console.error('[ApiKeysTab] load error:', err)
    })
  }, [])

  const handleSave = async () => {
    try {
      setError('')
      const existing = await db.appSettings.where('key').equals('claudeApiKey').first()
      console.log('[ApiKeysTab] existing:', existing)
      if (existing) {
        await db.appSettings.update(existing.id!, {
          value: claudeApiKey,
          updatedAt: new Date().toISOString(),
        })
        console.log('[ApiKeysTab] updated id:', existing.id)
      } else {
        const id = await db.appSettings.add({
          key: 'claudeApiKey',
          value: claudeApiKey,
          updatedAt: new Date().toISOString(),
        })
        console.log('[ApiKeysTab] added id:', id)
      }
      // Verify
      const all = await db.appSettings.toArray()
      console.log('[ApiKeysTab] all settings keys:', all.map(r => r.key))
      const verify = all.find(r => r.key === 'claudeApiKey')
      console.log('[ApiKeysTab] verify:', verify ? `found (id=${verify.id})` : 'NOT FOUND')

      setHasKey(true)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: any) {
      console.error('[ApiKeysTab] save error:', err)
      setError(err.message)
    }
  }

  const maskKey = (key: string) => {
    if (key.length <= 10) return '********'
    return key.slice(0, 7) + '****' + key.slice(-4)
  }

  return (
    <div style={{ maxWidth: '500px' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>Claude API Key</h3>
      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>
        משמש לחילוץ נתונים ממסמכי מס. ניתן להשיג מ-{' '}
        <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
          console.anthropic.com
        </a>
      </p>

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{error}</div>
      )}

      {hasKey && !editing ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            fontSize: '0.9rem',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '0.375rem',
            direction: 'ltr',
            color: '#166534',
            fontFamily: 'monospace',
          }}>
            {maskKey(claudeApiKey)}
          </div>
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              background: 'transparent',
              color: '#3b82f6',
              border: '1px solid #3b82f6',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            החלף
          </button>
          {saved && <span style={{ color: '#16a34a', fontSize: '0.85rem' }}>נשמר</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="password"
            placeholder="sk-ant-..."
            value={editing ? '' : claudeApiKey}
            onChange={e => setClaudeApiKey(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              fontSize: '0.9rem',
              border: '1px solid #cbd5e1',
              borderRadius: '0.375rem',
              direction: 'ltr',
            }}
          />
          <button
            onClick={handleSave}
            disabled={!claudeApiKey}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              background: claudeApiKey ? '#3b82f6' : '#94a3b8',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: claudeApiKey ? 'pointer' : 'not-allowed',
            }}
          >
            שמור
          </button>
          {editing && (
            <button
              onClick={() => setEditing(false)}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.85rem',
                background: 'transparent',
                color: '#64748b',
                border: '1px solid #cbd5e1',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              ביטול
            </button>
          )}
        </div>
      )}
    </div>
  )
}
