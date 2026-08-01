/**
 * Whether the full-page chat route (`/app/chat`) is currently mounted.
 *
 * Can't use `usePathname()` for this: the Saliko mobile-landing rewrite
 * (proxy.ts) serves `/app/chat`'s content while the browser URL stays
 * `/app`, so `usePathname()` still reads `/app` there. This lets the chat
 * page itself signal "I'm the full-page chat" regardless of which URL got
 * it rendered, so the floating ChatWidget bubble can hide without a
 * redundant overlay on top of its own content.
 */
type Listener = (active: boolean) => void

let active = false
const listeners = new Set<Listener>()

export const chatPageActive = {
  set(value: boolean) {
    active = value
    listeners.forEach((l) => l(value))
  },
  get(): boolean {
    return active
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}
