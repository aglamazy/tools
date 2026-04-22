/**
 * Shared timeout helper for grocery API routes.
 *
 * JS has no native Promise cancellation, so the underlying promise continues
 * running in the background after the timeout rejects — this is acceptable
 * here because the goal is only to bound the API-layer wait time so the
 * Vercel maxDuration isn't exceeded. The underlying socket/fetch will be
 * GC'd when it eventually settles or the function instance is torn down.
 */

/**
 * Race `p` against a timer. If `p` hasn't settled in `ms`, rejects with
 * `Error("${label}: timeout after ${ms}ms")`. The original promise is NOT
 * cancelled — see the file-level note.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: timeout after ${ms}ms`)), ms)),
  ])
}
