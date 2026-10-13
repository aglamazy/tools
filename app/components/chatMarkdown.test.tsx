import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMarkdown } from './chatMarkdown'

describe('chat markdown (saliko#41)', () => {
  it('renders "###" headings as bold text, never the raw hashes', () => {
    const html = renderToStaticMarkup(<>{renderMarkdown('### הסל שלך\nבננה 15.9\n- גזר')}</>)
    expect(html).not.toContain('#')
    expect(html).toContain('<strong>הסל שלך</strong>')
    expect(html).toContain('<li>גזר</li>')
  })
})
