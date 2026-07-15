// Deep-link registry — the "where do I set X" map. Built for #261
// (app-nav-concierge): a chat agent should answer these instantly from this
// table instead of grepping the codebase live (the trigger for the whole
// idea: Yaakov asking "which page is VAT status defined on").
//
// Each entry maps a human concept to a real, currently-navigable URL in this
// app. Paths use the ?tab= convention already established by SettingsTabs.tsx
// (app/components/settings/SettingsTabs.tsx) and BusinessPage.tsx
// (app/components/business/BusinessPage.tsx) — both read the tab from
// searchParams on mount and update it via history.replaceState, so these
// URLs are genuinely bookmarkable/shareable, not just in-session state.
//
// NOT exhaustive yet — first pass covers the concepts named in the epic's own
// idea capture plus the top-level tab structure. Extend as new "where is X"
// questions come up rather than trying to front-load every possible setting.

export type NavRegistryEntry = {
  id: string
  /** Hebrew label — what a user would actually call this in conversation. */
  label: string
  /** Alternate phrasings/synonyms to match against, Hebrew and English. */
  synonyms?: string[]
  /** Relative path, ?tab= included where applicable. */
  path: string
  /** One-line description of what lives here, for the agent's reply text. */
  description: string
  /**
   * True if `path` needs a businessId to resolve to something meaningful
   * (e.g. /app/business/[id]?tab=settings) — the caller must substitute a
   * real business id, or ask the user which business if there's more than
   * one. See find_setting (child task 2) for the resolution logic.
   */
  requiresBusinessId?: boolean
  /**
   * Known gap: this path lands on the right TAB but not the specific
   * sub-view/field within it (no query param exists yet for that level of
   * precision). Surfaced so find_setting can say "you'll need to scroll/
   * select X once you're there" instead of implying an exact deep link.
   */
  landsOnTabOnly?: boolean
}

export const NAV_REGISTRY: NavRegistryEntry[] = [
  // --- Household-level settings (/app/settings) ---
  {
    id: 'vat-status',
    label: 'סטטוס מע"מ',
    synonyms: ['VAT status', 'עוסק פטור', 'עוסק מורשה', 'vatType', 'TaxProfileSection'],
    path: '/app/settings?tab=household',
    description: 'סטטוס עוסק (פטור/מורשה) מוגדר לכל בן משפחה בנפרד בלשונית משק בית',
    landsOnTabOnly: true, // HouseholdTab renders TaxProfileSection per-member with no URL-level member selector yet
  },
  {
    id: 'subjects-settings',
    label: 'נושאי הכנסה/הוצאה',
    // "קיזוז" alone is genuinely ambiguous with business-settlement's own
    // "קיזוז שותפים" synonym below — a bare "איפה הקיזוז" could mean either
    // this category-level flag or the settlement screen. Listed here
    // deliberately so find_setting comes back ambiguous (asks which) instead
    // of silently picking one (surfaced by the #283 test plan, 2026-07-15).
    synonyms: ['קטגוריות', 'categories', 'subjects', 'תקציב ונושאים', 'קיזוז', 'קיזוז שותפים בלבד', 'excludeFromBusinessTotals'],
    path: '/app/settings?tab=categories',
    description: 'ניהול נושאי הכנסה/הוצאה, כולל דגל "קיזוז שותפים בלבד" (excludeFromBusinessTotals) על כל נושא',
  },
  {
    id: 'businesses-list',
    label: 'רשימת עסקים',
    synonyms: ['businesses', 'עסקים'],
    path: '/app/settings?tab=businesses',
    description: 'הוספה/עריכה/מחיקה של עסקים',
  },
  {
    id: 'household-members',
    label: 'בני משק הבית',
    synonyms: ['household members', 'משק בית'],
    path: '/app/settings?tab=household',
    description: 'ניהול בני משק הבית ושיוכם',
  },
  {
    id: 'cloud-sync',
    label: 'סנכרון ענן',
    synonyms: ['sync', 'CloudSync', 'גיבוי'],
    path: '/app/settings?tab=sync',
    description: 'הגדרות סנכרון בין מכשירים וגיבוי מוצפן',
  },
  {
    id: 'telegram-bot',
    label: 'הגדרות טלגרם',
    synonyms: ['telegram', 'בוט טלגרם', 'AglamazoBot'],
    path: '/app/settings?tab=telegram',
    description: 'חיבור וניהול בוט הטלגרם',
  },
  {
    id: 'api-keys',
    label: 'מפתחות API',
    synonyms: ['API keys', 'Claude key', 'Gemini key', 'claudeApiKey'],
    path: '/app/settings?tab=apikeys',
    description: 'מפתחות API אישיים (למשל מפתח Anthropic/Claude)',
  },
  {
    id: 'external-connections',
    label: 'חיבורים חיצוניים',
    synonyms: ['vault', 'Google', 'Gmail', 'Drive', 'Calendar'],
    path: '/app/settings?tab=vault',
    description: 'חיבורי Google (Gmail/Drive/Calendar) ואישורי גישה',
  },
  {
    id: 'advanced-settings',
    label: 'הגדרות מתקדמות',
    synonyms: ['advanced'],
    path: '/app/settings?tab=advanced',
    description: 'הגדרות מתקדמות/דיבאג',
  },

  // --- Per-business settings (/app/business/[id]) — requiresBusinessId ---
  {
    id: 'ypay-credentials',
    label: 'פרטי חיבור YPAY',
    synonyms: ['YPAY credentials', 'YPAY', 'ypayClientId', 'ypayClientSecret'],
    path: '/app/business/{businessId}?tab=settings',
    description: 'פרטי התחברות ל-YPAY (הפקת חשבוניות/קבלות) מוגדרים בהגדרות העסק',
    requiresBusinessId: true,
  },
  {
    id: 'business-income',
    label: 'הכנסות עסק',
    synonyms: ['income', 'הכנסות'],
    path: '/app/business/{businessId}?tab=income',
    description: 'רשימת הכנסות העסק, יצירת קבלות/חשבוניות',
    requiresBusinessId: true,
  },
  {
    id: 'business-expenses',
    label: 'הוצאות עסק',
    synonyms: ['expenses', 'הוצאות'],
    path: '/app/business/{businessId}?tab=expenses',
    description: 'רשימת הוצאות העסק, התאמת קבלות',
    requiresBusinessId: true,
  },
  {
    id: 'business-settlement',
    label: 'התחשבנות שותפים',
    synonyms: ['settlement', 'קיזוז שותפים', 'partner settlement'],
    path: '/app/business/{businessId}?tab=settlement',
    description: 'התחשבנות בין שותפים (זמין רק כשיש 2+ שותפים בעסק)',
    requiresBusinessId: true,
  },
  {
    id: 'business-timing',
    label: 'תיעוד זמן',
    synonyms: ['time tracking', 'timer', 'שעות'],
    path: '/app/business/{businessId}?tab=timing',
    description: 'טיימר, רישום שעות ופרויקטים',
    requiresBusinessId: true,
  },
  {
    id: 'business-invoices',
    label: 'חשבוניות',
    synonyms: ['invoices', 'חשבונית מס'],
    path: '/app/business/{businessId}?tab=invoices',
    description: 'רשימת חשבוניות שהופקו',
    requiresBusinessId: true,
  },
  {
    id: 'business-open-docs',
    label: 'מסמכים פתוחים',
    synonyms: ['open documents', 'open invoices'],
    path: '/app/business/{businessId}?tab=open-docs',
    description: 'חשבוניות שטרם נסגרו/שולמו במלואן',
    requiresBusinessId: true,
  },
  {
    id: 'business-projects',
    label: 'פרויקטים',
    synonyms: ['projects', 'פרויקטים'],
    path: '/app/business/{businessId}?tab=projects',
    description: 'ניהול פרויקטים של העסק',
    requiresBusinessId: true,
  },
  {
    id: 'business-tasks',
    label: 'משימות עסק',
    synonyms: ['business tasks'],
    path: '/app/business/{businessId}?tab=tasks',
    description: 'משימות חוזרות/חד-פעמיות של העסק',
    requiresBusinessId: true,
  },

  // --- Top-level app screens ---
  {
    id: 'budget',
    label: 'תקציב',
    synonyms: ['budget', 'סיווג עסקאות'],
    path: '/app/budget',
    description: 'תקציב חודשי וסיווג עסקאות לנושאים',
  },
  {
    id: 'taxes',
    label: 'מסים',
    synonyms: ['taxes', 'מקדמות', 'מע"מ'],
    path: '/app/taxes',
    description: 'מעקב מקדמות מס הכנסה ותשלומי מע"מ',
  },
  {
    id: 'capital',
    label: 'הון',
    synonyms: ['capital', 'חסכונות', 'פנסיה'],
    path: '/app/capital',
    description: 'מעקב אחר חסכונות/פנסיה/השקעות',
  },
  {
    id: 'cash-flow',
    label: 'תזרים מזומנים',
    synonyms: ['cash flow', 'תזרים'],
    path: '/app/cash-flow',
    description: 'תצוגת תזרים מזומנים',
  },
  {
    id: 'credit-cards',
    label: 'כרטיסי אשראי',
    synonyms: ['credit cards'],
    path: '/app/credit-cards',
    description: 'ניהול כרטיסי אשראי',
  },
  {
    id: 'future-payments',
    label: 'תשלומים עתידיים',
    synonyms: ['future payments'],
    path: '/app/future-payments',
    description: 'תצוגת תשלומים עתידיים/הוראות קבע',
  },
  {
    id: 'import-wizard',
    label: 'ייבוא קבצים',
    synonyms: ['import', 'ייבוא PDF', 'ייבוא בנק'],
    path: '/app/import',
    description: 'ייבוא דפי חשבון/כרטיס אשראי (כולל PDF)',
  },
  {
    id: 'grocery-stores',
    label: 'חנויות/קניות',
    synonyms: ['grocery', 'שופרסל', 'קניות'],
    path: '/app/stores',
    description: 'הגדרות רשימת קניות אוטומטית וחנויות',
  },
  {
    id: 'todo',
    label: 'משימות',
    synonyms: ['todo', 'tasks'],
    path: '/app/todo',
    description: 'רשימת המשימות האישית',
  },
]
