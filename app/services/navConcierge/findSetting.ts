// Aglamazo's find_setting wrapper (#261, child task 2/3; #337 wired this to
// the shared agents-ai/nav-concierge tool). This file keeps only what's
// genuinely product-specific: the registry data source and the Hebrew reply
// formatting — createFindSettingTool returns structured data only, by
// design (agents-ai/nav-concierge/findSettingTool.ts), so each product owns
// its own reply language/tone here rather than porting formatting logic.
import { createFindSettingTool, resolvePath } from 'agents-ai/nav-concierge'
import type { NavCapabilityEntry, FindSettingResult } from 'agents-ai/nav-concierge'
import navCapabilities from '../../../nav-capabilities.json'

export const NAV_REGISTRY = navCapabilities as NavCapabilityEntry[]

export function findNavEntry(id: string): NavCapabilityEntry | undefined {
  return NAV_REGISTRY.find((entry) => entry.id === id)
}

const findSettingTool = createFindSettingTool(NAV_REGISTRY)

type ToolResult = FindSettingResult & { needsParams?: string[]; navigateTo?: { path: string; label: string } }

// Hebrew ask-phrasing per dynamic param name a registry entry might declare
// via requiresParams. Add an entry here whenever a new param name is
// introduced in nav-capabilities.json — same spirit as the old hardcoded
// requiresBusinessId check, just no longer limited to one param.
const PARAM_ASK: Record<string, string> = {
  businessId: 'לאיזה עסק?',
  member: 'לאיזה חבר משפחה?',
}

/**
 * Full find_setting action handler — query -> chat-ready reply (+ navigateTo
 * when resolved). Lives here, not inline in actionExecutor.ts's switch,
 * because that file is at the 850-line eslint cap; this keeps the tool's
 * lookup logic AND its response formatting together in one place anyway.
 */
export async function handleFindSetting(rawQuery: unknown): Promise<string | { followUp: string; navigateTo: { path: string; label: string } }> {
  const query = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (!query) return 'מה חיפשת?'

  const { result } = await findSettingTool.execute({ query }, undefined)
  const outcome = result as ToolResult

  if (outcome.outcome === 'not_found') {
    return 'לא מצאתי הגדרה שמתאימה לזה. אפשר לנסח אחרת?'
  }
  if (outcome.outcome === 'ambiguous') {
    const options = outcome.candidates.map((c) => `• ${c.label}${c.description ? ` — ${c.description}` : ''}`).join('\n')
    return `לא בטוח למה בדיוק התכוונת, זה יכול להיות:\n${options}\nאיזה מהם?`
  }

  const { entry } = outcome
  if (outcome.needsParams && outcome.needsParams.length > 0) {
    // No server-side context to resolve these from (e.g. businesses are
    // client-local Dexie data — SessionState only tracks activeStore, the
    // grocery-domain equivalent). Ask rather than guess, same as before —
    // just generalized past the old businessId-only check.
    const desc = entry.description ? ` (${entry.description})` : ''
    const asks = outcome.needsParams.map((p) => PARAM_ASK[p] ?? `ערך עבור ${p}?`).join(' / ')
    return `${entry.label} נמצא בהגדרות${desc} — ${asks}`
  }

  const path = outcome.navigateTo?.path ?? resolvePath(entry)
  // addressable defaults to true when omitted; entry.gap has the specific
  // reason when it's false (e.g. a modal that needs a manual click) — surface
  // it verbatim instead of a generic note, since the registry author already
  // worked out exactly what's missing.
  const gapNote = entry.addressable === false ? ` (${entry.gap || 'זה יביא אותך למסך הכללי, ייתכן שתצטרך לחפש/לבחור בפנים'})` : ''
  return {
    followUp: `${entry.label}${entry.description ? `: ${entry.description}` : ''}.${gapNote}`,
    navigateTo: { path, label: entry.label },
  }
}
