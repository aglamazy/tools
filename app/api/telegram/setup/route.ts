/**
 * POST /api/telegram/setup — register webhook URL with Telegram.
 * Admin-only. Call once after deploy or when URL changes.
 *
 * GET /api/telegram/setup — check current webhook status.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/app/lib/apiGuard'
import { setWebhook, deleteWebhook, getWebhookInfo, getMe, isConfigured } from '@/app/services/telegram/telegramClient'
import { withServiceCall } from '@/app/lib/observe'

async function POSTHandler(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  if (guard.tier !== 'owner') {
    return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  }

  if (!isConfigured()) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, { status: 500 })
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'TELEGRAM_WEBHOOK_SECRET not configured' }, { status: 500 })
  }

  let body: { action?: string; webhookUrl?: string } = {}
  try {
    body = await request.json()
  } catch {
    // no body is fine for default action
  }

  if (body.action === 'delete') {
    await deleteWebhook()
    return NextResponse.json({ success: true, action: 'deleted' })
  }

  // Default: set webhook
  const webhookUrl = body.webhookUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/telegram/webhook`
  if (!webhookUrl) {
    return NextResponse.json({ error: 'No webhook URL — set NEXT_PUBLIC_APP_URL or pass webhookUrl' }, { status: 400 })
  }

  const bot = await getMe()
  await setWebhook(webhookUrl, secret)

  console.log(`[Telegram Setup] Webhook set for @${bot.username} → ${webhookUrl}`)

  return NextResponse.json({
    success: true,
    bot: { id: bot.id, username: bot.username },
    webhookUrl,
  })
}

async function GETHandler(request: NextRequest) {
  const guard = await requireAuth(request)
  if (guard.error) return guard.error
  if (guard.tier !== 'owner') {
    return NextResponse.json({ error: 'Owner only' }, { status: 403 })
  }

  if (!isConfigured()) {
    return NextResponse.json({ configured: false })
  }

  const [bot, webhook] = await Promise.all([getMe(), getWebhookInfo()])

  return NextResponse.json({
    configured: true,
    bot: { id: bot.id, username: bot.username },
    webhook,
  })
}

export const POST = withServiceCall(POSTHandler)
export const GET = withServiceCall(GETHandler)
