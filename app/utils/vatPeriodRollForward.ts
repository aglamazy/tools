export type RollForwardPeriod = {
  key: string
  start: Date
  end: Date
}

/** Which of `periods` already have a matching filed payment. */
export function computeClosedPeriodKeys(
  periods: { key: string; startISO: string; endISO: string }[],
  vatPayments: { periodStart: string; periodEnd: string }[],
): Set<string> {
  const set = new Set<string>()
  for (const p of periods) {
    if (vatPayments.some((v) => v.periodStart === p.startISO && v.periodEnd === p.endISO)) set.add(p.key)
  }
  return set
}

/**
 * Which OPEN period an untagged document belongs in (aglamazo#402).
 *
 * Agla's own scenario: "We close now july-august and I pay it. Tomorrow I
 * find Ikea invoice that I want to deduct. This one will wait to Sep-Oct
 * period." — an untagged document whose natural (date-matching) period has
 * already been paid/closed must roll forward into the next open period,
 * not vanish. Before this, an untagged doc was only ever shown when its
 * date fell inside the exact period being viewed — a late document whose
 * natural period had already closed matched no period at all.
 *
 * `periods` must be ordered oldest-first (generatePeriods's own contract).
 * Returns undefined when the date falls before/after every known period
 * (unchanged from prior behavior — such a doc was never shown either).
 */
export function resolveOpenPeriodKey(
  date: Date,
  periods: RollForwardPeriod[],
  closedPeriodKeys: ReadonlySet<string>,
): string | undefined {
  const naturalIndex = periods.findIndex((p) => date >= p.start && date <= p.end)
  if (naturalIndex === -1) return undefined
  for (let i = naturalIndex; i < periods.length; i++) {
    if (!closedPeriodKeys.has(periods[i].key)) return periods[i].key
  }
  // Every period from the doc's natural one onward is closed (e.g. paid
  // ahead of schedule) — no open home to roll into yet; leave it where its
  // own date naturally sits rather than inventing a period.
  return periods[naturalIndex].key
}
