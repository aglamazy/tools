'use client'

import { useState, useEffect } from 'react'

export default function PublicTermsPage() {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/terms')
      .then(res => res.json())
      .then(data => { if (data.success && data.text) setText(data.text) })
      .catch(() => {})
  }, [])

  return (
    <div dir="rtl" style={{ maxWidth: '700px', margin: '2rem auto', padding: '2rem', fontFamily: 'sans-serif', lineHeight: 1.8 }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>תנאי שימוש</h1>
      {text ? (
        <div dangerouslySetInnerHTML={{ __html: text }} />
      ) : (
        <p style={{ color: '#94a3b8' }}>טוען...</p>
      )}
    </div>
  )
}
