import { describe, it, expect } from 'vitest'
import { hebrewStem, nameMatchesQuery, rankCatalogMatches, isFreshProduce } from './catalogMatch'

// Rows taken from the Makor HaShefa public catalog, 2026-10-12 (saliko#34).
const P = (fullName: string, price: number, category: string, parentCategory = '') =>
  ({ name: fullName, fullName, price, category, parentCategory })

const CATALOG = [
  P('רוטב עגבניות לפסטה 400 גרם MUTTI', 12.9, 'ממרחים ורטבים', 'מכולת'),
  P('עגבניות מיובשות 100 גרם חוות תקוע', 15.9, 'ירקות גינה', 'ירקניה'),
  P('עגבניות שלמות מקולפות במיץ 400 גרם MUTTI', 16.9, 'שימורים', 'מכולת'),
  P('עגבניה אשכולות', 16.9, 'ירקות גינה', 'ירקניה'),
  P('עגבניה תמר גדולה', 14.9, 'ירקות גינה', 'ירקניה'),
  P('מחית עגבניות קלה 700 גרם MUTTI', 17.9, 'ממרחים ורטבים', 'מכולת'),
  P('בננה', 15.9, 'פירות', 'ירקניה'),
  P("בננה צ'יפס", 7.5, 'פירות יבשים ופיצוחים'),
  P('מלפפון', 11.9, 'ירקות גינה', 'ירקניה'),
  P('תפוח אדמה לבן', 7.9, 'ירקות שורש', 'ירקניה'),
  P('תפוח עץ חרמון', 16.9, 'פירות', 'ירקניה'),
]

const search = (q: string) => rankCatalogMatches(CATALOG.filter(p => nameMatchesQuery(p.fullName, q)), q).map(p => p.fullName)

describe('catalog search (saliko#34)', () => {
  it('stems plural and singular to the same root', () => {
    expect(hebrewStem('עגבניות')).toBe(hebrewStem('עגבניה'))
    expect(hebrewStem('מלפפונים')).toBe(hebrewStem('מלפפון'))
    expect(hebrewStem('בננות')).toBe(hebrewStem('בננה'))
  })

  it('"עגבניות" finds fresh tomatoes and ranks them before sauces and cans', () => {
    const r = search('עגבניות')
    expect(r.slice(0, 2)).toEqual(['עגבניה תמר גדולה', 'עגבניה אשכולות'])
    expect(r).toContain('רוטב עגבניות לפסטה 400 גרם MUTTI')
  })

  it('a processed request still gets the processed item', () => {
    expect(search('רוטב עגבניות')).toEqual(['רוטב עגבניות לפסטה 400 גרם MUTTI'])
  })

  it('fresh banana beats cheaper banana chips', () => {
    expect(search('בננות')[0]).toBe('בננה')
  })

  it('"תפוחים" means apples: potatoes do not lead', () => {
    expect(search('תפוחים')[0]).toBe('תפוח עץ חרמון')
    expect(search('תפוחי אדמה')[0]).toBe('תפוח אדמה לבן')
  })

  it('plural query finds the singular item', () => {
    expect(search('מלפפונים')).toEqual(['מלפפון'])
  })

  it('dried goods in a fresh category are not fresh', () => {
    expect(isFreshProduce('ירקות גינה', 'ירקניה', 'עגבניות מיובשות 100 גרם')).toBe(false)
    expect(isFreshProduce('פירות יבשים ופיצוחים', '', 'חמוציות ברכז תפוחים')).toBe(false)
  })
})
