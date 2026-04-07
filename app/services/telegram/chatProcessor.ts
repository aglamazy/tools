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

export interface StoreContext {
  id: string
  label: string
  connected: boolean
  standingList?: { name: string; qty: number; unit?: string }[]
  pendingChanges?: { add: { name: string; qty: number; unit?: string }[]; remove: string[] }
  orderStatus?: string
  schedule?: {
    orderDay: number
    preferredSlot: { day: string; time: string }
    reviewReminderHours: number
  } | null
  otpPending?: boolean
}

export interface UserContext {
  displayName?: string
  /** All configured stores */
  stores?: StoreContext[]
  /** Default store ID */
  defaultStore?: string
  /** Upcoming tasks */
  tasks?: { title: string; deadline?: string }[]

  // Legacy — kept for backward compat during migration
  /** @deprecated use stores instead */
  standingList?: { name: string; qty: number; unit?: string }[]
  /** @deprecated use stores instead */
  pendingChanges?: { add: { name: string; qty: number; unit?: string }[]; remove: string[] }
  /** @deprecated use stores instead */
  orderStatus?: string
  /** @deprecated use stores instead */
  schedule?: {
    orderDay: number
    preferredSlot: { day: string; time: string }
    reviewReminderHours: number
  } | null
  /** @deprecated use stores instead */
  hasCredentials?: boolean
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
- ניהול רשימות קניות שבועיות בחנויות שונות (שופרסל, מקור השפע, ועוד)
- ניהול רשימה קבועה (מוצרים שחוזרים כל שבוע) — לכל חנות בנפרד
- יצירת משימות ותזכורות
- מענה על שאלות לגבי הרשימה והמשימות

## חנויות
כל פעולת קניות מכוונת לחנות ספציפית. הוסף "store" לכל פעולת חנות.
- אם המשתמש מזכיר שם חנות (שופרסל, מקור השפע, רמי לוי...) — השתמש בה
- אם לא מזכיר חנות — השתמש בחנות ברירת המחדל (מצוין במצב הנוכחי)
- המשתמש יכול לשאול "מה ברשימה של שופרסל?" או "תוסיף ביצים למקור השפע"

## איך לבצע פעולות
כשהמשתמש מבקש פעולה, הגב בטקסט טבעי וגם הוסף בלוק JSON בסוף ההודעה בפורמט:
\`\`\`action
{"action": "...", "store": "shufersal", ...}
\`\`\`

פעולות זמינות (כל פעולה מקבלת שדה "store" אופציונלי):
- {"action":"search_product","query":"חלב","qty":1,"target":"pending","store":"shufersal"} — חפש מוצר. target: "pending" (להזמנה) או "standing" (לרשימה הקבועה)
- {"action":"remove_items","items":["ביצים"],"store":"..."} — הסר מההזמנה השבועית
- {"action":"remove_standing","items":["חלב"],"store":"..."} — הסר מהרשימה קבועה
- {"action":"move_to_standing","items":["מלפפון","עגבניה"],"store":"..."} — העבר מתוספות השבוע לרשימה הקבועה. items יכול להכיל שם חלקי. להעביר הכל: שלח את כל השמות מתוספות השבוע
- {"action":"re_search","query":"קוטג 5%","qty":6,"target":"standing","store":"..."} — חפש מחדש
- {"action":"show_list","store":"..."} — הצג רשימה של חנות ספציפית
- {"action":"clear_pending","store":"..."} — נקה שינויים שבועיים
- {"action":"trigger_order","day":"...","time":"...","store":"..."} — בצע הזמנה
- {"action":"cancel_order","store":"..."} — בטל הזמנה פעילה
- {"action":"show_orders","store":"..."} — הצג הזמנות פעילות
- {"action":"set_credentials","email":"...","password":"...","store":"shufersal"} — חבר חשבון שופרסל
- {"action":"set_otp_phone","phone":"054...","store":"retalix"} — חבר חשבון עם SMS (מקור השפע)
- {"action":"verify_otp","otp":"1234","store":"retalix"} — אמת קוד SMS
- {"action":"set_schedule","orderDay":0,"preferredSlot":{"day":"רביעי","time":"14:00-16:00"},"reviewReminderHours":36,"store":"..."} — הגדר לוח זמנים
- {"action":"show_schedule","store":"..."} — הצג לוח זמנים
- {"action":"browse_category","category":"ירקות","store":"..."} — הצג כל המוצרים בקטגוריה (פירות, ירקות, חלב, בשר...). לשאלות כמו "מה יש בירקות?" או "איזה פירות יש?"
- {"action":"set_default_store","store":"..."} — שנה חנות ברירת מחדל
- {"action":"create_task","title":"...","deadline":"..."} — צור משימה (לא קשור לחנות)
- {"action":"list_tasks"} — הצג משימות

## חיבור חנויות
- שופרסל: דורש אימייל וסיסמה → set_credentials
- מקור השפע / רמי לוי (Retalix): דורש מספר טלפון → set_otp_phone → SMS → verify_otp
- כשמשתמש שולח קוד מספרי והמצב מראה otpPending=true, זה קוד SMS → verify_otp

## כללים
- הודעות קצרות ותמציתיות — זו שיחת טלגרם
- כשמישהו שולח רשימת מוצרים, שלח search_product לכל מוצר בנפרד
- "בלי X" / "השבוע בלי X" = remove_items
- "תמיד" / "כל שבוע" / "לקבוע" = search_product עם target:"standing"
- "תעביר לקבועה" / "הכל לרשימה הקבועה" / "העבר לקבוע" = move_to_standing (העברה מתוספות השבוע לרשימה קבועה, בלי חיפוש מחדש)
- כשחנות לא מחוברת, הסבר שצריך לחבר ובקש פרטים מתאימים (אימייל/סיסמה או טלפון)
- פרטי התחברות רק בצ'אט פרטי! בקבוצה, תגיד שישלחו בפרטי
- אל תשלח סיסמה/קוד בחזרה בתגובה
- "תבטל הזמנה" = cancel_order (בקש אישור לפני ביטול!)
- כשמשתמש מבקש לראות רשימה (show_list) או הזמנות (show_orders) — לעולם אל תפרט פריטים בתגובה שלך! כתוב רק "הנה הרשימה:" או "בודק הזמנות..." — הפירוט מגיע אוטומטית מהמערכת. אל תמציא רשימה משלך
- כשאתה מציג מוצרים בטקסט (לא דרך show_list), תמיד הצג כרשימה עם תבליטים (•) ועם יחידות (ק"ג, יח' וכו') אם יש
- כשמשתמש שואל על מחיר, השתמש ב-search_product — התוצאות כוללות מחירים
- אם ההודעה היא שיחה רגילה — תגיב בטבעיות, בלי בלוק action
- אם לא ברור מה המשתמש רוצה, שאל — אל תנחש`

// NO_CREDS_PROMPT is no longer needed — the main SYSTEM_PROMPT handles
// unconnected stores dynamically via context block showing store.connected=false

/**
 * Process a chat message with conversation history.
 */
export async function processChat(
  messages: ChatMessage[],
  context: UserContext,
): Promise<ChatResult> {
  const basePrompt = SYSTEM_PROMPT
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
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

  if (ctx.displayName) parts.push(`משתמש: ${ctx.displayName}`)

  // Multi-store context
  if (ctx.stores?.length) {
    parts.push(`חנות ברירת מחדל: ${ctx.defaultStore || 'לא נבחרה'}`)
    for (const store of ctx.stores) {
      parts.push(`\n### ${store.label} (${store.id})`)
      parts.push(`חיבור: ${store.connected ? 'מחובר' : 'לא מחובר'}`)
      if (store.otpPending) parts.push('ממתין לקוד SMS (otpPending=true)')
      if (store.connected) {
        if (store.standingList?.length) {
          parts.push(`רשימה קבועה (${store.standingList.length} פריטים): ${store.standingList.map(i => i.name).join(', ')}`)
        } else {
          parts.push('רשימה קבועה: ריקה')
        }
        if (store.pendingChanges) {
          const adds = store.pendingChanges.add?.length
            ? `הוספות: ${store.pendingChanges.add.map(i => i.name).join(', ')}`
            : ''
          const removes = store.pendingChanges.remove?.length
            ? `הסרות: ${store.pendingChanges.remove.join(', ')}`
            : ''
          const pending = [adds, removes].filter(Boolean).join(' | ')
          if (pending) parts.push(`שינויים השבוע: ${pending}`)
        }
        if (store.orderStatus) parts.push(`סטטוס הזמנה: ${store.orderStatus}`)
        if (store.schedule) {
          parts.push(`לוח זמנים: הזמנה ביום ${DAY_NAMES[store.schedule.orderDay]}, משלוח ${store.schedule.preferredSlot.day} ${store.schedule.preferredSlot.time}, תזכורת ${store.schedule.reviewReminderHours} שעות לפני`)
        }
      }
    }
  } else {
    // Legacy single-store fallback
    if (ctx.standingList?.length) {
      parts.push(`רשימה קבועה (${ctx.standingList.length} פריטים): ${ctx.standingList.map(i => i.name).join(', ')}`)
    }
    parts.push(`חשבון שופרסל: ${ctx.hasCredentials ? 'מחובר' : 'לא מחובר'}`)
    if (ctx.schedule) {
      parts.push(`לוח זמנים: הזמנה ביום ${DAY_NAMES[ctx.schedule.orderDay]}, משלוח ${ctx.schedule.preferredSlot.day} ${ctx.schedule.preferredSlot.time}`)
    }
  }

  if (ctx.tasks?.length) {
    const tasks = ctx.tasks.map(t => `"${t.title}"${t.deadline ? ` (עד ${t.deadline})` : ''}`).join(', ')
    parts.push(`\nמשימות: ${tasks}`)
  }

  return parts.join('\n')
}

interface SearchResultItem {
  catalogId: string
  name: string
  brand: string
  price: string
  unitPrice: string
}

/**
 * Smart filter: ask LLM to rank/filter Shufersal results based on what the user actually wants.
 * Returns filtered+reordered results and an optional comment.
 */
export async function filterSearchResults(
  userQuery: string,
  results: SearchResultItem[],
): Promise<{ filtered: SearchResultItem[]; comment: string }> {
  if (results.length <= 2) return { filtered: results, comment: '' }

  const resultsList = results.map((r, i) =>
    `[${i}] ${r.name} | ${r.brand} — ${r.price}₪ (${r.unitPrice})`
  ).join('\n')

  const prompt = `המשתמש חיפש: "${userQuery}"
תוצאות מהחנות:
${resultsList}

החזר JSON בלבד:
{"indices": [0, 2, 5], "comment": "..."}

indices = אינדקסים של המוצרים הרלוונטיים ביותר, מסודרים לפי רלוונטיות. סנן מוצרים שלא מתאימים לכוונת המשתמש.
comment = הערה קצרה אם יש מוצרים שלא נמצאו או הצעה לחיפוש אחר. ריק אם הכל בסדר.

דוגמה: אם המשתמש חיפש "גבינה צהובה בלוק" ויש תוצאות של פרוסות וגם בלוקים, החזר רק את הבלוקים.`

  try {
    const result = await gemini.chat({
      system: 'אתה מסנן תוצאות חיפוש. החזר JSON בלבד, בלי טקסט נוסף.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
    })

    if (!result.text) return { filtered: results, comment: '' }

    // Extract JSON from response (might be wrapped in ```json)
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { filtered: results, comment: '' }

    const parsed = JSON.parse(jsonMatch[0]) as { indices: number[]; comment: string }
    const filtered = parsed.indices
      .filter(i => i >= 0 && i < results.length)
      .map(i => results[i])

    if (filtered.length === 0) return { filtered: results, comment: parsed.comment || '' }
    return { filtered, comment: parsed.comment || '' }
  } catch (err) {
    console.error('[ChatProcessor] Filter search failed:', err)
    return { filtered: results, comment: '' }
  }
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
