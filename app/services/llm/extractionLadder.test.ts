import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractJsonWithFallback } from './extractionLadder'

// aglamazo#385, Sheli 2026-09-14: the live Anthropic fallback started
// rejecting requests with "`temperature` is deprecated for this model" —
// reproduced against Agla's real BTL notice. Fix: extractionLadder.ts's
// Anthropic request never sends `temperature` at all (the only place in the
// codebase that did). This test proves that at the network-call boundary,
// not just by reading the diff.

describe('extractJsonWithFallback — Anthropic fallback request shape (aglamazo#385)', () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
  })

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalGeminiKey
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('never sends a temperature field to the Anthropic API, even though the ladder computes one internally', async () => {
    let anthropicRequestBody: any = null

    global.fetch = vi.fn(async (url: any, init?: any) => {
      const urlStr = String(url)
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        // Force the Gemini leg to fail so the ladder falls through to Anthropic.
        return new Response('Gemini unavailable', { status: 503 })
      }
      if (urlStr.includes('api.anthropic.com')) {
        anthropicRequestBody = JSON.parse(init.body)
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }] }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected fetch to ${urlStr}`)
    }) as any

    const result = await extractJsonWithFallback<{ ok: boolean }>({
      routeName: 'test-route',
      systemPrompt: 'sys',
      userParts: [{ type: 'text', text: 'hello' }],
      anthropicApiKey: 'test-anthropic-key',
    })

    expect(result.ok).toBe(true)
    expect(anthropicRequestBody).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(anthropicRequestBody, 'temperature')).toBe(false)
  })
})
