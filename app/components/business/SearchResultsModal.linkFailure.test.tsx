import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SearchResultsModal from './SearchResultsModal'
import { classifyDocumentLinkFailure, type LinkAttempt } from '@/app/services/documentLinkFailure'
import type { CheckedCandidate } from '@/app/services/receiptMatchService'

// aglamazo#489 clause 2: the Gmail check modal shows the route's cause and
// action for a document link that gives no PDF, instead of "skip".
// The route answers { error: failure.message }; receiptMatchService logs it as
// "  ↳ <error>" and the candidate's reason is that line without the arrow.
function rowFor(attempts: LinkAttempt[]): CheckedCandidate {
  const routeAnswer = { error: classifyDocumentLinkFailure(attempts).message }
  return {
    messageId: 'm1',
    date: '11 Nov 2026',
    subject: 'חשבונית מ-XPlace',
    from: 'XPlace Team',
    outcome: 'rejected',
    reason: `  ↳ ${routeAnswer.error}`.replace('  ↳', '').trim(),
  }
}

const render = (c: CheckedCandidate) =>
  renderToStaticMarkup(<SearchResultsModal candidates={[c]} onClose={() => {}} onPick={() => {}} />)

describe('Gmail check modal: document link failure (aglamazo#489)', () => {
  it('the measured XPlace link (redirect to /signin) shows needs-login and the upload action', () => {
    const html = render(rowFor([{
      url: 'https://www.xplace.com/invoice/pdf/256484',
      finalUrl: 'https://www.xplace.com/signin?frompage=%2Fil%2Finvoice%2Fpdf%2F256484',
      status: 200, contentType: 'text/html; charset=utf-8',
    }]))
    expect(html).toContain('הקישור למסמך דורש התחברות לאתר xplace.com')
    expect(html).toContain('העלה קובץ')
    expect(html).not.toMatch(/skip|no PDF after/i)
  })

  it('a link that answers 200 text/html with no login redirect shows a different message: not a document', () => {
    const html = render(rowFor([{ url: 'https://invoice.stripe.com/i/x/pdf', status: 200, contentType: 'text/html' }]))
    expect(html).toContain('ולא לקובץ PDF')
    expect(html).not.toContain('דורש התחברות')
    expect(html).not.toMatch(/skip|no PDF after/i)
  })
})
