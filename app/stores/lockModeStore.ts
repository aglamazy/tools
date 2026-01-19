/**
 * Lock Mode Store
 * Simple reactive store to share station lock mode across components
 */

type LockMode = 'initializing' | 'master' | 'slave'
type Listener = (mode: LockMode) => void

let currentMode: LockMode = 'initializing'
const listeners: Set<Listener> = new Set()

export const lockModeStore = {
  get(): LockMode {
    return currentMode
  },

  set(mode: LockMode): void {
    if (currentMode !== mode) {
      currentMode = mode
      listeners.forEach((listener) => listener(mode))
    }
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    // Return unsubscribe function
    return () => {
      listeners.delete(listener)
    }
  },

  isMaster(): boolean {
    return currentMode === 'master'
  },

  isSlave(): boolean {
    return currentMode === 'slave'
  },
}
