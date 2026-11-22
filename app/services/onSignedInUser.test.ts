import { describe, it, expect } from 'vitest'
import { onSignedInUser } from './onSignedInUser'

// aglamazo#474 (Agla 134365): the todo filters vanished on reload because the
// page read the auth user once, before Firebase had resolved it.

type U = { uid: string }

function fakeAuth(initial: U | null) {
  let state = { user: initial }
  const listeners = new Set<(s: { user: U | null }) => void>()
  return {
    subscribe(l: (s: { user: U | null }) => void) {
      listeners.add(l)
      l(state) // like authStore.subscribeToAuth: called at once with the current state
      return () => listeners.delete(l)
    },
    set(user: U | null) {
      state = { user }
      listeners.forEach(l => l(state))
    },
  }
}

describe('onSignedInUser (aglamazo#474 reload race)', () => {
  it('runs when the user resolves after mount (reload case)', () => {
    const auth = fakeAuth(null)
    const seen: string[] = []
    onSignedInUser(auth.subscribe, u => seen.push(u.uid))
    expect(seen).toEqual([]) // mounted before auth: nothing yet
    auth.set({ uid: 'a' })
    expect(seen).toEqual(['a'])
  })

  it('runs at once when the user is already known (client navigation)', () => {
    const auth = fakeAuth({ uid: 'a' })
    const seen: string[] = []
    onSignedInUser(auth.subscribe, u => seen.push(u.uid))
    expect(seen).toEqual(['a'])
  })

  it('does not rerun for the same user, reruns on an account switch', () => {
    const auth = fakeAuth(null)
    const seen: string[] = []
    onSignedInUser(auth.subscribe, u => seen.push(u.uid))
    auth.set({ uid: 'a' })
    auth.set({ uid: 'a' })
    auth.set(null)
    auth.set({ uid: 'b' })
    expect(seen).toEqual(['a', 'b'])
  })

  it('stops after unsubscribe', () => {
    const auth = fakeAuth(null)
    const seen: string[] = []
    const off = onSignedInUser(auth.subscribe, u => seen.push(u.uid))
    off()
    auth.set({ uid: 'a' })
    expect(seen).toEqual([])
  })
})
