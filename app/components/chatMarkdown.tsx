/**
 * The chat bubble's small markdown subset: **bold**, numbered and bullet
 * lists, "#" headings (as a bold line), paragraphs. Split out of AppChat.tsx.
 */
import type { ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let k = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(<strong key={k++}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function renderMarkdown(text: string): ReactNode {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let bk = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }

    // "### Title" (saliko#41: rendered raw before) → a bold line, no '#'.
    if (/^#{1,6}\s+/.test(line)) {
      blocks.push(<p key={bk++}><strong>{renderInline(line.replace(/^#{1,6}\s+/, ''))}</strong></p>)
      i++
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const items: ReactNode[] = []
      let lk = 0
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={lk++}>{renderInline(lines[i].replace(/^\d+\.\s+/, ''))}</li>)
        i++
      }
      blocks.push(<ol key={bk++}>{items}</ol>)
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const items: ReactNode[] = []
      let lk = 0
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(<li key={lk++}>{renderInline(lines[i].replace(/^[-*]\s+/, ''))}</li>)
        i++
      }
      blocks.push(<ul key={bk++}>{items}</ul>)
      continue
    }

    const paraLines: ReactNode[] = []
    let ln = 0
    while (i < lines.length && lines[i].trim() !== '' && !/^\d+\.\s/.test(lines[i]) && !/^[-*]\s/.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i])) {
      if (ln > 0) paraLines.push(<br key={`br${i}`} />)
      paraLines.push(...renderInline(lines[i]))
      ln++
      i++
    }
    blocks.push(<p key={bk++}>{paraLines}</p>)
  }

  return blocks.length > 0 ? <>{blocks}</> : <>{text}</>
}
