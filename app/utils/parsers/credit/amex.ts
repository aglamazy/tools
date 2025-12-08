import type { SheetRow } from '../types'
import type { ParsedCreditResult, Parser } from '../types'
import { parseCreditCardStatement } from './generic'

const AMEX_KEYWORDS = [/am(eri)?can/i, /amex/i, /אמריקן/, /אמקס/, /BUSINESS/]

const detectAmex = (rows: SheetRow[]): { match: boolean; confidence: number } => {
  const sampleRows = rows.slice(0, 6)
  let hits = 0

  sampleRows.forEach((row) => {
    row.forEach((cell) => {
      if (typeof cell === 'string') {
        if (AMEX_KEYWORDS.some((re) => re.test(cell))) {
          hits += 1
        }
      }
    })
  })

  if (hits === 0) return { match: false, confidence: 0 }
  const confidence = Math.min(1, 0.4 + hits * 0.1)
  return { match: true, confidence }
}

const amexParser: Parser = {
  canParse: (rows: SheetRow[]) => {
    const { match, confidence } = detectAmex(rows)
    return { match, confidence, issuer: 'amex', kind: 'credit' }
  },
  parse: (rows: SheetRow[]): ParsedCreditResult => {
    const { confidence } = detectAmex(rows)
    const statement = parseCreditCardStatement(rows)
    const processingMonth = statement.billingDate
      ? `${String(statement.billingDate.getMonth() + 1).padStart(2, '0')}/${statement.billingDate.getFullYear()}`
      : null

    return {
      kind: 'credit',
      issuer: 'amex',
      confidence: Math.max(confidence, 0.5),
      cardNumber: statement.cardNumber,
      processingMonth,
      statement,
    }
  },
}

export default amexParser
