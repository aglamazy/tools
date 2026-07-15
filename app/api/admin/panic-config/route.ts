/**
 * Admin Panic Config API
 * GET  — owner reads current panic-alert config
 * POST — owner updates adminTelegramChatId / throttleMinutes
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireTier } from '@/app/lib/apiGuard'
import { readPanicConfig, writePanicConfig } from '@/app/services/adminPanic'
import { withServiceCall } from '@/app/lib/observe'

async function GETHandler(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

  try {
    const config = await readPanicConfig()
    return NextResponse.json({
      adminTelegramChatId: config.adminTelegramChatId,
      throttleMinutes: config.throttleMinutes,
      lastFiredAt: config.lastFiredAt ?? null,
    })
  } catch (error) {
    console.error('[Admin PanicConfig] GET failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאת שרת' }, { status: 500 })
  }
}

async function POSTHandler(request: NextRequest) {
  const guard = await requireTier(request, 'owner')
  if (guard.error) return guard.error

  try {
    const body = await request.json() as {
      adminTelegramChatId?: number
      throttleMinutes?: number
    }

    const update: { adminTelegramChatId?: number; throttleMinutes?: number } = {}

    if (body.adminTelegramChatId !== undefined) {
      const id = Number(body.adminTelegramChatId)
      if (!Number.isFinite(id) || !Number.isInteger(id)) {
        return NextResponse.json({ success: false, error: 'adminTelegramChatId לא תקין' }, { status: 400 })
      }
      update.adminTelegramChatId = id
    }

    if (body.throttleMinutes !== undefined) {
      const m = Number(body.throttleMinutes)
      if (!Number.isFinite(m) || m < 1 || m > 1440) {
        return NextResponse.json({ success: false, error: 'throttleMinutes חייב להיות בין 1 ל-1440' }, { status: 400 })
      }
      update.throttleMinutes = m
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ success: false, error: 'חסרים נתונים' }, { status: 400 })
    }

    await writePanicConfig(update)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin PanicConfig] POST failed:', error)
    return NextResponse.json({ success: false, error: 'שגיאת שרת' }, { status: 500 })
  }
}

export const GET = withServiceCall(GETHandler)
export const POST = withServiceCall(POSTHandler)
