/**
 * Terms & Conditions Store
 * Tracks whether the current user has accepted the latest T&C version.
 * Subscribes to user document in Firestore for real-time updates.
 */

import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirebaseFirestore, isFirebaseConfigured } from '@/app/lib/firebase'
import { config } from '@/app/config'

type TcState = {
  accepted: boolean
  loading: boolean
}

type Listener = (state: TcState) => void

let state: TcState = { accepted: false, loading: true }
const listeners = new Set<Listener>()
let firestoreUnsubscribe: Unsubscribe | null = null

function notifyListeners() {
  listeners.forEach((listener) => listener(state))
}

export const tcStore = {
  get(): TcState {
    return state
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    listener(state)
    return () => {
      listeners.delete(listener)
    }
  },

  subscribeFirestore(uid: string): void {
    if (!isFirebaseConfigured()) {
      state = { accepted: true, loading: false }
      notifyListeners()
      return
    }
    this.unsubscribeFirestore()
    const firestore = getFirebaseFirestore()
    firestoreUnsubscribe = onSnapshot(
      doc(firestore, 'users', uid),
      (snapshot) => {
        if (!snapshot.exists()) {
          state = { accepted: false, loading: false }
          notifyListeners()
          return
        }
        const data = snapshot.data()
        const tcAcceptedAt = data?.tcAcceptedAt as string | undefined
        const accepted = tcAcceptedAt != null && tcAcceptedAt >= config.tcVersion
        state = { accepted, loading: false }
        notifyListeners()
      },
      (error) => {
        console.error('[TcStore] Firestore subscription error:', error)
        state = { accepted: false, loading: false }
        notifyListeners()
      }
    )
  },

  unsubscribeFirestore(): void {
    if (firestoreUnsubscribe) {
      firestoreUnsubscribe()
      firestoreUnsubscribe = null
    }
  },

  reset(): void {
    this.unsubscribeFirestore()
    state = { accepted: false, loading: true }
    notifyListeners()
  },
}
