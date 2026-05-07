/**
 * Chat processor — sends system prompt + conversation history to Gemini
 * with native function calling for actions.
 */

import { GeminiClient } from '@/app/services/llm/geminiClient'
import { ACTION_DECLARATIONS } from './actionDeclarations'
import type { LLMMessage } from '@/app/services/llm/types'
import { VARIANT_CONFIG } from '@/app/config/variants'

const gemini = new GeminiClient()

/** Persisted chat history shape — plain user/assistant text. Tool calls/results live only in the working in-turn conversation. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StoreContext {
  id: string
  label: string
  connected: boolean
  /** Optional chain website URL — surfaced to the LLM so it can hand it out. */
  siteOrigin?: string
  standingList?: { name: string; qty: number; unit?: string }[]
  pendingChanges?: {
    add: { name: string; qty: number; unit?: string; validTo?: string }[]
    remove: { name: string; validTo?: string }[]
  }
  orderStatus?: string
  orderId?: string
  schedule?: {
    orderDay: number
    preferredSlot: { day: string; time: string }
    reviewReminderHours: number
  } | null
  otpPending?: boolean
}

export interface UserContext {
  displayName?: string
  stores?: StoreContext[]
  defaultStore?: string
  session?: { activeStore?: string | null }
  tasks?: { id: string; title: string; completed: boolean; deadline?: string; priority?: string }[]

  // Legacy
  /** @deprecated use stores instead */
  standingList?: { name: string; qty: number; unit?: string }[]
  /** @deprecated use stores instead */
  pendingChanges?: { add: { name: string; qty: number; unit?: string; validTo?: string }[]; remove: { name: string; validTo?: string }[] }
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
  /**
   * True when every step of the in-line recovery ladder failed. The caller
   * decides what to do next: Telegram webhook enqueues + panics; web route
   * returns 503 + panics; cron records the failed attempt for backoff.
   */
  llmExhausted?: boolean
  /** Server-observed upstream error string from the last LLM attempt. */
  upstreamError?: string
}

/**
 * Optional progress callback for long-running recovery (e.g. between retry 2
 * and retry 3 we tell the user via Telegram that we're still trying). Called
 * with a Hebrew string; the caller is responsible for delivering it.
 */
export type ChatStatusReporter = (msg: string) => Promise<void>

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export interface ChatAction {
  action: string
  [key: string]: unknown
}

const SYSTEM_PROMPT = `אתה ${VARIANT_CONFIG.botName} — עוזר משפחתי לניהול קניות ומשימות. אתה מדבר בעברית טבעית, ידידותי וקצר.

## מה אתה יכול לעשות
- ניהול רשימות קניות שבועיות בחנויות שונות (רשימת החנויות הנתמכות מופיעה למטה בהקשר)
- ניהול רשימה קבועה (מוצרים שחוזרים כל שבוע) — לכל חנות בנפרד
- יצירת משימות ותזכורות
- מענה על שאלות לגבי הרשימה והמשימות

## חנויות
כל פעולת קניות מכוונת לחנות ספציפית. **חובה** לשלוח store בכל קריאה לפונקציה.
- אם המשתמש מזכיר שם חנות — השתמש בה **וקרא ל-set_session עם activeStore**
- אם לא מזכיר חנות — השתמש ב-activeStore מהסשן (אם יש), אחרת חנות ברירת המחדל
- מיפוי שמות: "שופרסל" → store="shufersal", "מקור השפע" → store="retalix". שאר החנויות — store="rexail_<id>" לפי הרשימה בהקשר.
- כל חנות שמופיעה ברשימה "חנויות נתמכות" בהקשר היא חנות פעילה, ואפשר לחפש בה מוצרים, לפתוח בה הזמנה, לקבוע בה לוח זמנים, וכו'. כשמשתמש שואל "אילו חנויות?" — תן את הרשימה המלאה מההקשר עם השם וכתובת האתר, נקודה.
- הסטטוס "מחובר" ליד חנות מציין שהמשתמש הזה כבר התחבר לחנות. בלי הסטטוס הזה — המשתמש פשוט עוד לא חיבר את החשבון שלו, וזה לא קשור לזה שהחנות נתמכת או לא.

## שאלות חוצות חנויות (show_orders)
כאשר המשתמש שואל על הזמנות באופן כללי בלי לציין חנות — למשל "יש הזמנות פתוחות?", "יש לי הזמנות?", "מה פתוח אצלי?" — קרא ל-show_orders **בלי להעביר store**. המערכת תבדוק את כל החנויות המחוברות ותחזיר תשובה משולבת. אל תסתמך על activeStore/ברירת מחדל לשאלה כזו.
כאשר המשתמש מציין חנות מפורשות ("יש הזמנות בשופרסל?") — העבר store כרגיל.

## סשן (session state)
המצב הנוכחי של הסשן מופיע למטה. כשמשהו משתנה, קרא ל-set_session כדי לעדכן.
- activeStore: החנות הפעילה בשיחה (null = ברירת מחדל)

## חיבור חנויות
- שופרסל: דורש אימייל וסיסמה → set_credentials
- מקור השפע (Retalix): דורש מספר טלפון → set_otp_phone → SMS → verify_otp
- כשמשתמש שולח קוד מספרי והמצב מראה otpPending=true, זה קוד SMS → verify_otp

## כללים
- כשמישהו שולח רשימת מוצרים (חלב, לחם, ביצים), קרא ל-search_product **עבור כל מוצר בנפרד** באותה תגובה
- **התגובה חייבת להיות בעברית בלבד**
- הודעות קצרות ותמציתיות — זו שיחת טלגרם
- כשמישהו שולח רשימת מוצרים, קרא ל-search_product לכל מוצר בנפרד
- "בלי X" / "השבוע בלי X" = remove_items
- "תמיד" / "כל שבוע" / "לקבוע" = search_product עם target:"standing"
- "תעביר לקבועה" = move_to_standing (העברה, בלי חיפוש מחדש)
- כשחנות לא מחוברת, הסבר שצריך לחבר ובקש פרטים מתאימים
- פרטי התחברות רק בצ'אט פרטי! בקבוצה, תגיד שישלחו בפרטי
- אל תשלח סיסמה/קוד בחזרה בתגובה
- "תבטל הזמנה" = cancel_order (בקש אישור לפני ביטול!)
- כשמשתמש מבקש לראות רשימה — **חובה** לקרוא ל-show_list. **אסור** לרשום פריטים בתגובה
- כששואלים על מוצר שכבר נמצא ברשימה — השתמש ב-product_details (לא search_product)
- כשמשתמש שואל על מחיר מוצר שאינו ברשימה, או רוצה להוסיף מוצר — השתמש ב-search_product
- אם ההודעה היא שיחה רגילה — תגיב בטבעיות, בלי קריאות לפונקציות
- אם לא ברור מה המשתמש רוצה, שאל — אל תנחש
- **חובה תמיד להחזיר תשובה** (טקסט או קריאה לפונקציה). לעולם אל תשאיר את ההודעה ריקה. אם אין מה לעשות, ענה לפחות באישור קצר ("אוקיי", "הבנתי")

## הזמנה פתוחה (orderStatus: active/review)
כשיש הזמנה פתוחה בחנות:
- הוספת מוצר → search_product עם target:"pending" — המוצר יתווסף גם לעגלה הפתוחה אוטומטית
- הסרת מוצר → remove_items — מוסיר גם מהעגלה הפתוחה
- "מה בהזמנה?" / "תראה לי ההזמנה" → show_cart (לא show_list) — מציג תוכן עגלה בפועל
- אל תפתח הזמנה חדשה כשיש כבר הזמנה פתוחה

## תוקף שינויים ברשימה השבועית
שינויים לפנינג (add/remove להזמנה השבועית) יכולים לכלול תוקף דרך השדה validTo:
- ללא validTo = רק להזמנה הקרובה, נמחק אחרי.
- עם validTo (פורמט YYYY-MM-DD) = פעיל עד אותו תאריך, חל על כל הזמנה עד אז.
המרת ביטויים לתאריך (חשב ידנית מתוך "היום" שבהקשר):
- "השבוע" / "הזמנה הקרובה" = ללא validTo
- "לשבועיים" / "שבועיים הקרובים" = היום + 14 ימים
- "לחודש" / "חודש הקרוב" = היום + 30 ימים
- "עד <תאריך>" = אותו תאריך
- "תמיד" / "לקבוע" / "כל שבוע" = זה לא pending — השתמש ב-target=standing (search_product) או ב-remove_standing במקום
חשוב: התאריך של היום מופיע בהקשר למטה תחת "היום". חשב ממנו.

## לאחר קבלת תוצאות list_slots
כאשר תוצאות משבצות כבר מופיעות בהיסטוריית השיחה:
- **אל תרשום את רשימת המשבצות שוב** — כבר נראתה למשתמש
- **השתמש אך ורק בתאריכים שמופיעים ברשימה** — אסור להמציא תאריכים
- אם אין לתאריך המבוקש — ציין זאת ושאל אם לזמין לתאריך הקרוב ביותר

## פתיחת הזמנה (trigger_order)
- כשהמשתמש מבקש לפתוח הזמנה — **קרא ל-trigger_order ישירות**, בלי לכתוב טקסט מקדים כמו "מזמין..."
- המערכת תבצע את ההזמנה ותחזיר תוצאה עם מספר הזמנה ופרטי משלוח (או הודעת שגיאה)
- אחרי שהמערכת מחזירה תוצאה — סכם למשתמש: מספר הזמנה, חלון משלוח, וכל פריטים שלא נוספו (אם יש). תהיה תמציתי.
- **אסור להודיע על הצלחה לפני שהמערכת אישרה.** רק אחרי שהיא מחזירה את האישור.

## כלל יסוד — אל תמציא נתונים
אסור להמציא מספרי הזמנה, שמות מוצרים, מחירים, כמויות או תאריכים. אם צריך ערך כזה — תקרא לכלי שמחזיר אותו. אם כלי כבר החזיר ערך בשיחה הזו — תצטט אותו כפי שהוא, אל תייצר אותו מחדש.`

const MAX_HISTORY_CHARS = 12000

/** Drop oldest messages until total content size is under the cap. Never trim the tail (in-flight messages). */
function capBySize(messages: LLMMessage[], maxChars = MAX_HISTORY_CHARS): LLMMessage[] {
  const sizeOf = (m: LLMMessage): number => {
    if (m.role === 'tool') return m.toolResults.reduce((n, r) => n + (typeof r.result === 'string' ? r.result.length : JSON.stringify(r.result).length) + r.name.length, 0)
    if (m.role === 'assistant') return (m.content?.length || 0) + (m.toolCalls?.reduce((n, c) => n + c.name.length + JSON.stringify(c.args).length, 0) || 0)
    return m.content.length
  }
  let total = messages.reduce((n, m) => n + sizeOf(m), 0)
  let start = 0
  while (total > maxChars && start < messages.length - 1) {
    total -= sizeOf(messages[start])
    start++
  }
  return messages.slice(start)
}

function isEmptyResponse(r: { text: string; functionCalls?: unknown[]; error?: string }): boolean {
  return !r.text && !r.functionCalls?.length && !!r.error
}

/**
 * Call Gemini for one turn. Takes an LLMMessage[] that can include tool-call
 * and tool-result messages so the model sees the full agentic trace.
 * Strips any legacy ```action``` blocks from old persisted assistant text.
 * Proactively caps history by size; on empty response, compacts and retries.
 */
export async function processChat(
  messages: LLMMessage[],
  context: UserContext,
  onStatus?: ChatStatusReporter,
): Promise<ChatResult> {
  const contextBlock = buildContextBlock(context)
  const fullSystem = `${SYSTEM_PROMPT}\n\n## מצב נוכחי\n${contextBlock}`

  const cleanMessages: LLMMessage[] = capBySize(messages
    .map(m => {
      if (m.role === 'assistant' && typeof m.content === 'string' && m.content) {
        return { ...m, content: m.content.replace(/```action\s*\n?[\s\S]*?```/g, '').trim() }
      }
      return m
    })
    // Drop only text-only assistant messages that are now empty; keep tool-call messages.
    .filter(m => !(m.role === 'assistant' && !m.toolCalls?.length && !m.content))
    .filter(m => !(m.role === 'user' && !m.content)))

  console.log('\n========== SYSTEM PROMPT ==========')
  console.log(fullSystem.slice(0, 500) + '...')
  console.log('========== MESSAGES ==========')
  cleanMessages.forEach((m, i) => {
    if (m.role === 'tool') {
      console.log(`[${i}] tool: ${m.toolResults.map(r => r.name).join(',')}`)
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      console.log(`[${i}] assistant calls: ${m.toolCalls.map(c => c.name).join(',')}`)
    } else {
      console.log(`[${i}] ${m.role}: ${(m.content || '').slice(0, 100)}`)
    }
  })
  console.log('========================================\n')

  // Gemini-2.5-flash occasionally returns finishReason=STOP with 0 parts and 0
  // output tokens — the router decided "nothing to say" before generation. The
  // big tool array (~2000 tokens of Hebrew function declarations) is a strong
  // trigger. Recovery ladder, escalating with deliberate spacing so transient
  // upstream pressure has a chance to clear:
  //   1. Immediate retry @ temp=0 (deterministic resample; covers sampling flake).
  //   2. Sleep 1s, retry @ temp=0 with tools.
  //   3. Tell the user via Telegram we're still trying, sleep 5s, retry WITHOUT
  //      tools + nudge prompt — forces a plain-text reply.
  // If all three fail, the caller queues the message for cron-driven retry.
  let result = await callLLM(cleanMessages, 0.7, /*withTools*/ true)
  if (isEmptyResponse(result)) {
    console.warn(`[ChatProcessor] Empty Gemini response (${result.error}). Retry 1: sleep 1s + temperature=0.`)
    await sleep(1000)
    result = await callLLM(cleanMessages, 0, /*withTools*/ true)
  }
  if (isEmptyResponse(result)) {
    console.warn(`[ChatProcessor] Still empty. Retry 2: status notice + sleep 5s + drop tools + nudge.`)
    if (onStatus) {
      try { await onStatus('🤖 המערכת מתקשה לענות, מנסה שוב...') }
      catch (notifyErr) { console.warn('[ChatProcessor] onStatus failed:', notifyErr) }
    }
    await sleep(5000)
    const nudged: LLMMessage[] = [
      ...cleanMessages,
      // Without tools, naive phrasings like "search X" make Gemini describe
      // tool calls as text (e.g. `search_product(query='...')`). Explicitly
      // forbid that pseudocode pattern.
      { role: 'user', content: 'תגיב למשתמש בעברית בקצרה ובשפה טבעית. אם אינך בטוח מה המשתמש רוצה, שאל שאלת הבהרה. **אסור** לכתוב קריאות לפונקציות בסגנון `func_name(...)` — תענה רק במשפטים בעברית רגילה.' },
    ]
    result = await callLLM(nudged, 0, /*withTools*/ false)
  }

  async function callLLM(msgs: LLMMessage[], temperature: number, withTools: boolean) {
    return gemini.chatWithTools({
      system: fullSystem,
      messages: msgs,
      maxTokens: 2048,
      tools: withTools ? ACTION_DECLARATIONS : undefined,
      temperature,
    })
  }

  console.log('[ChatProcessor] text:', result.text?.slice(0, 100))
  console.log('[ChatProcessor] functionCalls:', result.functionCalls?.map(fc => `${fc.name}(${JSON.stringify(fc.args)})`).join(', ') || 'none')
  console.log('[ChatProcessor] error:', result.error)

  // Last-resort: every recovery step (immediate, sleep+temp=0, sleep+drop-tools)
  // failed. Signal `llmExhausted` and surface the upstream error verbatim so
  // the caller (webhook / web route / cron) can decide whether to enqueue,
  // return 503, or fire admin panic.
  if (result.error && !result.text && !result.functionCalls?.length) {
    console.error('[ChatProcessor] LLM error after all retries:', result.error)
    return {
      reply: `⚠️ המערכת לא מגיבה כרגע. נסה שוב בעוד מספר דקות.`,
      actions: [],
      llmExhausted: true,
      upstreamError: result.error,
    }
  }

  // Map function calls directly to actions — no regex parsing needed
  const actions: ChatAction[] = (result.functionCalls || []).map(fc => ({
    action: fc.name,
    ...fc.args,
  }))

  // Gemini sometimes returns only function calls with no text. Also: when
  // the retry-without-tools path runs, Gemini occasionally describes what
  // it WOULD have called as raw pseudocode. Strip those lines so they
  // never reach the user — known offenders look like:
  //   set_session(activeStore='...')
  //   search_product(store='...', query='...')
  // The tool name list comes from ACTION_DECLARATIONS so this stays in sync
  // even as new tools are added.
  const toolNamePattern = ACTION_DECLARATIONS.map(a => a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const pseudocodeLine = new RegExp(`^\\s*(?:${toolNamePattern})\\s*\\([^\\n]*\\)?\\s*$`, 'gm')
  const reply = (result.text || '').replace(pseudocodeLine, '').replace(/\n{3,}/g, '\n\n').trim()

  return {
    reply,
    thinking: result.thinking,
    actions,
  }
}

function buildContextBlock(ctx: UserContext): string {
  const parts: string[] = []
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

  const now = new Date()
  const todayStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  const todayDayName = DAY_NAMES[now.getDay()]
  parts.push(`היום: ${todayDayName} ${todayStr}`)

  if (ctx.displayName) parts.push(`משתמש: ${ctx.displayName}`)

  // Supported stores — every Rexail-powered chain plus Shufersal. The LLM
  // should rely on this list verbatim rather than its training memory.
  // Includes the chain website so the LLM can hand it to users on request.
  parts.push('\n## חנויות נתמכות')
  if (ctx.stores?.length) {
    for (const s of ctx.stores) {
      const status = s.connected ? ' — מחובר' : ''
      parts.push(`- ${s.label} (${s.id})${s.siteOrigin ? ` — ${s.siteOrigin}` : ''}${status}`)
    }
  }

  // Session state
  const activeStore = ctx.session?.activeStore || ctx.defaultStore || null
  parts.push(`\n## סשן`)
  parts.push(`activeStore: ${activeStore || 'null'} (${activeStore ? 'חנות פעילה' : 'ברירת מחדל'})`)

  if (ctx.stores?.length) {
    parts.push(`\nחנות ברירת מחדל: ${ctx.defaultStore || 'לא נבחרה'}`)
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
          const fmt = (name: string, validTo?: string) => validTo ? `${name} (עד ${validTo})` : name
          const adds = store.pendingChanges.add?.length
            ? `הוספות: ${store.pendingChanges.add.map(i => fmt(i.name, i.validTo)).join(', ')}`
            : ''
          const removes = store.pendingChanges.remove?.length
            ? `הסרות: ${store.pendingChanges.remove.map(r => fmt(r.name, r.validTo)).join(', ')}`
            : ''
          const pending = [adds, removes].filter(Boolean).join(' | ')
          if (pending) parts.push(`שינויים השבוע: ${pending}`)
        }
        if (store.orderStatus) {
          const orderLine = store.orderId
            ? `סטטוס הזמנה: ${store.orderStatus} (#${store.orderId})`
            : `סטטוס הזמנה: ${store.orderStatus}`
          parts.push(orderLine)
        }
        if (store.schedule) {
          parts.push(`לוח זמנים: הזמנה ביום ${DAY_NAMES[store.schedule.orderDay]}, משלוח ${store.schedule.preferredSlot.day} ${store.schedule.preferredSlot.time}, תזכורת ${store.schedule.reviewReminderHours} שעות לפני`)
        }
      }
    }
  } else {
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
 * Smart filter: ask LLM to rank/filter search results by user intent.
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
