// CALLER-KEYED ROUTE — probes the caller's own Anthropic key; no app secret.
// Lightweight Claude-key health check. Makes the smallest possible Anthropic
// request (max_tokens: 1) and classifies the result so the app can always show
// the key's status in Settings and alert (once/day) when it's unusable — the
// "credit balance too low" failure was previously invisible until a receipt
// match silently failed. This does NOT extract anything; it only probes the key.
import { NextRequest, NextResponse } from 'next/server'

export type ClaudeKeyReason = 'ok' | 'no-credit' | 'invalid' | 'rate-limit' | 'error'

export async function POST(req: NextRequest) {
  const { apiKey } = await req.json().catch(() => ({ apiKey: undefined }))
  if (!apiKey || typeof apiKey !== 'string') {
    return NextResponse.json({ ok: false, reason: 'invalid', message: 'לא הוזן מפתח' } as const)
  }

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
  } catch {
    return NextResponse.json({ ok: false, reason: 'error', message: 'שגיאת רשת בבדיקת המפתח' } as const)
  }

  if (res.ok) {
    return NextResponse.json({ ok: true, reason: 'ok', message: 'מפתח Claude תקין' } as const)
  }

  const body = await res.text()
  let providerMsg = ''
  try { providerMsg = JSON.parse(body)?.error?.message || '' } catch { /* non-JSON */ }

  let reason: ClaudeKeyReason = 'error'
  let message = providerMsg || `שגיאת Anthropic (${res.status})`
  if (/credit balance is too low/i.test(providerMsg)) {
    reason = 'no-credit'
    message = 'יתרת הקרדיט ב-Anthropic נמוכה מדי — טען קרדיט או הסר את המפתח כדי לעבוד עם Gemini.'
  } else if (res.status === 401 || /authentication|invalid x-api-key|invalid api key/i.test(providerMsg)) {
    reason = 'invalid'
    message = 'מפתח Claude אינו תקין.'
  } else if (res.status === 429) {
    reason = 'rate-limit'
    message = 'הגעת למגבלת הקצב ב-Anthropic — נסה שוב מאוחר יותר.'
  }

  return NextResponse.json({ ok: false, reason, message })
}
