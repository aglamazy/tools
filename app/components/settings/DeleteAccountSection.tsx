'use client'

/**
 * Settings red zone: delete the account and everything it owns (aglamazo#412).
 * Shown only to a signed-in Firebase user. Owner-only on the server; a member
 * sees why they cannot. Spec: ~/develop/Buddy/docs/aglamazo-delete-account-SPEC.md.
 */
import { useEffect, useState } from 'react'
import { subscribeToAuth, type AuthUser } from '@/app/stores/authStore'
import { fetchDeletionPreview } from '@/app/services/accountDeletionClient'
import type { DeletionPreview } from '@/app/services/accountDeletion/preview'
import { DELETE_ACCOUNT as T } from '@/app/services/accountDeletion/strings'
import DeleteAccountFlow from './DeleteAccountFlow'

type PreviewState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; preview: DeletionPreview }

function PersonList({ title, people }: { title: string; people: Array<{ uid: string; email: string | null }> }) {
  if (people.length === 0) return null
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <strong>{title}</strong>
      <ul style={{ margin: '0.25rem 0 0', paddingInlineStart: '1.25rem' }}>
        {people.map((p) => <li key={p.uid}>{p.email ?? T.unknownEmail}</li>)}
      </ul>
    </div>
  )
}

export default function DeleteAccountSection() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  const [flowOpen, setFlowOpen] = useState(false)

  useEffect(() => subscribeToAuth((auth) => setUser(auth.user)), [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetchDeletionPreview()
      .then((result) => {
        if (cancelled) return
        setState(result.ok ? { status: 'ready', preview: result.preview } : { status: 'failed' })
      })
      .catch((err) => {
        console.error('[DeleteAccount] preview failed:', err)
        if (!cancelled) setState({ status: 'failed' })
      })
    return () => { cancelled = true }
  }, [user])

  if (!user) return null

  return (
    <section style={{ marginTop: '2rem', padding: '1rem', border: '2px solid #dc2626', borderRadius: '0.75rem', background: '#fef2f2' }}>
      <h2 style={{ margin: 0, fontSize: '1.05rem', color: '#991b1b' }}>{T.zoneTitle}</h2>
      {state.status === 'loading' && <p style={{ margin: '0.5rem 0 0' }}>…</p>}
      {state.status === 'failed' && <p style={{ margin: '0.5rem 0 0', color: '#b91c1c' }}>{T.previewFailed}</p>}
      {state.status === 'ready' && !state.preview.isOwner && <p style={{ margin: '0.5rem 0 0' }}>{T.notOwner}</p>}
      {state.status === 'ready' && state.preview.isOwner && (
        <>
          <p style={{ margin: '0.5rem 0 0', color: '#7f1d1d' }}>{T.whatIsDeleted}</p>
          <p style={{ margin: '0.5rem 0 0', color: '#7f1d1d', fontWeight: 600 }}>{T.irreversible}</p>
          <p style={{ margin: '0.5rem 0 0', color: '#7f1d1d' }}>{T.filesNote}</p>
          <PersonList title={T.membersTitle} people={state.preview.members} />
          <PersonList title={T.partnersTitle} people={state.preview.partners} />
          <button
            onClick={() => setFlowOpen(true)}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
          >
            {T.start}
          </button>
        </>
      )}
      {flowOpen && <DeleteAccountFlow onClose={() => setFlowOpen(false)} />}
    </section>
  )
}
