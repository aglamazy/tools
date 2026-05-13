/**
 * Reproduce the production "Gemini returned empty" failure for the prompt:
 *   "בוא נוסיף כמה מוצרים לשופרסל - רשימה שבועית.\nנתחיל מתירס קפוא"
 *
 * Calls processChat() directly (no Firestore writes) under a synthetic
 * context. Exercises three scenarios:
 *   A) cold (no prior history)
 *   B) production-like history (matches the 11-msg trace from the failing run)
 *   C) production-like history WITHOUT tools (sanity check that text reply works)
 *
 * Each scenario runs N times to surface flake. Reports finishReason / tokens
 * for any empty completions so we can root-cause.
 *
 * Usage: npx tsx scripts/repro-empty-response.ts [--runs=3]
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

const RUNS = (() => {
  const arg = process.argv.find(a => a.startsWith('--runs='))
  if (!arg) return 3
  const n = Number(arg.split('=')[1])
  return Number.isFinite(n) && n > 0 ? n : 3
})()

const FAILING_PROMPT = 'בוא נוסיף כמה מוצרים לשופרסל - רשימה שבועית.\nנתחיל מתירס קפוא'

const PROD_HISTORY = [
  { role: 'user', content: 'טחינה הר ברכה - תבדוק בשתי החנויות' },
  { role: 'assistant', content: 'ok\n\nלא נמצאו תוצאות עבור "טחינה הר ברכה" במקור השפע.' },
  { role: 'user', content: 'צריך לשנות את חלון הזמנים של שופרסל. ביום ראשון - צריך לפתוח הזמנה ליום רביעי' },
  { role: 'assistant', content: 'מגדיר את יום ראשון כיום פתיחת ההזמנה לשופרסל, עם משלוח ביום רביעי.' },
  { role: 'user', content: 'מה יש בהזמנה של שופרסל?' },
  { role: 'assistant', content: 'אין הזמנה פתוחה בשופרסל.' },
  { role: 'user', content: 'איזה יום היום?' },
  { role: 'assistant', content: 'היום יום רביעי, 06/05/2026.' },
  { role: 'user', content: 'אז בוא נפתח למחר.\nאבל תגיד לי קודם מה צריך להכנס..' },
  { role: 'assistant', content: 'הרשימה הקבועה שלך בשופרסל כוללת:\n*   חזה עוף טרי\n*   עוף שלם טרי א.דיל ארוז\n*   גבינת בולגרית 5% גד' },
] as const

type LLMMessage = import('../app/services/llm/types').LLMMessage

async function main() {
  const { processChat } = await import('../app/services/telegram/chatProcessor')

  // Synthetic context — minimal but realistic for a Shufersal-active session.
  const ctx = {
    displayName: 'Yaakov',
    defaultStore: 'shufersal',
    session: { activeStore: 'shufersal' as string | null },
    stores: [
      {
        id: 'shufersal',
        label: 'שופרסל',
        connected: true,
        standingList: [
          { name: 'חזה עוף טרי', qty: 1 },
          { name: 'עוף שלם טרי א.דיל ארוז', qty: 1 },
          { name: 'גבינת בולגרית 5% גד', qty: 1 },
        ],
        pendingChanges: { add: [], remove: [] },
        orderStatus: 'none',
        schedule: { orderDay: 0, preferredSlot: { day: 'רביעי', time: '14:00-16:00' }, reviewReminderHours: 36 },
      },
      {
        id: 'retalix',
        label: 'מקור השפע',
        connected: true,
        standingList: [],
        pendingChanges: { add: [], remove: [] },
        orderStatus: 'review',
      },
    ],
    tasks: [],
  }

  const cold: LLMMessage[] = [{ role: 'user', content: FAILING_PROMPT }]
  const warm: LLMMessage[] = [
    ...PROD_HISTORY.map(m => ({ role: m.role, content: m.content }) as LLMMessage),
    { role: 'user', content: FAILING_PROMPT },
  ]

  await runScenario('A) COLD (no history)', cold, ctx, RUNS)
  await runScenario('B) WARM (prod-like history)', warm, ctx, RUNS)
}

interface SimpleCtx { displayName?: string; defaultStore?: string; session?: { activeStore?: string | null }; stores?: unknown[]; tasks?: unknown[] }

async function runScenario(label: string, messages: LLMMessage[], ctx: SimpleCtx, runs: number) {
  console.log(`\n========== ${label} ==========`)
  const { processChat } = await import('../app/services/telegram/chatProcessor')
  let empties = 0
  let texts = 0
  let calls = 0

  for (let i = 0; i < runs; i++) {
    const start = Date.now()
    try {
      const result = await processChat(messages, ctx as Parameters<typeof processChat>[1])
      const elapsed = Date.now() - start
      const fcs = (result as { actions?: { action: string }[] }).actions || []
      const text = result.reply || ''
      const isEmpty = !text && fcs.length === 0
      if (isEmpty) empties++
      else if (fcs.length) calls++
      else texts++
      console.log(`  run ${i + 1}/${runs} (${elapsed}ms): ` +
        `${isEmpty ? '🚨 EMPTY' : text ? '✓ TEXT' : '✓ CALLS'} ` +
        `text=${(text || '').slice(0, 60).replace(/\n/g, ' ')} ` +
        `calls=${fcs.map(c => c.action).join(',') || 'none'}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  run ${i + 1}/${runs}: ❌ THREW ${msg}`)
    }
  }

  console.log(`  Summary: ${runs} runs → ${empties} empty, ${calls} with calls, ${texts} text-only`)
}

main().catch(e => { console.error(e); process.exit(1) })
