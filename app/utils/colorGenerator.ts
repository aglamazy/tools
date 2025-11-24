/**
 * Generate visually distinct colors using the golden ratio
 * @param count Number of colors to generate
 * @returns Array of hex color strings
 */
export const generateDistinctColors = (count: number): string[] => {
  const colors: string[] = []
  const goldenRatioConjugate = 0.618033988749895
  let hue = Math.random()

  for (let i = 0; i < count; i++) {
    hue += goldenRatioConjugate
    hue %= 1

    const saturation = 65 + (i % 3) * 10 // 65%, 75%, 85%
    const lightness = 45 + (i % 2) * 10 // 45%, 55%

    const h = hue * 360
    const s = saturation
    const l = lightness

    // HSL to RGB conversion
    const c = ((1 - Math.abs((2 * l) / 100 - 1)) * s) / 100
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l / 100 - c / 2

    let r = 0,
      g = 0,
      b = 0
    if (h >= 0 && h < 60) {
      r = c
      g = x
      b = 0
    } else if (h >= 60 && h < 120) {
      r = x
      g = c
      b = 0
    } else if (h >= 120 && h < 180) {
      r = 0
      g = c
      b = x
    } else if (h >= 180 && h < 240) {
      r = 0
      g = x
      b = c
    } else if (h >= 240 && h < 300) {
      r = x
      g = 0
      b = c
    } else {
      r = c
      g = 0
      b = x
    }

    const toHex = (n: number) => {
      const hex = Math.round((n + m) * 255).toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }

    colors.push(`#${toHex(r)}${toHex(g)}${toHex(b)}`)
  }

  return colors
}
