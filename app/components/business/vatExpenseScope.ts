/**
 * aglamazo#487: the expense categories a person's VAT section may list —
 * only those of THAT person's businesses (the `businesses` prop of the tab).
 * expCategoryMap holds every business of every household member; reading all
 * of its values put another member's business expenses (and their input VAT)
 * on this person's report. Household-deductible categories are folded into
 * each business's entry, so they stay, and the per-member share check in the
 * caller still decides whether this person has a part of them.
 * View-time only: nothing is written.
 */
export function vatDeductibleCategoryNames(
  expCategoryMap: Map<string, string[]>,
  businessSyncIds: Iterable<string | undefined>,
): Set<string> {
  const names = new Set<string>()
  for (const id of businessSyncIds) {
    if (!id) continue
    for (const n of expCategoryMap.get(id) || []) names.add(n)
  }
  return names
}
