import { describe, it, expect } from 'vitest'
import { classifyDocumentLinkFailure } from './documentLinkFailure'

describe('classifyDocumentLinkFailure (aglamazo#489)', () => {
  it('the measured XPlace case: redirect to /signin, 200 text/html = needs a login', () => {
    const f = classifyDocumentLinkFailure([{
      url: 'https://www.xplace.com/invoice/pdf/256484',
      finalUrl: 'https://www.xplace.com/signin?frompage=%2Fil%2Finvoice%2Fpdf%2F256484',
      status: 200, contentType: 'text/html; charset=utf-8',
    }])
    expect(f.code).toBe('needs-login')
    expect(f.message).toContain('xplace.com')
    expect(f.message).toContain('התחברות')
    expect(f.message).not.toMatch(/skip/i)
  })

  it('an HTML viewer with no login redirect = not a PDF, a different instruction', () => {
    const f = classifyDocumentLinkFailure([
      { url: 'https://invoice.stripe.com/i/x/pdf?s=em', status: 200, contentType: 'text/html' },
      { url: 'https://invoice.stripe.com/i/x/pdf', status: 200, contentType: 'text/html' },
    ])
    expect(f.code).toBe('not-pdf')
    expect(f.message).not.toContain('התחברות')
  })

  it('every variant non-OK = http error with the statuses', () => {
    const f = classifyDocumentLinkFailure([{ url: 'https://example.com/a.pdf', status: 404, contentType: 'text/html' }])
    expect(f.code).toBe('http-error')
    expect(f.message).toContain('404')
  })
})
