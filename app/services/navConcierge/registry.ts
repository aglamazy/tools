/**
 * Deep-link registry — maps settings/flow concepts a user might ask for
 * (in Hebrew) to their stable URL + query-param shape.
 *
 * Part 1/3 of the nav-concierge epic (#261). Task 2 (the navigate tool)
 * imports NAV_REGISTRY directly to resolve a user request to a path.
 *
 * Keep this file data-only — no React, no side effects — so it can be
 * imported both by the app and by the standalone validator
 * (scripts/validate-nav-registry.ts).
 *
 * KNOWN BUG (verified live, 2026-07-15): direct navigation to a tier-gated
 * settings tab (?tab=household, ?tab=businesses, ?tab=bots — all HOME/PRO
 * tier) silently falls back to the default "categories" tab. Settings.tsx
 * computes `tabs` from userTierStore.get() on first render, before the
 * async tier load resolves; SettingsTabs.tsx then freezes `activeTab` from
 * that first-render `tabs` list via a one-time useState, so a later tier
 * update re-renders the tab BUTTONS correctly but never re-syncs the
 * already-picked activeTab. Clicking the tab manually works fine — only
 * cold/direct URL navigation is affected. FREE-tier settings tabs (sync,
 * telegram, apikeys, vault, advanced, categories) and all business-scoped
 * tabs (?tab=income/expenses/... on /app/business/{id}) are unaffected —
 * verified both classes directly in-browser. Task 2 (navigate tool) should
 * account for this; fixing it is a follow-up, not in this task's scope.
 */

export interface NavRegistryEntry {
  /** Stable, unique slug — never reuse an id after removing an entry. */
  id: string
  /** Hebrew label — what a user would call this screen/setting. */
  label: string
  /** Extra Hebrew/English phrasings a user might use instead of `label`. */
  synonyms?: string[]
  /**
   * Stable URL, relative to the site root, including query params.
   * Dynamic route segments use `{paramName}` (e.g. `{businessId}`) —
   * the navigate tool substitutes the real value before pushing the URL.
   */
  path: string
  /** One-line Hebrew/English note on what lives at this path and any caveats. */
  description?: string
  /** True if `path` contains a `{businessId}` segment that must be resolved first. */
  requiresBusinessId?: boolean
  /**
   * False when `path` only lands on a *parent* screen and the actual
   * concept requires a manual click from there (a modal, a specific row)
   * because no query param exists yet to target it directly.
   * Defaults to true when omitted.
   */
  addressable?: boolean
  /** Required when addressable is false — what's missing to make it precise. */
  gap?: string
  /**
   * For entries whose `path` includes a `?tab=<id>` param: the component
   * file (repo-relative) that declares the valid tab ids, so the
   * validator can catch a renamed/removed tab id going stale.
   */
  tabOwnerFile?: string
}

export const NAV_REGISTRY: NavRegistryEntry[] = [
  // ---------------------------------------------------------------------
  // Named examples from #261's original idea capture
  // ---------------------------------------------------------------------
  {
    id: 'vat-status-member',
    label: 'סטטוס מע"מ (עוסק פטור / עוסק מורשה) לפי חבר משפחה',
    synonyms: ['מע"מ', 'עוסק פטור', 'עוסק מורשה', 'VAT', 'סטטוס מס', 'TaxProfileSection'],
    path: '/app/settings?tab=household',
    description:
      'פרופיל המע"מ (TaxProfileSection) נפתח כמודל מתוך טאב משק הבית, לפי לחיצה על חבר ' +
      'משפחה ספציפי — אין עדיין קישור ישיר לחבר נתון. בנוסף, טאב household עצמו לוקה בבאג ' +
      'ניווט ישיר (ראו הערה בראש הקובץ) — קישור ישיר אליו נוחת כרגע על categories.',
    addressable: false,
    gap:
      'שני חסמים לניווט מדויק: (1) בחירת החבר (memberSettings) היא React state מקומי ' +
      'ב-HouseholdTab.tsx, לא פרמטר ב-URL — צריך להוסיף ?member=<uid>. (2) גם ה-tab עצמו ' +
      '(household, tier-gated) לא נטען נכון בניווט ישיר בגלל מרוץ טעינת ה-tier — ראו הערת ' +
      'הבאג בראש הקובץ.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'ypay-credentials',
    label: 'פרטי התחברות YPAY (סליקה / הפקת חשבוניות)',
    synonyms: ['ypay', 'סליקה', 'חשבונית', 'הגדרות תשלומים', 'ypayClientId'],
    path: '/app/business/{businessId}?tab=settings',
    description:
      'טאב "הגדרות" של עמוד עסק (BizSettingsTab) — כולל ypayClientId/ypayClientSecret ' +
      'וזוג הפרטים המקביל למצב sandbox (ypayUseSandbox).',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'category-offset-flag',
    label: 'קיזוז שותפים בלבד (הוצאה אישית שלא נכללת בסיכומי העסק)',
    synonyms: ['קיזוז', 'excludeFromBusinessTotals', 'הוצאה אישית', 'התחשבנות שותפים'],
    path: '/app/settings?tab=categories',
    description:
      'טאב "תקציב ונושאים". הדגל excludeFromBusinessTotals מוגדר בטופס עריכה של קטגוריית ' +
      'הוצאה ספציפית — אין עדיין קישור לקטגוריה נתונה, רק לטאב.',
    addressable: false,
    gap:
      'CategoriesTab.tsx אינו קורא שום searchParam; פתיחת טופס עריכה לקטגוריה ספציפית ' +
      'דורשת לחיצה ידנית. להוסיף בעתיד ?category=<id> שפותח את editingCategory ישירות.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },

  // ---------------------------------------------------------------------
  // Top-level settings screen — /app/settings?tab=<id>
  // ---------------------------------------------------------------------
  {
    id: 'settings-categories',
    label: 'תקציב ונושאים',
    synonyms: ['קטגוריות', 'נושאים', 'תקציב'],
    path: '/app/settings?tab=categories',
    description: 'גם הטאב שנפתח כברירת מחדל ב-/app/settings ללא פרמטר.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-businesses',
    label: 'ניהול עסקים',
    synonyms: ['עסקים', 'רשימת עסקים'],
    path: '/app/settings?tab=businesses',
    description: 'רשימת העסקים והוספת עסק חדש (BusinessesTab). לא לבלבל עם /app/business/{id} עבור עסק ספציפי.',
    addressable: false,
    gap:
      'tier-gated (PRO) — ניווט ישיר ל-URL הזה נוחת בפועל על טאב categories (ברירת המחדל) ' +
      'עקב מרוץ טעינת ה-tier; ראו הערת הבאג בראש הקובץ. לחיצה ידנית על הטאב עובדת תקין.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-household',
    label: 'משק בית',
    synonyms: ['בני משפחה', 'household', 'שיתוף משק בית'],
    path: '/app/settings?tab=household',
    description: 'ניהול חברי משק הבית, הזמנות, ושיוך חשבונות בנק משותפים; גם שער הכניסה לפרופיל המע"מ לכל חבר.',
    addressable: false,
    gap:
      'tier-gated (HOME) — ניווט ישיר ל-URL הזה נוחת בפועל על טאב categories (ברירת המחדל) ' +
      'עקב מרוץ טעינת ה-tier; ראו הערת הבאג בראש הקובץ. לחיצה ידנית על הטאב עובדת תקין ' +
      '(מאומת בדפדפן).',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-sync',
    label: 'סנכרון ענן וגיבוי',
    synonyms: ['sync', 'סנכרון', 'גיבוי', 'CloudSync'],
    path: '/app/settings?tab=sync',
    description: 'CloudSyncSection + DedupSection + LocalBackup.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-telegram',
    label: 'חיבור חשבון לבוט טלגרם',
    synonyms: ['טלגרם', 'telegram', 'קישור טלגרם'],
    path: '/app/settings?tab=telegram',
    description: 'קישור חשבון המשתמש לבוט AglamazoBot. שונה מ"בוטים" (bots) שהוא ניהול בוטים אישיים.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-bots',
    label: 'בוטים אישיים',
    synonyms: ['bots', 'הבוטים שלי'],
    path: '/app/settings?tab=bots',
    description: 'MyBotsSection — יצירה וניהול בוטים אישיים, כולל webhook.',
    addressable: false,
    gap:
      'tier-gated (HOME) — ניווט ישיר ל-URL הזה נוחת בפועל על טאב categories (ברירת המחדל) ' +
      'עקב מרוץ טעינת ה-tier; ראו הערת הבאג בראש הקובץ. לחיצה ידנית על הטאב עובדת תקין.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-api-keys',
    label: 'מפתחות API',
    synonyms: ['api key', 'מפתח קלוד', 'Claude API', 'Anthropic key'],
    path: '/app/settings?tab=apikeys',
    description: 'כרגע כולל רק מפתח Claude/Anthropic אישי.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-external-services',
    label: 'חיבורים חיצוניים (סיסמאות לגרידה)',
    synonyms: ['vault', 'ביטוח לאומי', 'אוצר החייל', 'שופרסל', 'credentials'],
    path: '/app/settings?tab=vault',
    description:
      'ExternalServicesTab — פרטי התחברות לגרידה (BTL/אוצר החייל/שופרסל בלבד). ' +
      'לתשומת לב: Google Drive/Gmail/Calendar אינם כאן — אלה מחוברים אד-הוק מתוך כל זרימה שצריכה אותם, אין להם מסך הגדרות ייעודי.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },
  {
    id: 'settings-advanced',
    label: 'הגדרות מתקדמות',
    synonyms: ['advanced', 'מתקדם', 'גיבוי מקומי', 'סטטיסטיקת DB'],
    path: '/app/settings?tab=advanced',
    description: 'AdvancedTab — תיקיית גיבוי מקומי, עמוד נחיתה ברירת מחדל, סטטיסטיקות DB.',
    tabOwnerFile: 'app/components/Settings.tsx',
  },

  // ---------------------------------------------------------------------
  // Per-business tabs — /app/business/{businessId}?tab=<id>
  // (tab set varies by business.type — see BusinessPage.tsx TABS/APARTMENT_TABS/
  // TEACHER_TABS/EMPLOYEE_TABS/ARTIST_TABS; entries below cover the default set)
  // ---------------------------------------------------------------------
  {
    id: 'business-income',
    label: 'הכנסות עסק',
    synonyms: ['הכנסות', 'income'],
    path: '/app/business/{businessId}?tab=income',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-expenses',
    label: 'הוצאות עסק',
    synonyms: ['הוצאות', 'expenses'],
    path: '/app/business/{businessId}?tab=expenses',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-settlement',
    label: 'התחשבנות שותפים',
    synonyms: ['התחשבנות', 'settlement', 'שותפים'],
    path: '/app/business/{businessId}?tab=settlement',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-timing',
    label: 'תיעוד זמן / שעות עבודה',
    synonyms: ['שעות', 'timing', 'טיימר', 'תיעוד שעות'],
    path: '/app/business/{businessId}?tab=timing',
    description:
      'תומך גם ב-view (daily/weekly/monthly/recent), date (YYYY-MM-DD, ל-daily), ' +
      'wo (week offset, ל-weekly) ו-mo (month offset, ל-monthly) — ראו TimingTab.tsx. ' +
      'ערך ברירת מחדל מוסר מה-URL (למשל view=weekly לא מופיע).',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-invoices',
    label: 'חשבוניות עסק',
    synonyms: ['חשבוניות', 'invoices'],
    path: '/app/business/{businessId}?tab=invoices',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-open-docs',
    label: 'מסמכים פתוחים',
    synonyms: ['מסמכים', 'open docs'],
    path: '/app/business/{businessId}?tab=open-docs',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-tasks',
    label: 'משימות עסק',
    synonyms: ['משימות', 'tasks'],
    path: '/app/business/{businessId}?tab=tasks',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-projects',
    label: 'פרויקטים',
    synonyms: ['פרויקטים', 'projects'],
    path: '/app/business/{businessId}?tab=projects',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-settings',
    label: 'הגדרות עסק',
    synonyms: ['הגדרות', 'settings', 'עריכת פרטי עסק'],
    path: '/app/business/{businessId}?tab=settings',
    description: 'BizSettingsTab — שם/סוג העסק, YPAY (ראו ypay-credentials), ומוסתר לגמרי לעסקים ששותפו איתך (sharedWithMe).',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },
  {
    id: 'business-accounting-teacher',
    label: 'חשבונאות חודשית (עסק מסוג מורה)',
    synonyms: ['חשבונאות', 'accounting'],
    path: '/app/business/{businessId}?tab=accounting',
    description:
      'זמין רק לעסקים מסוג Teacher (TEACHER_TABS). קיים גם נתיב כפול, לא-דרך-טאב, ' +
      'שמציג את אותו AccountingTab: /app/business/{businessId}/accounting — עדיף להשתמש בטאב.',
    requiresBusinessId: true,
    tabOwnerFile: 'app/components/business/BusinessPage.tsx',
  },

  // ---------------------------------------------------------------------
  // Standalone routes (not part of the business/settings tab systems)
  // ---------------------------------------------------------------------
  {
    id: 'taxes-annual-summary',
    label: 'מסים — סיכום שנתי',
    synonyms: ['מסים', 'taxes', 'דוח שנתי', 'ביטוח לאומי', 'מקדמות מס הכנסה'],
    path: '/app/taxes',
    description:
      'עמוד עצמאי (לא טאב עסק, למרות ש-TaxesTab.tsx יושב תחת components/business). ' +
      'תומך ב-?user=<uid> (ברירת מחדל "all") ו-?debug=1.',
  },
  {
    id: 'business-categories-mapping',
    label: 'שיוך קטגוריות לעסקים',
    synonyms: ['שיוך קטגוריות', 'business categories'],
    path: '/app/business-categories',
    description: 'טבלת ניהול BusinessCategory — שיוך שם קטגוריה גולמי מהבנק לקטגוריה/עסק. אין פרמטרים.',
  },
]

/** Follow-up: top-level app screens intentionally left out of v1 (not settings/flow concepts) —
 *  dashboard, import, cash-flow, budget, credit-cards, future-payments, capital, stores, chat,
 *  todo, market-research, gmail, profile, dev-db, admin, guide, about. Add them here if/when
 *  task 2 (navigate tool) needs to resolve requests for those screens too. */

export function findNavEntry(id: string): NavRegistryEntry | undefined {
  return NAV_REGISTRY.find((entry) => entry.id === id)
}
