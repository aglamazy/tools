import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TransactionSourceLink from './TransactionSourceLink'
import { findFileByParam } from './sourceFileLink'
import type { ImportedFile } from '@/app/db/financeDB'

describe('budget transaction source-file link (aglamazo#464)', () => {
  it('a row with fileId links to its file on the import page', () => {
    const html = renderToStaticMarkup(<TransactionSourceLink fileId="1789038376127-4256_09_2026.pdf" />)
    expect(html).toContain('href="/app/import?file=1789038376127-4256_09_2026.pdf"')
    expect(html).toContain('<bdi>4256_09_2026.pdf</bdi>')
    expect(html.replace(/href="[^"]*"/, '')).not.toContain('1789038376127')
    expect(html).toContain('📄')
  })

  it('encodes names with spaces and parentheses', () => {
    const html = renderToStaticMarkup(<TransactionSourceLink fileId="1789-פירוט עסקאות (1).xlsx" />)
    expect(html).toContain(`href="/app/import?file=${encodeURIComponent('1789-פירוט עסקאות (1).xlsx')}"`)
    expect(html).toContain('<bdi>פירוט עסקאות (1).xlsx</bdi>')
  })

  it('a row without fileId renders no link', () => {
    expect(renderToStaticMarkup(<TransactionSourceLink />)).toBe('')
    expect(renderToStaticMarkup(<TransactionSourceLink fileId="" />)).toBe('')
  })
})

describe('import page finds a file by its ?file= param (aglamazo#464)', () => {
  const file = (fileKey: string, processingMonth: string): ImportedFile => ({
    fileName: fileKey, fileKey, fileType: 'credit-card', processingMonth, transactionCount: 1, importedAt: '',
  })
  const files = [file('1-a.xlsx', '09/2026'), file('2-4256_09_2026.pdf', '09/2026'), file('2-4256_09_2026.pdf', '10/2026')]

  it('returns the first file whose fileKey equals the param', () => {
    expect(findFileByParam(files, '2-4256_09_2026.pdf')).toBe(files[1])
  })

  it('returns undefined for no param or an unknown file', () => {
    expect(findFileByParam(files, null)).toBeUndefined()
    expect(findFileByParam(files, '')).toBeUndefined()
    expect(findFileByParam(files, '9-gone.pdf')).toBeUndefined()
  })
})
