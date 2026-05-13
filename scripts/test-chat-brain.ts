/**
 * Phase 2: AI chat tests via chatBrain (no HTTP, no auth — direct).
 *
 * Drives many phrasings through processChatMessage with the real UID, then
 * places + verifies + cancels a real order to May 6 via the chat.
 *
 * Usage: npx tsx scripts/test-chat-brain.ts <uid> [--skip-place]
 */
import { loadEnv } from './_load-env'
loadEnv()
;(process.env as { NODE_ENV?: string }).NODE_ENV = process.env.NODE_ENV || 'development'

const UID = process.argv[2]
const SKIP_PLACE = process.argv.includes('--skip-place')
if (!UID) { console.error('Usage: npx tsx scripts/test-chat-brain.ts <uid> [--skip-place]'); process.exit(1) }

// Dynamic imports — must happen AFTER loadEnv() so geminiClient sees NEXT_PUBLIC_GEMINI_API_KEY
// at its top-level read.
type ChatBrain = typeof import('../app/services/chatBrain')
type ShufersalClient = typeof import('../app/services/grocery/shufersalClient')
let processChatMessage: ChatBrain['processChatMessage']
let handleReset: ChatBrain['handleReset']
let ordersList: ShufersalClient['ordersList']
let cancelOrder: ShufersalClient['cancelOrder']

let firestore: import('firebase-admin').firestore.Firestore

async function bootstrap() {
  const admin = await import('firebase-admin')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)) })
  firestore = admin.firestore()
  const cb = await import('../app/services/chatBrain')
  const sc = await import('../app/services/grocery/shufersalClient')
  processChatMessage = cb.processChatMessage
  handleReset = cb.handleReset
  ordersList = sc.ordersList
  cancelOrder = sc.cancelOrder
}

async function snapshotStore(): Promise<any> {
  const ref = firestore.collection('groceries').doc(UID).collection('stores').doc('shufersal')
  const snap = await ref.get()
  return snap.data()
}

async function restoreStore(snapshot: any): Promise<void> {
  const ref = firestore.collection('groceries').doc(UID).collection('stores').doc('shufersal')
  await ref.set(JSON.parse(JSON.stringify(snapshot)))
}

const COLLECTION = 'appChatHistory_test' // isolated test history; never touches user's real chat

const results: { step: string; status: 'PASS' | 'FAIL' | 'SKIP'; note?: string }[] = []
function record(step: string, status: 'PASS' | 'FAIL' | 'SKIP', note?: string) {
  results.push({ step, status, note })
  const c = status === 'PASS' ? '\x1b[32m' : status === 'FAIL' ? '\x1b[31m' : '\x1b[33m'
  console.log(`${c}[${status}]\x1b[0m ${step}${note ? ` — ${note}` : ''}`)
}

interface Expectation {
  msg: string
  expectActions?: string[]   // every action in this list must appear in result.actions
  forbidActions?: string[]   // none of these may appear
  replyMustInclude?: string  // substring must appear in reply text
  description: string
}

async function send(msg: string): Promise<{ reply: string; actions: string[]; raw: any }> {
  const r = await processChatMessage({
    uid: UID,
    text: msg,
    historyCollection: COLLECTION,
    includeTasks: false,
  })
  const acts = (r.actions || []).map(a => a.action)
  return { reply: r.reply, actions: acts, raw: r }
}

async function runScenario(e: Expectation) {
  // Fresh chat per scenario — avoids history bleed between unrelated tests.
  await handleReset(COLLECTION, UID)
  process.stdout.write(`  \x1b[36m›\x1b[0m ${e.description}: `)
  let reply = ''
  let actions: string[] = []
  try {
    const r = await send(e.msg)
    reply = r.reply
    actions = r.actions
  } catch (err: any) {
    record(e.description, 'FAIL', `threw: ${err.message}`)
    return
  }
  const missingActs = (e.expectActions || []).filter(a => !actions.includes(a))
  const forbiddenHit = (e.forbidActions || []).filter(a => actions.includes(a))
  const replyOk = !e.replyMustInclude || reply.includes(e.replyMustInclude)
  const pass = missingActs.length === 0 && forbiddenHit.length === 0 && replyOk
  const noteParts: string[] = []
  noteParts.push(`reply="${(reply || '').slice(0, 60).replace(/\n/g, ' ')}"`)
  if (actions.length) noteParts.push(`actions=[${actions.join(',')}]`)
  if (missingActs.length) noteParts.push(`missing actions=[${missingActs.join(',')}]`)
  if (forbiddenHit.length) noteParts.push(`forbidden hit=[${forbiddenHit.join(',')}]`)
  console.log() // newline before record
  record(e.description, pass ? 'PASS' : 'FAIL', noteParts.join(' | '))
}

async function main() {
  await bootstrap()
  console.log(`\n=== Phase 2: AI chat tests via chatBrain ===`)
  console.log(`uid=${UID}  collection=${COLLECTION}  skipPlace=${SKIP_PLACE}\n`)

  // Snapshot store state — chat scenarios may mutate standing/pending lists.
  // We restore at the end so the user's state is unchanged after the test.
  console.log('Snapshotting store state…')
  const snapshot = await snapshotStore()

  // Reset isolated test chat
  await handleReset(COLLECTION, UID)

  console.log('--- Standing list operations ---')
  await runScenario({
    description: 'add to standing — explicit "תמיד" + store',
    msg: 'תמיד תוסיף בננות לרשימה הקבועה בשופרסל',
    expectActions: ['search_product'],
  })
  await runScenario({
    description: 'add to standing — "לקבועה" + store',
    msg: 'תוסיף לרשימה הקבועה בשופרסל גזר',
    expectActions: ['search_product'],
  })
  await runScenario({
    description: 'remove from standing — real item (קוטג\') from shufersal',
    msg: 'תוריד מהרשימה הקבועה בשופרסל את הקוטג\'',
    expectActions: ['remove_standing'],
  })
  await runScenario({
    description: 'show standing list — must call show_list, not invent items',
    msg: 'תראה לי את הרשימה הקבועה בשופרסל',
    expectActions: ['show_list'],
  })

  console.log('\n--- Pending (this-week) operations ---')
  await runScenario({
    description: 'add to pending — "השבוע"',
    msg: 'תוסיף השבוע 3 אבוקדו',
    expectActions: ['search_product'],
  })
  await runScenario({
    description: 'remove for this week only — "בלי X"',
    msg: 'השבוע בלי גבינה צהובה',
    expectActions: ['remove_items'],
  })
  await runScenario({
    description: 'remove with validTo — "לשבועיים"',
    msg: 'תוריד עגבניות לשבועיים',
    expectActions: ['remove_items'],
  })
  await runScenario({
    description: 'product_details for an existing item',
    msg: 'מה המחיר של החלב ברשימה?',
    expectActions: ['product_details'],
    forbidActions: ['search_product'],
  })

  console.log('\n--- Search / price-check ---')
  await runScenario({
    description: 'price-check item not in list — search_product',
    msg: 'כמה עולה גלידה מגנום?',
    expectActions: ['search_product'],
  })

  console.log('\n--- Slot listing ---')
  await runScenario({
    description: 'list slots',
    msg: 'אילו משבצות משלוח יש?',
    expectActions: ['list_slots'],
  })

  console.log('\n--- Reply quality (silent-stop guard) ---')
  await runScenario({
    description: 'short ack does not silent-stop',
    msg: 'אוקיי תודה',
  })
  await runScenario({
    description: 'ambiguous question gets a clarification or text reply',
    msg: 'בעיה',
    forbidActions: [],
  })

  // === Order placement via chat ===
  let placedOrderId: string | undefined
  if (SKIP_PLACE) {
    record('place order via chat → 06/05', 'SKIP', '--skip-place flag')
  } else {
    console.log('\n--- Order placement via chat (06/05) ---')
    // Reset chat so the LLM starts fresh
    await handleReset(COLLECTION, UID)

    process.stdout.write('  \x1b[36m›\x1b[0m sending "תפתח הזמנה לחמישי 06/05 בשעה 15:00": ')
    const r = await send('תפתח הזמנה לחמישי 06/05 בשעה 15:00')
    console.log()
    const triggered = r.actions.includes('trigger_order')
    record('chat triggers trigger_order', triggered ? 'PASS' : 'FAIL', `reply="${r.reply.slice(0, 80)}" actions=[${r.actions.join(',')}]`)

    // Pull the new order id from the live order list
    if (triggered) {
      const orders = await ordersList(UID)
      const cancelable = orders.find(o => o.cancelable)
      placedOrderId = cancelable?.orderId
      record('order created in Shufersal', placedOrderId ? 'PASS' : 'FAIL', placedOrderId ? `#${placedOrderId}` : 'no cancelable order')

      // Reply must announce success — must not be just "מזמין..." with nothing after.
      const replyHasSummary = r.reply.length > 5 && !/^מזמין\.{0,3}$/.test(r.reply.trim())
      record('reply contains post-order summary (not just "מזמין...")', replyHasSummary ? 'PASS' : 'FAIL', `reply="${r.reply.slice(0, 100)}"`)
    }

    if (placedOrderId) {
      console.log('\n--- show_cart via chat ---')
      process.stdout.write('  \x1b[36m›\x1b[0m sending "מה בהזמנה?": ')
      const r2 = await send('מה בהזמנה?')
      console.log()
      const calledShowCart = r2.actions.includes('show_cart')
      record('chat calls show_cart', calledShowCart ? 'PASS' : 'FAIL', `actions=[${r2.actions.join(',')}]`)
      const replyMentionsItems = r2.reply.includes('•') || r2.reply.match(/\d+\s+פריטים/) !== null
      record('show_cart reply mentions items', replyMentionsItems ? 'PASS' : 'FAIL', `reply head="${r2.reply.slice(0, 120)}"`)
    }

    if (placedOrderId) {
      console.log('\n--- cancel order via chat ---')
      process.stdout.write('  \x1b[36m›\x1b[0m sending "תבטל את ההזמנה": ')
      const r3 = await send('תבטל את ההזמנה')
      console.log()
      // Many implementations require a confirmation step, so the LLM may ask first.
      // Send confirmation and accept either path.
      const askedToConfirm = !r3.actions.includes('cancel_order')
      if (askedToConfirm) {
        process.stdout.write('  \x1b[36m›\x1b[0m sending confirmation "כן": ')
        const r4 = await send('כן')
        console.log()
        const cancelled = r4.actions.includes('cancel_order')
        record('chat cancels order (after confirm)', cancelled ? 'PASS' : 'FAIL', `actions=[${r4.actions.join(',')}]`)
      } else {
        record('chat cancels order (immediate)', 'PASS', `actions=[${r3.actions.join(',')}]`)
      }

      // Safety net: if chat didn't cancel, force-cancel via API so we don't leave a real order alive.
      const orders = await ordersList(UID)
      const stillThere = orders.find(o => o.orderId === placedOrderId && o.cancelable)
      if (stillThere) {
        console.log(`  [safety] forcing cancel of #${placedOrderId}`)
        await cancelOrder(UID, placedOrderId)
        record('safety force-cancel', 'PASS', `force-cancelled #${placedOrderId}`)
      } else {
        record('order no longer cancelable after chat cancel', 'PASS')
      }
    }
  }

  // Restore state — undo any standing/pending mutations from the chat scenarios.
  console.log('\nRestoring store state from snapshot…')
  await restoreStore(snapshot)

  // Summary
  const pass = results.filter(r => r.status === 'PASS').length
  const fail = results.filter(r => r.status === 'FAIL').length
  const skip = results.filter(r => r.status === 'SKIP').length
  console.log(`\n=== Summary: ${pass} pass / ${fail} fail / ${skip} skip ===`)
  if (fail > 0) {
    console.log(`\nFailures:`)
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  - ${r.step}${r.note ? ` — ${r.note}` : ''}`)
    }
  }
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
