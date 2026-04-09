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
  /** Tasks from Firestore */
  tasks?: { id: string; title: string; completed: boolean; deadline?: string; priority?: string }[]

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
  thinking?: string
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
כשהמשתמש מבקש פעולה, הגב בטקסט טבעי וגם הוסף בלוק JSON לכל פעולה בסוף ההודעה.
**חובה**: השתמש אך ורק בפורמט בלוק action שלנו. אסור להשתמש ב-XML, execute_tool, function_call, או כל פורמט אחר.
כשיש **מספר פריטים** — הוסף **בלוק נפרד לכל פריט**, כך:
\`\`\`action
{"action": "search_product", "query": "חלב", "qty": 2, "target": "pending", "store": "shufersal"}
\`\`\`
\`\`\`action
{"action": "search_product", "query": "לחם", "qty": 1, "target": "pending", "store": "shufersal"}
\`\`\`
\`\`\`action
{"action": "search_product", "query": "ביצים", "qty": 1, "target": "pending", "store": "shufersal"}
\`\`\`

פעולות זמינות (כל פעולה מקבלת שדה "store" אופציונלי):
- {"action":"search_product","query":"חלב","qty":1,"target":"pending","store":"shufersal"} — חפש מוצר. target: "pending" (להזמנה) או "standing" (לרשימה הקבועה)
- {"action":"remove_items","items":["ביצים"],"store":"..."} — הסר מההזמנה השבועית
- {"action":"remove_standing","items":["חלב"],"store":"..."} — הסר מהרשימה קבועה
- {"action":"move_to_standing","items":["מלפפון","עגבניה"],"store":"..."} — העבר מתוספות השבוע לרשימה הקבועה. items יכול להכיל שם חלקי. להעביר הכל: שלח את כל השמות מתוספות השבוע
- {"action":"re_search","query":"קוטג 5%","qty":6,"target":"standing","store":"..."} — חפש מחדש
- {"action":"show_list","store":"..."} — הצג רשימה של חנות ספציפית
- {"action":"clear_pending","store":"..."} — נקה שינויים שבועיים
- {"action":"list_slots","store":"..."} — הצג משבצות משלוח זמינות (בדוק לפני הזמנה אם לא ברור מתי)
- {"action":"trigger_order","day":"...","time":"...","store":"..."} — בצע הזמנה. day: שם יום בעברית ("היום","מחר","ראשון","שני"...) או תאריך מדויק בפורמט DD/MM/YYYY מרשימת המשבצות
- {"action":"cancel_order","store":"..."} — בטל הזמנה פעילה
- {"action":"show_orders","store":"..."} — הצג הזמנות פעילות
- {"action":"set_credentials","email":"...","password":"...","store":"shufersal"} — חבר חשבון שופרסל
- {"action":"set_otp_phone","phone":"054...","store":"retalix"} — חבר חשבון עם SMS (מקור השפע)
- {"action":"verify_otp","otp":"1234","store":"retalix"} — אמת קוד SMS
- {"action":"set_schedule","orderDay":0,"preferredSlot":{"day":"רביעי","time":"14:00-16:00"},"reviewReminderHours":36,"store":"..."} — הגדר לוח זמנים
- {"action":"show_schedule","store":"..."} — הצג לוח זמנים
- {"action":"browse_category","category":"ירקות","store":"..."} — הצג כל המוצרים בקטגוריה (פירות, ירקות, חלב, בשר...). לשאלות כמו "מה יש בירקות?" או "איזה פירות יש?"
- {"action":"set_default_store","store":"..."} — שנה חנות ברירת מחדל
- {"action":"create_task","title":"...","deadline":"YYYY-MM-DD","priority":"low|medium|high","quadrant":"do|schedule|delegate|eliminate"} — צור משימה
- {"action":"list_tasks","query":"..."} — הצג/חפש משימות. query אופציונלי לסינון לפי כותרת
- {"action":"complete_task","id":"xxxx"} — סמן משימה כהושלמה. id = 4 ספרות אחרונות של המזהה
- {"action":"update_task","id":"xxxx","title":"...","deadline":"...","priority":"..."} — ערוך משימה
- {"action":"delete_task","id":"xxxx"} — מחק משימה

## חיבור חנויות
- שופרסל: דורש אימייל וסיסמה → set_credentials
- מקור השפע / רמי לוי (Retalix): דורש מספר טלפון → set_otp_phone → SMS → verify_otp
- כשמשתמש שולח קוד מספרי והמצב מראה otpPending=true, זה קוד SMS → verify_otp

## כללים
- **התגובה חייבת להיות בעברית בלבד** — אסור לכתוב אנגלית בתגובה, גם לא הסברים או הערות
- הודעות קצרות ותמציתיות — זו שיחת טלגרם
- כשמישהו שולח רשימת מוצרים, שלח search_product לכל מוצר בנפרד
- "בלי X" / "השבוע בלי X" = remove_items
- "תמיד" / "כל שבוע" / "לקבוע" = search_product עם target:"standing"
- "תעביר לקבועה" / "הכל לרשימה הקבועה" / "העבר לקבוע" = move_to_standing (העברה מתוספות השבוע לרשימה קבועה, בלי חיפוש מחדש)
- כשחנות לא מחוברת, הסבר שצריך לחבר ובקש פרטים מתאימים (אימייל/סיסמה או טלפון)
- פרטי התחברות רק בצ'אט פרטי! בקבוצה, תגיד שישלחו בפרטי
- אל תשלח סיסמה/קוד בחזרה בתגובה
- "תבטל הזמנה" = cancel_order (בקש אישור לפני ביטול!)
- כשמשתמש מבקש לראות רשימה — **חובה** להשתמש ב-show_list. **אסור** לרשום פריטים בתגובה — אפילו לא חלקית. הרשימה המפורטת מגיעה אוטומטית מהמערכת. כתוב רק משפט קצר כמו "הנה הרשימה:" ותו לא
- כשמשתמש מבקש רשימות של מספר חנויות — שלח show_list נפרד לכל חנות (בלוק action נפרד לכל אחת)
- כשמשתמש שואל על מחיר, השתמש ב-search_product — התוצאות כוללות מחירים
- אם ההודעה היא שיחה רגילה — תגיב בטבעיות, בלי בלוק action
- אם לא ברור מה המשתמש רוצה, שאל — אל תנחש

## לאחר קבלת תוצאות list_slots
כאשר תוצאות משבצות כבר מופיעות בהיסטוריית השיחה (ממשת לסיבוב שני):
- **אל תרשום את רשימת המשבצות שוב** — כבר נראתה (או תוצג) למשתמש
- **השתמש אך ורק בתאריכים שמופיעים ממש ברשימה** — אסור להמציא תאריכים שלא קיימים ברשימה
- נתח את הנתונים: בדוק האם התאריך/יום שביקשו מופיע ברשימה (השווה לתאריך היום שמצוין בהקשר)
  - **אין לתאריך המבוקש** — ציין זאת בקצרה ושאל אם לזמין לתאריך הקרוב ביותר שכן מופיע ברשימה
  - **יש** — אם המשתמש כבר ביקש לזמין, בצע trigger_order עם **התאריך המדויק מהרשימה** (DD/MM/YYYY)
- כשמפעיל trigger_order: כתוב רק "מזמין..." — **אל תודיע על הצלחה לפני שהמערכת אישרה** (התוצאה תוצג אוטומטית)
- דוגמה: אין להיום, קרוב ביותר שישי 17/04/2026 בשעה 8:00, ומשתמש ביקש לזמין →
  \`\`\`action
  {"action":"trigger_order","day":"17/04/2026","time":"8:00","store":"retalix"}
  \`\`\``

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

  console.log('\n========== FULL SYSTEM PROMPT ==========')
  console.log(fullSystem)
  console.log('========== MESSAGES ==========')
  cleanMessages.forEach((m, i) => console.log(`[${i}] ${m.role}: ${m.content}`))
  console.log('========================================\n')

  const result = await gemini.chat({
    system: fullSystem,
    messages: cleanMessages,
    maxTokens: 1024,
  })

  console.log('[ChatProcessor] LLM reply:', result.text)
  console.log('[ChatProcessor] LLM error:', result.error)

  if (result.error || !result.text) {
    console.error('[ChatProcessor] LLM error:', result.error)
    return { reply: 'שגיאה. נסה שוב.', actions: [] }
  }

  const parsed = parseResponse(result.text)
  // Prefer inline THOUGHT: from text; fall back to Gemini thought parts
  return { ...parsed, thinking: parsed.thinking ?? result.thinking }
}

function buildContextBlock(ctx: UserContext): string {
  const parts: string[] = []
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

  // Always include today's date so the bot can reason about "today" / "tomorrow"
  const now = new Date()
  const todayStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  const todayDayName = DAY_NAMES[now.getDay()]
  parts.push(`היום: ${todayDayName} ${todayStr}`)

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
    parts.push('\n## משימות')
    ctx.tasks.forEach(t => {
      const status = t.completed ? '✓' : '○'
      const deadline = t.deadline ? ` עד ${t.deadline}` : ''
      const priority = t.priority && t.priority !== 'medium' ? ` [${t.priority}]` : ''
      parts.push(`${status} [${t.id.slice(-4)}] ${t.title}${deadline}${priority}`)
    })
  } else {
    parts.push('\nמשימות: אין')
  }

  return parts.join('\n')
}

interface SearchResultItem {
  catalogId: string
  name: string
  brand: string
  price: string
  unitPrice: string
  sellingUnitId?: number
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

  // Extract inline THOUGHT: ... block (Gemini 2.5 Flash embeds thinking as text)
  // Format: "THOUGHT: ...\n\n[reply]" — split on the first blank line
  let thinking: string | undefined
  let bodyText = text
  if (/^THOUGHT:/i.test(text)) {
    const blankLine = text.indexOf('\n\n')
    if (blankLine !== -1) {
      thinking = text.slice(0, blankLine).replace(/^THOUGHT:\s*/i, '').trim()
      bodyText = text.slice(blankLine + 2).trim()
    } else {
      // No blank line — entire text is thought, no separate reply
      thinking = text.replace(/^THOUGHT:\s*/i, '').trim()
      bodyText = ''
    }
  }

  // Remove action blocks and any stray XML tool calls from the reply text
  const reply = bodyText
    .replace(/```(?:action|json)\s*\n?[\s\S]*?```/g, '')
    .replace(/<execute_tool>[\s\S]*?<\/execute_tool>/gi, '')
    .replace(/<execute_tool>[\s\S]*/gi, '') // unclosed tag
    .trim()

  return { reply, thinking, actions }
}
