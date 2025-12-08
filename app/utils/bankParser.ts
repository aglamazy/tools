export {
  parseBankTransactions,
  extractAccountNumber,
  extractBankPreview,
  extractBankPreviewAsync,
  type ParsedBankTransaction,
  type BankPreview,
} from './parsers/bank/genericFibi'

export { parseBankWithRegistry } from './parsers/registry'
