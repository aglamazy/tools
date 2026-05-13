'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { credentialStore } from '@/app/stores/credentialStore'
import { CREDENTIAL_SERVICE_LABELS, type CredentialRow, type CredentialService } from '@/app/types/credential'
import YesNoModal from '@/app/components/YesNoModal'

type FormState = {
  service: CredentialService
  serviceName: string
  userCode: string
  password: string
  notes: string
}

const emptyForm: FormState = {
  service: 'btl',
  serviceName: '',
  userCode: '',
  password: '',
  notes: '',
}

export default function ExternalServicesTab() {
  const [rows, setRows] = useState<CredentialRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; label: string } | null>(null)

  const refresh = useCallback(async () => {
    const list = await credentialStore.list()
    setRows(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const startNew = () => {
    setForm(emptyForm)
    setEditingId('new')
    setError(null)
  }

  const startEdit = (row: CredentialRow) => {
    setForm({
      service: row.service,
      serviceName: row.serviceName ?? '',
      userCode: row.userCode,
      password: row.password,
      notes: row.notes ?? '',
    })
    setEditingId(row.id!)
    setError(null)
  }

  const toggleReveal = (id: number) => {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSave = async () => {
    setError(null)
    if (!form.userCode && !form.password) {
      setError('הזן לפחות שם משתמש או סיסמה')
      return
    }
    try {
      await credentialStore.upsert({
        service: form.service,
        serviceName: form.service === 'other' ? form.serviceName : undefined,
        userCode: form.userCode,
        password: form.password,
        notes: form.notes || undefined,
      })
      setEditingId(null)
      setForm(emptyForm)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    await credentialStore.delete(confirmDelete.id)
    setConfirmDelete(null)
    await refresh()
  }

  const serviceLabel = (row: CredentialRow) =>
    row.service === 'other' ? row.serviceName || 'אחר' : CREDENTIAL_SERVICE_LABELS[row.service]

  if (loading) return <div>טוען...</div>

  return (
    <div style={{ maxWidth: '720px' }}>
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem' }}>חיבורים חיצוניים</h3>
      <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>
        פרטי גישה לשירותים חיצוניים (ביטוח לאומי, בנקים…). נשמרים מקומית ב-IndexedDB ומסונכרנים מוצפנים דרך הגיבוי הענני הקיים.
      </p>

      {error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>
      )}

      {rows.length === 0 && !editingId && (
        <div style={{ color: '#64748b', fontSize: '0.9rem', margin: '1rem 0' }}>
          עדיין לא נשמרו פרטי גישה.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {rows.map((row) => {
          const isEditing = editingId === row.id
          if (isEditing) return <CredentialEditor key={row.id} form={form} setForm={setForm} onSave={handleSave} onCancel={() => { setEditingId(null); setForm(emptyForm) }} />
          const shown = !!revealed[row.id!]
          return (
            <div
              key={row.id}
              style={{
                padding: '0.75rem 1rem',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.95rem' }}>{serviceLabel(row)}</strong>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button onClick={() => toggleReveal(row.id!)} style={btnGhost}>
                    {shown ? 'הסתר' : 'חשוף'}
                  </button>
                  <button onClick={() => startEdit(row)} style={btnGhost}>ערוך</button>
                  <button
                    onClick={() => setConfirmDelete({ id: row.id!, label: serviceLabel(row) })}
                    style={{ ...btnGhost, color: '#dc2626', borderColor: '#dc2626' }}
                  >
                    מחק
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '0.3rem 1rem', fontSize: '0.85rem' }}>
                <span style={{ color: '#64748b' }}>שם משתמש:</span>
                <span style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}>
                  {shown ? row.userCode : maskValue(row.userCode)}
                </span>
                <span style={{ color: '#64748b' }}>סיסמה:</span>
                <span style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}>
                  {shown ? row.password : maskValue(row.password)}
                </span>
                {row.notes && (
                  <>
                    <span style={{ color: '#64748b' }}>הערות:</span>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{row.notes}</span>
                  </>
                )}
                <span style={{ color: '#64748b' }}>עודכן:</span>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{row.updatedAt ? new Date(row.updatedAt).toLocaleString('he-IL') : '-'}</span>
              </div>
            </div>
          )
        })}

        {editingId === 'new' && (
          <CredentialEditor
            form={form}
            setForm={setForm}
            onSave={handleSave}
            onCancel={() => { setEditingId(null); setForm(emptyForm) }}
          />
        )}
      </div>

      {editingId !== 'new' && (
        <button
          onClick={startNew}
          style={{
            marginTop: '1rem',
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          הוסף פרטי גישה
        </button>
      )}

      {saved && <div style={{ color: '#16a34a', fontSize: '0.85rem', marginTop: '0.5rem' }}>נשמר</div>}

      <YesNoModal
        isOpen={!!confirmDelete}
        question={confirmDelete ? `למחוק את פרטי הגישה ל-${confirmDelete.label}?` : ''}
        onYes={handleDelete}
        onNo={() => setConfirmDelete(null)}
      />
    </div>
  )
}

const btnGhost: React.CSSProperties = {
  padding: '0.3rem 0.7rem',
  fontSize: '0.8rem',
  background: 'transparent',
  color: '#3b82f6',
  border: '1px solid #cbd5e1',
  borderRadius: '0.375rem',
  cursor: 'pointer',
}

function maskValue(v?: string): string {
  if (!v) return '-'
  return '•'.repeat(Math.min(12, Math.max(6, v.length)))
}

function CredentialEditor({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  onSave: () => void
  onCancel: () => void
}) {
  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((prev) => ({ ...prev, [k]: v }))

  return (
    <div
      style={{
        padding: '1rem',
        border: '1px solid #3b82f6',
        borderRadius: '0.5rem',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <label style={labelStyle}>
        שירות
        <select
          value={form.service}
          onChange={(e) => update('service', e.target.value as CredentialService)}
          style={inputStyle}
        >
          {(Object.keys(CREDENTIAL_SERVICE_LABELS) as CredentialService[]).map((s) => (
            <option key={s} value={s}>{CREDENTIAL_SERVICE_LABELS[s]}</option>
          ))}
        </select>
      </label>

      {form.service === 'other' && (
        <label style={labelStyle}>
          שם השירות
          <input
            type="text"
            value={form.serviceName}
            onChange={(e) => update('serviceName', e.target.value)}
            style={inputStyle}
          />
        </label>
      )}

      <label style={labelStyle}>
        שם משתמש / קוד
        <input
          type="text"
          value={form.userCode}
          onChange={(e) => update('userCode', e.target.value)}
          style={{ ...inputStyle, direction: 'ltr' }}
          autoComplete="off"
        />
      </label>

      <label style={labelStyle}>
        סיסמה
        <input
          type="password"
          value={form.password}
          onChange={(e) => update('password', e.target.value)}
          style={{ ...inputStyle, direction: 'ltr' }}
          autoComplete="new-password"
        />
      </label>

      <label style={labelStyle}>
        הערות (אופציונלי)
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
        />
      </label>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={btnGhost}>ביטול</button>
        <button
          onClick={onSave}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          שמור
        </button>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.85rem',
  color: '#334155',
  gap: '0.3rem',
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.9rem',
  border: '1px solid #cbd5e1',
  borderRadius: '0.375rem',
  width: '100%',
  boxSizing: 'border-box',
}
