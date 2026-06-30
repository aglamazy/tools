import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://aglamazo.com'
const NORMALIZED_BASE = SITE_URL.endsWith('/') ? SITE_URL.slice(0, -1) : SITE_URL

export const QUICK_WIN_DATE = '2026-06-30'

export const TAX_AUTHORITY_URL = 'https://www.gov.il/he/departments/israel_tax_authority/govil-landing-page'
export const KOLZCHUT_URL = 'https://www.kolzchut.org.il/he/'

export type QuickWinSource = {
  label: string
  href: string
}

export type QuickWinPageData = {
  path: string
  title: string
  description: string
  category: string
  query: string
  intro: string
  keyPoints: string[]
  productSteps: string[]
  sourceLinks: QuickWinSource[]
  disclaimer: string
  ctaLabel: string
  ctaHref: string
}

const commonProductSteps = [
  'מייבאים דפי בנק וכרטיסי אשראי כקבצים, בלי למסור את סיסמת הבנק לאף שירות חיצוני.',
  'נותנים למערכת לסווג אוטומטית את העסקאות, ואז מתקנים רק את החריגים.',
  'רואים את התזרים, ההכנסות, ההוצאות והקטגוריות במקום אחד, עם נתונים מוצפנים בצד הלקוח.',
]

const taxAuthoritySource = [{ label: 'רשות המסים בישראל', href: TAX_AUTHORITY_URL }]
const taxAuthorityAndRightsSource = [
  { label: 'רשות המסים בישראל', href: TAX_AUTHORITY_URL },
  { label: 'כל-זכות', href: KOLZCHUT_URL },
]

export const QUICK_WIN_PAGES: Record<string, QuickWinPageData> = {
  bankStatementGuide: {
    path: '/madrich/korim-daf-heshbon-banki',
    title: 'איך קוראים דף חשבון בנק — מדריך לבעל עסק',
    description: 'מדריך קצר לקריאת דף חשבון בנק, זיהוי תנועות חשובות, והפיכת הקובץ לבסיס נקי לסיווג אוטומטי ותזרים.',
    category: 'מדריך',
    query: 'איך קוראים דף חשבון בנק',
    intro:
      'דף חשבון טוב לקריאה מתחיל בזיהוי היתרה, תנועות החובה והזכות, תאריך הערך, והפרדה בין מה ששייך לעסק לבין מה שלא. ברגע שמייבאים את הדף ל-Aglamazo, אפשר להפוך את הקריאה הידנית לסיווג אוטומטי ולראות את התזרים במקום אחד.',
    keyPoints: [
      'בדקו קודם את יתרת הפתיחה והיתרה הסופית כדי להבין אם יש פער שנגרר מחודש קודם.',
      'חפשו תנועות כפולות, תשלומים דחויים ועמלות שנראה כאילו "נעלמו" בתוך ההיסטוריה.',
      'הפרידו בין תנועות עסקיות לפרטיות לפני שמכניסים את הדף לתזרים או להוצאות.',
      'השוו את תיאור הפעולה מול הקובץ המקורי כדי לקצר תיקונים ידניים אחר כך.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. לפני החלטה תפעולית או מסוימת, בדקו את ההנחיות העדכניות ברשות המסים או עם רואה החשבון שלכם.',
    ctaLabel: 'ייבוא דף בנק',
    ctaHref: '/app/import',
  },
  bankReconciliationGuide: {
    path: '/madrich/bank-reconciliation-guide',
    title: 'למה העו"ש לא מסתדר? מדריך להתאמת בנק לעסק',
    description: 'מדריך לזיהוי פערים בין העו"ש לבין החשבונאות: כפילויות, תשלומים דחויים, ותנועות שלא שובצו נכון.',
    category: 'מדריך',
    query: 'הפרשי עו"ש / התאמת בנק',
    intro:
      'כשהעו"ש לא מסתדר, הבעיה בדרך כלל אינה "חוסר כסף" אלא פער בין תאריך העסקה, תאריך הערך, תשלומים בפריסה, והצמדה לא נכונה לקטגוריה. Aglamazo עוזר להביא את כל התנועות לאותו מסך ואז לסגור את הפערים מהר יותר.',
    keyPoints: [
      'בדקו עסקאות כפולות לפני שמניחים שהיתרה "שגויה".',
      'השוו בין תאריך הקניה, תאריך החיוב בפועל ותאריך הערך.',
      'סמנו תשלומים דחויים ותנועות בנק שאינן שייכות לעסק.',
      'שמרו תיעוד מסודר כדי שיהיה קל להסביר כל פער בדוח או מול הנהלת חשבונות.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. לפני סגירת חודש או הגשת דיווח, בדקו את ההוראות העדכניות ברשות המסים.',
    ctaLabel: 'לראות את התזרים',
    ctaHref: '/app/cash-flow',
  },
  cashFlowWithoutBank: {
    path: '/madrich/cash-flow-without-bank-access',
    title: 'ניהול תזרים מזומנים בלי לחבר את הבנק',
    description: 'איך לנהל תזרים גם בלי חיבור בנק חי: העלאת קבצים, עבודה מקומית, וסיווג בלי למסור גישה לבנק.',
    category: 'מדריך',
    query: 'ניהול תזרים בלי גישה לבנק',
    intro:
      'לא חייבים לחבר את חשבון הבנק כדי לנהל תזרים. אפשר להתחיל מקבצי CSV/XLSX, כרטיסי אשראי וייבוא ידני, ואז לראות את התמונה המלאה בלי להעביר סיסמת בנק לשום צד שלישי.',
    keyPoints: [
      'אפשר להסתמך על קבצים שהורדתם מהבנק או מחברת האשראי, ולא על חיבור ישיר לחשבון.',
      'הפרטיות נשמרת כי הסיווג והניתוח רצים בצד הלקוח, לא בענן חיצוני.',
      'תזרים נקי נבנה גם כשמתחילים ממידע חלקי, כל עוד שומרים על תאריך, סכום ותיאור.',
      'הוספת מסמכי מקור בהמשך משפרת את הדיוק ואת הביטחון בנתונים.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. אם יש דרישות דיווח ספציפיות, בדקו אותן מול רשות המסים או איש המקצוע שלכם.',
    ctaLabel: 'התחילו מייבוא קובץ',
    ctaHref: '/app/import',
  },
  cashFlowExcelTemplate: {
    path: '/template/cash-flow-excel-template',
    title: 'תבנית תזרים מזומנים באקסל להורדה (+דרך אוטומטית)',
    description: 'תבנית אקסל לתזרים: עמודות בסיסיות, סדר עבודה, ואיך Aglamazo מחליף את העתק-הדבק החוזר.',
    category: 'תבנית',
    query: 'תזרים מזומנים אקסל תבנית',
    intro:
      'אם אתם אוהבים לעבוד באקסל, התבנית הנכונה צריכה להיות פשוטה: תאריך, תיאור, הכנסה, הוצאה, ויתרה. אם אתם רוצים להפסיק להקליד ידנית, אפשר לייבא את אותם קבצים ל-Aglamazo ולקבל את המבנה הזה אוטומטית.',
    keyPoints: [
      'שמרו עמודות קבועות כדי שהשוואה חודשית תהיה עקבית ולא תלויה בזיכרון.',
      'הפרידו בין תנועות שהן הכנסה בפועל לבין תנועות שנראות כמו "כסף שנכנס" אך הן רק העברה פנימית.',
      'הוסיפו שדה קטגוריה כדי לאפשר סיווג מהיר של העסקאות.',
      'השתמשו בתבנית כבסיס, ואז עברו לייבוא אוטומטי כשהעומס גדל.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. לתיעוד ודרישות שימור, בדקו את ההנחיות העדכניות ברשות המסים.',
    ctaLabel: 'לייבא קובץ תזרים',
    ctaHref: '/app/import',
  },
  incomeExpensesTemplate: {
    path: '/template/income-expenses-excel',
    title: 'טבלת הוצאות והכנסות לעסק — אקסל חינם',
    description: 'טבלת אקסל בסיסית להכנסות והוצאות בעסק, עם מבנה שמקל על סיווג אוטומטי והכנת דוח תזרים.',
    category: 'תבנית',
    query: 'טבלת הוצאות והכנסות אקסל',
    intro:
      'טבלת הכנסות והוצאות טובה היא כזו שאפשר למלא מהר ולהשוות חודש מול חודש. המבנה הפשוט ביותר הוא שדה תאריך, שם ספק או לקוח, סכום, וסימון אם זו הכנסה או הוצאה.',
    keyPoints: [
      'שמרו על שמות אחידים לספקים וללקוחות כדי לצמצם כפילויות.',
      'הוסיפו סימון האם מדובר בעסקה עסקית או פרטית.',
      'הכניסו קישור לדף הבנק או לאשראי כדי לא לאבד את המקור.',
      'קבצים אחידים מקלים מאוד על מעבר לסיווג אוטומטי בתוך Aglamazo.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. לפני דיווח מס או טיפול בהוצאה מוכרת, בדקו את הנהלים העדכניים ברשות המסים.',
    ctaLabel: 'להעלות קובץ הכנסות והוצאות',
    ctaHref: '/app/import',
  },
  incomeTaxAdvanceCalculator: {
    path: '/machshevon/income-tax-advance-calculator',
    title: 'מחשבון מקדמות מס הכנסה לעצמאי',
    description: 'הסבר מחשבוני למקדמות מס הכנסה: איך להעריך תשלום חודשי לפי התזרים וההכנסה בפועל.',
    category: 'מחשבון',
    query: 'מחשבון מקדמות מס הכנסה',
    intro:
      'מקדמות מס הכנסה הן תשלום שוטף, ולכן כדאי לבנות הערכה על בסיס ההכנסה המצטברת ולא רק על "מה שהיה בחודש האחרון". Aglamazo עוזר להזין מספרים מתוך בנק וכרטיס, כך שההערכה נשענת על נתונים אמתיים ולא על תחושת בטן.',
    keyPoints: [
      'הערכה טובה מתחילה מהכנסה נטו, לא רק מהמחזור הגולמי.',
      'אם ההכנסות משתנות, שווה לעדכן את ההערכה במהלך השנה ולא רק בסוף.',
      'צריך לשמור תיעוד ברור של מה נכלל בחישוב ומה לא.',
      'תזרים מסודר מקל על בדיקת סבירות מול ההנחיות וההתראות של רשות המסים.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ מס. מקדמות, שיעורים ונהלים יכולים להשתנות, ולכן יש לאמת כל חישוב מול רשות המסים או איש מקצוע.',
    ctaLabel: 'לייבא נתוני תזרים',
    ctaHref: '/app/cash-flow',
  },
  vatCalculator: {
    path: '/machshevon/vat-calculator',
    title: 'מחשבון מע"מ — תשומות ועסקאות',
    description: 'מחשבון מע"מ בסיסי להסבר ההפרש בין עסקאות לתשומות, ואיך לבדוק אם נשאר תשלום או החזר.',
    category: 'מחשבון',
    query: 'מחשבון מע"מ',
    intro:
      'בחישוב מע"מ, חשוב להבחין בין מע"מ על עסקאות לבין מע"מ שניתן לקזז על תשומות. החישוב המדויק תלוי בסוג העסק, במסמכים ובכללים של רשות המסים, ולכן כדאי לעבוד עם קבצים מסודרים ולא רק עם זיכרון.',
    keyPoints: [
      'בצד העסקאות נרשמות המכירות או השירותים החייבים במע"מ, ובצד התשומות נרשמות ההוצאות הרלוונטיות לקיזוז.',
      'הקיזוז אפשרי רק כשיש מסמך מתאים ותיעוד מסודר.',
      'פער בין הקלט לקיזוז יכול להפוך לתשלום או לזיכוי, תלוי במספרים של התקופה.',
      'Aglamazo עוזר לקלוט את המסמכים מהר יותר ולשייך אותם לעסקה המתאימה.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ מס. לפני הגשה או קיזוז, בדקו את הוראות המע\"מ העדכניות ברשות המסים.',
    ctaLabel: 'לסווג מסמכים',
    ctaHref: '/app/import',
  },
  cashFlowGlossary: {
    path: '/madrich/what-is-cash-flow',
    title: 'תזרים מזומנים — מה זה ולמה זה חשוב לעסק קטן',
    description: 'הסבר קצר וברור על תזרים מזומנים, למה הוא שונה מרווח, ואיך להשתמש בו כדי להימנע מהפתעות.',
    category: 'מושג',
    query: 'מה זה תזרים מזומנים',
    intro:
      'תזרים מזומנים הוא לא אותו דבר כמו רווח. הוא עונה על שאלה אחת פשוטה: מתי כסף באמת נכנס ומתי הוא באמת יוצא. בעסק קטן זה אחד המדדים הכי חשובים, כי אפשר להיות "רווחיים על הנייר" ועדיין להיתקע בלי מזומן.',
    keyPoints: [
      'תזרים בודק את התנועה בפועל של כסף, לא רק את התוצאה החשבונאית.',
      'חשבוניות ותשלומים בפריסה יכולים לשנות מאוד את התמונה החודשית.',
      'חשוב להסתכל קדימה, לא רק אחורה, כדי להימנע מהפתעות.',
      'יבוא בנק וכרטיסים ל-Aglamazo נותן תמונת תזרים אחת, בלי לאחד ידנית קבצים.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. בכל שאלה שקשורה לדיווח, בדקו את ההנחיות העדכניות ברשות המסים.',
    ctaLabel: 'לראות תזרים אמיתי',
    ctaHref: '/app/cash-flow',
  },
  inputTaxGlossary: {
    path: '/madrich/what-is-input-tax',
    title: 'מס תשומות — מה זה ואיך מקזזים',
    description: 'מושג בסיסי במע"מ: מהו מס תשומות, מתי מסתכלים עליו, ואיך מייצרים תיעוד מסודר לקיזוז.',
    category: 'מושג',
    query: 'מס תשומות מה זה',
    intro:
      'מס תשומות הוא החלק במע"מ של הוצאות העסק שייתכן שאפשר לקזז, כל עוד יש מסמך מתאים וההוצאה עומדת בכללים. לכן חשוב לא רק "לשמור קבלה", אלא גם לשייך אותה נכון ולבדוק שהיא באמת קשורה לעסק.',
    keyPoints: [
      'מס תשומות קשור למס על הוצאות, לא למס על ההכנסה.',
      'בלי מסמך תקין, הקיזוז עלול להידחות או להצטמצם.',
      'כדאי לשמור הוצאה ותיאור עסקה יחד כדי שיהיה קל להוכיח את הקשר לעסק.',
      'Aglamazo הופך קבצי בנק ואשראי לרשימת הוצאות מסודרת לפני בדיקת מע"מ.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ מס. לפני קיזוז תשומות, בדקו את הכללים העדכניים ברשות המסים.',
    ctaLabel: 'לבדוק הוצאות',
    ctaHref: '/app/budget',
  },
  autoExpenseClassification: {
    path: '/madrich/auto-expense-classification',
    title: 'סיווג הוצאות עסק אוטומטי — איך זה עובד',
    description: 'איך סיווג אוטומטי של הוצאות עובד בפועל, ולמה קובצי בנק וכרטיסים נקיים חוסכים זמן.',
    category: 'מדריך',
    query: 'סיווג הוצאות אוטומטי',
    intro:
      'סיווג אוטומטי לא "מנחש" סתם. הוא משתמש בתיאור העסקה, בשם הספק, בסכום, ובהיסטוריית תיקונים כדי להציע קטגוריה סבירה. ככל שהקבצים מסודרים יותר, כך התוצאות מדויקות יותר.',
    keyPoints: [
      'הסיווג מתחיל מהתיאור, אבל משתפר כשיש היסטוריה קבועה של ספקים וקטגוריות.',
      'תיקון אחד חוסך תיקונים עתידיים כי המערכת לומדת דפוסים חוזרים.',
      'עסקאות מעורבות דורשות בדיקה ידנית, לא קבלה אוטומטית עיוורת.',
      'הפלט הנקי מקל על תזרים, תקציב, ואפילו על הכנת חומר למס.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. סיווג הוצאות ותיעוד נדרשים להישען על הכללים העדכניים ברשות המסים.',
    ctaLabel: 'לסווג הוצאות',
    ctaHref: '/app/budget',
  },
  businessCreditCardStatement: {
    path: '/madrich/business-credit-card-statement-guide',
    title: 'איך קוראים פירוט כרטיס אשראי עסקי',
    description: 'מדריך לקריאת פירוט אשראי עסקי: חיוב, זיכוי, תשלומים, והצלבה מול החשבון והתזרים.',
    category: 'מדריך',
    query: 'פירוט אשראי עסקי',
    intro:
      'פירוט כרטיס אשראי עסקי נראה מסובך רק עד שמפרקים אותו לחלקים: תאריך עסקה, תאריך חיוב, מספר תשלומים, וסכום מצטבר. אחרי הייבוא ל-Aglamazo אפשר לחבר אותו לחשבון הבנק ולהבין מה כבר נפרע ומה עדיין יירד.',
    keyPoints: [
      'הבדילו בין מועד הקניה לבין מועד החיוב בפועל.',
      'חפשו עסקאות בתשלומים, כי הן משפיעות אחרת על התזרים.',
      'בדקו אם יש זיכויים או ביטולים שמורידים את הסכום הסופי.',
      'הצלבה עם דפי הבנק מונעת ספירה כפולה של אותה הוצאה.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthoritySource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ חשבונאי או משפטי. לפני סגירת דיווח או קיזוז, בדקו את המסמכים וההוראות העדכניות ברשות המסים.',
    ctaLabel: 'להעלות כרטיס אשראי',
    ctaHref: '/app/credit-cards',
  },
  workFromHomeExpenses: {
    path: '/madrich/work-from-home-deductible-expenses',
    title: 'רשימת הוצאות מוכרות לעבודה מהבית',
    description: 'הסבר כללי על הוצאות מהבית, מה נחשב מעורב, ולמה חשוב תיעוד והפרדה בין פרטי לעסקי.',
    category: 'מדריך',
    query: 'הוצאות מוכרות עבודה מהבית',
    intro:
      'כשעובדים מהבית, לא כל הוצאה הופכת אוטומטית להוצאה מוכרת. בדרך כלל צריך להראות קשר לעסק, תיעוד מסודר, ולעיתים גם חלוקה יחסית בין שימוש עסקי לשימוש פרטי. כאן בדיוק סיווג אוטומטי ושמירה נקייה של מסמכים חוסכים המון כאב ראש.',
    keyPoints: [
      'הוצאה מעורבת דורשת בדיקה והקצאה יחסית, לא סימון עיוור.',
      'תיעוד מסודר חשוב במיוחד כשאותו ספק משמש גם לבית וגם לעסק.',
      'הפרדה בין תשלום פרטי לעסקי מקלה על הנהלת החשבונות ועל הדיווח.',
      'אם הכול נכנס ל-Aglamazo, אפשר לראות מהר מה שייך לעסק ומה נשאר מחוץ לתחשיב.',
    ],
    productSteps: commonProductSteps,
    sourceLinks: taxAuthorityAndRightsSource,
    disclaimer:
      'זהו מידע כללי בלבד, לא ייעוץ מס או משפטי. הוצאות מהבית תלויות בנסיבות הספציפיות ובהנחיות העדכניות של רשות המסים וכל-זכות.',
    ctaLabel: 'לסווג הוצאות בית',
    ctaHref: '/app/budget',
  },
}

export function buildQuickWinMetadata(page: QuickWinPageData): Metadata {
  return {
    title: `${page.title} | Aglamazo`,
    description: page.description,
    alternates: {
      canonical: page.path,
      languages: {
        'he-IL': page.path,
        'x-default': page.path,
      },
    },
    openGraph: {
      title: `${page.title} | Aglamazo`,
      description: page.description,
      url: `${NORMALIZED_BASE}${page.path}`,
      siteName: 'Aglamazo',
      type: 'article',
      locale: 'he_IL',
      images: [{ url: '/logo.png', width: 2816, height: 1536, alt: page.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${page.title} | Aglamazo`,
      description: page.description,
      images: ['/logo.png'],
    },
    robots: { index: true, follow: true },
  }
}

function renderSources(sourceLinks: QuickWinSource[]) {
  return sourceLinks.map((source, index) => (
    <span key={source.href}>
      {index > 0 ? ' · ' : ''}
      <a href={source.href} target="_blank" rel="noreferrer" style={{ color: '#0f766e', textDecoration: 'underline' }}>
        {source.label}
      </a>
    </span>
  ))
}

function renderInlineCitation(sourceLinks: QuickWinSource[]) {
  return <span style={{ color: '#64748b' }}> (מקור: {renderSources(sourceLinks)})</span>
}

export function QuickWinPage({ page }: { page: QuickWinPageData }) {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.description,
      url: `${NORMALIZED_BASE}${page.path}`,
      inLanguage: 'he-IL',
      datePublished: QUICK_WIN_DATE,
      dateModified: QUICK_WIN_DATE,
      isPartOf: { '@type': 'WebSite', name: 'Aglamazo', url: `${NORMALIZED_BASE}/` },
      primaryImageOfPage: { '@type': 'ImageObject', url: `${NORMALIZED_BASE}/logo.png` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Aglamazo', item: `${NORMALIZED_BASE}/` },
        { '@type': 'ListItem', position: 2, name: page.title, item: `${NORMALIZED_BASE}${page.path}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: page.title,
          acceptedAnswer: {
            '@type': 'Answer',
            text: [page.intro, ...page.keyPoints].join(' '),
          },
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: `איך Aglamazo עוזר — ${page.title}`,
      description: page.intro,
      inLanguage: 'he-IL',
      step: page.productSteps.map((text, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        text,
      })),
    },
  ]

  return (
    <main dir="rtl" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #fff 36%, #f8fafc 100%)', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '2rem 1rem 3rem' }}>
        <section
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #0f766e 100%)',
            color: '#f8fafc',
            borderRadius: 24,
            padding: '2rem',
            boxShadow: '0 30px 70px rgba(15, 23, 42, 0.18)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
            <span style={{ background: 'rgba(255,255,255,0.14)', padding: '0.35rem 0.75rem', borderRadius: 999, fontSize: '0.9rem' }}>
              {page.category}
            </span>
            <span style={{ background: 'rgba(255,255,255,0.1)', padding: '0.35rem 0.75rem', borderRadius: 999, fontSize: '0.9rem' }}>
              {page.query}
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 'clamp(2rem, 4vw, 3.4rem)', lineHeight: 1.1 }}>{page.title}</h1>
          <p style={{ marginTop: 16, marginBottom: 0, maxWidth: 820, fontSize: '1.08rem', lineHeight: 1.85, color: '#dbeafe' }}>
            {page.intro}
          </p>
          <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <Link
              href={page.ctaHref}
              style={{
                background: '#f8fafc',
                color: '#0f172a',
                textDecoration: 'none',
                padding: '0.8rem 1.15rem',
                borderRadius: 14,
                fontWeight: 700,
              }}
            >
              {page.ctaLabel}
            </Link>
            <a
              href={page.sourceLinks[0].href}
              target="_blank"
              rel="noreferrer"
              style={{
                border: '1px solid rgba(248,250,252,0.35)',
                color: '#f8fafc',
                textDecoration: 'none',
                padding: '0.8rem 1.15rem',
                borderRadius: 14,
              }}
            >
              מקור רשמי
            </a>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginTop: 22 }}>
          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>מה חשוב לדעת</h2>
            <ul style={listStyle}>
              {page.keyPoints.map((point) => (
                <li key={point} style={listItemStyle}>
                  <span>{point}</span>
                  {renderInlineCitation(page.sourceLinks)}
                </li>
              ))}
            </ul>
          </section>

          <section style={cardStyle}>
            <h2 style={sectionTitleStyle}>איך Aglamazo עוזר</h2>
            <ol style={listStyle}>
              {page.productSteps.map((step) => (
                <li key={step} style={listItemStyle}>
                  {step}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section style={{ ...cardStyle, marginTop: 18 }}>
          <h2 style={sectionTitleStyle}>מקורות רשמיים</h2>
          <p style={{ marginTop: 0, lineHeight: 1.9, color: '#334155' }}>
            העמוד מבוסס על מקורות רשמיים בלבד. קישורי המקור מופיעים כאן וגם בצמוד לכל טענה מרכזית למעלה.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {page.sourceLinks.map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#ecfeff',
                  color: '#0f766e',
                  textDecoration: 'none',
                  padding: '0.75rem 1rem',
                  borderRadius: 14,
                  border: '1px solid #a7f3d0',
                }}
              >
                {source.label}
                <span style={{ color: '#475569', fontSize: '0.9rem' }}>{source.href}</span>
              </a>
            ))}
          </div>
        </section>

        <section style={{ ...cardStyle, marginTop: 18, background: '#fff7ed', borderColor: '#fed7aa' }}>
          <h2 style={sectionTitleStyle}>דיסקליימר</h2>
          <p style={{ margin: 0, lineHeight: 1.9, color: '#7c2d12' }}>{page.disclaimer}</p>
        </section>
      </div>
    </main>
  )
}

const cardStyle: CSSProperties = {
  background: '#ffffff',
  borderRadius: 20,
  padding: '1.35rem',
  boxShadow: '0 14px 40px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
}

const sectionTitleStyle: CSSProperties = {
  marginTop: 0,
  marginBottom: '1rem',
  fontSize: '1.25rem',
  color: '#0f172a',
}

const listStyle: CSSProperties = {
  margin: 0,
  paddingRight: '1.15rem',
  display: 'grid',
  gap: '0.9rem',
}

const listItemStyle: CSSProperties = {
  lineHeight: 1.9,
  color: '#334155',
}

export type QuickWinHubData = {
  path: string
  title: string
  description: string
  pages: QuickWinPageData[]
}

export function buildHubMetadata(hub: QuickWinHubData): Metadata {
  return {
    title: `${hub.title} | Aglamazo`,
    description: hub.description,
    alternates: {
      canonical: hub.path,
      languages: {
        'he-IL': hub.path,
        'x-default': hub.path,
      },
    },
    openGraph: {
      title: `${hub.title} | Aglamazo`,
      description: hub.description,
      url: `${NORMALIZED_BASE}${hub.path}`,
      siteName: 'Aglamazo',
      type: 'website',
      locale: 'he_IL',
      images: [{ url: '/logo.png', width: 2816, height: 1536, alt: hub.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${hub.title} | Aglamazo`,
      description: hub.description,
      images: ['/logo.png'],
    },
    robots: { index: true, follow: true },
  }
}

export function QuickWinHub({ hub }: { hub: QuickWinHubData }) {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: hub.title,
      description: hub.description,
      url: `${NORMALIZED_BASE}${hub.path}`,
      inLanguage: 'he-IL',
      datePublished: QUICK_WIN_DATE,
      dateModified: QUICK_WIN_DATE,
      isPartOf: { '@type': 'WebSite', name: 'Aglamazo', url: `${NORMALIZED_BASE}/` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Aglamazo', item: `${NORMALIZED_BASE}/` },
        { '@type': 'ListItem', position: 2, name: hub.title, item: `${NORMALIZED_BASE}${hub.path}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: hub.title,
      itemListElement: hub.pages.map((page, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: page.title,
        url: `${NORMALIZED_BASE}${page.path}`,
      })),
    },
  ]

  return (
    <main dir="rtl" style={{ background: 'linear-gradient(180deg, #f8fafc 0%, #fff 36%, #f8fafc 100%)', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '2rem 1rem 3rem' }}>
        <section
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #0f766e 100%)',
            color: '#f8fafc',
            borderRadius: 24,
            padding: '2rem',
            boxShadow: '0 30px 70px rgba(15, 23, 42, 0.18)',
            marginBottom: 22,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1.15 }}>{hub.title}</h1>
          <p style={{ marginTop: 14, marginBottom: 0, maxWidth: 760, fontSize: '1.05rem', lineHeight: 1.8, color: '#dbeafe' }}>
            {hub.description}
          </p>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {hub.pages.map((page) => (
            <Link
              key={page.path}
              href={page.path}
              style={{
                display: 'block',
                background: '#ffffff',
                borderRadius: 20,
                padding: '1.35rem',
                boxShadow: '0 14px 40px rgba(15, 23, 42, 0.08)',
                border: '1px solid #e2e8f0',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'box-shadow 0.15s',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  background: '#f0fdf4',
                  color: '#0f766e',
                  border: '1px solid #a7f3d0',
                  borderRadius: 999,
                  padding: '0.2rem 0.65rem',
                  fontSize: '0.82rem',
                  marginBottom: 10,
                }}
              >
                {page.category}
              </span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', lineHeight: 1.35 }}>{page.title}</h2>
              <p style={{ margin: '0.6rem 0 0', fontSize: '0.9rem', color: '#475569', lineHeight: 1.7 }}>{page.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
