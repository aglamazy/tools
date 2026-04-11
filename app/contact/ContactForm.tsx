'use client'

import { useState } from 'react'

type FormState = 'idle' | 'sending' | 'sent' | 'error'

export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [formState, setFormState] = useState<FormState>('idle')
  const [errorText, setErrorText] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormState('sending')
    setErrorText('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'שגיאה בשליחת ההודעה')
      }

      setFormState('sent')
      setName('')
      setEmail('')
      setMessage('')
    } catch (err: any) {
      setErrorText(err.message || 'שגיאה בשליחת ההודעה')
      setFormState('error')
    }
  }

  if (formState === 'sent') {
    return (
      <div
        style={{
          background: '#ecfdf5',
          border: '1px solid #10b981',
          borderRadius: '0.5rem',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>&#x2705;</div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>ההודעה נשלחה בהצלחה</h2>
        <p style={{ color: '#475569', margin: 0 }}>נחזור אליך בהקדם</p>
        <button
          onClick={() => setFormState('idle')}
          style={{
            marginTop: '1.5rem',
            padding: '0.75rem 2rem',
            background: '#4338ca',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            cursor: 'pointer',
          }}
        >
          שלח הודעה נוספת
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="contact-name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          שם
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={formState === 'sending'}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
          }}
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="contact-email" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          אימייל
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={formState === 'sending'}
          dir="ltr"
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
          }}
        />
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="contact-message" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
          הודעה
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          disabled={formState === 'sending'}
          rows={5}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            resize: 'vertical',
          }}
        />
      </div>

      {formState === 'error' && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.5rem',
            color: '#dc2626',
            fontSize: '0.9rem',
            textAlign: 'center',
          }}
        >
          {errorText}
        </div>
      )}

      <button
        type="submit"
        disabled={formState === 'sending'}
        style={{
          width: '100%',
          padding: '0.875rem',
          background: formState === 'sending' ? '#94a3b8' : '#4338ca',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: formState === 'sending' ? 'not-allowed' : 'pointer',
        }}
      >
        {formState === 'sending' ? 'שולח...' : 'שלח הודעה'}
      </button>
    </form>
  )
}
