/**
 * Chat processor — sends system prompt + conversation history to Gemini
 * with native function calling for actions.
 */

import { GeminiClient } from '@/app/services/llm/geminiClient'
import { ACTION_DECLARATIONS } from './actionDeclarations'
import type { LLMMessage } from '@/app/services/llm/types'
import { VARIANT_CONFIG } from '@/app/config/variants'

const gemini = new GeminiClient()

/**
 * When the default model jams (returns tool-call pseudocode as text instead of
 * structured functionCalls), retry the same prompt with this heavier model.
 * Pro is substantially more reliable on structured tool use. Cost impact is
 * limited to the small fraction of turns that actually jam.
 */
const ESCALATION_MODEL = 'gemini-2.5-pro'

/**
 * Lazy-built regex that matches any line where the model wrote a tool call as
 * text — either bare (`toolName(args)`) or with a leading `call:` prefix the
 * model sometimes hallucinates from generic-pseudocode training. Both forms
 * mean "the model knew which tool to call but didn't use the structured
 * functionCalls channel."
 */
let _jamRegex: RegExp | null = null
function getJamRegex(): RegExp {
  if (_jamRegex) return _jamRegex
  const names = ACTION_DECLARATIONS.map(a => a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  _jamRegex = new RegExp(`(?:call:\\s*)?\\b(?:${names})\\s*\\(`)
  return _jamRegex
}

/** True iff the result has no structured functionCalls but its text contains tool-call pseudocode. */
function detectToolJam(result: { text?: string; functionCalls?: { name: string }[] }): boolean {
  if (result.functionCalls?.length) return false
  if (!result.text) return false
  return getJamRegex().test(result.text)
}

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
  /**
   * Short Hebrew specialty hint ("רשת חנויות בריאות", "חנות דגים", "סופרמרקט כללי").
   * The LLM uses this to avoid wasted searches — e.g. user asks for Coke at a
   * fruit-and-veg specialty store, the bot should redirect to Shufersal rather
   * than wasting a catalog search that will return nothing useful.
   */
  description?: string
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

export type CurrentTier = 'tier-1' | 'tier-2' | 'tier-3'

export interface UserContext {
  displayName?: string
  /**
   * Resolved privacy tier for THIS user, set by the chat caller (chatBrain).
   * `tier-1` = anon (no account, no persistence — sessionStorage only).
   * `tier-2` = logged-in, no server-side cred storage (browser-only Dexie + e2e backup).
   * `tier-3` = logged-in WITH explicit server-creds consent (encrypted at rest, cron works).
   * The LLM uses this to frame every privacy/credentials answer around the
   * user's actual current state rather than reciting abstract tier definitions.
   */
  currentTier?: CurrentTier
  stores?: StoreContext[]
  defaultStore?: string
  session?: { activeStore?: string | null }
  tasks?: { id: string; title: string; completed: boolean; deadline?: string; priority?: string }[]
  /**
   * Saliko Tier-3 consent state. `null`/undefined = not asked / not applicable
   * (e.g. anon user). Set by the chat caller (chatBrain) when context is built.
   * The LLM reads this to decide whether a `set_credentials` / `set_otp_phone`
   * call needs to walk the user through Tier-3 acceptance first.
   */
  serverCredsConsent?: { acceptedAt: string; policyVersion: string } | null
  /**
   * Masked phone from a previously-connected OTP store (Tier 3 only — Tier 2
   * phones live in the browser, never server-side). Format: "...XXXX" (last 4
   * digits). When present, the LLM should offer to reuse it instead of asking
   * for the phone again.
   */
  storedOtpPhone?: { masked: string }

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

export const SYSTEM_PROMPT = `אתה ${VARIANT_CONFIG.botName} — עוזר משפחתי לניהול קניות ומשימות. אתה מדבר בעברית טבעית, ידידותי וקצר.

## ערוץ תקשורת — טקסט בלבד (חוק יסוד)
אתה משיב ב**ערוץ טקסט בלבד** — וידג'ט באתר, WhatsApp או Telegram, כולם זהים מבחינתך. **אין מסך ויזואלי נפרד** שמראה רשימות, פריטים, כפתורים, או UI. כל מה שהמשתמש רואה הוא בועות טקסט בשיחה.
- **אסור** להגיד "כעת מוצג על המסך", "ראה למעלה", "לחץ על הכפתורים", "מודגש", "מופיע בצד" — דברים אלו לא קיימים.
- **חובה לרשום בתוך התגובה עצמה** כל פריט / אופציה / לוח זמנים שהמשתמש מבקש לראות.
  - "מה ברשימה?" → תרשום שורה לכל פריט: "- חלב 2L x1", "- לחם x1", וכו'.
  - חיפוש שמחזיר מספר אפשרויות → רשימה ממוספרת (1, 2, 3) ובקש "תכתוב מספר". כשהמשתמש עונה על רשימה כזו (מספר, תיאור, או כמות חדשה) — קרא ל-select_pending_product, **לא** ל-search_product מחדש.
- אם פעולה רצה (search_product, set_schedule, וכו') ולא יצא ממנה מה לכתוב — סכם בקצרה במה היא טיפלה ("חיפשתי לחם, הוספתי לרשימה השבועית", "קבעתי לוח זמנים: שלישי בערב").

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

## חיבור חנויות — סוג authentication
- שופרסל: אימייל + סיסמה (set_credentials). **למשתמש מחובר** — דורש החלטת tier (ראה "פרטיות וסיסמאות" למטה).
- מקור השפע ושאר רשת Rexail: מספר טלפון + קוד SMS (set_otp_phone → verify_otp). **משתמש אנונימי** יכול להזמין באופן חד-פעמי בלי חשבון.
- כשמשתמש שולח קוד מספרי והמצב מראה otpPending=true, זה קוד SMS → verify_otp.
- **מספר טלפון שמור:** אם ההקשר מציג "מספר טלפון שמור (OTP): ...XXXX" — **אל תבקש מספר טלפון**. במקום זאת, הצע: "יש לי מספר שמור (...XXXX) — להשתמש בו לחיבור <שם חנות>?" אם המשתמש מאשר — קרא ל-set_otp_phone **ללא** phone (המערכת תשתמש במספר השמור אוטומטית).

## פרטיות וסיסמאות — קודם תקרא את "רמת פרטיות נוכחית" בהקשר
**הרמה הנוכחית של המשתמש כתובה למטה בהקשר** ("## רמת פרטיות נוכחית של המשתמש הזה"). זה ה-single source of truth לכל שאלת פרטיות.
- כשמשתמש שואל "איפה הסיסמה שלי?" / "מה נשמר עליי?" / "אתם רואים את הסיסמה?" — **תענה לפי הבלוק הזה בדיוק, לא לפי תיאור גנרי**. הזכר את שם הרמה הנוכחית (Tier 1/2/3) ואת המשמעות המוחשית שלה כפי שמופיעה בבלוק.
- **אל תקפוץ ל-Tier 3** כברירת מחדל. Tier 2 = ברירת המחדל למשתמש מחובר. Tier 3 הוא שדרוג opt-in שמועיל רק למי שרוצה הזמנות אוטומטיות.
- **כשהמשתמש ב-Tier 2 ושואל על אחסון סיסמאות:** ענה לפי בלוק Tier 2 ("הסיסמה רק בדפדפן שלך, השרת רואה רק טקסט מוצפן, אנחנו לא יכולים לראות אותה"). הזכר את Tier 3 רק אם נשאלת מה משתנה / איך אפשר לקבל הזמנות אוטומטיות.
- **כשהמשתמש ב-Tier 3 ושואל על אחסון סיסמאות:** ענה לפי בלוק Tier 3 — חובה לכלול את האמירה הכנה שצוות עם גישת ייצור יכול עקרונית לפענח. **אל תרכך** ("אנחנו לא רואים את זה" / "רק במצב חירום" / וכו') — זה שקר ואסור.
- **כשהמשתמש אנונימי (Tier 1) ושואל:** ענה לפי בלוק Tier 1 — השרת לא שומר כלום, sessionStorage בלבד, מתנקה בסגירת טאב. אל תזכיר TTL של שעתיים — זה תיאור ישן ולא נכון.

## חיבור חנות חדשה — מתי לבקש אישור Tier 3
כשמשתמש מחובר (Tier 2) מבקש לחבר חנות עם סיסמה (שופרסל) או טלפון (Rexail) — יש שתי דרכים תקפות:
1. **Tier 2 דרך הגדרות → חיבורים חיצוניים:** הסיסמה נשארת בדפדפן בלבד. כל מה שעובד באונליין יעבוד. **אין הזמנות אוטומטיות.** זו ברירת המחדל וכך תציע ראשית.
2. **Tier 3 דרך הצ'אט עם אישור מפורש:** אם המשתמש *רוצה* הזמנות אוטומטיות — אז כדאי לדבר על Tier 3.

לכן השיחה האופיינית היא:
- משתמש: "תחבר לי שופרסל". בוט: "אפשר בשתי דרכים — דרך ההגדרות, והסיסמה נשארת רק אצלך בדפדפן, או דרך הצ'אט עם שמירת עותק מוצפן בשרת שלנו, שמאפשר הזמנות אוטומטיות בלילה כשאתה לא מחובר. מה מעדיף?"

**🔒 שפה מול המשתמש — בלי ז'רגון פנימי:** המונחים "Tier 1/2/3" הם **פנימיים בלבד**. **לעולם אל תכתוב "Tier" למשתמש.** דבר בעברית רגילה: "הפרטים נשמרים רק בדפדפן שלך" (במקום Tier 2), "שמירה מוצפנת ומאובטחת בשרת שלנו לטובת הזמנות אוטומטיות" (במקום Tier 3). זה חל גם על אישורים — תכתוב "רשמתי את הסכמתך לשמירה מאובטחת בשרת", לא "(Tier 3)".
- אם בחר Tier 2 → "סבבה, פתח את הגדרות → חיבורים חיצוניים, הוסף שופרסל שם. אני לא רואה את הסיסמה ולא צריך."
- אם בחר Tier 3 *באופן מפורש* (ראה הכלל הקשיח למטה) → קרא ל-set_credentials עם acceptServerCredsConsent=true (או, אם רוצה לאשר נפרד קודם, grant_server_creds_consent).
- אם המשתמש מסרב לתת סיסמה בכלל: **תזכיר את חנויות ה-OTP (Rexail family — מקור השפע ועוד 10 חנויות)** — הן דורשות רק מספר טלפון, בלי סיסמה. רשימה מלאה בבלוק "חנויות נתמכות".

### 🚨 כלל קשיח: מה זה "אישור Tier 3"
**שליחת אימייל וסיסמה בצ׳אט היא לא אישור Tier 3.** המשתמש עשוי בכלל לחשוב שזה הולך ל-Tier 2 — מעולם לא הסכים לשמירה בשרת. **לעולם אל תפעיל acceptServerCredsConsent=true אלא אם המשתמש כתב במפורש משפט שמסכים לכך** — למשל אחד מאלה (לא ממצה):
- "אני מאשר Tier 3" / "אני מאשר שמירה בשרת" / "כן, תשמור בשרת"
- "תשמור את הסיסמה מוצפן בשרת" / "אני רוצה הזמנות אוטומטיות"
- תשובה מפורשת "כן" / "אני מאשר" אחרי שהבוט שאל באופן ספציפי על Tier 3

זה שהמשתמש כתב "תחבר לי שופרסל" + מסר פרטים = **רק** התחלת זרימת חיבור, *לא* הסכמה לשמירה בשרת. במצב כזה:
1. **לא** לקרוא ל-set_credentials כלל בלי לשאול קודם.
2. הציע את שתי הדרכים (Tier 2 דרך הגדרות, Tier 3 דרך הצ'אט עם אישור) ובקש החלטה.
3. ברירת המחדל אם המשתמש לא הסכים מפורשות = Tier 2 (הפנייה להגדרות).

**אם Tier 3 consent כבר granted (מופיע בהקשר):** אפשר לקרוא ישר ל-set_credentials/set_otp_phone בלי לשאול שוב — בלי acceptServerCredsConsent חוזר, כי הוא כבר נשמר במצב המשתמש.

**ביטול Tier 3:** "תבטל אישור" → תפנה את המשתמש להגדרות → חיבורים חיצוניים, יש שם מתג שמוחק את העותק המוצפן מהשרת (הדפדפן נשאר).

### 📧 כתובת יצירת קשר — קנונית
אם המשתמש מבקש כתובת מייל ליצירת קשר / פרטיות / תמיכה — הכתובת **היחידה** היא ${VARIANT_CONFIG.contactEmail}. **לעולם אל תמציא כתובת אחרת** (למשל support@...). אם אינך בטוח — תן את הכתובת הזו בלבד.

## משתמש אנונימי (Tier 1 — סשן חד-פעמי)
משתמש שלא נכנס לחשבון יכול בכל זאת לבצע **הזמנה אחת** בחנויות OTP (מקור השפע, וכל חנות Rexail אחרת):
1. שלח לי מספר טלפון → set_otp_phone (אני שולח SMS)
2. שלח לי את הקוד → verify_otp (אני מתחבר לחנות בשמך)
3. נחפש מוצרים יחד (search_product) ואז trigger_order
4. show_cart זמין כדי לראות מה מסתדר בעגלה לפני אישור
**מה כן עובד בלי חשבון:** חיפוש בקטלוג של כל חנות נתמכת, OTP, הזמנה חד-פעמית.
**מה לא עובד בלי חשבון:** שמירת רשימה קבועה, לוח זמנים, הזמנות אוטומטיות (cron), צפייה בהזמנות ישנות, ביטול הזמנה, הזמנה שנייה (אחרי הראשונה — צריך להירשם). כדי לקבל את כל אלה — להציע למשתמש להירשם ל-Saliko דרך Google sign-in. **שים לב: Google sign-in זה רק כדי להיכנס ל-Saliko עצמה, לא קשור לסיסמת שופרסל. שופרסל היא חנות עצמאית שדורשת אימייל וסיסמה של חשבון שופרסל פרטי.**
**הסבר ישר ומדויק:** פרטי החנות שהמשתמש נותן בסשן (טלפון + טוקן OTP) **לא נשמרים אצלנו בכלל** — הם חיים בלעדית ב-sessionStorage של הדפדפן שלו ונמחקים מיידית בסגירת הטאב. אין TTL בשרת, אין מסד נתונים, אין גיבוי. תהיה שקוף ומדויק: לא "נמחק תוך X שעות" אלא "לא נשמר אצלנו, חי רק אצלך בדפדפן".
**אחרי trigger_order מוצלח באנונימי** — אי אפשר לבצע הזמנה נוספת באותו סשן. הסבר שזה מנגנון חד-פעמי לפי המדיניות וההפתרון היחיד הוא הרשמה.
**שופרסל לא תומך ב-OTP** — חיבור לשופרסל מצריך אימייל וסיסמה של חשבון שופרסל פרטי (set_credentials), וזה דורש שהמשתמש יהיה מחובר ל-Saliko (Tier 2/3) — לכן משתמש אנונימי לא יכול להזמין משופרסל. הצעה אופיינית: "כדי לקנות בשופרסל צריך קודם להיכנס ל-Saliko (יש כפתור 'התחברות' למעלה — Google sign-in). אחר כך תוכל לחבר את חשבון השופרסל שלך עם אימייל וסיסמה. אם אתה רוצה להזמין עכשיו בלי הרשמה — מקור השפע, הירקנייה ושאר רשתות ה-Rexail עובדות עם קוד SMS בלבד."

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
כשיש הזמנה פתוחה בחנות (orderStatus=active בהקשר), שינויים **לא** מוחלים על ההזמנה מיד — הם **נאספים** לרשימת שינויים ממתינים (pendingChanges), והמשתמש מאשר עדכון אחד מרוכז. עדכון הזמנה בשופרסל איטי (~30 שניות), לכן צוברים ושולחים הכל יחד.
- הוספת מוצר → search_product עם target:"pending" — נאסף לשינויים הממתינים (לא נשלח להזמנה עדיין)
- הסרת מוצר → remove_items — נאסף לשינויים הממתינים (לא נשלח עדיין)
- **כשהמשתמש סיים לצבור שינויים** (או מבקש לעדכן את ההזמנה) — סכם לו את השינויים הממתינים שאתה רואה בהקשר ("אני רואה שינויים ממתינים: +ביצים, +לחם, −קולה. להוסיף אותם להזמנה הפתוחה #<orderId>?") ובקש אישור.
- **רק אחרי אישור מפורש** ("כן", "תעדכן", "תוסיף") → קרא ל-update_order. זה מחיל את כל השינויים הממתינים על ההזמנה בעדכון אחד (תוספת על מה שכבר בהזמנה — לא מחליף). אחרי שהמערכת מחזירה תוצאה — סכם כמה נוספו/הוסרו.
- אם יש שינויים ממתינים בהקשר וגם הזמנה פתוחה — אתה יכול ליזום ולשאול אם להוסיף אותם להזמנה.
- "מה בהזמנה?" / "תראה לי ההזמנה" → show_cart (לא show_list) — מציג תוכן ההזמנה בפועל
- אל תפתח הזמנה חדשה (trigger_order) כשיש כבר הזמנה פתוחה — לעדכון הזמנה קיימת השתמש ב-update_order

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
  //
  // Separately from emptiness: Gemini-flash occasionally JAMS on tool use —
  // returns the call as text pseudocode ("call: search_product(...)" or bare
  // "search_product(...)") instead of using the structured functionCalls
  // channel. The escalation path swaps to gemini-2.5-pro for the same prompt;
  // Pro is far more reliable on structured tool use. We pay the Pro cost only
  // on the small fraction of turns that jam.
  let result = await callLLM(cleanMessages, 0.7, /*withTools*/ true)
  if (detectToolJam(result)) {
    console.warn(`[ChatProcessor] Tool-jam detected on default model — escalating to ${ESCALATION_MODEL}.`)
    result = await callLLM(cleanMessages, 0, /*withTools*/ true, ESCALATION_MODEL)
  }
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

  async function callLLM(msgs: LLMMessage[], temperature: number, withTools: boolean, modelOverride?: string) {
    return gemini.chatWithTools({
      system: fullSystem,
      messages: msgs,
      maxTokens: 2048,
      tools: withTools ? ACTION_DECLARATIONS : undefined,
      temperature,
      modelOverride,
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

  // Map function calls directly to actions — no regex parsing needed.
  // `__sig` carries the Gemini thoughtSignature alongside each action so the
  // chatBrain can echo it back on the next turn (required by flash-latest /
  // 3.x — see geminiClient.ts). Double-underscore marks it as internal so the
  // action executor knows to ignore it.
  const actions: ChatAction[] = (result.functionCalls || []).map(fc => ({
    action: fc.name,
    ...fc.args,
    ...(fc.thoughtSignature ? { __sig: fc.thoughtSignature } : {}),
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

export function buildContextBlock(ctx: UserContext): string {
  const parts: string[] = []
  const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

  const now = new Date()
  const todayStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  const todayDayName = DAY_NAMES[now.getDay()]
  parts.push(`היום: ${todayDayName} ${todayStr}`)

  if (ctx.displayName) parts.push(`משתמש: ${ctx.displayName}`)

  // ============================================================
  // Current privacy tier — the LLM MUST read this before every
  // privacy / credentials answer. The blurbs are the SOLE source
  // of truth for what to tell the user about where their data lives.
  // Never invent or paraphrase claims that contradict the blurb.
  // ============================================================
  if (ctx.currentTier) {
    parts.push('\n## רמת פרטיות נוכחית של המשתמש הזה')
    if (ctx.currentTier === 'tier-1') {
      parts.push('**Tier 1 — אנונימי (לא מחובר).**')
      parts.push('מה זה אומר בפועל: השרת שלנו לא שומר שום דבר. פרטי החנות (טלפון/טוקן OTP) חיים *רק* ב-sessionStorage של הדפדפן ונמחקים בסגירת הטאב. אין מסד נתונים, אין TTL, אין גיבוי, אין סיכוי לגישת admin — כי אין מה לגשת.')
      parts.push('מה לא עובד: שמירת רשימה קבועה, לוח זמנים, הזמנות אוטומטיות, היסטוריית הזמנות, הזמנה שנייה באותו סשן.')
      parts.push('שדרוג: הרשמה (Google sign-in) → Tier 2.')
    } else if (ctx.currentTier === 'tier-2') {
      parts.push('**Tier 2 — מחובר, ללא שמירת פרטים בשרת (ברירת מחדל למשתמש מחובר).**')
      parts.push('מה זה אומר בפועל: פרטי החנות (סיסמת שופרסל / טלפון Rexail) נשמרים *רק* בדפדפן של המשתמש (IndexedDB). יש גיבוי מוצפן end-to-end ל-Firebase Storage לסנכרון בין מכשירים — השרת רואה רק טקסט מוצפן שאי אפשר לפענח בלי המכשיר של המשתמש. הצוות שלנו לא יכול לראות את הסיסמה.')
      parts.push('מה לא עובד: הזמנות אוטומטיות כשהמשתמש לא מחובר (cron). הכל אחר עובד כשהמשתמש פעיל.')
      parts.push('שדרוג: אישור Tier 3 → השרת ישמור עותק מוצפן ויוכל לפתוח הזמנות אוטומטיות.')
    } else {
      parts.push('**Tier 3 — מחובר, עם אישור מפורש לשמירת פרטים מוצפנים בשרת.**')
      parts.push('מה זה אומר בפועל: פרטי החנות נשמרים בדפדפן (כמו ב-Tier 2) **וגם** עותק מוצפן at-rest על השרת שלנו. ההצפנה at-rest מגינה מדליפת מסד נתונים, אבל השרת חייב לפענח בכל פעם שהוא נכנס לחנות בשמך — לכן צוות עם גישת ייצור יכול עקרונית לפענח. **תהיה כן לגבי זה כשמשתמש שואל — אסור להגיד "אנחנו לא יכולים לראות".**')
      parts.push('מה כן עובד: הכל, כולל הזמנות אוטומטיות בלילה.')
      parts.push('שינוי דעת: ניתן לבטל את האישור בכל רגע מהגדרות → חיבורים חיצוניים, וזה ימחק את העותק המוצפן מהשרת מיידית (העותק בדפדפן נשאר).')
    }
    parts.push('המדיניות המלאה: /privacy. **כשמשתמש שואל "איפה הסיסמה?" / "מה נשמר עליי?" — תענה לפי הבלוק הזה, לא לפי הזיכרון הכללי שלך על תיירים.**')
  }

  // Supported stores — every Rexail-powered chain plus Shufersal. The LLM
  // should rely on this list verbatim rather than its training memory.
  // Includes the chain website so the LLM can hand it to users on request.
  parts.push('\n## חנויות נתמכות')
  parts.push('הערה לבוט: התייחס לתיאור (מה החנות בעיקר מוכרת) לפני שאתה מחפש מוצר. למשל "קוקה קולה" לא יימצא בחנות פירות וירקות — הפנה לסופרמרקט כללי במקום לנסות.')
  if (ctx.stores?.length) {
    for (const s of ctx.stores) {
      const status = s.connected ? ' — מחובר' : ''
      const desc = s.description ? ` — ${s.description}` : ''
      parts.push(`- ${s.label} (${s.id})${desc}${s.siteOrigin ? ` — ${s.siteOrigin}` : ''}${status}`)
    }
  }

  // Session state
  const activeStore = ctx.session?.activeStore || ctx.defaultStore || null
  parts.push(`\n## סשן`)
  parts.push(`activeStore: ${activeStore || 'null'} (${activeStore ? 'חנות פעילה' : 'ברירת מחדל'})`)

  // Tier-3 consent (shape: { acceptedAt, policyVersion } | null). The LLM
  // uses this to decide whether to prompt before saving creds server-side.
  if (ctx.serverCredsConsent !== undefined) {
    if (ctx.serverCredsConsent) {
      parts.push(`Tier 3 consent: granted (policy=${ctx.serverCredsConsent.policyVersion}, at=${ctx.serverCredsConsent.acceptedAt})`)
    } else {
      parts.push('Tier 3 consent: NOT granted (saving credentials server-side will be refused; ask the user before retrying)')
    }
  }

  if (ctx.storedOtpPhone) {
    parts.push(`מספר טלפון שמור (OTP): ${ctx.storedOtpPhone.masked} — הצע למשתמש להשתמש בו לחיבור חנות OTP חדשה; אם מאשר, קרא ל-set_otp_phone ללא phone`)
  }

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
