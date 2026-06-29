/**
 * Function declarations for Gemini native function calling.
 * Each action the bot can perform is declared here with its parameters.
 */
import type { FunctionDeclaration } from '@/app/services/llm/types'

export const ACTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'set_session',
    description: 'עדכן מצב סשן — קרא כשהמשתמש משנה חנות פעילה',
    parameters: {
      type: 'object',
      properties: {
        activeStore: { type: 'string', description: 'מזהה חנות פעילה (shufersal, retalix) או null לאיפוס' },
      },
    },
  },
  {
    name: 'product_details',
    description: 'קבל פרטים על מוצר שכבר נמצא ברשימה (שם, מחיר, יחידה). השתמש כששואלים על מוצר ברשימה — אל תשתמש ב-search_product למוצרים שכבר ברשימה.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'שם המוצר כפי שמופיע ברשימה' },
        store: { type: 'string', description: 'מזהה חנות' },
      },
      required: ['name'],
    },
  },
  {
    name: 'search_product',
    description: 'חפש מוצר בחנות. משמש גם לבדיקת מחיר.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'שם המוצר לחיפוש' },
        qty: { type: 'integer', description: 'כמות (ברירת מחדל 1)' },
        target: { type: 'string', enum: ['pending', 'standing'], description: 'pending=הזמנה שבועית, standing=רשימה קבועה' },
        store: { type: 'string', description: 'מזהה חנות (shufersal, retalix)' },
        validTo: { type: 'string', description: 'רק עבור target=pending. תוקף ב-YYYY-MM-DD. ללא ערך = רק להזמנה הקרובה. עם תאריך = פעיל עד התאריך.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'remove_items',
    description: 'הסר פריטים מההזמנה השבועית. "בלי X" / "השבוע בלי X" / "תוריד את X לשבועיים"',
    parameters: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'שמות הפריטים להסרה' },
        store: { type: 'string' },
        validTo: { type: 'string', description: 'תוקף ב-YYYY-MM-DD. ללא ערך = רק להזמנה הקרובה. עם תאריך = להסיר מכל הזמנה עד התאריך.' },
      },
      required: ['items'],
    },
  },
  {
    name: 'remove_standing',
    description: 'הסר פריטים מהרשימה הקבועה',
    parameters: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'שמות הפריטים להסרה' },
        store: { type: 'string' },
      },
      required: ['items'],
    },
  },
  {
    name: 'move_to_standing',
    description: 'העבר פריטים מתוספות השבוע לרשימה הקבועה (בלי חיפוש מחדש)',
    parameters: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' }, description: 'שמות הפריטים להעברה. שם חלקי מתקבל.' },
        store: { type: 'string' },
      },
      required: ['items'],
    },
  },
  {
    name: 're_search',
    description: 'חפש מוצר מחדש (כשהתוצאה הקודמת לא התאימה)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'שם מוצר מדויק יותר' },
        qty: { type: 'integer' },
        target: { type: 'string', enum: ['pending', 'standing'] },
        store: { type: 'string' },
        validTo: { type: 'string', description: 'רק עבור target=pending. תוקף ב-YYYY-MM-DD.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'show_list',
    description: 'הצג/תראה רשימת קניות של חנות. משמש ל"תראה את הרשימה", "מה ברשימה". חובה — לאחר הקריאה, **רשום את הפריטים בתגובה** (שם + כמות + יחידה). הצ׳אט הוא טקסט בלבד, אין UI נפרד שמראה את הרשימה.',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string' },
      },
    },
  },
  {
    name: 'clear_pending',
    description: 'נקה שינויים שבועיים',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string' },
      },
    },
  },
  {
    name: 'list_slots',
    description: 'הצג משבצות משלוח זמינות',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string' },
      },
    },
  },
  {
    name: 'list_categories',
    description: 'הצג קטגוריות מוצרים זמינות בחנות. שימושי כשהמשתמש שואל "איזה קטגוריות יש?" או רוצה להתעיין לפי קטגוריה במקום שם מוצר.',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string', description: 'מזהה חנות. אם לא מצוין — המערכת תשתמש ב-activeStore.' },
      },
    },
  },
  {
    name: 'trigger_order',
    description: 'בצע הזמנה. day: שם יום בעברית או תאריך DD/MM/YYYY מרשימת המשבצות',
    parameters: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'יום: "היום","מחר","ראשון"... או DD/MM/YYYY' },
        time: { type: 'string', description: 'שעה מרשימת המשבצות' },
        store: { type: 'string', description: 'מזהה חנות (shufersal, retalix)' },
      },
    },
  },
  {
    name: 'cancel_order',
    description: 'בטל הזמנה פעילה (בקש אישור לפני!)',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string', description: 'מזהה חנות (shufersal, retalix)' },
      },
    },
  },
  {
    name: 'update_order',
    description: 'החל את כל השינויים הממתינים (הוספות והסרות שנאספו) על ההזמנה הפתוחה בשופרסל, בעדכון אחד. קרא לזה רק כשיש הזמנה פתוחה (orderStatus=active) ורק אחרי שהמשתמש אישר במפורש שברצונו לעדכן את ההזמנה. עדכון ההזמנה לוקח ~30 שניות.',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string', description: 'מזהה חנות (shufersal)' },
      },
    },
  },
  {
    name: 'show_cart',
    description: 'הצג את תוכן העגלה / ההזמנה הפתוחה בשופרסל (פריטים בפועל, לא הרשימה)',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'show_orders',
    description: 'הצג הזמנות פעילות. אם המשתמש שאל באופן כללי ("יש הזמנות פתוחות?") בלי לציין חנות — אל תעביר store כלל, והמערכת תבדוק את כל החנויות המחוברות. אם המשתמש ציין חנות ("יש הזמנות בשופרסל?") — העבר store.',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string', description: 'מזהה חנות. השמט כדי לבדוק את כל החנויות המחוברות.' },
      },
    },
  },
  {
    name: 'set_credentials',
    description: 'שמור פרטי שופרסל בשרת (Tier 3). דורש שאישור Tier 3 כבר נרשם בעבר (`grant_server_creds_consent`). אם אין אישור — השמירה תיכשל וההודעה למשתמש תכוון אותו או לאשר במפורש או לחבר דרך הגדרות → חיבורים חיצוניים (Tier 2). **אל תקרא לפעולה הזו אלא אם המשתמש אמר במפורש משפט שמסכים לשמירה בשרת.**',
    parameters: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
        store: { type: 'string' },
      },
      required: ['email', 'password'],
    },
  },
  {
    name: 'set_otp_phone',
    description: 'שלח SMS אימות לטלפון לחיבור חנות Retalix (מקור השפע/הירקניה וכו׳). למשתמש אנונימי הפרטים נשמרים בדפדפן בלבד וזה אוטומטי. **למשתמש רשום: דורש אישור Tier 3 שכבר נרשם בעבר.** אם אין אישור — הקריאה תיכשל; אל תקרא לזה למשתמש רשום אלא אם הוא אמר במפורש משפט שמסכים לשמירה בשרת. **אם ההקשר מציג מספר טלפון שמור (OTP) ומשתמש אישר שימוש בו — קרא ללא phone (המערכת תשתמש במספר השמור).**',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'מספר טלפון נייד. ניתן להשמיט אם יש מספר שמור בהקשר ומשתמש אישר שימוש בו.' },
        store: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'grant_server_creds_consent',
    description: 'רשום אישור Tier 3 של המשתמש לשמירת פרטי חיבור בשרת. **לקרוא רק כשהמשתמש אמר במפורש משפט שמסכים** (למשל "אני מאשר Tier 3", "תשמור בשרת", "אני רוצה הזמנות אוטומטיות"). **שליחת אימייל/סיסמה בצ׳אט לבד היא לא אישור.** אם הקריאה למלא Tier 3 + set_credentials באה ב-turn אחד — קודם תקרא לזה ורק אחר כך ל-set_credentials/set_otp_phone.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'verify_otp',
    description: 'אמת קוד SMS',
    parameters: {
      type: 'object',
      properties: {
        otp: { type: 'string' },
        store: { type: 'string' },
      },
      required: ['otp'],
    },
  },
  {
    name: 'set_schedule',
    description: 'הגדר לוח זמנים להזמנות',
    parameters: {
      type: 'object',
      properties: {
        orderDay: { type: 'integer', description: 'יום בשבוע (0=ראשון, 6=שבת)' },
        preferredSlot: {
          type: 'object',
          properties: {
            day: { type: 'string', description: 'יום משלוח בעברית' },
            time: { type: 'string', description: 'שעת משלוח' },
          },
        },
        reviewReminderHours: { type: 'integer', description: 'שעות לפני להתזכורת' },
        store: { type: 'string' },
      },
    },
  },
  {
    name: 'show_schedule',
    description: 'הצג לוח זמנים',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string' },
      },
    },
  },
  {
    name: 'browse_category',
    description: 'הצג מוצרים בקטגוריה (פירות, ירקות, חלב, בשר...)',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'שם הקטגוריה' },
        store: { type: 'string' },
      },
      required: ['category'],
    },
  },
  {
    name: 'set_default_store',
    description: 'שנה חנות ברירת מחדל',
    parameters: {
      type: 'object',
      properties: {
        store: { type: 'string', description: 'מזהה חנות חדש' },
      },
      required: ['store'],
    },
  },
  {
    name: 'create_task',
    description: 'צור משימה חדשה',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        deadline: { type: 'string', description: 'YYYY-MM-DD' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        quadrant: { type: 'string', enum: ['do', 'schedule', 'delegate', 'eliminate'] },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_tasks',
    description: 'הצג/חפש משימות',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'סינון לפי כותרת (אופציונלי)' },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'סמן משימה כהושלמה',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '4 ספרות אחרונות של המזהה' },
      },
      required: ['id'],
    },
  },
  {
    name: 'update_task',
    description: 'ערוך משימה קיימת',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '4 ספרות אחרונות של המזהה' },
        title: { type: 'string' },
        deadline: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_task',
    description: 'מחק משימה',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '4 ספרות אחרונות של המזהה' },
      },
      required: ['id'],
    },
  },
]
