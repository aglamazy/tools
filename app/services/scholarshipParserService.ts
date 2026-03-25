import * as mammoth from 'mammoth'

export interface LeadEntry {
  name: string
  category: string
  deadline: string | null
  links: { text: string; url: string }[]
  address: string | null
  tags: string[]
  status: 'sent' | null
  notes: string | null
  phone?: string
}

export interface ParsedLeads {
  legend: Record<string, string>
  leads: LeadEntry[]
}

/**
 * Parse a docx file into structured lead entries.
 * Uses mammoth for docx→HTML, then parses HTML structure in code (no LLM needed).
 */
export async function parseDocxToLeads(
  fileBuffer: ArrayBuffer,
  onProgress?: (step: string) => void,
): Promise<ParsedLeads> {
  onProgress?.('ממיר מסמך...')
  const result = await mammoth.convertToHtml({ arrayBuffer: fileBuffer })
  const html = result.value

  if (!html || html.length < 100) {
    throw new Error('Document appears empty or could not be parsed')
  }

  onProgress?.('מנתח מבנה...')
  const leads = parseHtmlToLeads(html)
  onProgress?.(`נמצאו ${leads.length} פריטים`)

  return {
    legend: { PO: 'Project Oriented', JF: 'Jewish Focused', IO: 'Instrument Oriented' },
    leads,
  }
}

// --- HTML parser ---

function parseHtmlToLeads(html: string): LeadEntry[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const leads: LeadEntry[] = []

  let currentCategory = 'uncategorized'
  let currentEntry: Partial<LeadEntry> | null = null
  const categoryMap: Record<string, string> = {
    'with deadlines': 'with_deadline',
    'without deadlines': 'without_deadline',
    'via post': 'via_post',
  }

  const flushEntry = () => {
    if (currentEntry?.name) {
      leads.push({
        name: currentEntry.name,
        category: currentEntry.category || currentCategory,
        deadline: currentEntry.deadline || null,
        links: currentEntry.links || [],
        address: currentEntry.address || null,
        tags: currentEntry.tags || [],
        status: currentEntry.status || null,
        notes: currentEntry.notes || null,
        phone: currentEntry.phone,
      })
    }
    currentEntry = null
  }

  const elements = doc.body.children
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    const tag = el.tagName.toLowerCase()
    const text = (el.textContent || '').trim()

    // H1 = section category
    if (tag === 'h1') {
      flushEntry()
      const lower = text.toLowerCase()
      for (const [key, val] of Object.entries(categoryMap)) {
        if (lower.includes(key)) { currentCategory = val; break }
      }
      continue
    }

    // H2 = new entry
    if (tag === 'h2') {
      flushEntry()
      const { name, status, tags } = parseHeading(el)
      if (!name) continue

      currentEntry = {
        name, status, tags,
        category: currentCategory,
        links: extractLinks(el),
        deadline: null,
        address: null,
        notes: null,
      }
      continue
    }

    // Content under current entry
    if (!currentEntry) continue

    // Extract links from any element
    const links = extractLinks(el)
    if (links.length > 0) {
      currentEntry.links = [...(currentEntry.links || []), ...links]
    }

    // Deadline
    const deadlineMatch = text.match(/Deadline:\s*(.+)/i)
    if (deadlineMatch) {
      currentEntry.deadline = deadlineMatch[1].trim()
      continue
    }

    // Phone
    const phoneMatch = text.match(/Tel\s+(\+[\d\s]+)/)
    if (phoneMatch) {
      currentEntry.phone = phoneMatch[1].trim()
      continue
    }

    // Tags in parentheses
    const tagMatch = text.match(/^\((PO|JF|IO|OP)\)$/)
    if (tagMatch) {
      const t = tagMatch[1] === 'OP' ? 'PO' : tagMatch[1]
      currentEntry.tags = [...(currentEntry.tags || []), t]
      continue
    }

    // Notes — parenthetical text
    if (text.startsWith('(') && text.endsWith(')') && text.length > 4) {
      const inner = text.slice(1, -1)
      if (['PO', 'JF', 'IO', 'OP'].includes(inner)) {
        const t = inner === 'OP' ? 'PO' : inner
        currentEntry.tags = [...(currentEntry.tags || []), t]
      } else {
        currentEntry.notes = currentEntry.notes
          ? `${currentEntry.notes}; ${inner}` : inner
      }
      continue
    }

    // Special notes
    if (text.startsWith('In liquidation')) {
      currentEntry.notes = currentEntry.notes
        ? `${currentEntry.notes}; ${text}` : text
      continue
    }

    // Address-like lines (no links, short text)
    if (links.length === 0 && text.length > 3 && text.length < 80 && isAddressLine(text)) {
      currentEntry.address = currentEntry.address
        ? `${currentEntry.address}, ${text}` : text
    }
  }
  flushEntry()

  // Deduplicate links per entry
  for (const lead of leads) {
    const seen = new Set<string>()
    lead.links = lead.links.filter(l => {
      if (seen.has(l.url)) return false
      seen.add(l.url)
      return true
    })
  }

  return leads
}

function parseHeading(el: Element): { name: string; status: 'sent' | null; tags: string[] } {
  let text = (el.textContent || '').trim()
  const status: 'sent' | null = text.includes('SENT') ? 'sent' : null
  text = text.replace(/SENT/g, '').trim()

  const tags: string[] = []
  const tagPatterns = [/\s+PO$/, /\s+JF$/, /\s+IO$/]
  for (const pat of tagPatterns) {
    if (pat.test(text)) {
      tags.push(text.match(pat)![0].trim())
      text = text.replace(pat, '').trim()
    }
  }

  // Clean trailing +
  text = text.replace(/\s*\+\s*$/, '').trim()

  return { name: text, status, tags }
}

function extractLinks(el: Element): { text: string; url: string }[] {
  const anchors = el.querySelectorAll('a[href]')
  const links: { text: string; url: string }[] = []
  anchors.forEach(a => {
    const url = a.getAttribute('href')
    const text = (a.textContent || '').trim()
    if (url && url.startsWith('http')) {
      links.push({ text: text || url, url })
    }
  })
  return links
}

function isAddressLine(text: string): boolean {
  return (
    /^c\/o\s/i.test(text) ||
    /CH-\d{4}/.test(text) ||
    /^\d{4}\s/.test(text) ||
    /(?:strasse|str\.|weg\b|platz|gasse|rain\b)/i.test(text) ||
    // Short city-like names
    (text.length < 30 && /^[A-ZÄÖÜ]/.test(text) &&
      !/(?:Stiftung|Foundation|Fondation|Deadline|Tel\s|Seems|Does|More|Worked|Shiraz|specific|looks|FAQ|CHF)/i.test(text))
  )
}
