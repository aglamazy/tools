import { describe, it, expect, vi } from 'vitest'

vi.mock('@/app/lib/firebaseAdmin', () => ({ getAdminFirestore: () => ({}) }))

import { otpSendErrorMessage } from './credGuards'
import { RexailOtpError } from '@/app/services/grocery/retalixClient'

describe('otpSendErrorMessage (saliko#33)', () => {
  it('names the store refusal, not the phone, when Rexail answers permissionDenied', () => {
    const err = new RexailOtpError({ code: 'permissionDenied', resolvedMessage: 'הגישה נדחתה!' })
    const msg = otpSendErrorMessage(err, 'מקור השפע')
    expect(msg).toContain('הגישה נדחתה!')
    expect(msg).toContain('לא בעיה במספר הטלפון')
    expect(msg).not.toContain('בדוק את מספר הטלפון')
  })

  it('quotes any other store answer verbatim', () => {
    const err = new RexailOtpError({ code: null, resolvedMessage: 'חלק מהנתונים הנדרשים לא סופקו או שאינם חוקיים.' })
    expect(otpSendErrorMessage(err, 'הירקניה')).toContain('"חלק מהנתונים הנדרשים לא סופקו או שאינם חוקיים."')
  })

  it('falls back to the raw error for non-store failures', () => {
    expect(otpSendErrorMessage(new Error('fetch failed'), 'הירקניה')).toContain('fetch failed')
  })
})
