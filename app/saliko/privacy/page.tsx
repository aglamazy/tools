import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { VARIANT, VARIANT_CONFIG } from '@/app/config/variants'
import {
  SALIKO_PRIVACY_HTML,
  SALIKO_PRIVACY_VERSION,
  SALIKO_PRIVACY_CONTACT_EMAIL,
} from './privacyContent'

/**
 * Saliko privacy page.
 *
 * Reachable as `/privacy` on the Saliko deployment (the variant proxy in
 * `proxy.ts` rewrites `/privacy` → `/saliko/privacy`) and as `/saliko/privacy`
 * canonically. On Aglamazo deployments the page returns 404 — the policy is
 * Saliko-specific (only Saliko ever acts on the user's behalf with stored
 * credentials), and surfacing it under the Aglamazo brand would be misleading.
 */
export const metadata: Metadata = {
  title: `מדיניות פרטיות | ${VARIANT_CONFIG.name}`,
  description: `מדיניות הפרטיות של ${VARIANT_CONFIG.name} — שלוש רמות פרטיות, הסבר מה נשמר ומי ניגש.`,
  alternates: { canonical: '/privacy' },
  robots: { index: VARIANT === 'saliko', follow: VARIANT === 'saliko' },
}

export default function SalikoPrivacyPage() {
  // Hard gate: this page exists only under the Saliko variant. Aglamazo has
  // no on-behalf cron flows and therefore no need for this policy.
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
      <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>מדיניות פרטיות</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        גרסה <code>{SALIKO_PRIVACY_VERSION}</code> · לפניות:{' '}
        <a href={`mailto:${SALIKO_PRIVACY_CONTACT_EMAIL}`} style={{ color: '#4338ca' }}>
          {SALIKO_PRIVACY_CONTACT_EMAIL}
        </a>
      </p>

      <div dangerouslySetInnerHTML={{ __html: SALIKO_PRIVACY_HTML }} />

      <nav style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
        <Link href="/" style={{ color: '#4338ca' }}>
          חזרה לעמוד הבית
        </Link>
      </nav>
    </div>
  )
}
