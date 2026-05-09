import type { Transaction } from '@/app/db/financeDB'
import type { AccountOwners } from '@/app/stores/appSettingsStore'

/**
 * Resolve which household member is attributable to a transaction.
 *
 * Precedence:
 *   1. Explicit `paidByUid` on the transaction (manually set).
 *   2. Account-owner mapping by `cardNumber` (`card:NNNN`) or `accountNumber`
 *      (`bank:NNNN`) — configured in Settings → משק בית.
 *   3. `fallbackUid` (typically the business owner's uid) — covers accounts
 *      marked "שניהם"/shared (no key in accountOwners) and any tx without
 *      account/card fields. The household is represented in a partnership
 *      by the owner principal, so shared-household txs attribute to them.
 *   4. Undefined (only when no fallback is provided).
 */
export function getTransactionAttributedUid(
  t: Pick<Transaction, 'paidByUid' | 'cardNumber' | 'accountNumber'>,
  accountOwners: AccountOwners,
  fallbackUid?: string,
): string | undefined {
  if (t.paidByUid) return t.paidByUid
  if (t.cardNumber) {
    const owner = accountOwners[`card:${t.cardNumber}`]
    if (owner) return owner
  }
  if (t.accountNumber) {
    const owner = accountOwners[`bank:${t.accountNumber}`]
    if (owner) return owner
  }
  return fallbackUid
}
