import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { VARIANT, VARIANT_CONFIG } from '@/app/config/variants'
import {
  SALIKO_TC_HTML,
  SALIKO_TC_VERSION,
  SALIKO_TC_CONTACT_EMAIL,
} from './termsContent'

/**
 * Saliko terms-of-use page.
 *
 * Reachable as `/terms` on the Saliko deployment (the variant proxy in
 * `proxy.ts` rewrites `/terms` → `/saliko/terms`) and as `/saliko/terms`
 * canonically. On Aglamazo deployments the page returns 404 — the terms
 * here are Saliko-specific (grocery-ordering agent flows), and surfacing
 * them under the Aglamazo brand would be misleading.
 *
 * Note: before this page existed, `/terms` on the Saliko deployment 404'd
 * (the proxy rewrite target didn't exist) — this file fixes that as a
 * side effect of following the same pattern as app/saliko/privacy/page.tsx.
 */
const SALIKO_URL = 'https://saliko.co.il'

export const metadata: Metadata = {
  title: `תנאי שימוש | ${VARIANT_CONFIG.name}`,
  description: `תנאי השימוש של ${VARIANT_CONFIG.name} — מה הסוכן עושה, אחריות על הזמנות, ביטול ושינוי.`,
  alternates: { canonical: '/terms' },
  robots: { index: VARIANT === 'saliko', follow: VARIANT === 'saliko' },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: VARIANT_CONFIG.name, item: `${SALIKO_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'תנאי שימוש', item: `${SALIKO_URL}/terms` },
    ],
  },
]

export default function SalikoTermsPage() {
  // Hard gate: this page exists only under the Saliko variant.
  if (VARIANT !== 'saliko') notFound()

  return (
    <div
      dir="rtl"
      style={{
        maxWidth: '780px',
        margin: '2rem auto',
        padding: '2rem',
        fontFamily: 'sans-serif',
        lineHeight: 1.8,
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>תנאי שימוש</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        גרסה <code>{SALIKO_TC_VERSION}</code> · לפניות:{' '}
        <a href={`mailto:${SALIKO_TC_CONTACT_EMAIL}`} style={{ color: '#4338ca' }}>
          {SALIKO_TC_CONTACT_EMAIL}
        </a>
      </p>

      <div dangerouslySetInnerHTML={{ __html: SALIKO_TC_HTML }} />

      <nav style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
        <Link href="/" style={{ color: '#4338ca' }}>
          חזרה לעמוד הבית
        </Link>
      </nav>
    </div>
  )
}
