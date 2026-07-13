import { db } from '@/app/db/financeDB'
import type { GmailInvoiceCandidate, SupplierMatchProposal } from '@/app/types/supplierWizard'

// A single call with ~100 candidates + hundreds of suppliers in the prompt
// pushed Gemini into writing out reasoning text instead of the requested
// JSON and blew through the token budget before finishing (confirmed live:
// "Failed to parse LLM response" on a real 100-candidate sweep). Batching
// bounds both the input and the required output size per call, and confines
// a bad batch's failure to that batch instead of losing the whole sweep.
const BATCH_SIZE = 12

/**
 * Suppliers Wizard step 2: fuzzy-match Gmail-swept invoice candidates against
 * ALL current suppliers via the platform LLM (Gemini — no user API key
 * required). Best-effort, UI-facing: never throws, always resolves so the
 * review UI can render an error state instead of crashing. Batches are run
 * sequentially (not in parallel) to stay under Gmail/LLM rate limits.
 */
export async function matchCandidatesToSuppliers(
  candidates: GmailInvoiceCandidate[],
  onProgress?: (done: number, total: number) => void
): Promise<{ proposals: SupplierMatchProposal[]; error?: string }> {
  const allSuppliers = await db.suppliers.toArray()
  const suppliers = allSuppliers
    .filter((s) => s.id != null)
    .map((s) => ({
      id: s.id as number,
      name: s.name,
      bankCardAliases: s.bankCardAliases,
    }))

  const proposals: SupplierMatchProposal[] = []
  const errors: string[] = []
  const totalBatches = Math.ceil(candidates.length / BATCH_SIZE)
  onProgress?.(0, totalBatches)

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE)
    try {
      const res = await fetch('/api/match-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'match-supplier', candidates: batch, suppliers }),
      })
      const json = await res.json()

      if (!res.ok || json.error) {
        errors.push(json.error || `Request failed: ${res.status}`)
        continue
      }
      proposals.push(...(json.proposals ?? []))
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      onProgress?.(i / BATCH_SIZE + 1, totalBatches)
    }
  }

  // Partial success is still useful — only surface an error if EVERY batch
  // failed (nothing to review), otherwise return what did match and let the
  // review UI show what it has.
  if (proposals.length === 0 && errors.length > 0) {
    return { proposals: [], error: errors[0] }
  }
  return { proposals }
}
