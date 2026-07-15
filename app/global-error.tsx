'use client'

import { useEffect } from 'react'
import { reportClientError } from 'agents-observe/react'

/**
 * Root error boundary (aglamazo#240) — Next.js calls this when a client
 * render throws anywhere in the tree, including layout.tsx itself. This is
 * the only place that can catch faults Vercel's server logs physically
 * can't see (e.g. a Firebase `auth/unauthorized-domain` break).
 *
 * Design (resolved before this task, see task spec): report THROUGH our own
 * server (`/api/client-error`), never directly from the browser to the
 * cockpit. A direct browser -> cockpit POST would need
 * NEXT_PUBLIC_AGENTS_OBSERVE_TOKEN, which Next.js bakes into the public
 * client bundle — readable by anyone (~/.claude/VERCEL.md: NEXT_PUBLIC_* is
 * never a place for a secret). The `token` below is a placeholder only to
 * satisfy agents-observe's own "no token = skip" guard; it is NOT the real
 * cockpit secret. Our `/api/client-error` route re-signs with the real,
 * server-only SERVICE_CALL_INGEST_TOKEN before forwarding.
 *
 * Next.js only renders this file in a production build (`next build` +
 * `next start`) — in `next dev` the dev error overlay takes over instead.
 *
 * global-error.tsx replaces the ENTIRE root layout when it fires, so it
 * must render its own <html>/<body> (Next.js requirement).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientError(error, {
      config: {
        ingestUrl: '/api/client-error',
        token: 'relay',
        projectId: 'aglamazo',
      },
    })
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: 24,
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h2>אירעה שגיאה בלתי צפויה</h2>
          <p>אנחנו כבר יודעים על כך ובודקים את הבעיה. נסו לרענן את הדף.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            רענון
          </button>
        </div>
      </body>
    </html>
  )
}
