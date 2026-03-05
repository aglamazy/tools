'use client'

import React from 'react'
import { routes } from '@/app/config'

export default function ExtensionLink() {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <p style={{ fontSize: '1.125rem', marginBottom: '1rem', color: '#64748b' }}>
        התקן את התוסף לכרום כדי למלא טפסים אוטומטית
      </p>
      <a
        href={routes.extension}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          padding: '0.75rem 1.5rem',
          backgroundColor: '#3b82f6',
          color: '#fff',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          fontSize: '1rem',
          fontWeight: 600,
        }}
      >
        🧩 הורד תוסף
      </a>
    </div>
  )
}
