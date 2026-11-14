import { describe, it, expect } from 'vitest'
import { chunkList, runPool, CLASSIFY_BATCH_SIZE, CLASSIFY_PARALLEL } from './classifyBatching'

describe('chunkList', () => {
  it('splits 18 rows into three chunks of 6 at the chosen batch size', () => {
    const rows = Array.from({ length: 18 }, (_, i) => i)
    const chunks = chunkList(rows, CLASSIFY_BATCH_SIZE)
    expect(chunks.map((c) => c.length)).toEqual([6, 6, 6])
    expect(chunks.flat()).toEqual(rows)
  })

  it('keeps a short last chunk and handles an empty list', () => {
    expect(chunkList([1, 2, 3, 4, 5, 6, 7], 6)).toEqual([[1, 2, 3, 4, 5, 6], [7]])
    expect(chunkList([], 6)).toEqual([])
  })

  it('rejects a size below 1', () => {
    expect(() => chunkList([1], 0)).toThrow()
  })
})

describe('runPool', () => {
  it('never runs more than the limit at once and keeps input order', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 10 }, (_, i) => i)
    const out = await runPool(items, CLASSIFY_PARALLEL, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5 + ((n * 7) % 11)))
      inFlight--
      return n * 10
    })
    expect(peak).toBe(CLASSIFY_PARALLEL)
    expect(out).toEqual(items.map((n) => n * 10))
  })

  it('reports progress once per finished item', async () => {
    const seen: string[] = []
    await runPool([1, 2, 3], 2, async (n) => n, (d, t) => seen.push(`${d}/${t}`))
    expect(seen).toEqual(['1/3', '2/3', '3/3'])
  })

  it('rejects when a worker throws instead of swallowing it', async () => {
    await expect(
      runPool([1, 2, 3], 3, async (n) => {
        if (n === 2) throw new Error('Claude error 502')
        return n
      }),
    ).rejects.toThrow('Claude error 502')
  })
})
