import type { Parser, ParsedResult, ParsedCreditResult, ParsedBankResult, SheetRow } from './types'
import { genericCreditParser } from './credit/generic'
import amexParser from './credit/amex'
import { genericFibiParser } from './bank/genericFibi'

const creditParsers: Parser[] = [amexParser, genericCreditParser]
const bankParsers: Parser[] = [genericFibiParser]

const pickBest = (parsers: Parser[], rows: SheetRow[]): { parser: Parser; result: ReturnType<Parser['canParse']> } => {
  let best: { parser: Parser; result: ReturnType<Parser['canParse']> } | null = null

  parsers.forEach((parser) => {
    const res = parser.canParse(rows)
    if (!res.match) return
    if (!best || res.confidence > best.result.confidence) {
      best = { parser, result: res }
    }
  })

  if (best) return best

  // If nothing matched, fall back to the first parser
  const fallback = parsers[0]
  return { parser: fallback, result: fallback.canParse(rows) }
}

export function parseCreditWithRegistry(rows: SheetRow[]): ParsedCreditResult {
  const { parser, result } = pickBest(creditParsers, rows)
  const parsed = parser.parse(rows) as ParsedCreditResult
  return { ...parsed, issuer: parsed.issuer ?? result.issuer, confidence: parsed.confidence ?? result.confidence }
}

export function parseBankWithRegistry(rows: SheetRow[], cardTypeIndicators?: string[]): ParsedBankResult {
  const { parser, result } = pickBest(bankParsers, rows)
  const parsed = parser.parse(rows, cardTypeIndicators) as ParsedBankResult
  return { ...parsed, issuer: parsed.issuer ?? result.issuer, confidence: parsed.confidence ?? result.confidence }
}

export function parseWithRegistry(rows: SheetRow[]): ParsedResult {
  // Try credit first, then bank; you can adjust ordering if needed
  const credit = pickBest(creditParsers, rows)
  if (credit.result.match && credit.result.confidence >= 0.5) {
    return credit.parser.parse(rows) as ParsedResult
  }

  const bank = pickBest(bankParsers, rows)
  return bank.parser.parse(rows) as ParsedResult
}
