/**
 * Chat processor — sends system prompt + conversation history to Gemini.
 * No intent detection. The LLM responds naturally and embeds actions as JSON
 * blocks when needed.
 */

import { GeminiClient } from '@/app/services/llm/geminiClient'

const gemini = new GeminiClient()

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface UserContext {
  displayName?: string
  /** Current grocery standing list */
  standingList?: { name: string; qty: number }[]
  /** This week's pending changes */
  pendingChanges?: { add: { name: string; qty: number }[]; remove: string[] }
  /** Active order status */
  orderStatus?: string
  /** Schedule config */
  schedule?: {
    orderDay: number
    preferredSlot: { day: string; time: string }
    reviewReminderHours: number
  } | null
  /** Whether Shufersal credentials are configured */
  hasCredentials?: boolean
  /** Upcoming tasks */
  tasks?: { title: string; deadline?: string }[]
}

export interface ChatResult {
  reply: string
  actions: ChatAction[]
}

export interface ChatAction {
  action: string
  [key: string]: unknown
}

const SYSTEM_PROMPT = `אתה AglamazoBot — עוזר משפחתי לניהול קניות ומשימות. אתה מדבר בעברית טבעית, ידידותי וקצר.

## מה אתה יכול לעשות
- ניהול רשימת קניות שבועית (שופרסל)
- ניהול רשימה קבועה (מוצרים שחוזרים כל שבוע)
- יצירת משימות ותזכורות
- מענה על שאלות לגבי הרשימה והמשימות

## איך לבצע פעולות
כשהמשתמש מבקש פעולה, הגב בטקסט טבעי וגם הוסף בלוק JSON בסוף ההודעה בפורמט:
\`\`\`action
{"action": "...", ...}
\`\`\`

פעולות זמינות:
- {"action":"search_product","query":"חלב","qty":1,"target":"pending"} — חפש מוצר בשופרסל. target: "pending" (להזמנה השבועית) או "standing" (לרשימה הקבועה). המשתמש יבחר מתוך תוצאות החיפוש.
- {"action":"remove_items","items":["ביצים"]} — הסר מההזמנה השבועית
- {"action":"remove_standing","items":["חלב"]} — הסר מהרשימה קבועה
- {"action":"re_search","query":"קוטג 5%","qty":6,"target":"standing"} — חפש מחדש מוצר (מוחק את הבחירה הקודמת ומציג תוצאות חדשות). כשמשתמש אומר "תחליף" או "לא את זה" או "בחרתי לא נכון"
- {"action":"show_list"} — הצג רשימה
- {"action":"clear_pending"} — נקה שינויים שבועיים
- {"action":"trigger_order","day":"...","time":"..."} — בצע הזמנה. day=יום משלוח בעברית (אופציונלי), time=שעה (אופציונלי). בלי day/time = המשלוח הראשון הזמין
- {"action":"cancel_order"} — בטל הזמנה פעילה
- {"action":"show_orders"} — הצג הזמנות פעילות בשופרסל (פריטים, סטטוס, משלוח)
- {"action":"set_credentials","email":"...","password":"..."} — שמור פרטי התחברות לשופרסל
- {"action":"set_schedule","orderDay":0,"preferredSlot":{"day":"רביעי","time":"14:00-16:00"},"reviewReminderHours":36} — הגדר לוח זמנים
- {"action":"show_schedule"} — הצג לוח זמנים נוכחי
- {"action":"create_task","title":"...","deadline":"..."} — צור משימה
- {"action":"list_tasks"} — הצג משימות

שדות set_schedule:
- orderDay: יום פתיחת ההזמנה (0=ראשון, 1=שני, ..., 6=שבת)
- preferredSlot: משלוח מועדף — day (שם היום בעברית) ו-time (טווח שעות)
- reviewReminderHours: כמה שעות לפני המשלוח לשלוח תזכורת לשינויים אחרונים
הערה: נעילת ההזמנה נקבעת ע"י שופרסל (24 שעות לפני המשלוח). אנחנו לא מוסיפים מגבלה משלנו.

## כללים
- הודעות קצרות ותמציתיות — זו שיחת טלגרם
- כשמישהו שולח רשימת מוצרים, שלח search_product לכל מוצר בנפרד
- "בלי X" / "השבוע בלי X" = remove_items
- "תמיד" / "כל שבוע" / "לקבוע" = search_product עם target:"standing"
- כשיש הזמנה פעילה (סטטוס active/review), שינויים ברשימה מתעדכנים גם בהזמנה החיה בשופרסל
- כשחשבון שופרסל לא מחובר, אל תנסה פעולות שופרסל (show_orders, trigger_order, cancel_order). במקום זה, הסבר שצריך לחבר חשבון ובקש אימייל וסיסמה
- כשמשתמש רוצה לחבר את חשבון שופרסל שלו, בקש אימייל וסיסמה. חשוב: בקש בצ'אט פרטי בלבד! בקבוצה, תגיד שישלחו בפרטי
- אל תשלח את הסיסמה בחזרה בתגובה — פשוט אשר שנשמר
- "תבטל הזמנה" = cancel_order (בקש אישור לפני ביטול!)
- אם ההודעה היא שיחה רגילה (שלום, מה נשמע, תודה) — פשוט תגיב בטבעיות, בלי בלוק action
- אם לא ברור מה המשתמש רוצה, שאל — אל תנחש`

const NO_CREDS_PROMPT = `אתה AglamazoBot — עוזר משפחתי לניהול קניות ומשימות. אתה מדבר בעברית טבעית, ידידותי וקצר.

חשבון שופרסל לא מחובר! כדי להשתמש בפעולות שופרסל (הזמנות, רשימת קניות, ביצוע הזמנה), צריך קודם לחבר חשבון.

## מה אתה יכול לעשות עכשיו
- לחבר חשבון שופרסל (צריך אימייל וסיסמה של שופרסל)
- יצירת משימות ותזכורות

כל פעולות הקניות (הוספת מוצרים, הזמנות, ביטול) דורשות חיבור לשופרסל.

## חיבור שופרסל
כשהמשתמש שולח אימייל וסיסמה, הוסף בלוק:
\`\`\`action
{"action":"set_credentials","email":"...","password":"..."}
\`\`\`

חשוב: בקש פרטים בצ'אט פרטי בלבד! בקבוצה, תגיד שישלחו בפרטי.
אל תשלח את הסיסמה בחזרה בתגובה.

## כשהמשתמש מבקש כל פעולת קניות
תגיב בדיוק כך: "חשבון שופרסל עדיין לא מחובר. שלח לי את האימייל והסיסמה של שופרסל ואחבר אותך."

## פעולות זמינות
- {"action":"set_credentials","email":"...","password":"..."}
- {"action":"create_task","title":"...","deadline":"..."}`

/**
 * Process a chat message with conversation history.
 */
export async function processChat(
  messages: ChatMessage[],
  context: UserContext,
): Promise<ChatResult> {
  // Use different prompt when credentials are missing
  const basePrompt = context.hasCredentials ? SYSTEM_PROMPT : NO_CREDS_PROMPT
  const contextBlock = buildContextBlock(context)
  const fullSystem = `${basePrompt}\n\n## מצב נוכחי\n${contextBlock}`

  // Strip action blocks from assistant messages in history — they're bulky
  // and the current state already reflects their result
  const cleanMessages = messages.map(m => {
    if (m.role === 'assistant') {
      return { ...m, content: m.content.replace(/```action\s*\n?[\s\S]*?```/g, '').trim() }
    }
    return m
  }).filter(m => m.content)

  const result = await gemini.chat({
    system: fullSystem,
    messages: cleanMessages,
    maxTokens: 512,
  })

  if (result.error || !result.text) {
    console.error('[ChatProcessor] LLM error:', result.error)
    return { reply: 'שגיאה. נסה שוב.', actions: [] }
  }

  return parseResponse(result.text)
}

function buildContextBlock(ctx: UserContext): string {
  const parts: string[] = []

  if (ctx.displayName) {
    parts.push(`משתמש: ${ctx.displayName}`)
  }

  if (ctx.standingList?.length) {
    const items = ctx.standingList.map(i => `${i.name} x${i.qty}`).join(', ')
    parts.push(`רשימה קבועה: ${items}`)
  } else {
    parts.push('רשימה קבועה: ריקה')
  }

  if (ctx.pendingChanges) {
    const adds = ctx.pendingChanges.add?.length
      ? `הוספות: ${ctx.pendingChanges.add.map(i => `${i.name} x${i.qty}`).join(', ')}`
      : ''
    const removes = ctx.pendingChanges.remove?.length
      ? `הסרות: ${ctx.pendingChanges.remove.join(', ')}`
      : ''
    const pending = [adds, removes].filter(Boolean).join(' | ')
    parts.push(`שינויים השבוע: ${pending || 'אין'}`)
  }

  if (ctx.orderStatus) {
    parts.push(`סטטוס הזמנה: ${ctx.orderStatus}`)
  }

  parts.push(`חשבון שופרסל: ${ctx.hasCredentials ? 'מחובר' : 'לא מחובר'}`)

  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  if (ctx.schedule) {
    parts.push(`לוח זמנים: הזמנה ביום ${DAY_NAMES[ctx.schedule.orderDay]}, משלוח ${ctx.schedule.preferredSlot.day} ${ctx.schedule.preferredSlot.time}, תזכורת ${ctx.schedule.reviewReminderHours} שעות לפני`)
  } else {
    parts.push('לוח זמנים: לא הוגדר')
  }

  if (ctx.tasks?.length) {
    const tasks = ctx.tasks.map(t => `"${t.title}"${t.deadline ? ` (עד ${t.deadline})` : ''}`).join(', ')
    parts.push(`משימות: ${tasks}`)
  }

  return parts.join('\n')
}

/**
 * Parse LLM response — extract plain text reply and any action blocks.
 */
function parseResponse(text: string): ChatResult {
  const actions: ChatAction[] = []

  // Extract ```action/json ... ``` blocks containing {action: ...}
  const actionRegex = /```(?:action|json)\s*\n?([\s\S]*?)```/g
  let match
  while ((match = actionRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      if (parsed.action) {
        actions.push(parsed as ChatAction)
      }
    } catch {
      console.error('[ChatProcessor] Failed to parse action block:', match[1])
    }
  }

  // Remove action blocks from the reply text
  const reply = text.replace(/```(?:action|json)\s*\n?[\s\S]*?```/g, '').trim()

  return { reply, actions }
}
