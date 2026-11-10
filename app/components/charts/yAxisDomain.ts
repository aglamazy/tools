/** Round up to a "nice" number: 1, 2, 2.5, 5 or 10 times a power of ten. */
function niceCeil(v: number): number {
  if (v <= 0) return 0
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= v) return m * pow
  }
  return 10 * pow
}

/**
 * Y-axis range of ONE series: from 0 (or below, if the series goes negative)
 * up to a rounded-up max of this series, so each series is scaled to its own
 * range. Nulls (gaps) are ignored; no values or all zeros -> [0, 1].
 */
export function yAxisDomain(values: (number | null)[]): [number, number] {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length === 0) return [0, 1]
  const max = Math.max(...nums)
  const min = Math.min(...nums)
  const top = niceCeil(max)
  const bottom = min < 0 ? -niceCeil(-min) : 0
  if (top === bottom) return [0, 1]
  return [bottom, top]
}
