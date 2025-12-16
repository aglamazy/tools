'use client'

import React from 'react'

export default function BusinessesTab() {
  return (
    <section style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
      <div style={{
        maxWidth: '400px',
        margin: '0 auto',
        padding: '2rem',
        background: '#f8fafc',
        borderRadius: '0.75rem',
        border: '1px dashed #cbd5e1',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏢</div>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: '#334155' }}>ניהול עסקים</h2>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>
          בקרוב - ניהול עסקים, קישור לחשבוניות ומעקב הוצאות לפי עסק
        </p>
      </div>
    </section>
  )
}
