import type { SheetRow, SheetCell } from '@/app/types/transactions'
import type { CreditCardStatement } from './credit/generic'
import type { ParsedBankTransaction } from './bank/genericFibi'

export type ParserDetectResult = {
  match: boolean
  confidence: number
  issuer: string
  kind: 'bank' | 'credit'
}

export type ParsedBankResult = {
  kind: 'bank'
  issuer: string
  confidence: number
  accountNumber: string | null
  processingMonth: string | null
  transactions: ParsedBankTransaction[]
}

export type ParsedCreditResult = {
  kind: 'credit'
  issuer: string
  confidence: number
  cardNumber: string | null
  processingMonth: string | null
  statement: CreditCardStatement
}

export type ParsedResult = ParsedBankResult | ParsedCreditResult

export interface Parser {
  canParse: (rows: SheetRow[]) => ParserDetectResult
  parse: (rows: SheetRow[]) => ParsedResult
}

export type { SheetRow, SheetCell }
