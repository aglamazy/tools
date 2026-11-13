/**
 * Smart-classify batching (aglamazo#475). Chosen from a benchmark of the same
 * 18 October 2026 rows, 3 runs per variant (table on aglamazo#475):
 *   before: claude-sonnet-5, 18 rows in 1 call, default thinking -> median 46.6 s,
 *           useful 11/18, 4 confidently wrong, $0.099/run
 *   chosen: claude-haiku-5-5 at effort low, 6 rows per call, 3 calls at once
 *           -> median 8.9 s, useful 13/18, 0 confidently wrong, $0.010/run
 * Both the page (SmartClassifierAgent) and the route read these numbers, so
 * the batch shape lives in one place.
 */
export const CLASSIFY_BATCH_SIZE = 6
export const CLASSIFY_PARALLEL = 3
export const CLASSIFY_EFFORT = 'low' as const

/** Split `items` into consecutive chunks of at most `size`. */
export function chunkList<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error(`chunkList: size must be >= 1, got ${size}`)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Run `worker` over `items` with at most `limit` in flight. Results keep the
 * input order. The first rejection rejects the whole run (no swallowed errors);
 * `onDone` fires after each item settles successfully, for progress UI.
 */
export async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onDone?: (doneCount: number, total: number) => void,
): Promise<R[]> {
  if (limit < 1) throw new Error(`runPool: limit must be >= 1, got ${limit}`)
  const results = new Array<R>(items.length)
  let next = 0
  let done = 0
  const lane = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
      done++
      onDone?.(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}
