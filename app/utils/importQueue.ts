// aglamazo#451: statement imports run one at a time. Parallel imports each
// read the existing rows before the others wrote theirs, so overlapping
// files bypassed dedup (3 overlapping card-2075 xlsx all reported
// "0 duplicates skipped"). Every import goes through this module-level
// promise chain; a task starts only after the previous one settled.

let tail: Promise<unknown> = Promise.resolve()
let pending = 0
const listeners = new Set<(count: number) => void>()

function notify() {
  for (const listener of listeners) listener(pending)
}

/** Run `task` after every previously queued import has settled (resolved or
 *  rejected). The returned promise carries only this task's own result. */
export function runImportSerially<T>(task: () => Promise<T>): Promise<T> {
  pending++
  notify()
  const run = tail.then(task)
  // The chain continues whether this task resolves or rejects, so a failed
  // import never blocks the next one; the rejection reaches only `run`'s caller.
  tail = run.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    pending--
    notify()
  })
  return run
}

/** Imports queued or running right now. */
export function pendingImports(): number {
  return pending
}

/** Subscribe to the pending count; returns an unsubscribe function. */
export function subscribeImportQueue(listener: (count: number) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
