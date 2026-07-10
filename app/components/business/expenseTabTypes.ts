import type { Transaction, ExpenseDocument } from '@/app/db/financeDB'

export type MatchStatus = 'idle' | 'searching' | 'matched' | 'no-match' | 'error'

export type ExpenseTableRow =
  | {
      kind: 'transaction'
      id: number
      date: string
      partyUid?: string
      partyLabel: string
      amount: number
      vatAmount: number
      transaction: Transaction
    }
  | {
      kind: 'partnerDoc'
      id: number
      date: string
      partyUid?: string
      partyLabel: string
      amount: number
      vatAmount: number
      doc: ExpenseDocument
    }
