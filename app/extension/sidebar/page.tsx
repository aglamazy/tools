'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { signInWithGoogle, signOut, subscribeToAuthState, getIdToken, type AuthUser } from '@/app/services/firebaseAuthService'
import { branding } from '@/app/config'

interface ProfileEntry {
  id?: string
  question: string
  answer: string | string[]
  answerType: string
}

interface FormField {
  id: string
  type: string
  label: string
  section: string
  name: string
  placeholder: string
  value: string
  required: boolean
  selector: string
  options?: { value: string; text: string }[]
  captchaAnswer?: string
}

interface FieldSuggestion {
  value: string
  source: 'profile' | 'ai' | 'none'
  translatedLabel?: string
}

export default function ExtensionSidebarPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  // Form scan state
  const [fields, setFields] = useState<FormField[]>([])
  const [suggestions, setSuggestions] = useState<Record<string, FieldSuggestion>>({})
  const [editedValues, setEditedValues] = useState<Record<string, string>>({})
  const [scanning, setScanning] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [filling, setFilling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [tab, setTab] = useState<'scan' | 'profile'>('scan')
  const [profileEntries, setProfileEntries] = useState<ProfileEntry[]>([])
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)
  const [hideKnown, setHideKnown] = useState(false)
  const [hideOptional, setHideOptional] = useState(false)
  const pendingResolve = useRef<((fields: FormField[]) => void) | null>(null)
  const fillResolve = useRef<(() => void) | null>(null)

  useEffect(() => {
    const unsub = subscribeToAuthState((u) => {
      setUser(u)
      setLoading(false)
    })
    return unsub
  }, [])

  // Listen for postMessage responses from extension bridge
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || !msg.type) return
      if (msg.type === 'FIELDS_RESULT' && pendingResolve.current) {
        pendingResolve.current(msg.fields || [])
        pendingResolve.current = null
      }
      if (msg.type === 'FILL_RESULT' && fillResolve.current) {
        fillResolve.current()
        fillResolve.current = null
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Dev bridge: when running as standalone tab (not in iframe/extension),
  // intercept postMessage and relay via /api/dev-bridge
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as Record<string, Record<string, Record<string, string>>>
    const isStandalone = window.parent === window && !w.chrome?.runtime?.id
    if (!isStandalone) return

    const orig = window.postMessage.bind(window)
    window.postMessage = function (msg: unknown, targetOrigin?: string, transfer?: Transferable[]) {
      const m = msg as Record<string, unknown> | null
      if (m && (m.type === 'EXTRACT_FIELDS' || m.type === 'FILL_FIELDS')) {
        fetch('/api/dev-bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'form', message: m }),
        })
        return
      }
      return orig(msg as never, targetOrigin as never, transfer as never)
    } as typeof window.postMessage

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/dev-bridge?target=sidebar')
        const data = await res.json()
        for (const msg of data.messages) {
          window.dispatchEvent(new MessageEvent('message', { data: msg }))
        }
      } catch { /* dev server may be down */ }
    }, 2000)

    console.log('[DevBridge] Sidebar bridge active (standalone tab)')
    return () => clearInterval(interval)
  }, [])

  const showFeedback = useCallback((text: string, type: 'success' | 'error') => {
    setFeedback({ text, type })
    setTimeout(() => setFeedback(null), 3000)
  }, [])

  // Scan form fields via bridge
  const scanForm = useCallback(async () => {
    setScanning(true)
    setScanned(false)
    setSuggestions({})
    setEditedValues({})

    const extractedFields = await new Promise<FormField[]>((resolve) => {
      pendingResolve.current = resolve
      window.parent.postMessage({ type: 'EXTRACT_FIELDS' }, '*')
      setTimeout(() => {
        if (pendingResolve.current === resolve) {
          pendingResolve.current = null
          resolve([])
        }
      }, 3000)
    })

    setFields(extractedFields)
    setScanning(false)
    setScanned(true)

    if (extractedFields.length === 0) return

    // Get suggestions from profile + AI
    setSuggesting(true)
    try {
      const token = await getIdToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      // Fetch profile
      const profileRes = await fetch('/api/profile-qa', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const profileData = profileRes.ok ? (await profileRes.json()).data || [] : []

      // Get suggestions
      const suggestRes = await fetch('/api/form-filler/suggest', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fields: extractedFields, profileData }),
      })

      if (suggestRes.ok) {
        const s = (await suggestRes.json()).suggestions || {}
        setSuggestions(s)
        const initial: Record<string, string> = {}
        for (const f of extractedFields) {
          let val = s[f.id]?.value || ''
          // For select fields: map human-readable text to the form's option value
          if (f.type === 'select' && f.options && val) {
            const valLower = val.trim().toLowerCase()
            const matchedOpt = f.options.find(o =>
              o.text.trim().toLowerCase() === valLower
            ) || f.options.find(o =>
              o.text.trim().toLowerCase().includes(valLower) || valLower.includes(o.text.trim().toLowerCase())
            )
            if (matchedOpt) val = matchedOpt.value
          }
          // Auto-fill solved captchas
          if (!val && f.captchaAnswer) val = f.captchaAnswer
          initial[f.id] = val
        }
        // Auto-fill "repeat" / "confirm" fields from their counterpart
        for (const f of extractedFields) {
          if (initial[f.id]) continue
          const label = (f.label || f.name || '').toLowerCase()
          if (!/repeat|wiederh|confirm|bestätig/i.test(label)) continue
          // Find the matching base field
          const base = extractedFields.find(other =>
            other.id !== f.id && other.type === f.type &&
            initial[other.id] &&
            label.includes(other.label?.toLowerCase().replace(/^\*\s*/, '') || '___')
          )
          if (base) initial[f.id] = initial[base.id]
        }
        setEditedValues(initial)
      } else {
        const err = await suggestRes.json().catch(() => null)
        showFeedback(err?.error || 'שגיאה בניתוח הטופס', 'error')
      }
    } catch (err) {
      console.error('[Sidebar] Suggest error:', err)
      showFeedback('שגיאה בחיבור לשרת', 'error')
    }
    setSuggesting(false)
  }, [])

  // Fill form via bridge — send selects separately so AJAX refreshes don't wipe text fields
  const fillForm = useCallback(async () => {
    const allFill = fields
      .filter(f => editedValues[f.id] && f.type !== 'file')
      .map(f => ({ selector: f.selector, value: editedValues[f.id], type: f.type }))
    if (allFill.length === 0) return
    // Split: selects first (they may trigger AJAX refreshes), then text fields after
    const selects = allFill.filter(f => f.type === 'select')
    const rest = allFill.filter(f => f.type !== 'select')
    const toFill = [...selects, ...rest]

    setFilling(true)
    await new Promise<void>((resolve) => {
      fillResolve.current = resolve
      window.parent.postMessage({ type: 'FILL_FIELDS', fields: toFill }, '*')
      setTimeout(() => {
        if (fillResolve.current === resolve) {
          fillResolve.current = null
          resolve()
        }
      }, 3000)
    })
    setFilling(false)
    // Mark filled fields as known so filters hide them
    setSuggestions(prev => {
      const updated = { ...prev }
      for (const f of fields) {
        if (editedValues[f.id]) {
          updated[f.id] = { ...updated[f.id], value: editedValues[f.id], source: 'profile' }
        }
      }
      return updated
    })
    showFeedback(`מולאו ${toFill.length} שדות`, 'success')
  }, [fields, editedValues, showFeedback])

  // Save new/modified answers to profile
  const saveFacts = useCallback(async () => {
    const newFacts: { question: string; answer: string; answerType: string }[] = []
    for (const field of fields) {
      // Skip captcha, repeat, and password fields — never persist these
      const lbl = (field.label || field.name || '').toLowerCase()
      if (field.captchaAnswer) continue
      if (/repeat|wiederh|confirm|bestätig/i.test(lbl)) continue
      if (/password|passwort|kennwort/i.test(lbl)) continue
      const val = editedValues[field.id] || ''
      const orig = suggestions[field.id]?.value || ''
      if (val && val !== orig) {
        // For select fields: save the human-readable text, not the option value
        let answerToSave = val
        if (field.type === 'select' && field.options) {
          const matchedOpt = field.options.find(o => o.value === val)
          if (matchedOpt) answerToSave = matchedOpt.text
        }
        const baseLabel = suggestions[field.id]?.translatedLabel || field.label || field.name || field.id
        const question = field.section ? `${field.section}: ${baseLabel.replace(/^\*\s*/, '')}` : baseLabel
        newFacts.push({
          question,
          answer: answerToSave,
          answerType: field.type === 'textarea' ? 'paragraph' : field.type === 'date' ? 'date' : 'word',
        })
      }
    }
    if (newFacts.length === 0) {
      showFeedback('אין עובדות חדשות לשמירה', 'error')
      return
    }

    setSaving(true)
    try {
      const token = await getIdToken()
      const res = await fetch('/api/profile-qa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ facts: newFacts }),
      })
      if (res.ok) {
        showFeedback(`נשמרו ${newFacts.length} עובדות חדשות`, 'success')
        // Update suggestions so they won't be re-saved
        setSuggestions(prev => {
          const updated = { ...prev }
          for (const fact of newFacts) {
            const f = fields.find(f => (f.label || f.name || f.id) === fact.question)
            if (f) updated[f.id] = { value: fact.answer, source: 'profile' }
          }
          return updated
        })
      } else {
        showFeedback('שגיאה בשמירה', 'error')
      }
    } catch {
      showFeedback('שגיאה בשמירה', 'error')
    }
    setSaving(false)
  }, [fields, editedValues, suggestions, showFeedback])

  // Fetch profile entries
  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true)
    try {
      const token = await getIdToken()
      const res = await fetch('/api/profile-qa', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const json = await res.json()
        setProfileEntries(json.data || [])
      }
    } catch (err) {
      console.error('[Sidebar] Fetch profile error:', err)
    }
    setLoadingProfile(false)
  }, [])

  // Load profile when switching to profile tab
  useEffect(() => {
    if (tab === 'profile' && user && profileEntries.length === 0) fetchProfile()
  }, [tab, user, profileEntries.length, fetchProfile])

  const deleteProfileEntry = useCallback(async (id: string) => {
    try {
      const token = await getIdToken()
      await fetch('/api/profile-qa', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id }),
      })
      setProfileEntries(prev => prev.filter(e => e.id !== id))
    } catch {
      showFeedback('שגיאה במחיקה', 'error')
    }
  }, [showFeedback])

  const updateProfileEntry = useCallback(async (id: string, answer: string) => {
    try {
      const token = await getIdToken()
      await fetch('/api/profile-qa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id, answer }),
      })
      setProfileEntries(prev => prev.map(e => e.id === id ? { ...e, answer } : e))
    } catch {
      showFeedback('שגיאה בעדכון', 'error')
    }
  }, [showFeedback])

  if (loading) {
    return <div style={containerStyle}><p style={{ color: '#64748b' }}>טוען...</p></div>
  }

  if (!user) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', color: '#3b82f6', marginBottom: '0.25rem' }}>{branding.name}</h1>
          <p style={{ color: '#64748b', marginBottom: '2rem' }}>עוזר למילוי טפסים</p>
          <button onClick={() => signInWithGoogle()} style={googleBtnStyle}>
            <svg width="18" height="18" viewBox="0 0 48 48" style={{ marginLeft: '0.5rem' }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            התחבר עם Google
          </button>
        </div>
      </div>
    )
  }

  const statusEmoji = (fieldId: string) => {
    const s = suggestions[fieldId]
    if (!s) return ''
    if (s.source === 'profile') return '🟢'
    if (s.source === 'ai') return '🟡'
    return '🔴'
  }

  return (
    <div style={{ ...containerStyle, justifyContent: 'flex-start', padding: '1rem' }}>
      {/* Header */}
      <header style={headerStyle}>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAvatarMenu(!showAvatarMenu)}
            style={avatarBtnStyle}
            title={user.email || ''}
          >
            <img
              src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent((user.email?.charAt(0) || '?').toUpperCase())}&background=6366f1&color=fff&size=64&bold=true`}
              alt=""
              width={28}
              height={28}
              style={{ borderRadius: '50%' }}
              referrerPolicy="no-referrer"
            />
          </button>
          {showAvatarMenu && (
            <>
              <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                onClick={() => setShowAvatarMenu(false)}
              />
              <div style={avatarMenuStyle}>
                <button onClick={() => { setShowAvatarMenu(false); signOut() }} style={logoutMenuItemStyle}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>יציאה</span>
                </button>
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <h2 style={{ fontSize: '1.25rem', color: '#3b82f6', margin: 0 }}>{branding.name}</h2>
          <span style={{ fontSize: '0.55rem', color: '#94a3b8' }}>v1.0.8</span>
        </div>
        <div style={{ width: '32px' }} />
      </header>

      {/* Tab switcher */}
      <div style={tabBarStyle}>
        <button onClick={() => setTab('scan')} style={tab === 'scan' ? activeTabStyle : inactiveTabStyle}>
          סרוק טופס
        </button>
        <button onClick={() => { setTab('profile'); fetchProfile() }} style={tab === 'profile' ? activeTabStyle : inactiveTabStyle}>
          הפרופיל שלי
        </button>
      </div>

      {/* ── Profile Tab ── */}
      {tab === 'profile' && (
        <div style={{ marginTop: '0.75rem' }}>
          {loadingProfile && <p style={{ color: '#64748b', fontSize: '0.8rem' }}>טוען פרופיל...</p>}
          {!loadingProfile && profileEntries.length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center', marginTop: '2rem' }}>
              אין עובדות בפרופיל עדיין
            </p>
          )}
          <div style={fieldsListStyle}>
            {profileEntries.map(entry => (
              <div key={entry.id} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#475569' }}>{entry.question}</span>
                  <button
                    onClick={() => entry.id && deleteProfileEntry(entry.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#94a3b8', padding: '0.125rem 0.25rem' }}
                    title="מחק"
                  >✕</button>
                </div>
                <input
                  defaultValue={typeof entry.answer === 'string' ? entry.answer : Array.isArray(entry.answer) ? entry.answer.join(', ') : ''}
                  onBlur={e => {
                    const val = e.target.value
                    if (val !== entry.answer && entry.id) updateProfileEntry(entry.id, val)
                  }}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Scan Tab ── */}
      {tab === 'scan' && (
        <>
          <button onClick={scanForm} disabled={scanning || suggesting} style={{ ...primaryBtnStyle, marginTop: '0.75rem' }}>
            {scanning ? 'סורק...' : suggesting ? 'מחפש התאמות...' : '📋 סרוק טופס'}
          </button>

      {/* No fields */}
      {scanned && fields.length === 0 && !scanning && (
        <p style={{ color: '#dc2626', fontSize: '0.85rem', textAlign: 'center', marginTop: '1rem' }}>
          לא נמצאו שדות בדף הנוכחי
        </p>
      )}

      {/* Fields list */}
      {fields.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.75rem 0 0.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 500, margin: 0 }}>
              {fields.length} שדות
              {suggesting && <span style={{ color: '#64748b', fontWeight: 400 }}> — מנתח...</span>}
            </p>
            {!suggesting && Object.keys(suggestions).length > 0 && (
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  onClick={() => setHideKnown(!hideKnown)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.75rem', color: hideKnown ? '#16a34a' : '#64748b',
                    background: hideKnown ? '#f0fdf4' : 'transparent',
                    border: hideKnown ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                    borderRadius: '1rem', padding: '0.2rem 0.5rem',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '0.75rem' }}>🟢</span>
                  {hideKnown ? 'מוסתר' : 'הסתר'}
                </button>
                <button
                  onClick={() => setHideOptional(!hideOptional)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    fontSize: '0.75rem', color: hideOptional ? '#dc2626' : '#64748b',
                    background: hideOptional ? '#fef2f2' : 'transparent',
                    border: hideOptional ? '1px solid #fecaca' : '1px solid #e2e8f0',
                    borderRadius: '1rem', padding: '0.2rem 0.5rem',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '0.75rem' }}>*</span>
                  {hideOptional ? 'חובה בלבד' : 'רק חובה'}
                </button>
              </div>
            )}
          </div>

          <div style={fieldsListStyle}>
            {fields.filter(f => (!hideKnown || suggestions[f.id]?.source !== 'profile') && (!hideOptional || f.required) && !/repeat|wiederh|confirm|bestätig/i.test(f.label || f.name || '') && !f.captchaAnswer).map((field, i) => (
              <div key={field.id + i} style={field.type === 'file' ? fileCardStyle : cardStyle}>
                <div style={cardHeaderStyle}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#475569', direction: 'ltr', unicodeBidi: 'isolate' }}>
                      {suggestions[field.id]?.translatedLabel || field.label || field.name || field.id}
                      {field.required && <span style={{ color: '#dc2626' }}> *</span>}
                    </span>
                    {suggestions[field.id]?.translatedLabel && (field.label || field.name) && (
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.1rem' }}>
                        {field.label || field.name}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{statusEmoji(field.id)}</span>
                </div>

                {field.type === 'file' ? (
                  <span style={{ fontSize: '0.7rem', color: '#991b1b' }}>העלה קובץ ידנית</span>
                ) : field.type === 'select' && field.options ? (
                  <select
                    value={editedValues[field.id] || ''}
                    onChange={e => setEditedValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    {field.options.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.text}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={editedValues[field.id] || ''}
                    onChange={e => setEditedValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder || field.label || ''}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: '2.5rem', fontFamily: 'inherit' }}
                  />
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : 'text'}
                    value={editedValues[field.id] || ''}
                    onChange={e => setEditedValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.placeholder || field.label || ''}
                    style={inputStyle}
                  />
                )}
              </div>
            ))}
          </div>

          {/* spacer for fixed bottom bar */}
          {!suggesting && <div style={{ height: '3.5rem' }} />}
        </>
      )}
        </>
      )}

      {/* Fixed bottom action bar */}
      {tab === 'scan' && fields.length > 0 && !suggesting && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          zIndex: 10,
        }}>
          <button onClick={fillForm} disabled={filling} style={{ ...primaryBtnStyle, flex: 1, width: 'auto' }}>
            {filling ? 'ממלא...' : 'מלא טופס ►'}
          </button>
          <button onClick={saveFacts} disabled={saving} style={{ ...secondaryBtnStyle, flex: 1, width: 'auto' }}>
            {saving ? 'שומר...' : 'שמור עובדות חדשות'}
          </button>
        </div>
      )}

      {/* Feedback toast */}
      {feedback && (
        <div style={{
          position: 'fixed', bottom: '1rem', left: '1rem', right: '1rem',
          padding: '0.5rem', borderRadius: '0.375rem', fontSize: '0.8rem', textAlign: 'center',
          background: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: feedback.type === 'success' ? '#166534' : '#dc2626',
        }}>
          {feedback.text}
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  direction: 'rtl',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'stretch',
  background: '#f8fafc',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
  marginBottom: '1rem',
  paddingBottom: '0.75rem',
  borderBottom: '1px solid #e2e8f0',
}

const avatarBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  padding: 0,
  background: 'transparent',
  border: '2px solid #e0e7ff',
  borderRadius: '50%',
  cursor: 'pointer',
  overflow: 'hidden',
}

const avatarMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: '0.35rem',
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: '0.5rem',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
  zIndex: 100,
  minWidth: '120px',
  overflow: 'hidden',
}

const logoutMenuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  width: '100%',
  padding: '0.625rem 0.75rem',
  background: 'none',
  border: 'none',
  color: '#dc2626',
  fontSize: '0.85rem',
  cursor: 'pointer',
  textAlign: 'right',
}

const googleBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  padding: '0.75rem 1.25rem',
  background: 'white',
  color: '#3c4043',
  border: '1px solid #dadce0',
  borderRadius: '0.375rem',
  fontSize: '0.9rem',
  fontWeight: 500,
  cursor: 'pointer',
}

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 1.25rem',
  background: '#3b82f6',
  color: 'white',
  border: 'none',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 1.25rem',
  background: '#f1f5f9',
  color: '#475569',
  border: '1px solid #cbd5e1',
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
  fontWeight: 500,
  cursor: 'pointer',
}


const fieldsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.375rem',
  maxHeight: 'calc(100vh - 260px)',
  overflowY: 'auto',
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e2e8f0',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.625rem',
}

const fileCardStyle: React.CSSProperties = {
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '0.375rem',
  padding: '0.5rem 0.625rem',
}

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.25rem',
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0',
  borderBottom: '2px solid #e2e8f0',
}

const activeTabStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem',
  background: 'none',
  border: 'none',
  borderBottom: '2px solid #3b82f6',
  marginBottom: '-2px',
  fontSize: '0.85rem',
  fontWeight: 600,
  color: '#3b82f6',
  cursor: 'pointer',
}

const inactiveTabStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem',
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  marginBottom: '-2px',
  fontSize: '0.85rem',
  fontWeight: 500,
  color: '#94a3b8',
  cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.5rem',
  border: '1px solid #cbd5e1',
  borderRadius: '0.25rem',
  fontSize: '0.8rem',
  outline: 'none',
  direction: 'rtl',
  boxSizing: 'border-box',
}
