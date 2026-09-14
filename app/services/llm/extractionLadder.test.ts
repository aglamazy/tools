import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractJsonWithFallback, modelSupportsTemperature } from './extractionLadder'

// aglamazo#385, Sheli 2026-09-14: the live Anthropic fallback started
// rejecting requests with "`temperature` is deprecated for this model" —
// reproduced against Agla's real BTL notice. Fix, per Agla's own follow-up
// instruction ("take the model name from the maker/model name and handle
// the temp field"): a per-model check, not a blanket drop — a model whose
// maker hasn't deprecated the parameter still gets it (real determinism
// benefit), only claude-sonnet-5 (the one confirmed live) skips it. This
// test proves the actual network-call boundary, not just the diff.

describe('modelSupportsTemperature', () => {
  it('returns false for the confirmed-deprecated model (claude-sonnet-5)', () => {
    expect(modelSupportsTemperature('claude-sonnet-5')).toBe(false)
  })

  it('returns true for any other model — no evidence it is unsupported there', () => {
    expect(modelSupportsTemperature('claude-opus-5')).toBe(true)
    expect(modelSupportsTemperature('some-future-model')).toBe(true)
  })
})

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

  const stubFetchCapturingAnthropicBody = (capture: { body: any }) =>
    vi.fn(async (url: any, init?: any) => {
      const urlStr = String(url)
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        // Force the Gemini leg to fail so the ladder falls through to Anthropic.
        return new Response('Gemini unavailable', { status: 503 })
      }
      if (urlStr.includes('api.anthropic.com')) {
        capture.body = JSON.parse(init.body)
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: '{"ok":true}' }] }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected fetch to ${urlStr}`)
    })

  it('never sends a temperature field for claude-sonnet-5, the confirmed-deprecated model', async () => {
    const capture: { body: any } = { body: null }
    global.fetch = stubFetchCapturingAnthropicBody(capture) as any

    const result = await extractJsonWithFallback<{ ok: boolean }>({
      routeName: 'test-route',
      systemPrompt: 'sys',
      userParts: [{ type: 'text', text: 'hello' }],
      anthropicApiKey: 'test-anthropic-key',
      anthropicModel: 'claude-sonnet-5',
      geminiTemperature: 0,
    })

    expect(result.ok).toBe(true)
    expect(capture.body).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(capture.body, 'temperature')).toBe(false)
  })

  it('still sends temperature for a model with no evidence of deprecation', async () => {
    const capture: { body: any } = { body: null }
    global.fetch = stubFetchCapturingAnthropicBody(capture) as any

    const result = await extractJsonWithFallback<{ ok: boolean }>({
      routeName: 'test-route',
      systemPrompt: 'sys',
      userParts: [{ type: 'text', text: 'hello' }],
      anthropicApiKey: 'test-anthropic-key',
      anthropicModel: 'claude-opus-5',
      geminiTemperature: 0,
    })

    expect(result.ok).toBe(true)
    expect(capture.body.temperature).toBe(0)
  })
})
