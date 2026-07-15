// CALLER-KEYED ROUTE — internal only, not user-facing.
/**
 * POST /api/grocery/checkout/continue — Telegram's self-chaining driver for
 * the small-step Shufersal checkout (#275).
 *
 * Telegram has no persistent client to loop add-batch/finalize the way the
 * web chat widget does (see AppChat.tsx's runCheckoutSession). So the
 * webhook fires ONE of these per batch, unawaited (via `after()`), and each
 * invocation does its one small step then fires the next — a genuinely NEW
 * serverless invocation with its own fresh maxDuration, not one big loop
 * inside a single call. That's what actually satisfies "no single call
 * blows the function budget": each hop is small and independent.
 *
 * Auth: same lenient CRON_SECRET pattern as queue-cron (skipped if unset,
 * for local dev) — this endpoint trusts a caller-supplied uid, so it must
 * never be reachable without the secret in production.
 */
import { NextRequest, NextResponse } from 'next/server'
import { addCheckoutBatch, finalizeShufersalCheckoutSession } from '@/app/services/grocery/shufersalCheckoutFlow'
import { fireNextCheckoutStep, type CheckoutContinueBody } from '@/app/services/grocery/checkoutContinuation'
import { sendMessage } from '@/app/services/telegram/telegramClient'
import { withServiceCall } from '@/app/lib/observe'

const CRON_SECRET = process.env.CRON_SECRET

export const maxDuration = 30

async function POSTHandler(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CheckoutContinueBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.uid || !body.checkoutId || typeof body.telegramChatId !== 'number' || typeof body.batchIndex !== 'number') {
    return NextResponse.json({ error: 'Missing uid, checkoutId, telegramChatId, or batchIndex' }, { status: 400 })
  }

  const result = await addCheckoutBatch(body.uid, body.checkoutId, body.batchIndex)
  if (!result.ok) {
    await sendMessage(body.telegramChatId, `❌ ${result.message}`).catch(err => console.warn('[CheckoutContinue] sendMessage failed:', err))
    return NextResponse.json({ ok: false })
  }

  if (!result.ready) {
    fireNextCheckoutStep({ ...body, batchIndex: body.batchIndex + 1 })
    return NextResponse.json({ ok: true, completed: result.completed, total: result.total })
  }

  const finalized = await finalizeShufersalCheckoutSession(body.uid, body.checkoutId)
  // Telegram has no browser/Dexie to fall back to for attended checkout —
  // that's a web-only recovery path. Surface the REAL reason (never swallow
  // it — a status with no explanation is a bug, Agla 2026-07-15) plus what
  // to do about it here specifically.
  const telegramMessage = 'requiresAttendedCheckout' in finalized
    ? `${finalized.message}\nהמשך הזמנה זו אפשרי רק דרך האפליקציה (טלגרם לא תומך בהתחברות דרך הדפדפן).`
    : finalized.message
  await sendMessage(body.telegramChatId, telegramMessage).catch(err => console.warn('[CheckoutContinue] sendMessage failed:', err))
  return NextResponse.json({ ok: finalized.ok })
}

export const POST = withServiceCall(POSTHandler)
